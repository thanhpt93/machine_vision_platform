"""Gaussian Blur Handler (OpenCV)."""

import cv2
import numpy as np
from typing import Any, Dict, Tuple


def gaussian_blur_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Applies Gaussian convolution kernel to suppress high-frequency noise.
    Returns (outputs_dict, metadata_dict).
    """
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Gaussian Blur node requires valid 'image_in' input frame.")

    kernel_size = int(config.get("kernelSize", 5))
    if kernel_size % 2 == 0:
        kernel_size += 1

    sigma_x = float(config.get("sigmaX", 1.5))

    blurred = cv2.GaussianBlur(img, (kernel_size, kernel_size), sigma_x)

    h, w = blurred.shape[:2]
    c = 1 if len(blurred.shape) == 2 else blurred.shape[2]

    metadata = {
        "width": int(w),
        "height": int(h),
        "channels": int(c),
        "kernel_size": kernel_size,
        "sigma_x": sigma_x,
        "dtype": str(blurred.dtype),
    }

    return {"image_out": blurred}, metadata
