"""Feature Extraction Handlers (Category 5).

Includes:
- contour_detection: OpenCV findContours with hierarchy & annotated overlay
- contour_filter: Filter contours by geometric properties (area, perimeter, circularity)
- blob_analysis: Blob analysis & connected region shape statistics
- shape_analysis: Detailed shape descriptors (solidity, extent, convexity, aspect ratio)
- bounding_geometry: Axis-aligned bbox, rotated bbox, min enclosing circle, convex hull
- corner_detection: Harris and Shi-Tomasi corner extraction
- keypoint_detection: Traditional ORB / FAST keypoint detectors
- line_circle_extraction: Geometric line/circle fitting
- image_statistics: Intensity histogram, mean, variance, min/max within mask/ROI
- projection_profile: 1D horizontal & vertical intensity projections
"""

import cv2
import numpy as np
from typing import Any, Dict, List, Tuple


def contour_detection_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Finds contours from binary mask, filters by area, generates structured results and overlay."""
    mask = inputs.get("mask_in")
    if mask is None or not isinstance(mask, np.ndarray):
        raise ValueError("Contour Detection requires valid 'mask_in' input frame.")

    if len(mask.shape) == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)

    mode_str = str(config.get("mode", "RETR_EXTERNAL")).upper()
    method_str = str(config.get("method", "CHAIN_APPROX_SIMPLE")).upper()
    min_area = float(config.get("minArea", 50))
    max_area = float(config.get("maxArea", 500000))
    draw_bboxes = bool(config.get("drawBoundingBoxes", True))

    mode_map = {
        "RETR_EXTERNAL": cv2.RETR_EXTERNAL,
        "RETR_LIST": cv2.RETR_LIST,
        "RETR_TREE": cv2.RETR_TREE,
    }
    method_map = {
        "CHAIN_APPROX_SIMPLE": cv2.CHAIN_APPROX_SIMPLE,
        "CHAIN_APPROX_NONE": cv2.CHAIN_APPROX_NONE,
    }

    cv_mode = mode_map.get(mode_str, cv2.RETR_EXTERNAL)
    cv_method = method_map.get(method_str, cv2.CHAIN_APPROX_SIMPLE)

    contours, hierarchy = cv2.findContours(mask, cv_mode, cv_method)

    # Annotated preview frame
    h, w = mask.shape[:2]
    annotated = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)

    detections_list: List[Dict[str, Any]] = []
    filtered_contours = []

    for i, cnt in enumerate(contours):
        area = cv2.contourArea(cnt)
        if min_area <= area <= max_area:
            filtered_contours.append(cnt)
            x, y, bw, bh = cv2.boundingRect(cnt)
            m = cv2.moments(cnt)
            cx = float(m["m10"] / m["m00"]) if m["m00"] != 0 else float(x + bw / 2)
            cy = float(m["m01"] / m["m00"]) if m["m00"] != 0 else float(y + bh / 2)

            detections_list.append({
                "id": i + 1,
                "label": f"Defect #{i + 1}",
                "area": round(float(area), 2),
                "bounding_box": {"x": int(x), "y": int(y), "width": int(bw), "height": int(bh)},
                "centroid": {"x": round(cx, 1), "y": round(cy, 1)},
            })

            # Draw contour in bright emerald green
            cv2.drawContours(annotated, [cnt], -1, (0, 255, 128), 2)
            if draw_bboxes:
                cv2.rectangle(annotated, (x, y), (x + bw, y + bh), (0, 200, 255), 1)
                cv2.putText(
                    annotated,
                    f"#{i + 1} ({int(area)})",
                    (x, max(12, y - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.38,
                    (0, 255, 255),
                    1,
                )

    structured_results = {
        "count": len(detections_list),
        "total_contours_found": len(contours),
        "objects": detections_list,
        "detections": detections_list,
    }

    metadata = {
        "count": len(detections_list),
        "total_contours": len(contours),
        "mode": mode_str,
        "method": method_str,
    }

    return {
        "detections": structured_results,
        "image_out": annotated,
        "contours_out": filtered_contours,
        "contours": structured_results,
    }, metadata


def contour_filter_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Filters contour collection by area, perimeter, and circularity."""
    contours = inputs.get("contours_in")
    # If mask is passed instead of contour list, compute contours
    if contours is None and "mask_in" in inputs:
        mask = inputs["mask_in"]
        if len(mask.shape) == 3:
            mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if contours is None:
        raise ValueError("Contour Filter requires 'contours_in' or 'mask_in'.")

    min_area = float(config.get("minArea", 100))
    max_area = float(config.get("maxArea", 1000000))
    min_circularity = float(config.get("minCircularity", 0.0))

    passed = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if not (min_area <= area <= max_area):
            continue
        perimeter = cv2.arcLength(cnt, True)
        circ = (4.0 * np.pi * area) / (perimeter * perimeter) if perimeter > 0 else 0
        if circ >= min_circularity:
            passed.append(cnt)

    return {"contours_out": passed}, {"input_count": len(contours), "passed_count": len(passed)}


def blob_analysis_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Extracts blob geometric statistics (area, centroid, circularity, inertia, convexity)."""
    mask = inputs.get("mask_in")
    if mask is None or not isinstance(mask, np.ndarray):
        raise ValueError("Blob Analysis requires valid 'mask_in' input.")

    if len(mask.shape) == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    blobs: List[Dict[str, Any]] = []

    for idx, cnt in enumerate(contours):
        area = cv2.contourArea(cnt)
        if area < 5:
            continue
        perimeter = cv2.arcLength(cnt, True)
        circ = (4.0 * np.pi * area) / (perimeter * perimeter) if perimeter > 0 else 0
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0

        m = cv2.moments(cnt)
        cx = float(m["m10"] / m["m00"]) if m["m00"] != 0 else 0
        cy = float(m["m01"] / m["m00"]) if m["m00"] != 0 else 0

        blobs.append({
            "id": idx + 1,
            "area": round(float(area), 2),
            "perimeter": round(float(perimeter), 2),
            "circularity": round(float(circ), 3),
            "solidity": round(float(solidity), 3),
            "centroid": {"x": round(cx, 1), "y": round(cy, 1)},
        })

    detections = {"blob_count": len(blobs), "blobs": blobs}
    return {"detections": detections}, detections


def shape_analysis_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Calculates comprehensive shape descriptors for primary contour or mask."""
    mask = inputs.get("mask_in")
    if mask is None or not isinstance(mask, np.ndarray):
        raise ValueError("Shape Analysis requires valid 'mask_in' input frame.")

    if len(mask.shape) == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return {"features": {}}, {"error": "No contours found in mask"}

    # Take the largest contour
    cnt = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(cnt))
    perimeter = float(cv2.arcLength(cnt, True))
    x, y, w, h = cv2.boundingRect(cnt)
    rect_area = float(w * h)
    extent = area / rect_area if rect_area > 0 else 0.0

    hull = cv2.convexHull(cnt)
    hull_area = float(cv2.contourArea(hull))
    solidity = area / hull_area if hull_area > 0 else 0.0
    circularity = (4.0 * np.pi * area) / (perimeter * perimeter) if perimeter > 0 else 0.0
    aspect_ratio = float(w) / float(h) if h > 0 else 0.0

    features = {
        "area": round(area, 2),
        "perimeter": round(perimeter, 2),
        "circularity": round(circularity, 4),
        "solidity": round(solidity, 4),
        "extent": round(extent, 4),
        "aspect_ratio": round(aspect_ratio, 3),
        "bounding_box": {"x": x, "y": y, "width": w, "height": h},
    }

    return {"features": features, "measurement": features}, features


def bounding_geometry_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Computes axis-aligned bounding box, rotated minAreaRect, minEnclosingCircle, and convex hull."""
    mask = inputs.get("mask_in")
    if mask is None or not isinstance(mask, np.ndarray):
        raise ValueError("Bounding Geometry requires valid 'mask_in' input.")

    if len(mask.shape) == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return {"geometry": {}}, {"error": "No contours found"}

    cnt = max(contours, key=cv2.contourArea)

    # 1. Axis-aligned
    x, y, w, h = cv2.boundingRect(cnt)
    # 2. Rotated box
    rect = cv2.minAreaRect(cnt)
    box_pts = cv2.boxPoints(rect).tolist()
    # 3. Min circle
    (cx, cy), radius = cv2.minEnclosingCircle(cnt)

    geom = {
        "axis_aligned": {"x": x, "y": y, "width": w, "height": h},
        "rotated_rect": {
            "center": {"x": round(rect[0][0], 1), "y": round(rect[0][1], 1)},
            "size": {"width": round(rect[1][0], 1), "height": round(rect[1][1], 1)},
            "angle": round(rect[2], 2),
            "points": box_pts,
        },
        "min_enclosing_circle": {
            "center": {"x": round(cx, 1), "y": round(cy, 1)},
            "radius": round(radius, 1),
            "diameter": round(radius * 2, 1),
        },
    }

    return {"geometry": geom}, geom


def corner_detection_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Finds corners using Harris or Shi-Tomasi detector."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Corner Detection requires valid 'image_in' input frame.")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    method = str(config.get("method", "SHI_TOMASI")).upper()
    max_corners = int(config.get("maxCorners", 100))
    quality_level = float(config.get("qualityLevel", 0.01))
    min_dist = float(config.get("minDistance", 10))

    annotated = img.copy()
    if len(annotated.shape) == 2:
        annotated = cv2.cvtColor(annotated, cv2.COLOR_GRAY2BGR)

    corners_list: List[Dict[str, Any]] = []

    if method == "HARRIS":
        block_size = int(config.get("blockSize", 2))
        ksize = int(config.get("ksize", 3))
        k = float(config.get("k", 0.04))
        dst = cv2.cornerHarris(gray, block_size, ksize, k)
        dst_norm = cv2.normalize(dst, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
        y_idxs, x_idxs = np.where(dst_norm > 150)
        for x, y in zip(x_idxs[:max_corners], y_idxs[:max_corners]):
            corners_list.append({"x": int(x), "y": int(y)})
            cv2.circle(annotated, (int(x), int(y)), 4, (0, 0, 255), -1)
    else:  # SHI_TOMASI
        pts = cv2.goodFeaturesToTrack(gray, maxCorners=max_corners, qualityLevel=quality_level, minDistance=min_dist)
        if pts is not None:
            for p in pts:
                x, y = p.ravel()
                corners_list.append({"x": int(x), "y": int(y)})
                cv2.circle(annotated, (int(x), int(y)), 4, (0, 255, 0), -1)

    res = {"corner_count": len(corners_list), "corners": corners_list}
    return {"image_out": annotated, "detections": res}, res


def keypoint_detection_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Detects traditional ORB or FAST visual keypoints."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Keypoint Detection requires valid 'image_in' input.")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    detector_name = str(config.get("detector", "ORB")).upper()
    max_kps = int(config.get("maxKeypoints", 500))

    if detector_name == "FAST":
        fast = cv2.FastFeatureDetector_create()
        kps = fast.detect(gray, None)[:max_kps]
    else:  # ORB
        orb = cv2.ORB_create(max_kps)
        kps = orb.detect(gray, None)

    annotated = cv2.drawKeypoints(img, kps, None, color=(0, 255, 0), flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)
    metadata = {
        "detector": detector_name,
        "keypoint_count": len(kps),
    }

    return {"image_out": annotated}, metadata


def line_circle_extraction_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Extracts geometric lines and circles from edge map or contours."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Line/Circle Extraction requires valid 'image_in'.")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=40, minLineLength=25, maxLineGap=10)

    extracted_lines = []
    if lines is not None:
        for l in lines[:50]:
            x1, y1, x2, y2 = map(int, l[0])
            length = float(np.hypot(x2 - x1, y2 - y1))
            extracted_lines.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": round(length, 1)})

    res = {"line_count": len(extracted_lines), "lines": extracted_lines}
    return {"features": res}, res


def image_statistics_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Calculates pixel intensity statistics (mean, std dev, min, max) within optional mask."""
    img = inputs.get("image_in")
    mask = inputs.get("mask_in")

    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Image Statistics requires valid 'image_in' input frame.")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    mask_np = mask if (mask is not None and isinstance(mask, np.ndarray)) else None

    mean_val, std_val = cv2.meanStdDev(gray, mask=mask_np)
    min_val, max_val, _, _ = cv2.minMaxLoc(gray, mask=mask_np)

    stats = {
        "mean": round(float(mean_val[0][0]), 2),
        "std_dev": round(float(std_val[0][0]), 2),
        "min": float(min_val),
        "max": float(max_val),
    }

    return {"statistics": stats, "measurement": stats}, stats


def projection_profile_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Calculates horizontal (row) and vertical (column) intensity projections."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Projection Profile requires valid 'image_in' input frame.")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

    # Horizontal projection (row sums)
    h_proj = np.sum(gray, axis=1) / 255.0
    # Vertical projection (column sums)
    v_proj = np.sum(gray, axis=0) / 255.0

    profile_data = {
        "horizontal_max": float(h_proj.max()),
        "horizontal_mean": round(float(h_proj.mean()), 1),
        "vertical_max": float(v_proj.max()),
        "vertical_mean": round(float(v_proj.mean()), 1),
    }

    return {"profile": profile_data}, profile_data
