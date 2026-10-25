"""Image Acquisition Handlers (Category 1).

Includes:
- image_file: Read images from disk (JPEG, PNG, BMP, TIFF, color/grayscale)
- image_folder: Read image list from a directory
- image_sequence: Read numbered sequence of frames
- image_copy: Explicit deep copy to isolate downstream pipelines
"""

import os
import glob
import cv2
import numpy as np
from typing import Any, Dict, List, Optional, Tuple


def image_file_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Loads an image file with format validation and color/grayscale options."""
    file_path = config.get("filePath", "").strip()
    color_mode = config.get("colorMode", "COLOR").upper()  # 'COLOR', 'GRAYSCALE', 'UNCHANGED'

    if not file_path:
        raise ValueError("Image File node requires 'filePath' configuration.")

    # Resolve relative path against workspace_dir if provided
    candidate_path = file_path
    if not os.path.isabs(candidate_path) and workspace_dir:
        candidate_path = os.path.join(workspace_dir, candidate_path)

    if not os.path.exists(candidate_path):
        # Fallback to local check
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Image file does not exist: {file_path}")
        candidate_path = file_path

    # Determine OpenCV imread flag
    read_flag = cv2.IMREAD_COLOR
    if color_mode == "GRAYSCALE":
        read_flag = cv2.IMREAD_GRAYSCALE
    elif color_mode == "UNCHANGED":
        read_flag = cv2.IMREAD_UNCHANGED

    # Decode image using cv2.imdecode with numpy to handle unicode paths safely
    try:
        with open(candidate_path, "rb") as f:
            file_bytes = np.frombuffer(f.read(), dtype=np.uint8)
        img = cv2.imdecode(file_bytes, read_flag)
    except Exception as e:
        raise ValueError(f"Failed to read file bytes: {e}")

    if img is None:
        raise ValueError(f"Failed to decode image from path (unsupported format or corrupt file): {file_path}")

    h, w = img.shape[:2]
    channels = 1 if len(img.shape) == 2 else img.shape[2]

    metadata = {
        "file_path": candidate_path,
        "width": w,
        "height": h,
        "channels": channels,
        "dtype": str(img.dtype),
        "file_size_bytes": os.path.getsize(candidate_path),
        "color_mode": color_mode,
    }

    return {"image": img}, metadata


def image_folder_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Reads image files from a directory in deterministic sorted order."""
    folder_path = config.get("folderPath", "").strip()
    extensions = config.get("extensions", ["png", "jpg", "jpeg", "bmp", "tiff"])
    file_index = int(config.get("index", 0))

    if not folder_path:
        raise ValueError("Image Folder node requires 'folderPath' configuration.")

    target_dir = folder_path
    if not os.path.isabs(target_dir) and workspace_dir:
        target_dir = os.path.join(workspace_dir, target_dir)

    if not os.path.isdir(target_dir):
        if not os.path.isdir(folder_path):
            raise NotADirectoryError(f"Directory does not exist: {folder_path}")
        target_dir = folder_path

    # Gather matching files
    files: List[str] = []
    for ext in extensions:
        clean_ext = ext.lstrip(".").lower()
        files.extend(glob.glob(os.path.join(target_dir, f"*.{clean_ext}")))
        files.extend(glob.glob(os.path.join(target_dir, f"*.{clean_ext.upper()}")))

    files = sorted(list(set(files)))
    if not files:
        raise ValueError(f"No matching image files found in folder: {target_dir}")

    idx = max(0, min(file_index, len(files) - 1))
    selected_file = files[idx]

    # Read selected file
    with open(selected_file, "rb") as f:
        file_bytes = np.frombuffer(f.read(), dtype=np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError(f"Failed to decode image from folder: {selected_file}")

    h, w = img.shape[:2]
    metadata = {
        "folder": target_dir,
        "selected_file": selected_file,
        "index": idx,
        "total_files": len(files),
        "width": w,
        "height": h,
        "channels": 3 if len(img.shape) == 3 else 1,
    }

    return {"image": img, "file_path": selected_file}, metadata


def image_sequence_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Reads a numbered image sequence based on pattern (e.g. frame_%04d.png or img_{index}.png)."""
    pattern = config.get("pattern", "frame_%04d.png").strip()
    folder_path = config.get("folderPath", "").strip()
    frame_index = int(config.get("frameIndex", 0))

    if not folder_path:
        raise ValueError("Image Sequence node requires 'folderPath'.")

    target_dir = folder_path
    if not os.path.isabs(target_dir) and workspace_dir:
        target_dir = os.path.join(workspace_dir, target_dir)

    try:
        if "%" in pattern:
            filename = pattern % frame_index
        else:
            filename = pattern.format(index=frame_index)
    except Exception as e:
        raise ValueError(f"Invalid sequence pattern format '{pattern}': {e}")

    full_path = os.path.join(target_dir, filename)
    if not os.path.exists(full_path):
        raise FileNotFoundError(f"Sequence frame not found: {full_path}")

    with open(full_path, "rb") as f:
        file_bytes = np.frombuffer(f.read(), dtype=np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError(f"Failed to decode sequence frame: {full_path}")

    h, w = img.shape[:2]
    metadata = {
        "frame_index": frame_index,
        "filename": filename,
        "full_path": full_path,
        "width": w,
        "height": h,
    }

    return {"image": img}, metadata


def image_copy_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Performs an explicit deep copy of input ImageFrame to prevent downstream mutation."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Image Copy node requires valid 'image_in' input.")

    deep_copied = img.copy()
    h, w = deep_copied.shape[:2]
    metadata = {
        "width": w,
        "height": h,
        "channels": 1 if len(deep_copied.shape) == 2 else deep_copied.shape[2],
        "dtype": str(deep_copied.dtype),
        "is_copy": True,
    }

    return {"image_out": deep_copied}, metadata
