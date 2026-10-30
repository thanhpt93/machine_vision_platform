"""Comprehensive Tests for AI Model Integration: Importer, Registry, Adapters, and AI Pipeline Nodes."""

import os
import shutil
import tempfile
import json
from pathlib import Path
import pytest
import numpy as np
import cv2
from fastapi.testclient import TestClient

from vision_runtime.main import app
from vision_runtime.config import settings
from vision_runtime.services.model_manager import model_manager
from vision_runtime.services.model_registry_service import ModelRegistryService
from vision_runtime.engine.ai_adapters import ClassificationAdapter, ObjectDetectionAdapter
from vision_runtime.engine.executor import pipeline_executor
from vision_runtime.registry import runtime_registry

client = TestClient(app)

AI_TRAINER_CLASSIFICATION_PKG = Path(r"C:\Project\ai_trainer\export\mobilenet_v3_small_20261028_170820")
AI_TRAINER_DETECTION_PKG = Path(r"C:\Project\ai_trainer\export\fasterrcnn_mobilenet_v3_large_320_fpn_20261030_133000")
SAMPLE_IMAGE_PATH = Path(r"C:\Project\machine_vision_platform\sample_images\pcb_board.png")


@pytest.fixture(scope="module")
def isolated_models_env():
    """Sets up an isolated models storage environment for clean testing."""
    temp_dir = tempfile.mkdtemp(prefix="mvp_test_models_")
    test_svc = ModelRegistryService(data_dir=temp_dir)

    yield {
        "temp_dir": temp_dir,
        "service": test_svc,
    }

    shutil.rmtree(temp_dir, ignore_errors=True)
    model_manager.clear_cache()


def test_01_hardware_detection():
    """Verify hardware execution provider detection and reporting."""
    resp = client.get("/api/models/hardware/info")
    assert resp.status_code == 200
    data = resp.json()

    assert "available_providers" in data
    assert "selected_provider" in data
    assert "cuda_available" in data
    assert data["cpu_cores"] > 0
    # CPU must always be available
    assert "CPUExecutionProvider" in data["available_providers"]


def test_02_import_classification_package(isolated_models_env):
    """Verify importing a real classification package exported from NOVA AI Trainer."""
    svc: ModelRegistryService = isolated_models_env["service"]

    assert AI_TRAINER_CLASSIFICATION_PKG.exists(), "AI Trainer classification package must exist."

    imported = svc.import_model_package(
        source_path=str(AI_TRAINER_CLASSIFICATION_PKG),
        custom_name="MobileNetV3 Classification Model",
    )

    assert imported.id is not None
    assert imported.name == "MobileNetV3 Classification Model"
    assert imported.task_type == "IMAGE_CLASSIFICATION"
    assert imported.architecture == "mobilenet_v3_small"
    assert imported.format == "ONNX"
    assert imported.num_classes == 2
    assert len(imported.classes) == 2
    assert Path(imported.artifact_path).exists()
    assert imported.status == "valid"

    # Verify listed in catalog
    models = svc.list_models(task_type="IMAGE_CLASSIFICATION")
    assert any(m.id == imported.id for m in models)


def test_03_import_detection_package(isolated_models_env):
    """Verify importing a real detection package exported from NOVA AI Trainer."""
    svc: ModelRegistryService = isolated_models_env["service"]

    assert AI_TRAINER_DETECTION_PKG.exists(), "AI Trainer detection package must exist."

    imported = svc.import_model_package(
        source_path=str(AI_TRAINER_DETECTION_PKG),
        custom_name="Faster R-CNN Detection Model",
    )

    assert imported.id is not None
    assert imported.task_type == "OBJECT_DETECTION"
    assert imported.architecture == "fasterrcnn_mobilenet_v3_large_320_fpn"
    assert imported.format == "ONNX"
    assert imported.input_size == [320, 320]
    # Check background class identified
    bg_classes = [c for c in imported.classes if c.is_background]
    assert len(bg_classes) >= 1
    assert bg_classes[0].name == "__background__"
    assert Path(imported.artifact_path).exists()


def test_04_import_validation_rejections(isolated_models_env):
    """Verify rejecting corrupt, missing, or tampered packages."""
    svc: ModelRegistryService = isolated_models_env["service"]

    # 1. Non-existent path
    with pytest.raises(FileNotFoundError):
        svc.import_model_package("C:/path/to/non_existent_folder")

    # 2. Package missing model.onnx
    pkg_missing_model = Path(tempfile.mkdtemp(prefix="mvp_pkg_missing_"))
    try:
        shutil.copy2(AI_TRAINER_CLASSIFICATION_PKG / "model_metadata.json", pkg_missing_model)
        shutil.copy2(AI_TRAINER_CLASSIFICATION_PKG / "labels.json", pkg_missing_model)
        shutil.copy2(AI_TRAINER_CLASSIFICATION_PKG / "preprocessing.json", pkg_missing_model)

        with pytest.raises(ValueError, match="Required package file missing"):
            svc.import_model_package(str(pkg_missing_model))
    finally:
        shutil.rmtree(pkg_missing_model, ignore_errors=True)

    # 3. Tampered checksum
    pkg_tampered = Path(tempfile.mkdtemp(prefix="mvp_pkg_tampered_"))
    try:
        for f in AI_TRAINER_CLASSIFICATION_PKG.iterdir():
            shutil.copy2(f, pkg_tampered)
        # Modify model.onnx by 1 byte to cause checksum mismatch
        with open(pkg_tampered / "model.onnx", "ab") as f:
            f.write(b"tampered")

        with pytest.raises(ValueError, match="Checksum mismatch"):
            svc.import_model_package(str(pkg_tampered))
    finally:
        shutil.rmtree(pkg_tampered, ignore_errors=True)


def test_05_classification_inference_e2e(isolated_models_env):
    """Verify real classification inference on a sample image."""
    svc: ModelRegistryService = isolated_models_env["service"]
    models = svc.list_models(task_type="IMAGE_CLASSIFICATION")
    assert len(models) > 0
    model_id = models[0].id

    # Temporarily set global registry service to test env for handler resolution
    import vision_runtime.engine.ai_adapters as A
    orig_svc = A.model_registry_service
    A.model_registry_service = svc

    try:
        img = cv2.imread(str(SAMPLE_IMAGE_PATH))
        assert img is not None

        result = ClassificationAdapter.infer(
            image=img,
            model_id=model_id,
            confidence_threshold=0.0,
            top_k=2,
        )

        assert result.task_type == "IMAGE_CLASSIFICATION"
        assert result.model_id == model_id
        assert len(result.predictions) == 2
        assert result.top_prediction is not None
        assert result.execution.inference_time_ms > 0
        assert result.execution.provider in ["CPUExecutionProvider", "CUDAExecutionProvider"]

        # Probabilities sum to ~1.0
        total_prob = sum(p.confidence for p in result.predictions)
        assert 0.99 <= total_prob <= 1.01

        # Check session was cached
        assert model_manager.is_model_loaded(model_id)
    finally:
        A.model_registry_service = orig_svc


def test_06_object_detection_inference_e2e(isolated_models_env):
    """Verify real object detection inference and coordinate scaling back to original image size."""
    svc: ModelRegistryService = isolated_models_env["service"]
    models = svc.list_models(task_type="OBJECT_DETECTION")
    assert len(models) > 0
    model_id = models[0].id

    import vision_runtime.engine.ai_adapters as A
    orig_svc = A.model_registry_service
    A.model_registry_service = svc

    try:
        img = cv2.imread(str(SAMPLE_IMAGE_PATH))
        assert img is not None
        h, w = img.shape[:2]

        result = ObjectDetectionAdapter.infer(
            image=img,
            model_id=model_id,
            confidence_threshold=0.01,  # low threshold to inspect candidate boxes
            max_detections=10,
        )

        assert result.task_type == "OBJECT_DETECTION"
        assert result.model_id == model_id
        assert result.image_width == w
        assert result.image_height == h
        assert result.execution.inference_time_ms > 0

        # Background class index 0 must never be returned
        for det in result.detections:
            assert det.class_index != 0
            assert det.class_name != "__background__"
            # Bounding box coordinates must be within original image dimensions
            b = det.bbox
            assert 0.0 <= b.x_min <= w
            assert 0.0 <= b.x_max <= w
            assert 0.0 <= b.y_min <= h
            assert 0.0 <= b.y_max <= h
            assert b.x_max >= b.x_min
            assert b.y_max >= b.y_min
    finally:
        A.model_registry_service = orig_svc


def test_07_ai_nodes_in_pipeline_execution(isolated_models_env):
    """Verify pipeline execution with AI classification and detection nodes in the DAG."""
    svc: ModelRegistryService = isolated_models_env["service"]
    cls_models = svc.list_models(task_type="IMAGE_CLASSIFICATION")
    det_models = svc.list_models(task_type="OBJECT_DETECTION")
    cls_id = cls_models[0].id
    det_id = det_models[0].id

    import vision_runtime.engine.ai_adapters as A
    orig_svc = A.model_registry_service
    A.model_registry_service = svc

    try:
        pipeline = {
            "id": "pipeline_ai_inspection",
            "name": "AI Machine Vision Inspection",
            "nodes": [
                {
                    "id": "node_acq",
                    "nodeType": "image_file",
                    "config": {
                        "filePath": str(SAMPLE_IMAGE_PATH),
                        "colorMode": "COLOR",
                    },
                },
                {
                    "id": "node_cls",
                    "nodeType": "ai_classification",
                    "config": {
                        "modelId": cls_id,
                        "confidenceThreshold": 0.0,
                        "topK": 2,
                    },
                },
                {
                    "id": "node_det",
                    "nodeType": "ai_detection",
                    "config": {
                        "modelId": det_id,
                        "confidenceThreshold": 0.05,
                        "maxDetections": 20,
                    },
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "node_acq",
                    "sourceHandle": "image",
                    "target": "node_cls",
                    "targetHandle": "image_in",
                },
                {
                    "id": "e2",
                    "source": "node_acq",
                    "sourceHandle": "image",
                    "target": "node_det",
                    "targetHandle": "image_in",
                },
            ],
        }

        exec_res = pipeline_executor.execute_pipeline(pipeline)
        assert exec_res["status"] == "completed"
        assert exec_res["nodes_executed"] == 3

        # Check classification node result
        cls_node_res = exec_res["node_results"]["node_cls"]
        assert cls_node_res["status"] == "completed"
        assert cls_node_res["has_preview"] is True
        assert cls_node_res["output_metadata"]["top_prediction"] is not None

        # Check detection node result
        det_node_res = exec_res["node_results"]["node_det"]
        assert det_node_res["status"] == "completed"
        assert det_node_res["has_preview"] is True
        assert "count" in det_node_res["output_metadata"]
    finally:
        A.model_registry_service = orig_svc


def test_08_model_revalidation_and_deletion(isolated_models_env):
    """Verify re-validation and safe model deletion."""
    svc: ModelRegistryService = isolated_models_env["service"]
    cls_models = svc.list_models(task_type="IMAGE_CLASSIFICATION")
    model_id = cls_models[0].id

    # Re-validate
    val_resp = svc.validate_registered_model(model_id)
    assert val_resp.is_valid is True
    assert val_resp.session_ready is True
    assert val_resp.checksum_verified is True

    # Delete model
    assert svc.delete_model(model_id, force=True) is True
    assert svc.get_model(model_id) is None
    assert not (svc.registry_dir / model_id).exists()
    assert not model_manager.is_model_loaded(model_id)
