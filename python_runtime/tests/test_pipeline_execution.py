"""Integration tests for Vision Pipeline execution and REST API."""

import os
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from vision_runtime.main import app
from vision_runtime.engine.executor import pipeline_executor
from vision_runtime.engine.buffer import execution_buffer


@pytest.fixture
def synthetic_pipeline_image(tmp_path) -> str:
    img_path = str(tmp_path / "circuit_sample.png")
    # 400x300 image
    img = np.full((300, 400, 3), (30, 80, 40), dtype=np.uint8)
    # Bright target object in center
    cv2.rectangle(img, (80, 80), (140, 140), (240, 240, 255), -1)
    cv2.imwrite(img_path, img)
    return img_path


@pytest.fixture
def valid_six_node_pipeline(synthetic_pipeline_image) -> dict:
    """Creates a valid 6-node MVP pipeline definition."""
    return {
        "fileFormat": "MVP_PIPELINE",
        "schemaVersion": "1.0.0",
        "id": "test_six_node_pipeline",
        "name": "Full Inspection Pipeline",
        "nodes": [
            {
                "id": "node_image",
                "nodeType": "image_file",
                "name": "Image Source",
                "config": {"filePath": synthetic_pipeline_image},
            },
            {
                "id": "node_crop",
                "nodeType": "roi_crop",
                "name": "ROI Crop",
                "config": {"x": 50, "y": 50, "width": 200, "height": 180},
            },
            {
                "id": "node_gray",
                "nodeType": "grayscale",
                "name": "Grayscale Converter",
                "config": {"equalizeHist": False},
            },
            {
                "id": "node_thresh",
                "nodeType": "threshold",
                "name": "Threshold Binarizer",
                "config": {"threshold": 128, "mode": "BINARY", "maxVal": 255},
            },
            {
                "id": "node_contour",
                "nodeType": "contour_detection",
                "name": "Contour Finder",
                "config": {"minArea": 20, "maxArea": 50000},
            },
            {
                "id": "node_viewer",
                "nodeType": "result_viewer",
                "name": "Final Viewer",
                "config": {"title": "Inspection Result View"},
            },
        ],
        "edges": [
            {
                "id": "e1",
                "sourceNodeId": "node_image",
                "sourcePortId": "image",
                "targetNodeId": "node_crop",
                "targetPortId": "image_in",
            },
            {
                "id": "e2",
                "sourceNodeId": "node_crop",
                "sourcePortId": "image_out",
                "targetNodeId": "node_gray",
                "targetPortId": "image_in",
            },
            {
                "id": "e3",
                "sourceNodeId": "node_gray",
                "sourcePortId": "image_out",
                "targetNodeId": "node_thresh",
                "targetPortId": "image_in",
            },
            {
                "id": "e4",
                "sourceNodeId": "node_thresh",
                "sourcePortId": "image_out",
                "targetNodeId": "node_contour",
                "targetPortId": "mask_in",
            },
            {
                "id": "e5",
                "sourceNodeId": "node_contour",
                "sourcePortId": "image_out",
                "targetNodeId": "node_viewer",
                "targetPortId": "image_in",
            },
            {
                "id": "e6",
                "sourceNodeId": "node_contour",
                "sourcePortId": "detections",
                "targetNodeId": "node_viewer",
                "targetPortId": "detections_in",
            },
        ],
    }


def test_full_pipeline_execution(valid_six_node_pipeline):
    result = pipeline_executor.execute_pipeline(valid_six_node_pipeline)

    assert result["status"] == "completed"
    assert result["nodes_executed"] == 6
    assert result["total_duration_ms"] > 0
    assert result["error"] is None

    node_results = result["node_results"]
    assert len(node_results) == 6

    # Verify each node status
    for n_id, n_res in node_results.items():
        assert n_res["status"] == "completed"
        assert n_res["duration_ms"] >= 0

    # Verify Contour detection output
    contour_res = node_results["node_contour"]
    assert contour_res["has_preview"] is True
    assert contour_res["preview_url"] is not None
    structured = contour_res["structured_result"]
    assert structured is not None
    assert structured["count"] >= 1


def test_pipeline_error_handling_marks_node_failed():
    failing_pipeline = {
        "id": "failing_pipeline",
        "nodes": [
            {
                "id": "node_img",
                "nodeType": "image_file",
                "config": {"filePath": "missing_image_file.png"},
            },
            {
                "id": "node_crop",
                "nodeType": "roi_crop",
                "config": {"x": 0, "y": 0, "width": 50, "height": 50},
            },
        ],
        "edges": [
            {
                "sourceNodeId": "node_img",
                "sourcePortId": "image",
                "targetNodeId": "node_crop",
                "targetPortId": "image_in",
            }
        ],
    }

    result = pipeline_executor.execute_pipeline(failing_pipeline)
    assert result["status"] == "failed"
    assert "Image file does not exist" in result["error"]

    node_results = result["node_results"]
    assert node_results["node_img"]["status"] == "failed"
    assert node_results["node_crop"]["status"] == "skipped"


def test_cycle_detection_in_pipeline():
    cyclic_pipeline = {
        "id": "cyclic_pipeline",
        "nodes": [
            {"id": "n1", "nodeType": "roi_crop", "config": {}},
            {"id": "n2", "nodeType": "roi_crop", "config": {}},
        ],
        "edges": [
            {"sourceNodeId": "n1", "targetNodeId": "n2"},
            {"sourceNodeId": "n2", "targetNodeId": "n1"},
        ],
    }

    result = pipeline_executor.execute_pipeline(cyclic_pipeline)
    assert result["status"] == "failed"
    assert "circular dependency" in result["error"]


def test_fastapi_pipeline_endpoints(valid_six_node_pipeline):
    client = TestClient(app)

    # 1. Test supported nodes
    resp = client.get("/api/pipeline/supported-nodes")
    assert resp.status_code == 200
    data = resp.json()
    assert "image_file" in data["supported_nodes"]
    assert "contour_detection" in data["supported_nodes"]

    # 2. Test validate endpoint
    val_resp = client.post("/api/pipeline/validate", json={"pipeline": valid_six_node_pipeline})
    assert val_resp.status_code == 200
    assert val_resp.json()["valid"] is True

    # 3. Test execute endpoint
    exec_resp = client.post("/api/pipeline/execute", json={"pipeline": valid_six_node_pipeline})
    assert exec_resp.status_code == 200
    exec_data = exec_resp.json()
    assert exec_data["status"] == "completed"
    assert exec_data["nodes_executed"] == 6
    exec_id = exec_data["execution_id"]

    # 4. Test preview image endpoint
    preview_resp = client.get(f"/api/pipeline/executions/{exec_id}/nodes/node_contour/preview")
    assert preview_resp.status_code == 200
    assert preview_resp.headers["content-type"] == "image/jpeg"
    assert len(preview_resp.content) > 100

    # 5. Test cleanup buffer
    del_resp = client.delete(f"/api/pipeline/executions/{exec_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["cleared"] is True

    # Preview after cleanup should return 404
    preview_404 = client.get(f"/api/pipeline/executions/{exec_id}/nodes/node_contour/preview")
    assert preview_404.status_code == 404
