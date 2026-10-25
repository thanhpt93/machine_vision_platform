"""Threshold Binarization Handler (OpenCV)."""

import cv2
import numpy as np
from typing import Any, Dict, Tuple

THRESH_MODES = {
    "BINARY": cv2.THRESH_BINARY,
    "BINARY_INV": cv2.THRESH_BINARY_INV,
    "TRUNC": cv2.THRESH_TRUNC,
    "TOZERO": cv2.THRESH_TOZERO,
    "TOZERO_INV": cv2.THRESH_TOZERO_INV,
    "OTSU": cv2.THRESH_BINARY + cv2.THRESH_OTSU,
}


def threshold_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Binarizes image into a single-channel mask.
    Returns (outputs_dict, metadata_dict).
    """
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Threshold node requires valid 'image_in' input frame.")

    # Convert to grayscale if multichannel
    if len(img.shape) == 3:
        if img.shape[2] == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        elif img.shape[2] == 4:
            gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
        else:
            gray = img[:, :, 0]
    else:
        gray = img

    try:
        thresh_val = float(config.get("threshold", 128))
        max_val = float(config.get("maxVal", 255))
        mode_str = str(config.get("mode", "BINARY")).upper()
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid threshold parameter types: {e}")

    if not (0 <= thresh_val <= 255):
        raise ValueError(f"Threshold value must be between 0 and 255 (got {thresh_val}).")

    if not (0 <= max_val <= 255):
        raise ValueError(f"Max value must be between 0 and 255 (got {max_val}).")

    if mode_str not in THRESH_MODES:
        raise ValueError(
            f"Unsupported threshold mode '{mode_str}'. Supported modes: {list(THRESH_MODES.keys())}"
        )

    cv_mode = THRESH_MODES[mode_str]
    actual_thresh, mask = cv2.threshold(gray, thresh_val, max_val, cv_mode)

    h, w = mask.shape
    white_pixels = int(np.count_nonzero(mask))
    total_pixels = int(w * h)
    coverage_ratio = round((white_pixels / total_pixels) * 100, 2) if total_pixels > 0 else 0.0

    metadata = {
        "width": int(w),
        "height": int(h),
        "channels": 1,
        "mode": mode_str,
        "threshold": float(actual_thresh),
        "max_val": float(max_val),
        "white_pixels": white_pixels,
        "total_pixels": total_pixels,
        "coverage_percentage": coverage_ratio,
        "dtype": str(mask.dtype),
    }

    return {"image_out": mask}, metadata
