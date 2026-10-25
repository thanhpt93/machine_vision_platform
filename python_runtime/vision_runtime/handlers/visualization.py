"""Visualization Handlers (Category 8).

Includes:
- result_viewer: Primary inspection sink & display
- image_overlay: Blends mask / annotation overlays with alpha opacity
- draw_roi: Draws rectangles & bounding boxes with labels
- draw_contours: Draws contours, convex hulls, and centers
- draw_measurement: Draws dimension callout lines, arrows, distance text, and multi-circle overlays
- draw_labels: Draws text stamps, OK/NG badges
- mask_viewer: Colorizes binary masks via colormaps (JET, VIRIDIS, HOT, BONE)
- histogram_viewer: Renders visual 256-bin intensity histogram chart
- inspection_result_viewer: Renders final OK/NG verdict card
"""

import cv2
import numpy as np
from typing import Any, Dict, List, Tuple


def result_viewer_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Terminal sink node that displays final visual inspection frame."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Result Viewer node requires valid 'image_in' input frame.")

    h, w = img.shape[:2]
    channels = 1 if len(img.shape) == 2 else img.shape[2]
    title = str(config.get("title", "Main Inspection Output"))
    zoom_level = float(config.get("zoomLevel", 1.0))

    detections = inputs.get("detections_in")
    det_count = 0
    if isinstance(detections, dict):
        det_count = detections.get("count", len(detections.get("items", detections.get("objects", []))))

    metadata = {
        "title": title,
        "width": w,
        "height": h,
        "channels": channels,
        "dtype": str(img.dtype),
        "zoom_level": zoom_level,
        "has_detections": detections is not None,
        "detection_count": det_count,
    }
    if detections is not None:
        metadata["detections"] = detections

    outputs = {"image_out": img, "display_image": img}
    if detections is not None:
        outputs["structured_result"] = detections

    return outputs, metadata


def image_overlay_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Blends a mask or secondary image over the source image with opacity."""
    src = inputs.get("image_in")
    overlay = inputs.get("overlay_in")

    if src is None or not isinstance(src, np.ndarray):
        raise ValueError("Image Overlay requires valid 'image_in' input frame.")
    if overlay is None or not isinstance(overlay, np.ndarray):
        raise ValueError("Image Overlay requires valid 'overlay_in' input frame.")

    if len(src.shape) == 2:
        src = cv2.cvtColor(src, cv2.COLOR_GRAY2BGR)

    h, w = src.shape[:2]
    if overlay.shape[:2] != (h, w):
        overlay = cv2.resize(overlay, (w, h), interpolation=cv2.INTER_NEAREST)

    if len(overlay.shape) == 2:
        # Convert mask to colored overlay (e.g. green tint)
        color_overlay = np.zeros_like(src)
        color_overlay[overlay > 0] = [0, 255, 0]
    else:
        color_overlay = overlay

    opacity = float(config.get("opacity", 0.4))
    blended = cv2.addWeighted(src, 1.0 - opacity, color_overlay, opacity, 0)

    return {"image_out": blended}, {"opacity": opacity}


def draw_roi_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Renders ROI rectangles on top of image with labels."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Draw ROI requires valid 'image_in'.")

    out = img.copy()
    if len(out.shape) == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)

    x = int(config.get("x", 50))
    y = int(config.get("y", 50))
    w = int(config.get("width", 100))
    h = int(config.get("height", 80))
    label = str(config.get("label", "ROI"))

    cv2.rectangle(out, (x, y), (x + w, y + h), (0, 255, 255), 2)
    cv2.putText(out, label, (x, max(15, y - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

    return {"image_out": out}, {"x": x, "y": y, "width": w, "height": h, "label": label}


def draw_contours_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Draws contours or binary mask boundaries on image."""
    img = inputs.get("image_in")
    mask = inputs.get("mask_in")

    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Draw Contours requires valid 'image_in'.")

    out = img.copy()
    if len(out.shape) == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)

    if mask is not None and isinstance(mask, np.ndarray):
        if len(mask.shape) == 3:
            mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    else:
        contours = inputs.get("contours_in", [])

    cv2.drawContours(out, contours, -1, (0, 255, 0), 2)
    return {"image_out": out}, {"contour_count": len(contours)}


def draw_measurement_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Draws measurement dimensions (lines, arrows, circles, callout text)."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Draw Measurement requires valid 'image_in'.")

    out = img.copy()
    if len(out.shape) == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)

    meas = inputs.get("measurement_in") or inputs.get("measurement")
    if isinstance(meas, dict) and "center" in meas and ("radius" in meas or "radius_px" in meas):
        unit = str(meas.get("unit", "mm"))
        circles_list = meas.get("circles")
        if not isinstance(circles_list, list) or len(circles_list) == 0:
            center = meas.get("center", {})
            circles_list = [{
                "index": 0,
                "label": "Circle #1",
                "center_x": float(center.get("x", 170)),
                "center_y": float(center.get("y", 170)),
                "radius_px": float(meas.get("radius_px", meas.get("radius", 50))),
                "radius": meas.get("radius", 50),
                "diameter": meas.get("diameter", 100),
                "unit": unit,
            }]

        # Distinct colors for Outer Circle (Green/Yellow) vs Inner Circle (Cyan/Orange)
        circle_colors = [(0, 255, 128), (255, 220, 0), (255, 120, 255)]
        line_colors = [(0, 220, 255), (0, 140, 255), (255, 180, 0)]

        for idx, c_info in enumerate(circles_list):
            cx = int(round(float(c_info.get("center_x", 170))))
            cy = int(round(float(c_info.get("center_y", 170))))
            r_px = int(round(float(c_info.get("radius_px", c_info.get("radius", 50)))))
            c_col = circle_colors[idx % len(circle_colors)]
            l_col = line_colors[idx % len(line_colors)]

            # 1. Draw circle perimeter
            cv2.circle(out, (cx, cy), r_px, c_col, 2)
            # 2. Draw center crosshair + center dot
            cv2.line(out, (cx - 8, cy), (cx + 8, cy), (0, 0, 255), 1)
            cv2.line(out, (cx, cy - 8), (cx, cy + 8), (0, 0, 255), 1)
            cv2.circle(out, (cx, cy), 4, (0, 0, 255), -1)

            if idx == 0:
                # Horizontal diameter line for Circle #1 (Outer Circle)
                cv2.line(out, (cx - r_px, cy), (cx + r_px, cy), l_col, 2)
                cv2.line(out, (cx - r_px, cy - 10), (cx - r_px, cy + 10), l_col, 2)
                cv2.line(out, (cx + r_px, cy - 10), (cx + r_px, cy + 10), l_col, 2)
                cv2.circle(out, (cx - r_px, cy), 4, (0, 0, 255), -1)
                cv2.circle(out, (cx + r_px, cy), 4, (0, 0, 255), -1)
            elif idx == 1:
                # Vertical diameter line for Circle #2 (Inner Circle) so lines never overlap
                cv2.line(out, (cx, cy - r_px), (cx, cy + r_px), l_col, 2)
                cv2.line(out, (cx - 10, cy - r_px), (cx + 10, cy - r_px), l_col, 2)
                cv2.line(out, (cx - 10, cy + r_px), (cx + 10, cy + r_px), l_col, 2)
                cv2.circle(out, (cx, cy - r_px), 4, c_col, -1)
                cv2.circle(out, (cx, cy + r_px), 4, c_col, -1)
            else:
                # 45-degree diameter line for any additional circles
                dx = int(round(r_px * 0.7071))
                dy = int(round(r_px * 0.7071))
                cv2.line(out, (cx - dx, cy - dy), (cx + dx, cy + dy), l_col, 2)
                cv2.circle(out, (cx - dx, cy - dy), 4, c_col, -1)
                cv2.circle(out, (cx + dx, cy + dy), 4, c_col, -1)

        # Draw high-contrast HUD callout box at top-left showing all detected circles
        shown = circles_list[:3]
        box_h = 24 + 18 * len(shown)
        cv2.rectangle(out, (6, 6), (min(out.shape[1] - 6, 305), box_h), (15, 23, 42), -1)
        cv2.rectangle(out, (6, 6), (min(out.shape[1] - 6, 305), box_h), (0, 220, 255), 1)

        summary_texts: List[str] = []
        for idx, c_info in enumerate(shown):
            l_col = line_colors[idx % len(line_colors)]
            lbl_short = str(c_info.get("label", f"C{idx + 1}")).split()[0]
            dia_v = c_info.get("diameter")
            rad_v = c_info.get("radius")
            line_txt = f"C{idx + 1} ({lbl_short}): Dia {dia_v} {unit} (R {rad_v} {unit})"
            summary_texts.append(line_txt)
            cv2.putText(
                out,
                line_txt,
                (12, 22 + idx * 18),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                l_col,
                1,
                cv2.LINE_AA,
            )

        primary = circles_list[0]
        meta_out: Dict[str, Any] = {
            "circle_count": len(circles_list),
            "text": " | ".join(summary_texts),
            "center_x": int(round(float(primary.get("center_x", 170)))),
            "center_y": int(round(float(primary.get("center_y", 170)))),
            "radius": primary.get("radius"),
            "diameter": primary.get("diameter"),
            "unit": unit,
            "circles": circles_list,
        }
        if len(circles_list) >= 2:
            meta_out["outer_diameter"] = circles_list[0].get("diameter")
            meta_out["outer_radius"] = circles_list[0].get("radius")
            meta_out["inner_diameter"] = circles_list[1].get("diameter")
            meta_out["inner_radius"] = circles_list[1].get("radius")

        return {"image_out": out}, meta_out

    elif isinstance(meas, dict) and "p1" in meas and "p2" in meas:
        p1 = meas.get("p1", {})
        p2 = meas.get("p2", {})
        x1 = int(p1.get("x", 50))
        y1 = int(p1.get("y", 100))
        x2 = int(p2.get("x", 200))
        y2 = int(p2.get("y", 100))
        dist = meas.get("distance", meas.get("length_px", 0))
        unit = str(meas.get("unit", "px"))
        text = f"{dist} {unit}"

        cv2.line(out, (x1, y1), (x2, y2), (255, 100, 0), 2)
        cv2.circle(out, (x1, y1), 3, (0, 0, 255), -1)
        cv2.circle(out, (x2, y2), 3, (0, 0, 255), -1)
        mid_x = int((x1 + x2) / 2)
        mid_y = int((y1 + y2) / 2)
        cv2.putText(out, text, (mid_x, mid_y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 100, 0), 2)
        return {"image_out": out}, {"text": text, "measurement": meas}

    else:
        x1 = int(config.get("x1", 50))
        y1 = int(config.get("y1", 100))
        x2 = int(config.get("x2", 200))
        y2 = int(config.get("y2", 100))
        text = str(config.get("text", "15.0 mm"))

        cv2.line(out, (x1, y1), (x2, y2), (255, 100, 0), 2)
        cv2.circle(out, (x1, y1), 3, (0, 0, 255), -1)
        cv2.circle(out, (x2, y2), 3, (0, 0, 255), -1)

        mid_x = int((x1 + x2) / 2)
        mid_y = int((y1 + y2) / 2)
        cv2.putText(out, text, (mid_x, mid_y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 100, 0), 2)

        return {"image_out": out}, {"text": text}


def draw_labels_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Renders text stamps, defect labels, or OK/NG badges."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Draw Labels requires valid 'image_in'.")

    out = img.copy()
    if len(out.shape) == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)

    text = str(config.get("text", "INSPECTED"))
    x = int(config.get("x", 20))
    y = int(config.get("y", 30))
    color = (0, 255, 0) if "OK" in text.upper() else (0, 0, 255)

    cv2.putText(out, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
    return {"image_out": out}, {"text": text}


def mask_viewer_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Colorizes single-channel mask using a pseudo-color colormap."""
    mask = inputs.get("mask_in")
    if mask is None or not isinstance(mask, np.ndarray):
        raise ValueError("Mask Viewer requires valid 'mask_in'.")

    if len(mask.shape) == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)

    cmap_name = str(config.get("colormap", "JET")).upper()
    cmap_dict = {
        "JET": cv2.COLORMAP_JET,
        "VIRIDIS": cv2.COLORMAP_VIRIDIS,
        "HOT": cv2.COLORMAP_HOT,
        "BONE": cv2.COLORMAP_BONE,
    }
    cv_cmap = cmap_dict.get(cmap_name, cv2.COLORMAP_JET)
    colorized = cv2.applyColorMap(mask, cv_cmap)

    return {"image_out": colorized}, {"colormap": cmap_name}


def histogram_viewer_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Renders visual 256-bin intensity histogram plot."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Histogram Viewer requires valid 'image_in'.")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).ravel()

    # Draw histogram chart image (256x150)
    chart_h = 150
    chart_w = 256
    chart = np.zeros((chart_h, chart_w, 3), dtype=np.uint8)
    max_h = hist.max() if hist.max() > 0 else 1.0

    for i in range(256):
        val = int((hist[i] / max_h) * (chart_h - 10))
        cv2.line(chart, (i, chart_h - 1), (i, chart_h - 1 - val), (0, 200, 255), 1)

    return {"image_out": chart, "histogram_data": hist.tolist()}, {"max_bin_count": float(max_h)}


def inspection_result_viewer_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Renders visual summary card with OK/NG stamp and metrics."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        out = np.zeros((200, 400, 3), dtype=np.uint8)
    else:
        out = img.copy()
        if len(out.shape) == 2:
            out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)

    verdict = str(inputs.get("verdict", config.get("verdict", "OK"))).upper()
    is_ok = verdict == "OK"

    # Draw banner
    h, w = out.shape[:2]
    badge_color = (0, 180, 0) if is_ok else (0, 0, 200)
    cv2.rectangle(out, (10, 10), (160, 50), badge_color, -1)
    cv2.putText(out, f"STATUS: {verdict}", (20, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    return {"image_out": out}, {"verdict": verdict, "is_ok": is_ok}
