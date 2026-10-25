"""Image Loader Handler (OpenCV)."""

import os
import cv2
from typing import Any, Dict, Tuple


def image_loader_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Loads an image from filesystem (PNG, JPEG, BMP).
    Returns (outputs_dict, metadata_dict).
    """
    raw_path = config.get("filePath", "").strip()
    if not raw_path:
        raise ValueError("Image File node requires 'filePath' configuration.")

    # Resolve relative path against workspace_dir or cwd
    if os.path.isabs(raw_path):
        resolved_path = raw_path
    else:
        resolved_path = os.path.normpath(os.path.join(workspace_dir or os.getcwd(), raw_path))

    if not os.path.exists(resolved_path):
        # Fallback to project root if relative path was given
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        alt_path = os.path.normpath(os.path.join(project_root, raw_path))
        if os.path.exists(alt_path):
            resolved_path = alt_path
        else:
            raise FileNotFoundError(f"Image file does not exist: {raw_path} (Resolved: {resolved_path})")

    img = cv2.imread(resolved_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(
            f"Failed to decode image from '{raw_path}'. "
            "Please verify that the file is a valid image (PNG, JPEG, BMP)."
        )

    # Determine dimensions and channels
    if len(img.shape) == 2:
        h, w = img.shape
        c = 1
        color_space = "GRAYSCALE"
    elif len(img.shape) == 3:
        h, w, c = img.shape
        color_space = "BGR" if c == 3 else ("BGRA" if c == 4 else f"{c}-CHANNEL")
    else:
        raise ValueError(f"Unsupported image array dimensions: {img.shape}")

    metadata = {
        "width": int(w),
        "height": int(h),
        "channels": int(c),
        "color_space": color_space,
        "dtype": str(img.dtype),
        "source_path": resolved_path,
        "file_name": os.path.basename(resolved_path),
    }

    return {"image": img}, metadata
