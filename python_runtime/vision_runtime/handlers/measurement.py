"""Measurement & Metrology Handlers (Category 6).

Includes:
- distance_measurement: Euclidean point-to-point and point-to-line distance
- line_measurement: Line length, orientation angle, perpendicular offset
- circle_measurement: Circle least-squares / enclosing circle fitting (supports single & multi-circle concentric detection)
- rectangle_measurement: Bounding box width, height, area, aspect ratio
- angle_measurement: 3-point angle or angle between two lines (degrees/radians)
- caliper_measurement: 1D edge transition detection along inspection profile line
- gap_measurement: Distance/gap between two detected opposing edges
- area_measurement: Pixel area and calibrated physical area
- tolerance_check: Min/Max limit comparison with Pass/Fail verdict
- pixel_calibration: Pixel-to-physical unit conversion (mm, um, inch)
"""

import cv2
import numpy as np
from typing import Any, Dict, List, Tuple


def distance_measurement_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Calculates Euclidean distance between two points."""
    # Point 1 & Point 2 from config or inputs
    x1 = float(config.get("x1", 0.0))
    y1 = float(config.get("y1", 0.0))
    x2 = float(config.get("x2", 100.0))
    y2 = float(config.get("y2", 100.0))

    # Support override from input geometry if provided
    if "p1" in inputs and isinstance(inputs["p1"], dict):
        x1 = float(inputs["p1"].get("x", x1))
        y1 = float(inputs["p1"].get("y", y1))
    if "p2" in inputs and isinstance(inputs["p2"], dict):
        x2 = float(inputs["p2"].get("x", x2))
        y2 = float(inputs["p2"].get("y", y2))

    dx = x2 - x1
    dy = y2 - y1
    distance_px = float(np.hypot(dx, dy))

    scale = float(config.get("scale", 1.0))  # px per unit (e.g. px/mm)
    unit = str(config.get("unit", "px"))
    distance_scaled = distance_px / scale if scale > 0 else distance_px

    res = {
        "distance": round(distance_scaled, 3),
        "distance_px": round(distance_px, 2),
        "dx": round(dx, 2),
        "dy": round(dy, 2),
        "unit": unit,
        "p1": {"x": x1, "y": y1},
        "p2": {"x": x2, "y": y2},
    }

    return {"measurement": res, "scalar_value": res["distance"]}, res


def line_measurement_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Calculates line length and orientation angle."""
    x1 = float(config.get("x1", 0.0))
    y1 = float(config.get("y1", 0.0))
    x2 = float(config.get("x2", 100.0))
    y2 = float(config.get("y2", 0.0))

    dx = x2 - x1
    dy = y2 - y1
    length_px = float(np.hypot(dx, dy))
    angle_rad = float(np.arctan2(dy, dx))
    angle_deg = float(np.degrees(angle_rad))

    res = {
        "length_px": round(length_px, 2),
        "angle_deg": round(angle_deg, 2),
        "angle_rad": round(angle_rad, 4),
        "p1": {"x": x1, "y": y1},
        "p2": {"x": x2, "y": y2},
    }

    return {"measurement": res, "scalar_value": res["length_px"]}, res


def _extract_circles_from_binary(gray_mask: np.ndarray) -> List[Tuple[np.ndarray, float, float, float, float, float]]:
    """Extracts circular contours (both outer and inner concentric circles) using RETR_TREE."""
    contours, hierarchy = cv2.findContours(gray_mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    if not contours or hierarchy is None:
        return []

    h = hierarchy[0]
    candidates: List[Tuple[np.ndarray, float, float, float, float, float]] = []

    for i, cnt in enumerate(contours):
        area = float(cv2.contourArea(cnt))
        if area < 100.0:
            continue

        # Compute tree depth (even = foreground object boundary, odd = hole boundary)
        depth = 0
        parent_idx = int(h[i][3])
        while parent_idx != -1:
            depth += 1
            parent_idx = int(h[parent_idx][3])

        # If this is an odd-depth hole contour that merely wraps an inner foreground circle
        # (like a thin dark ring separating outer and inner circles), skip the outer groove wall
        # so the inner circle itself (at depth + 1) is measured cleanly without duplication.
        first_child = int(h[i][2])
        if depth % 2 == 1 and first_child != -1:
            child_area = float(cv2.contourArea(contours[first_child]))
            if child_area / area >= 0.4:
                continue

        (cx, cy), radius = cv2.minEnclosingCircle(cnt)
        if radius <= 2.0:
            continue

        circle_area = float(np.pi * (radius ** 2))
        fill_ratio = area / circle_area if circle_area > 0 else 0.0
        # Filter out non-circular scratches/defects (true circles have high fill ratio)
        if fill_ratio < 0.55:
            continue

        perim = float(cv2.arcLength(cnt, True))
        candidates.append((cnt, float(cx), float(cy), float(radius), area, perim))

    # Sort from largest radius (outer circle) to smallest radius (inner circle)
    candidates.sort(key=lambda item: item[3], reverse=True)
    return candidates


def circle_measurement_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Fits minimum enclosing circles to binary mask contours (supports concentric outer & inner circles)."""
    mask = inputs.get("mask_in")
    points = inputs.get("points_in")
    preview_img = None

    scale = float(config.get("scale", 1.0))
    if scale <= 0:
        scale = 1.0
    unit = str(config.get("unit", "mm"))
    circle_index = int(config.get("circle_index", 0))

    raw_circles: List[Tuple[Any, float, float, float, float, float]] = []

    if points is not None and len(points) >= 3:
        pts = np.array(points, dtype=np.float32).reshape(-1, 1, 2)
        (cx, cy), radius = cv2.minEnclosingCircle(pts)
        area = float(np.pi * (radius ** 2))
        perim = float(2.0 * np.pi * radius)
        raw_circles.append((None, float(cx), float(cy), float(radius), area, perim))
    elif mask is not None and isinstance(mask, np.ndarray):
        if len(mask.shape) == 3:
            gray_mask = cv2.cvtColor(mask, cv2.cvtColor_BGR2GRAY if hasattr(cv2, "cvtColor_BGR2GRAY") else cv2.COLOR_BGR2GRAY)
            preview_img = mask.copy()
        else:
            gray_mask = mask
            preview_img = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)

        raw_circles = _extract_circles_from_binary(gray_mask)

        # Fallback if no contour passed circularity filter: take largest external contour
        if not raw_circles:
            contours, _ = cv2.findContours(gray_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                raise ValueError("No circle contours found in mask.")
            cnt = max(contours, key=cv2.contourArea)
            area = float(cv2.contourArea(cnt))
            perim = float(cv2.arcLength(cnt, True))
            (cx, cy), radius = cv2.minEnclosingCircle(cnt)
            raw_circles.append((cnt, float(cx), float(cy), float(radius), area, perim))
    else:
        cx = float(config.get("cx", 100))
        cy = float(config.get("cy", 100))
        radius = float(config.get("radius", 50))
        area = float(np.pi * (radius ** 2))
        perim = float(2.0 * np.pi * radius)
        raw_circles.append((None, cx, cy, radius, area, perim))

    detected_circles: List[Dict[str, Any]] = []
    for idx, (cnt, c_x, c_y, r_px, c_area, c_perim) in enumerate(raw_circles):
        d_px = float(r_px * 2.0)
        r_val = round(float(r_px) * scale, 2)
        d_val = round(d_px * scale, 2)
        p_val = round(float(2.0 * np.pi * r_px) * scale, 2)
        a_val = round(float(np.pi * (r_px ** 2)) * (scale ** 2), 2)
        circ = round((4.0 * np.pi * c_area) / (c_perim ** 2), 4) if c_perim > 0 else 1.0

        if len(raw_circles) >= 2 and idx == 0:
            label = "Outer Circle"
        elif len(raw_circles) >= 2 and idx == 1:
            label = "Inner Circle"
        else:
            label = f"Circle #{idx + 1}"

        detected_circles.append({
            "index": idx,
            "label": label,
            "center": {"x": round(c_x, 2), "y": round(c_y, 2)},
            "center_x": round(c_x, 2),
            "center_y": round(c_y, 2),
            "radius_px": round(r_px, 2),
            "diameter_px": round(d_px, 2),
            "radius": r_val,
            "diameter": d_val,
            "perimeter": p_val,
            "area": a_val,
            "circularity": circ,
            "unit": unit,
        })

    selected_idx = min(max(0, circle_index), len(detected_circles) - 1)
    primary = detected_circles[selected_idx]

    res: Dict[str, Any] = {
        "circle_count": len(detected_circles),
        "center": primary["center"],
        "center_x": primary["center_x"],
        "center_y": primary["center_y"],
        "radius_px": primary["radius_px"],
        "diameter_px": primary["diameter_px"],
        "radius": primary["radius"],
        "diameter": primary["diameter"],
        "perimeter": primary["perimeter"],
        "area": primary["area"],
        "circularity": primary["circularity"],
        "scale": scale,
        "unit": unit,
        "circles": detected_circles,
        "algorithm": "cv2.findContours(RETR_TREE) + cv2.minEnclosingCircle",
    }

    if len(detected_circles) >= 2:
        res["outer_diameter"] = detected_circles[0]["diameter"]
        res["outer_radius"] = detected_circles[0]["radius"]
        res["inner_diameter"] = detected_circles[1]["diameter"]
        res["inner_radius"] = detected_circles[1]["radius"]

    outputs: Dict[str, Any] = {
        "measurement": res,
        "scalar_value": primary["diameter"],
    }

    if preview_img is not None:
        # Palette for multiple circles: Outer = Green/Yellow, Inner = Cyan/Orange
        circle_colors = [(0, 255, 128), (255, 220, 0), (255, 120, 255)]
        line_colors = [(0, 220, 255), (0, 140, 255), (255, 180, 0)]

        for idx, c_info in enumerate(detected_circles):
            icx = int(round(c_info["center_x"]))
            icy = int(round(c_info["center_y"]))
            ir = int(round(c_info["radius_px"]))
            c_col = circle_colors[idx % len(circle_colors)]
            l_col = line_colors[idx % len(line_colors)]

            cv2.circle(preview_img, (icx, icy), ir, c_col, 2)
            cv2.circle(preview_img, (icx, icy), 4, (0, 0, 255), -1)

            if idx == 0:
                # Horizontal diameter line for Outer Circle
                cv2.line(preview_img, (icx - ir, icy), (icx + ir, icy), l_col, 2)
                cv2.circle(preview_img, (icx - ir, icy), 4, (0, 0, 255), -1)
                cv2.circle(preview_img, (icx + ir, icy), 4, (0, 0, 255), -1)
            elif idx == 1:
                # Vertical diameter line for Inner Circle so lines don't overlap
                cv2.line(preview_img, (icx, icy - ir), (icx, icy + ir), l_col, 2)
                cv2.circle(preview_img, (icx, icy - ir), 4, (255, 220, 0), -1)
                cv2.circle(preview_img, (icx, icy + ir), 4, (255, 220, 0), -1)

        # Draw compact summary labels at top-left of preview
        box_h = 18 + 20 * len(detected_circles[:3])
        cv2.rectangle(preview_img, (6, 6), (min(preview_img.shape[1] - 6, 295), box_h), (15, 23, 42), -1)
        cv2.rectangle(preview_img, (6, 6), (min(preview_img.shape[1] - 6, 295), box_h), (0, 220, 255), 1)
        for idx, c_info in enumerate(detected_circles[:3]):
            l_col = line_colors[idx % len(line_colors)]
            lbl = f"C{idx + 1} ({c_info['label'].split()[0]}): D={c_info['diameter']}{unit} (R={c_info['radius']}{unit})"
            cv2.putText(
                preview_img,
                lbl,
                (12, 22 + idx * 18),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                l_col,
                1,
                cv2.LINE_AA,
            )

        outputs["image_out"] = preview_img

    return outputs, res


def rectangle_measurement_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Measures rectangle dimensions (width, height, area, aspect ratio)."""
    mask = inputs.get("mask_in")
    if mask is not None and isinstance(mask, np.ndarray):
        if len(mask.shape) == 3:
            mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            cnt = max(contours, key=cv2.contourArea)
            rect = cv2.minAreaRect(cnt)
            (cx, cy), (w, h), angle = rect
        else:
            w = float(config.get("width", 100))
            h = float(config.get("height", 50))
            cx, cy, angle = 0.0, 0.0, 0.0
    else:
        w = float(config.get("width", 100))
        h = float(config.get("height", 50))
        cx, cy, angle = 0.0, 0.0, 0.0

    area = w * h
    aspect = w / h if h > 0 else 0.0

    res = {
        "width": round(float(w), 2),
        "height": round(float(h), 2),
        "area": round(float(area), 2),
        "aspect_ratio": round(float(aspect), 3),
        "rotation_angle": round(float(angle), 2),
    }

    return {"measurement": res, "scalar_value": res["width"]}, res


def angle_measurement_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Calculates vertex angle formed by 3 points (P1 -> Vertex -> P2)."""
    vx = float(config.get("vertex_x", 100))
    vy = float(config.get("vertex_y", 100))
    x1 = float(config.get("p1_x", 50))
    y1 = float(config.get("p1_y", 100))
    x2 = float(config.get("p2_x", 100))
    y2 = float(config.get("p2_y", 50))

    v1 = np.array([x1 - vx, y1 - vy], dtype=np.float64)
    v2 = np.array([x2 - vx, y2 - vy], dtype=np.float64)

    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)

    if norm1 == 0 or norm2 == 0:
        angle_deg = 0.0
    else:
        cos_theta = np.dot(v1, v2) / (norm1 * norm2)
        cos_theta = np.clip(cos_theta, -1.0, 1.0)
        angle_rad = np.arccos(cos_theta)
        angle_deg = float(np.degrees(angle_rad))

    res = {
        "angle_deg": round(float(angle_deg), 2),
        "angle_rad": round(float(np.radians(angle_deg)), 4),
    }

    return {"measurement": res, "scalar_value": res["angle_deg"]}, res


def caliper_measurement_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """1D edge caliper: samples intensity profile along search line and finds gradient transition edge."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Caliper Measurement requires valid 'image_in' input frame.")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

    x1 = int(config.get("x1", 20))
    y1 = int(config.get("y1", 50))
    x2 = int(config.get("x2", 150))
    y2 = int(config.get("y2", 50))
    polarity = str(config.get("polarity", "ANY")).upper()  # 'DARK_TO_LIGHT', 'LIGHT_TO_DARK', 'ANY'

    num_samples = int(np.hypot(x2 - x1, y2 - y1))
    if num_samples < 2:
        num_samples = 2

    # Sample profile
    x_coords = np.linspace(x1, x2, num_samples)
    y_coords = np.linspace(y1, y2, num_samples)
    profile = cv2.remap(
        gray.astype(np.float32),
        x_coords.astype(np.float32),
        y_coords.astype(np.float32),
        interpolation=cv2.INTER_LINEAR,
    ).ravel()

    # Compute 1D gradient
    grad = np.gradient(profile)

    if polarity == "DARK_TO_LIGHT":
        edge_idx = int(np.argmax(grad))
        edge_strength = float(grad[edge_idx])
    elif polarity == "LIGHT_TO_DARK":
        edge_idx = int(np.argmin(grad))
        edge_strength = float(abs(grad[edge_idx]))
    else:  # ANY
        edge_idx = int(np.argmax(np.abs(grad)))
        edge_strength = float(abs(grad[edge_idx]))

    edge_x = round(float(x_coords[edge_idx]), 2)
    edge_y = round(float(y_coords[edge_idx]), 2)

    res = {
        "edge_location": {"x": edge_x, "y": edge_y},
        "edge_strength": round(edge_strength, 2),
        "profile_length": num_samples,
    }

    return {"measurement": res, "scalar_value": edge_x}, res


def gap_measurement_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Measures gap or distance between two edges / contours."""
    e1 = float(config.get("edge1_pos", 50.0))
    e2 = float(config.get("edge2_pos", 120.0))
    gap_px = abs(e2 - e1)

    scale = float(config.get("scale", 1.0))
    unit = str(config.get("unit", "px"))
    gap_scaled = gap_px / scale if scale > 0 else gap_px

    res = {
        "gap": round(gap_scaled, 3),
        "gap_px": round(gap_px, 2),
        "unit": unit,
    }

    return {"measurement": res, "scalar_value": res["gap"]}, res


def area_measurement_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Measures area in pixels and calibrated physical units (mm², cm²)."""
    mask = inputs.get("mask_in")
    if mask is not None and isinstance(mask, np.ndarray):
        pixel_area = float(np.count_nonzero(mask))
    else:
        pixel_area = float(config.get("pixelArea", 1000.0))

    scale = float(config.get("scale", 1.0))  # px per mm
    unit = str(config.get("unit", "mm²"))
    physical_area = pixel_area / (scale * scale) if scale > 0 else pixel_area

    res = {
        "pixel_area": pixel_area,
        "physical_area": round(physical_area, 3),
        "unit": unit,
    }

    return {"measurement": res, "scalar_value": res["physical_area"]}, res


def tolerance_check_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Checks numeric value against tolerance limits [nominal - lower_tol, nominal + upper_tol]."""
    val = inputs.get("value_in")
    if val is None:
        val = float(config.get("value", 10.0))
    elif isinstance(val, dict):
        val = float(val.get("scalar_value", val.get("value", 0.0)))
    else:
        val = float(val)

    nominal = float(config.get("nominal", 10.0))
    lower_tol = float(config.get("lowerTolerance", 1.0))
    upper_tol = float(config.get("upperTolerance", 1.0))

    min_limit = nominal - lower_tol
    max_limit = nominal + upper_tol

    passed = bool(min_limit <= val <= max_limit)
    deviation = val - nominal

    res = {
        "value": val,
        "nominal": nominal,
        "min_limit": min_limit,
        "max_limit": max_limit,
        "deviation": round(deviation, 3),
        "passed": passed,
        "status": "PASS" if passed else "FAIL",
    }

    return {"boolean_out": passed, "measurement": res}, res


def pixel_calibration_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Converts pixel measurement to real-world engineering units."""
    pixel_val = inputs.get("pixels_in")
    if pixel_val is None:
        pixel_val = float(config.get("pixels", 100.0))
    elif isinstance(pixel_val, dict):
        pixel_val = float(pixel_val.get("scalar_value", pixel_val.get("pixels", 100.0)))
    else:
        pixel_val = float(pixel_val)

    pixels_per_unit = float(config.get("pixelsPerUnit", 10.0))
    unit = str(config.get("unit", "mm"))

    calibrated_val = pixel_val / pixels_per_unit if pixels_per_unit > 0 else pixel_val

    res = {
        "pixels": pixel_val,
        "pixels_per_unit": pixels_per_unit,
        "calibrated_value": round(calibrated_val, 3),
        "unit": unit,
    }

    return {"measurement": res, "scalar_value": res["calibrated_value"]}, res
