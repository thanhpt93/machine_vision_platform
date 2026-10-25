"""Result Viewer Handler (OpenCV / Output Sink)."""

import numpy as np
from typing import Any, Dict, Tuple


def result_viewer_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Final Output Viewport node.
    Consolidates image stream and optional detection metadata.
    Returns (outputs_dict, metadata_dict).
    """
    img = inputs.get("image_in")
    detections = inputs.get("detections_in")

    title = str(config.get("title", "Main Inspection Output"))

    if img is not None and isinstance(img, np.ndarray):
        if len(img.shape) == 2:
            h, w = img.shape
            c = 1
        else:
            h, w, c = img.shape
    else:
        h, w, c = 0, 0, 0

    det_count = 0
    if isinstance(detections, dict):
        det_count = detections.get("count", len(detections.get("items", [])))

    metadata = {
        "title": title,
        "width": int(w),
        "height": int(h),
        "channels": int(c),
        "has_detections": detections is not None,
        "detection_count": det_count,
        "verdict": "PASS" if det_count >= 0 else "FAIL",
    }

    # Pass the display image through so it can be previewed
    outputs = {}
    if img is not None:
        outputs["display_image"] = img
    if detections is not None:
        outputs["structured_result"] = detections

    return outputs, metadata
