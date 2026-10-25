"""Contour Detection & Bounding Box Handler (OpenCV)."""

import cv2
import numpy as np
from typing import Any, Dict, Tuple

CONTOUR_MODES = {
    "RETR_EXTERNAL": cv2.RETR_EXTERNAL,
    "RETR_LIST": cv2.RETR_LIST,
    "RETR_TREE": cv2.RETR_TREE,
}

CONTOUR_METHODS = {
    "CHAIN_APPROX_SIMPLE": cv2.CHAIN_APPROX_SIMPLE,
    "CHAIN_APPROX_NONE": cv2.CHAIN_APPROX_NONE,
}


def contour_detection_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Finds contours in binary mask, computes bounding boxes, and generates visual overlay.
    Returns (outputs_dict, metadata_dict).
    """
    mask = inputs.get("mask_in")
    if mask is None or not isinstance(mask, np.ndarray):
        raise ValueError("Contour Detection node requires valid 'mask_in' input frame.")

    # Convert to single channel uint8 if needed
    if len(mask.shape) == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)

    if mask.dtype != np.uint8:
        mask = mask.astype(np.uint8)

    mode_str = str(config.get("mode", "RETR_EXTERNAL")).upper()
    method_str = str(config.get("method", "CHAIN_APPROX_SIMPLE")).upper()
    min_area = float(config.get("minArea", 50))
    max_area = float(config.get("maxArea", 500000))
    draw_boxes = bool(config.get("drawBoundingBoxes", True))

    cv_mode = CONTOUR_MODES.get(mode_str, cv2.RETR_EXTERNAL)
    cv_method = CONTOUR_METHODS.get(method_str, cv2.CHAIN_APPROX_SIMPLE)

    contours, hierarchy = cv2.findContours(mask, cv_mode, cv_method)

    h, w = mask.shape
    annotated = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)

    items = []
    filtered_contours = []

    for i, cnt in enumerate(contours):
        area = float(cv2.contourArea(cnt))
        if area < min_area or area > max_area:
            continue

        filtered_contours.append(cnt)
        x, y, bw, bh = cv2.boundingRect(cnt)

        # Centroid
        M = cv2.moments(cnt)
        if M["m00"] != 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
        else:
            cx = int(x + bw / 2)
            cy = int(y + bh / 2)

        items.append({
            "index": len(items) + 1,
            "x": int(x),
            "y": int(y),
            "width": int(bw),
            "height": int(bh),
            "area": round(area, 2),
            "centroid": [cx, cy],
        })

    # Draw all valid contours in bright green
    if filtered_contours:
        cv2.drawContours(annotated, filtered_contours, -1, (0, 230, 80), 2)

    # Draw bounding boxes and text tags in cyan/orange
    if draw_boxes:
        for item in items:
            bx, by, bw, bh = item["x"], item["y"], item["width"], item["height"]
            cv2.rectangle(annotated, (bx, by), (bx + bw, by + bh), (255, 165, 0), 2)
            cv2.circle(annotated, tuple(item["centroid"]), 3, (0, 0, 255), -1)
            label = f"#{item['index']}: {int(item['area'])}px"
            cv2.putText(
                annotated,
                label,
                (bx, max(14, by - 5)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                (0, 255, 255),
                1,
                cv2.LINE_AA,
            )

    structured_result = {
        "count": len(items),
        "items": items,
        "total_area": round(sum(it["area"] for it in items), 2),
        "mode": mode_str,
        "method": method_str,
        "min_area": min_area,
        "max_area": max_area,
    }

    metadata = {
        "width": int(w),
        "height": int(h),
        "channels": 3,
        "detection_count": len(items),
        "total_raw_contours": len(contours),
        "total_area": structured_result["total_area"],
        "dtype": str(annotated.dtype),
    }

    return {
        "detections": structured_result,
        "image_out": annotated,
    }, metadata
