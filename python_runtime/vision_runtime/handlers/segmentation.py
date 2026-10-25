"""Segmentation Handlers (Category 4).

Includes:
- threshold_segmentation: Multi-level or Otsu/fixed threshold segmentation
- color_segmentation: Color-range segmentation in HSV/Lab with cleanup
- connected_components: Connected components with stats & bounding boxes
- watershed_segmentation: Marker-based watershed segmentation
- grabcut_segmentation: Foreground/background GrabCut segmentation
- mask_operations: Logical bitwise operations (AND, OR, XOR, NOT) between masks
- region_filter: Filter regions by area, width, height, aspect ratio
"""

import cv2
import numpy as np
from typing import Any, Dict, List, Tuple


def threshold_segmentation_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Segments image using thresholding (Fixed or Otsu)."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Threshold Segmentation requires valid 'image_in' input frame.")

    if len(img.shape) == 3 and img.shape[2] >= 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    method = str(config.get("method", "OTSU")).upper()
    thresh_val = float(config.get("threshold", 128))

    if method == "OTSU":
        ret, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:
        ret, mask = cv2.threshold(gray, thresh_val, 255, cv2.THRESH_BINARY)

    return {"mask_out": mask, "image_out": mask}, {"threshold": float(ret), "method": method}


def color_segmentation_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Segments regions by color range in HSV or Lab with optional noise cleanup."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Color Segmentation requires valid 'image_in' input frame.")

    space = str(config.get("colorSpace", "HSV")).upper()
    lower = np.array(config.get("lower", [0, 50, 50]), dtype=np.uint8)
    upper = np.array(config.get("upper", [180, 255, 255]), dtype=np.uint8)
    cleanup = bool(config.get("cleanup", True))

    converted = cv2.cvtColor(img, cv2.COLOR_BGR2HSV if space == "HSV" else cv2.COLOR_BGR2LAB)
    mask = cv2.inRange(converted, lower, upper)

    if cleanup:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    return {"mask_out": mask, "image_out": mask}, {"colorSpace": space, "cleanup": cleanup}


def connected_components_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Labels connected components and returns statistics (bounding box, area, centroid)."""
    mask = inputs.get("mask_in")
    if mask is None or not isinstance(mask, np.ndarray):
        raise ValueError("Connected Components requires valid 'mask_in' input.")

    if len(mask.shape) == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)

    connectivity = int(config.get("connectivity", 8))
    min_area = float(config.get("minArea", 10.0))
    max_area = float(config.get("maxArea", 1000000.0))

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=connectivity)

    components: List[Dict[str, Any]] = []
    filtered_mask = np.zeros_like(mask)

    # Label 0 is background
    for i in range(1, num_labels):
        x = int(stats[i, cv2.CC_STAT_LEFT])
        y = int(stats[i, cv2.CC_STAT_TOP])
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        area = int(stats[i, cv2.CC_STAT_AREA])
        cx, cy = float(centroids[i][0]), float(centroids[i][1])

        if min_area <= area <= max_area:
            components.append({
                "label": i,
                "x": x,
                "y": y,
                "width": w,
                "height": h,
                "area": area,
                "centroid": {"x": round(cx, 2), "y": round(cy, 2)},
            })
            filtered_mask[labels == i] = 255

    # Visual false-color display
    color_map = np.zeros((mask.shape[0], mask.shape[1], 3), dtype=np.uint8)
    np.random.seed(42)
    colors = np.random.randint(0, 255, size=(num_labels, 3), dtype=np.uint8)
    colors[0] = [0, 0, 0]  # Background is black
    for i in range(1, num_labels):
        if min_area <= stats[i, cv2.CC_STAT_AREA] <= max_area:
            color_map[labels == i] = colors[i]

    detections = {
        "component_count": len(components),
        "total_components": num_labels - 1,
        "components": components,
    }

    return {"mask_out": filtered_mask, "image_out": color_map, "detections": detections}, detections


def watershed_segmentation_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Marker-controlled watershed segmentation for separating touching objects."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Watershed Segmentation requires valid 'image_in' input frame.")

    if len(img.shape) == 2:
        img_color = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        gray = img
    else:
        img_color = img.copy()
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Binarize using Otsu
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # 2. Noise removal
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)

    # 3. Sure background
    sure_bg = cv2.dilate(opening, kernel, iterations=3)

    # 4. Sure foreground via distance transform
    dist_transform = cv2.distanceTransform(opening, cv2.DIST_L2, 5)
    fg_ratio = float(config.get("foregroundRatio", 0.5))
    _, sure_fg = cv2.threshold(dist_transform, fg_ratio * dist_transform.max(), 255, 0)
    sure_fg = np.uint8(sure_fg)

    # 5. Unknown region
    unknown = cv2.subtract(sure_bg, sure_fg)

    # 6. Marker labelling
    _, markers = cv2.connectedComponents(sure_fg)
    markers = markers + 1
    markers[unknown == 255] = 0

    # 7. Apply watershed
    markers = cv2.watershed(img_color, markers)
    img_color[markers == -1] = [0, 0, 255]  # Mark boundaries in red

    # Colorize regions
    num_markers = int(markers.max())
    metadata = {
        "num_regions": max(0, num_markers - 1),
    }

    return {"image_out": img_color}, metadata


def grabcut_segmentation_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Foreground segmentation using GrabCut with rectangle bounding box."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("GrabCut requires valid 'image_in' input frame.")

    if len(img.shape) == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    h, w = img.shape[:2]
    # Default margin rect (10% inward)
    margin_x = int(w * 0.1)
    margin_y = int(h * 0.1)
    rect = (margin_x, margin_y, w - 2 * margin_x, h - 2 * margin_y)

    iter_count = int(config.get("iterations", 3))
    mask = np.zeros(img.shape[:2], np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    cv2.grabCut(img, mask, rect, bgd_model, fgd_model, iter_count, cv2.GC_INIT_WITH_RECT)
    mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype("uint8")
    result_img = img * mask2[:, :, np.newaxis]
    binary_mask = (mask2 * 255).astype(np.uint8)

    metadata = {
        "rect": rect,
        "iterations": iter_count,
        "foreground_pixels": int(np.count_nonzero(binary_mask)),
    }

    return {"image_out": result_img, "mask_out": binary_mask}, metadata


def mask_operations_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Bitwise logic operations (AND, OR, XOR, NOT) between binary masks."""
    mask_a = inputs.get("mask_a")
    mask_b = inputs.get("mask_b")
    op = str(config.get("operation", "AND")).upper()

    if mask_a is None or not isinstance(mask_a, np.ndarray):
        raise ValueError("Mask Operations requires valid 'mask_a' input.")

    if len(mask_a.shape) == 3:
        mask_a = cv2.cvtColor(mask_a, cv2.COLOR_BGR2GRAY)

    if op == "NOT":
        res = cv2.bitwise_not(mask_a)
        return {"mask_out": res, "image_out": res}, {"operation": "NOT"}

    if mask_b is None or not isinstance(mask_b, np.ndarray):
        raise ValueError(f"Mask Operations '{op}' requires valid 'mask_b' input.")

    if len(mask_b.shape) == 3:
        mask_b = cv2.cvtColor(mask_b, cv2.COLOR_BGR2GRAY)

    # Align dimensions if necessary
    h_a, w_a = mask_a.shape[:2]
    h_b, w_b = mask_b.shape[:2]
    if (h_a, w_a) != (h_b, w_b):
        mask_b = cv2.resize(mask_b, (w_a, h_a), interpolation=cv2.INTER_NEAREST)

    if op == "OR":
        res = cv2.bitwise_or(mask_a, mask_b)
    elif op == "XOR":
        res = cv2.bitwise_xor(mask_a, mask_b)
    else:  # AND
        res = cv2.bitwise_and(mask_a, mask_b)

    metadata = {
        "operation": op,
        "active_pixels": int(np.count_nonzero(res)),
    }

    return {"mask_out": res, "image_out": res}, metadata


def region_filter_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Filters binary mask regions based on geometric constraints (area, aspect ratio, bounds)."""
    mask = inputs.get("mask_in")
    if mask is None or not isinstance(mask, np.ndarray):
        raise ValueError("Region Filter requires valid 'mask_in' input.")

    if len(mask.shape) == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)

    min_area = float(config.get("minArea", 50))
    max_area = float(config.get("maxArea", 1000000))
    min_aspect = float(config.get("minAspectRatio", 0.1))
    max_aspect = float(config.get("maxAspectRatio", 10.0))

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out_mask = np.zeros_like(mask)
    passed_count = 0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if not (min_area <= area <= max_area):
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        aspect = float(w) / float(h) if h > 0 else 0
        if min_aspect <= aspect <= max_aspect:
            cv2.drawContours(out_mask, [cnt], -1, 255, -1)
            passed_count += 1

    metadata = {
        "total_contours": len(contours),
        "passed_regions": passed_count,
    }

    return {"mask_out": out_mask, "image_out": out_mask}, metadata
