"""Grayscale Conversion Handler (OpenCV)."""

import cv2
import numpy as np
from typing import Any, Dict, Tuple


def grayscale_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Converts visual color frame into single-channel luminance grayscale.
    Returns (outputs_dict, metadata_dict).
    """
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Grayscale node requires valid 'image_in' input frame.")

    equalize = bool(config.get("equalizeHist", False))

    if len(img.shape) == 2:
        # Already single channel
        gray = img.copy()
        orig_channels = 1
    elif len(img.shape) == 3:
        orig_channels = img.shape[2]
        if orig_channels == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        elif orig_channels == 4:
            gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
        elif orig_channels == 1:
            gray = img[:, :, 0].copy()
        else:
            raise ValueError(f"Cannot convert image with {orig_channels} channels to grayscale.")
    else:
        raise ValueError(f"Invalid image array shape: {img.shape}")

    if equalize:
        gray = cv2.equalizeHist(gray)

    h, w = gray.shape

    metadata = {
        "width": int(w),
        "height": int(h),
        "channels": 1,
        "color_space": "GRAYSCALE",
        "dtype": str(gray.dtype),
        "input_channels": orig_channels,
        "histogram_equalized": equalize,
    }

    return {"image_out": gray}, metadata
