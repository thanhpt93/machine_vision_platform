"""Common AI Inference Adapters for Machine Vision Platform.

Implements decoupled inference lifecycle:
1. Input image validation
2. Preprocessing & tensor construction
3. ONNX Runtime execution via ModelManager
4. Task-specific output decoding & coordinate conversion
5. Postprocessing & standardized result schema generation
"""

import time
import uuid
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

from vision_runtime.schemas.ai_model import (
    ClassificationItem,
    ClassificationResult,
    BoundingBox,
    DetectionItem,
    DetectionResult,
    ExecutionMetrics,
    ModelCatalogItem,
)
from vision_runtime.services.model_manager import model_manager
from vision_runtime.services.model_registry_service import model_registry_service

# Default ImageNet normalization values
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def softmax(x: np.ndarray) -> np.ndarray:
    """Numerically stable softmax."""
    e_x = np.exp(x - np.max(x, axis=-1, keepdims=True))
    return e_x / np.sum(e_x, axis=-1, keepdims=True)


def compute_iou(box_a: List[float], box_b: List[float]) -> float:
    """Computes IoU between two [x1, y1, x2, y2] boxes."""
    x1 = max(box_a[0], box_b[0])
    y1 = max(box_a[1], box_b[1])
    x2 = min(box_a[2], box_b[2])
    y2 = min(box_a[3], box_b[3])

    inter_w = max(0.0, x2 - x1)
    inter_h = max(0.0, y2 - y1)
    inter_area = inter_w * inter_h

    area_a = max(0.0, box_a[2] - box_a[0]) * max(0.0, box_a[3] - box_a[1])
    area_b = max(0.0, box_b[2] - box_b[0]) * max(0.0, box_b[3] - box_b[1])
    union_area = area_a + area_b - inter_area

    return inter_area / union_area if union_area > 0 else 0.0


def apply_nms(
    boxes: List[List[float]],
    scores: List[float],
    labels: List[int],
    iou_threshold: float,
) -> List[int]:
    """Performs Non-Maximum Suppression per class."""
    keep_indices: List[int] = []
    unique_labels = set(labels)

    for lbl in unique_labels:
        cls_indices = [i for i, l in enumerate(labels) if l == lbl]
        cls_indices.sort(key=lambda i: scores[i], reverse=True)

        while cls_indices:
            current = cls_indices.pop(0)
            keep_indices.append(current)

            cls_indices = [
                idx for idx in cls_indices
                if compute_iou(boxes[current], boxes[idx]) < iou_threshold
            ]

    keep_indices.sort(key=lambda i: scores[i], reverse=True)
    return keep_indices


class ClassificationAdapter:
    """Inference adapter for Image Classification ONNX models."""

    @classmethod
    def infer(
        cls,
        image: np.ndarray,
        model_id: str,
        confidence_threshold: float = 0.0,
        top_k: int = 5,
        execution_provider: Optional[str] = None,
    ) -> ClassificationResult:
        if not isinstance(image, np.ndarray) or image.size == 0:
            raise ValueError("Invalid input image: must be a non-empty numpy ndarray.")

        model_item = model_registry_service.get_model(model_id)
        if not model_item:
            raise KeyError(f"Image Classification model '{model_id}' not found in registry.")

        if model_item.task_type.upper() != "IMAGE_CLASSIFICATION":
            raise ValueError(
                f"Model '{model_id}' is of task type '{model_item.task_type}', expected 'IMAGE_CLASSIFICATION'."
            )

        # 1. Preprocessing Monitored Timer
        t0 = time.perf_counter()
        prep_cfg = model_item.metadata.get("preprocessing", {})
        input_size = prep_cfg.get("input_size", [224, 224])
        norm_cfg = prep_cfg.get("normalization", {})
        mean = np.array(norm_cfg.get("mean", IMAGENET_MEAN), dtype=np.float32)
        std = np.array(norm_cfg.get("std", IMAGENET_STD), dtype=np.float32)

        # Convert to RGB (Pipeline uses OpenCV BGR)
        if len(image.shape) == 2:
            rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
        elif len(image.shape) == 3 and image.shape[2] == 3:
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        elif len(image.shape) == 3 and image.shape[2] == 4:
            rgb = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
        else:
            raise ValueError(f"Unsupported image shape for classification: {image.shape}")

        # Resize (model input is [H, W])
        target_h, target_w = input_size[0], input_size[1]
        resized = cv2.resize(rgb, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

        # Normalize: (pixel / 255.0 - mean) / std
        normalized = (resized.astype(np.float32) / 255.0 - mean) / std

        # Transpose from (H, W, C) to (1, C, H, W)
        chw = np.transpose(normalized, (2, 0, 1))
        batch_input = np.expand_dims(chw, axis=0).astype(np.float32)
        prep_time_ms = (time.perf_counter() - t0) * 1000.0

        # 2. ONNX Runtime Inference
        session = model_manager.get_or_create_session(
            model_id=model_id,
            onnx_file_path=model_item.artifact_path,
            version=model_item.version,
            requested_provider=execution_provider,
        )

        in_name = session.get_inputs()[0].name
        t1 = time.perf_counter()
        outputs = session.run(None, {in_name: batch_input})
        infer_time_ms = (time.perf_counter() - t1) * 1000.0

        # 3. Postprocessing
        t2 = time.perf_counter()
        raw_logits = outputs[0]  # shape: (1, num_classes) or (num_classes,)
        if raw_logits.ndim == 2:
            logits_1d = raw_logits[0]
        else:
            logits_1d = raw_logits.flatten()

        # Apply softmax to logits
        probs = softmax(logits_1d)

        # Map to class objects
        classes_map = {c.index: c for c in model_item.classes}
        predictions: List[ClassificationItem] = []

        for idx, score in enumerate(probs):
            score_flt = float(score)
            if score_flt >= confidence_threshold:
                cls_meta = classes_map.get(idx)
                predictions.append(
                    ClassificationItem(
                        class_index=idx,
                        class_id=cls_meta.id if cls_meta else f"class_{idx}",
                        class_name=cls_meta.name if cls_meta else f"Class {idx}",
                        confidence=round(score_flt, 4),
                        color=cls_meta.color if cls_meta else None,
                    )
                )

        # Sort descending by confidence and take top K
        predictions.sort(key=lambda p: p.confidence, reverse=True)
        if top_k > 0:
            predictions = predictions[:top_k]

        top_pred_str = predictions[0].class_name if predictions else "None"
        post_time_ms = (time.perf_counter() - t2) * 1000.0

        provider_name = session.get_providers()[0] if session else "CPUExecutionProvider"

        return ClassificationResult(
            task_type="IMAGE_CLASSIFICATION",
            model_id=model_id,
            model_version=model_item.version,
            predictions=predictions,
            top_prediction=top_pred_str,
            execution=ExecutionMetrics(
                provider=provider_name,
                inference_time_ms=round(infer_time_ms, 2),
                preprocessing_time_ms=round(prep_time_ms, 2),
                postprocessing_time_ms=round(post_time_ms, 2),
            ),
        )


class ObjectDetectionAdapter:
    """Inference adapter for Object Detection ONNX models (Faster R-CNN architecture)."""

    @classmethod
    def infer(
        cls,
        image: np.ndarray,
        model_id: str,
        confidence_threshold: float = 0.5,
        iou_threshold: Optional[float] = None,
        max_detections: int = 100,
        class_filter: Optional[List[str]] = None,
        execution_provider: Optional[str] = None,
    ) -> DetectionResult:
        if not isinstance(image, np.ndarray) or image.size == 0:
            raise ValueError("Invalid input image: must be a non-empty numpy ndarray.")

        orig_h, orig_w = image.shape[:2]

        model_item = model_registry_service.get_model(model_id)
        if not model_item:
            raise KeyError(f"Object Detection model '{model_id}' not found in registry.")

        if model_item.task_type.upper() != "OBJECT_DETECTION":
            raise ValueError(
                f"Model '{model_id}' is of task type '{model_item.task_type}', expected 'OBJECT_DETECTION'."
            )

        # 1. Preprocessing Monitored Timer
        t0 = time.perf_counter()
        prep_cfg = model_item.metadata.get("preprocessing", {})
        input_size = prep_cfg.get("input_size", [320, 320])
        norm_cfg = prep_cfg.get("normalization", {})
        mean = np.array(norm_cfg.get("mean", IMAGENET_MEAN), dtype=np.float32)
        std = np.array(norm_cfg.get("std", IMAGENET_STD), dtype=np.float32)

        # Convert to RGB (Pipeline uses OpenCV BGR)
        if len(image.shape) == 2:
            rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
        elif len(image.shape) == 3 and image.shape[2] == 3:
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        elif len(image.shape) == 3 and image.shape[2] == 4:
            rgb = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
        else:
            raise ValueError(f"Unsupported image shape for detection: {image.shape}")

        # Resize to model input dimensions [H, W]
        target_h, target_w = input_size[0], input_size[1]
        resized = cv2.resize(rgb, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

        # Normalize: (pixel / 255.0 - mean) / std
        normalized = (resized.astype(np.float32) / 255.0 - mean) / std

        # Transpose from (H, W, C) to (C, H, W)
        chw = np.transpose(normalized, (2, 0, 1)).astype(np.float32)
        prep_time_ms = (time.perf_counter() - t0) * 1000.0

        # 2. ONNX Runtime Inference
        session = model_manager.get_or_create_session(
            model_id=model_id,
            onnx_file_path=model_item.artifact_path,
            version=model_item.version,
            requested_provider=execution_provider,
        )

        in_name = session.get_inputs()[0].name
        t1 = time.perf_counter()
        outputs = session.run(None, {in_name: chw})
        infer_time_ms = (time.perf_counter() - t1) * 1000.0

        # 3. Postprocessing
        t2 = time.perf_counter()
        # Outputs: [boxes (N, 4), labels (N,), scores (N,)]
        boxes_raw = outputs[0] if len(outputs) > 0 else np.zeros((0, 4), dtype=np.float32)
        labels_raw = outputs[1] if len(outputs) > 1 else np.zeros((0,), dtype=np.int64)
        scores_raw = outputs[2] if len(outputs) > 2 else np.zeros((0,), dtype=np.float32)

        scale_x = orig_w / float(target_w)
        scale_y = orig_h / float(target_h)

        classes_map = {c.index: c for c in model_item.classes}
        post_cfg = model_item.metadata.get("postprocessing", {})
        effective_conf = (
            confidence_threshold
            if confidence_threshold > 0.0
            else post_cfg.get("confidence_threshold", 0.5)
        )
        effective_iou = iou_threshold or post_cfg.get("iou_threshold", 0.5)

        boxes_list: List[List[float]] = []
        labels_list: List[int] = []
        scores_list: List[float] = []

        num_det = len(scores_raw)
        for i in range(num_det):
            score = float(scores_raw[i])
            if score < effective_conf:
                continue

            lbl_idx = int(labels_raw[i])
            cls_meta = classes_map.get(lbl_idx)

            # Ignore background class (index 0)
            if lbl_idx == 0 or (cls_meta and cls_meta.is_background):
                continue

            # Class filter check
            if class_filter:
                cname = cls_meta.name if cls_meta else str(lbl_idx)
                cid = cls_meta.id if cls_meta else str(lbl_idx)
                if cname not in class_filter and cid not in class_filter:
                    continue

            # Scale box to original image coordinates
            bx = boxes_raw[i]
            x1 = max(0.0, min(float(orig_w), float(bx[0] * scale_x)))
            y1 = max(0.0, min(float(orig_h), float(bx[1] * scale_y)))
            x2 = max(0.0, min(float(orig_w), float(bx[2] * scale_x)))
            y2 = max(0.0, min(float(orig_h), float(bx[3] * scale_y)))

            if x2 > x1 and y2 > y1:
                boxes_list.append([x1, y1, x2, y2])
                labels_list.append(lbl_idx)
                scores_list.append(score)

        # Apply external NMS if custom IoU was specified
        if iou_threshold is not None and boxes_list:
            keep_indices = apply_nms(boxes_list, scores_list, labels_list, effective_iou)
            boxes_list = [boxes_list[i] for i in keep_indices]
            labels_list = [labels_list[i] for i in keep_indices]
            scores_list = [scores_list[i] for i in keep_indices]

        # Limit to max_detections
        if max_detections > 0 and len(boxes_list) > max_detections:
            boxes_list = boxes_list[:max_detections]
            labels_list = labels_list[:max_detections]
            scores_list = scores_list[:max_detections]

        detections: List[DetectionItem] = []
        for i in range(len(boxes_list)):
            lbl_idx = labels_list[i]
            cls_meta = classes_map.get(lbl_idx)
            b = boxes_list[i]
            det_id = f"det_{i + 1:03d}_{uuid.uuid4().hex[:6]}"

            detections.append(
                DetectionItem(
                    detection_id=det_id,
                    class_index=lbl_idx,
                    class_id=cls_meta.id if cls_meta else f"class_{lbl_idx}",
                    class_name=cls_meta.name if cls_meta else f"Class_{lbl_idx}",
                    confidence=round(scores_list[i], 4),
                    bbox=BoundingBox(
                        x_min=round(b[0], 2),
                        y_min=round(b[1], 2),
                        x_max=round(b[2], 2),
                        y_max=round(b[3], 2),
                    ),
                    color=cls_meta.color if cls_meta else None,
                )
            )

        post_time_ms = (time.perf_counter() - t2) * 1000.0
        provider_name = session.get_providers()[0] if session else "CPUExecutionProvider"

        return DetectionResult(
            task_type="OBJECT_DETECTION",
            model_id=model_id,
            model_version=model_item.version,
            image_width=orig_w,
            image_height=orig_h,
            detections=detections,
            count=len(detections),
            execution=ExecutionMetrics(
                provider=provider_name,
                inference_time_ms=round(infer_time_ms, 2),
                preprocessing_time_ms=round(prep_time_ms, 2),
                postprocessing_time_ms=round(post_time_ms, 2),
            ),
        )
