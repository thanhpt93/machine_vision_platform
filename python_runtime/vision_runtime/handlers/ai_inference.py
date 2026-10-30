"""AI Inference Handlers for Image Classification and Object Detection nodes."""

from typing import Any, Dict, Tuple
import cv2
import numpy as np

from vision_runtime.engine.ai_adapters import ClassificationAdapter, ObjectDetectionAdapter


def ai_classification_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Handler for AI Image Classification node."""
    img = inputs.get("image_in")
    if img is None:
        img = inputs.get("image")
    if img is None:
        raise ValueError("AI Image Classification node requires an incoming image on port 'image_in'.")

    model_id = config.get("modelId", "").strip()
    if not model_id:
        raise ValueError("AI Image Classification node requires 'modelId' configured.")

    conf_thresh = float(config.get("confidenceThreshold", 0.0))
    top_k = int(config.get("topK", 5))
    provider = config.get("executionProvider")

    result = ClassificationAdapter.infer(
        image=img,
        model_id=model_id,
        confidence_threshold=conf_thresh,
        top_k=top_k,
        execution_provider=provider,
    )

    # Generate visual overlay card for image_out preview
    annotated = img.copy()
    top_pred = result.top_prediction or "Unknown"
    top_conf = result.predictions[0].confidence if result.predictions else 0.0

    # Draw result banner on top
    h, w = annotated.shape[:2]
    banner_h = max(32, int(h * 0.07))
    overlay = annotated.copy()
    cv2.rectangle(overlay, (0, 0), (w, banner_h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.75, annotated, 0.25, 0, annotated)

    text = f"AI Classification: {top_pred} ({top_conf * 100:.1f}%)"
    cv2.putText(
        annotated,
        text,
        (12, int(banner_h * 0.65)),
        cv2.FONT_HERSHEY_SIMPLEX,
        max(0.45, banner_h * 0.015),
        (50, 255, 100) if top_conf >= 0.5 else (50, 200, 255),
        1,
        cv2.LINE_AA,
    )

    outputs = {
        "classification_result": result.model_dump(),
        "top_prediction": top_pred,
        "image_out": annotated,
    }

    metadata = {
        "task_type": "IMAGE_CLASSIFICATION",
        "model_id": model_id,
        "model_version": result.model_version,
        "top_prediction": top_pred,
        "confidence": top_conf,
        "inference_time_ms": result.execution.inference_time_ms,
        "provider": result.execution.provider,
    }

    return outputs, metadata


def ai_detection_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Handler for AI Object Detection node."""
    img = inputs.get("image_in")
    if img is None:
        img = inputs.get("image")
    if img is None:
        raise ValueError("AI Object Detection node requires an incoming image on port 'image_in'.")

    model_id = config.get("modelId", "").strip()
    if not model_id:
        raise ValueError("AI Object Detection node requires 'modelId' configured.")

    conf_thresh = float(config.get("confidenceThreshold", 0.5))
    iou_raw = config.get("iouThreshold")
    iou_thresh = float(iou_raw) if iou_raw is not None else None
    max_det = int(config.get("maxDetections", 100))
    provider = config.get("executionProvider")
    draw_boxes = bool(config.get("drawBoxes", True))

    result = ObjectDetectionAdapter.infer(
        image=img,
        model_id=model_id,
        confidence_threshold=conf_thresh,
        iou_threshold=iou_thresh,
        max_detections=max_det,
        execution_provider=provider,
    )

    # Render bounding boxes onto image_out
    annotated = img.copy()
    if draw_boxes:
        for det in result.detections:
            b = det.bbox
            x1, y1 = int(round(b.x_min)), int(round(b.y_min))
            x2, y2 = int(round(b.x_max)), int(round(b.y_max))

            # Color handling
            box_color = (0, 165, 255)  # default bright orange BGR
            if det.color and det.color.startswith("#") and len(det.color) == 7:
                try:
                    r = int(det.color[1:3], 16)
                    g = int(det.color[3:5], 16)
                    b_col = int(det.color[5:7], 16)
                    box_color = (b_col, g, r)
                except Exception:
                    pass

            cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, 2)

            label_txt = f"{det.class_name} {det.confidence * 100:.1f}%"
            (tw, th), baseline = cv2.getTextSize(label_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            label_y = max(y1, th + 4)
            cv2.rectangle(
                annotated,
                (x1, label_y - th - 4),
                (x1 + tw + 6, label_y + baseline),
                box_color,
                -1,
            )
            cv2.putText(
                annotated,
                label_txt,
                (x1 + 3, label_y - 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )

    outputs = {
        "detections": result.model_dump(),
        "count": result.count,
        "image_out": annotated,
        "structured_result": result.model_dump(),
    }

    metadata = {
        "task_type": "OBJECT_DETECTION",
        "model_id": model_id,
        "model_version": result.model_version,
        "count": result.count,
        "inference_time_ms": result.execution.inference_time_ms,
        "provider": result.execution.provider,
    }

    return outputs, metadata
