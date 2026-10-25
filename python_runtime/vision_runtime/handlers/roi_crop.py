"""ROI Crop Handler (OpenCV)."""

import numpy as np
from typing import Any, Dict, Tuple


def roi_crop_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Crops a Region of Interest with bounds validation.
    Returns (outputs_dict, metadata_dict).
    """
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("ROI Crop node requires valid 'image_in' input frame.")

    h_img, w_img = img.shape[:2]

    try:
        x = int(config.get("x", 0))
        y = int(config.get("y", 0))
        width = int(config.get("width", w_img))
        height = int(config.get("height", h_img))
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid ROI crop parameter types: {e}")

    # Bounds & dimension checks
    if width <= 0 or height <= 0:
        raise ValueError(f"ROI width and height must be strictly positive (got width={width}, height={height}).")

    if x < 0 or y < 0:
        raise ValueError(f"ROI coordinates (x, y) cannot be negative (got x={x}, y={y}).")

    if x + width > w_img or y + height > h_img:
        raise ValueError(
            f"ROI crop [x={x}, y={y}, w={width}, h={height}] exceeds image boundaries "
            f"[width={w_img}, height={h_img}]."
        )

    # Perform slice
    cropped = img[y : y + height, x : x + width].copy()

    metadata = {
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "original_width": w_img,
        "original_height": h_img,
        "channels": 1 if len(cropped.shape) == 2 else cropped.shape[2],
        "dtype": str(cropped.dtype),
    }

    return {"image_out": cropped}, metadata
