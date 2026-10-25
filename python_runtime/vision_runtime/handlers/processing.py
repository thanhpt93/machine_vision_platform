"""Image Processing Handlers (Category 3).

Includes:
- threshold: Fixed binary/trunc/tozero thresholding
- adaptive_threshold: Mean-C and Gaussian-C adaptive thresholding
- otsu_threshold: Automatic Otsu binarization
- color_threshold: HSV, BGR, or Lab inRange segmentation mask
- morphology: Erode, Dilate, Open, Close, Gradient, TopHat, BlackHat
- edge_detection: Canny, Sobel, Scharr, Laplacian
- gradient_derivatives: X/Y derivatives, magnitude, and direction
- image_filter: Kernel convolution (Sharpen, Emboss, Edge, Ridge, Custom)
- hough_transform: Standard lines, probabilistic lines (HoughLinesP), circles (HoughCircles)
- template_matching: Match template with scores and bounding box coordinates
- background_subtraction: Reference subtraction & noise filtering
- image_registration: Traditional ORB feature alignment & homography warp
"""

import cv2
import numpy as np
from typing import Any, Dict, List, Tuple


def threshold_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Binarizes single-channel or grayscale image."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Threshold node requires valid 'image_in' input frame.")

    if len(img.shape) == 3 and img.shape[2] >= 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    thresh_val = float(config.get("threshold", 128))
    max_val = float(config.get("maxVal", 255))
    mode_str = str(config.get("mode", "BINARY")).upper()

    mode_map = {
        "BINARY": cv2.THRESH_BINARY,
        "BINARY_INV": cv2.THRESH_BINARY_INV,
        "TRUNC": cv2.THRESH_TRUNC,
        "TOZERO": cv2.THRESH_TOZERO,
        "TOZERO_INV": cv2.THRESH_TOZERO_INV,
        "OTSU": cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    }

    cv_mode = mode_map.get(mode_str, cv2.THRESH_BINARY)
    ret_thresh, mask = cv2.threshold(gray, thresh_val, max_val, cv_mode)

    white_pixels = int(np.count_nonzero(mask))
    total_pixels = mask.shape[0] * mask.shape[1]
    coverage_pct = round((white_pixels / float(total_pixels)) * 100.0, 2)

    metadata = {
        "mode": mode_str,
        "effective_threshold": ret_thresh,
        "maxVal": max_val,
        "white_pixels": white_pixels,
        "coverage_percent": coverage_pct,
    }

    return {"image_out": mask, "mask_out": mask}, metadata


def adaptive_threshold_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Adaptive thresholding (Mean-C or Gaussian-C)."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Adaptive Threshold node requires valid 'image_in' input frame.")

    if len(img.shape) == 3 and img.shape[2] >= 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    max_val = float(config.get("maxVal", 255))
    method_str = str(config.get("method", "GAUSSIAN")).upper()
    block_size = int(config.get("blockSize", 11))
    c_val = float(config.get("C", 2.0))

    if block_size < 3:
        block_size = 3
    if block_size % 2 == 0:
        block_size += 1

    adaptive_method = cv2.ADAPTIVE_THRESH_GAUSSIAN_C if method_str == "GAUSSIAN" else cv2.ADAPTIVE_THRESH_MEAN_C
    mask = cv2.adaptiveThreshold(gray, max_val, adaptive_method, cv2.THRESH_BINARY, block_size, c_val)

    metadata = {
        "method": method_str,
        "blockSize": block_size,
        "C": c_val,
        "maxVal": max_val,
    }

    return {"image_out": mask, "mask_out": mask}, metadata


def otsu_threshold_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Automatic Otsu binarization returning computed optimal threshold."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Otsu Threshold node requires valid 'image_in' input frame.")

    if len(img.shape) == 3 and img.shape[2] >= 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    invert = bool(config.get("invert", False))
    thresh_type = (cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY) + cv2.THRESH_OTSU

    optimal_thresh, mask = cv2.threshold(gray, 0, 255, thresh_type)

    metadata = {
        "optimal_threshold": float(optimal_thresh),
        "inverted": invert,
    }

    return {"image_out": mask, "mask_out": mask, "threshold_value": float(optimal_thresh)}, metadata


def color_threshold_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Color range segmentation in HSV, BGR, or Lab."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Color Threshold node requires valid 'image_in' input frame.")

    space = str(config.get("colorSpace", "HSV")).upper()
    lower_vals = config.get("lower", [0, 50, 50])
    upper_vals = config.get("upper", [180, 255, 255])

    if space == "HSV":
        converted = cv2.cvtColor(img, cv2.COLOR_BGR2HSV) if len(img.shape) == 3 else img
    elif space == "LAB":
        converted = cv2.cvtColor(img, cv2.COLOR_BGR2LAB) if len(img.shape) == 3 else img
    else:  # BGR
        converted = img

    lower_np = np.array(lower_vals, dtype=np.uint8)
    upper_np = np.array(upper_vals, dtype=np.uint8)

    mask = cv2.inRange(converted, lower_np, upper_np)

    metadata = {
        "colorSpace": space,
        "lower": lower_vals,
        "upper": upper_vals,
        "white_pixels": int(np.count_nonzero(mask)),
    }

    return {"image_out": mask, "mask_out": mask}, metadata


def morphology_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Morphological transformations (Erode, Dilate, Open, Close, Gradient, TopHat, BlackHat)."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Morphology node requires valid 'image_in' input frame.")

    op_str = str(config.get("operation", "OPEN")).upper()
    shape_str = str(config.get("kernelShape", "RECT")).upper()
    ksize = int(config.get("kernelSize", 3))
    iterations = int(config.get("iterations", 1))

    shape_map = {
        "RECT": cv2.MORPH_RECT,
        "CROSS": cv2.MORPH_CROSS,
        "ELLIPSE": cv2.MORPH_ELLIPSE,
    }
    kernel = cv2.getStructuringElement(shape_map.get(shape_str, cv2.MORPH_RECT), (ksize, ksize))

    op_map = {
        "ERODE": cv2.MORPH_ERODE,
        "DILATE": cv2.MORPH_DILATE,
        "OPEN": cv2.MORPH_OPEN,
        "CLOSE": cv2.MORPH_CLOSE,
        "GRADIENT": cv2.MORPH_GRADIENT,
        "TOPHAT": cv2.MORPH_TOPHAT,
        "BLACKHAT": cv2.MORPH_BLACKHAT,
    }

    cv_op = op_map.get(op_str, cv2.MORPH_OPEN)
    res = cv2.morphologyEx(img, cv_op, kernel, iterations=iterations)

    metadata = {
        "operation": op_str,
        "kernelShape": shape_str,
        "kernelSize": ksize,
        "iterations": iterations,
    }

    return {"image_out": res}, metadata


def edge_detection_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Edge detection with Canny, Sobel, Scharr, or Laplacian."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Edge Detection node requires valid 'image_in' input frame.")

    if len(img.shape) == 3 and img.shape[2] >= 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    method = str(config.get("method", "CANNY")).upper()

    if method == "CANNY":
        thresh1 = float(config.get("threshold1", 50))
        thresh2 = float(config.get("threshold2", 150))
        aperture = int(config.get("apertureSize", 3))
        edges = cv2.Canny(gray, thresh1, thresh2, apertureSize=aperture)
    elif method == "SOBEL":
        dx = int(config.get("dx", 1))
        dy = int(config.get("dy", 1))
        ksize = int(config.get("ksize", 3))
        sobelx = cv2.Sobel(gray, cv2.CV_64F, dx, 0, ksize=ksize)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, dy, ksize=ksize)
        mag = np.hypot(sobelx, sobely)
        edges = np.clip((mag / mag.max() if mag.max() > 0 else mag) * 255.0, 0, 255).astype(np.uint8)
    elif method == "SCHARR":
        scharrx = cv2.Scharr(gray, cv2.CV_64F, 1, 0)
        scharry = cv2.Scharr(gray, cv2.CV_64F, 0, 1)
        mag = np.hypot(scharrx, scharry)
        edges = np.clip((mag / mag.max() if mag.max() > 0 else mag) * 255.0, 0, 255).astype(np.uint8)
    else:  # LAPLACIAN
        ksize = int(config.get("ksize", 3))
        lap = cv2.Laplacian(gray, cv2.CV_64F, ksize=ksize)
        edges = cv2.convertScaleAbs(lap)

    metadata = {
        "method": method,
        "width": edges.shape[1],
        "height": edges.shape[0],
    }

    return {"image_out": edges}, metadata


def gradient_derivatives_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Calculates spatial gradients (X/Y derivatives, magnitude, direction)."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Gradient Derivatives node requires valid 'image_in' input frame.")

    if len(img.shape) == 3 and img.shape[2] >= 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    ksize = int(config.get("ksize", 3))
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=ksize)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=ksize)

    mag, angle = cv2.cartToPolar(gx, gy, angleInDegrees=True)
    mag_vis = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)

    metadata = {
        "ksize": ksize,
        "max_gradient": float(mag.max()),
        "mean_gradient": float(mag.mean()),
    }

    return {"image_out": mag_vis, "magnitude": mag, "direction": angle}, metadata


def image_filter_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Linear filter using pre-defined safe convolution kernels."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Image Filter node requires valid 'image_in' input frame.")

    kernel_name = str(config.get("kernelName", "SHARPEN")).upper()

    kernels = {
        "SHARPEN": np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32),
        "EMBOSS": np.array([[-2, -1, 0], [-1, 1, 1], [0, 1, 2]], dtype=np.float32),
        "EDGE_ENHANCE": np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]], dtype=np.float32),
        "RIDGE": np.array([[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]], dtype=np.float32),
    }

    kernel = kernels.get(kernel_name, kernels["SHARPEN"])
    filtered = cv2.filter2D(img, -1, kernel)

    return {"image_out": filtered}, {"kernelName": kernel_name}


def hough_transform_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Detects geometric lines and circles via Hough Transform."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Hough Transform node requires valid 'image_in' input frame.")

    if len(img.shape) == 3 and img.shape[2] >= 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        annotated = img.copy()
    else:
        gray = img.copy()
        annotated = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    mode = str(config.get("mode", "LINES_PROBABILISTIC")).upper()
    lines_found: List[Dict[str, Any]] = []
    circles_found: List[Dict[str, Any]] = []

    if mode == "CIRCLES":
        dp = float(config.get("dp", 1.2))
        min_dist = float(config.get("minDist", 30))
        param1 = float(config.get("param1", 50))
        param2 = float(config.get("param2", 30))
        min_radius = int(config.get("minRadius", 10))
        max_radius = int(config.get("maxRadius", 100))

        blurred = cv2.medianBlur(gray, 5)
        circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=dp,
            minDist=min_dist,
            param1=param1,
            param2=param2,
            minRadius=min_radius,
            maxRadius=max_radius,
        )

        if circles is not None:
            circles = np.uint16(np.around(circles))[0]
            for c in circles:
                cx, cy, r = int(c[0]), int(c[1]), int(c[2])
                circles_found.append({"center_x": cx, "center_y": cy, "radius": r, "diameter": r * 2})
                cv2.circle(annotated, (cx, cy), r, (0, 255, 0), 2)
                cv2.circle(annotated, (cx, cy), 2, (0, 0, 255), 3)

    else:  # LINES_PROBABILISTIC
        threshold = int(config.get("threshold", 50))
        min_line_len = float(config.get("minLineLength", 30))
        max_line_gap = float(config.get("maxLineGap", 10))

        edges = cv2.Canny(gray, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=threshold, minLineLength=min_line_len, maxLineGap=max_line_gap)

        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = map(int, line[0])
                length = float(np.hypot(x2 - x1, y2 - y1))
                angle_deg = float(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
                lines_found.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2, "length": round(length, 2), "angle_deg": round(angle_deg, 2)})
                cv2.line(annotated, (x1, y1), (x2, y2), (0, 255, 255), 2)

    detections = {
        "mode": mode,
        "line_count": len(lines_found),
        "lines": lines_found,
        "circle_count": len(circles_found),
        "circles": circles_found,
    }

    return {"image_out": annotated, "detections": detections}, detections


def template_matching_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Finds pattern matches using cv2.matchTemplate."""
    img = inputs.get("image_in")
    template = inputs.get("template_in")

    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Template Matching requires valid 'image_in' input frame.")
    if template is None or not isinstance(template, np.ndarray):
        raise ValueError("Template Matching requires valid 'template_in' input frame.")

    # Ensure single channel or match channels
    if len(img.shape) == 3 and len(template.shape) == 2:
        template = cv2.cvtColor(template, cv2.COLOR_GRAY2BGR)
    elif len(img.shape) == 2 and len(template.shape) == 3:
        template = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)

    h_t, w_t = template.shape[:2]
    h_i, w_i = img.shape[:2]

    if h_t > h_i or w_t > w_i:
        raise ValueError(f"Template [{w_t}x{h_t}] cannot be larger than input image [{w_i}x{h_i}].")

    method_str = str(config.get("method", "TM_CCOEFF_NORMED")).upper()
    method_map = {
        "TM_SQDIFF": cv2.TM_SQDIFF,
        "TM_SQDIFF_NORMED": cv2.TM_SQDIFF_NORMED,
        "TM_CCORR": cv2.TM_CCORR,
        "TM_CCORR_NORMED": cv2.TM_CCORR_NORMED,
        "TM_CCOEFF": cv2.TM_CCOEFF,
        "TM_CCOEFF_NORMED": cv2.TM_CCOEFF_NORMED,
    }
    cv_method = method_map.get(method_str, cv2.TM_CCOEFF_NORMED)

    res = cv2.matchTemplate(img, template, cv_method)
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)

    if cv_method in (cv2.TM_SQDIFF, cv2.TM_SQDIFF_NORMED):
        match_loc = min_loc
        score = 1.0 - min_val if cv_method == cv2.TM_SQDIFF_NORMED else min_val
    else:
        match_loc = max_loc
        score = max_val

    top_left = match_loc
    bottom_right = (top_left[0] + w_t, top_left[1] + h_t)

    # Annotated preview
    annotated = img.copy()
    if len(annotated.shape) == 2:
        annotated = cv2.cvtColor(annotated, cv2.COLOR_GRAY2BGR)
    cv2.rectangle(annotated, top_left, bottom_right, (0, 255, 0), 2)
    cv2.putText(annotated, f"Match: {score:.2f}", (top_left[0], max(15, top_left[1] - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

    result_data = {
        "score": round(float(score), 4),
        "location": {"x": int(top_left[0]), "y": int(top_left[1])},
        "bounding_box": {"x": int(top_left[0]), "y": int(top_left[1]), "width": int(w_t), "height": int(h_t)},
        "method": method_str,
    }

    return {"image_out": annotated, "detections": result_data}, result_data


def background_subtraction_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Reference image background subtraction with thresholding."""
    current_img = inputs.get("image_in")
    ref_img = inputs.get("reference_in")

    if current_img is None or not isinstance(current_img, np.ndarray):
        raise ValueError("Background Subtraction requires valid 'image_in' input frame.")
    if ref_img is None or not isinstance(ref_img, np.ndarray):
        raise ValueError("Background Subtraction requires valid 'reference_in' input frame.")

    # Match shapes
    h, w = current_img.shape[:2]
    if ref_img.shape[:2] != (h, w):
        ref_img = cv2.resize(ref_img, (w, h), interpolation=cv2.INTER_LINEAR)

    diff = cv2.absdiff(current_img, ref_img)
    if len(diff.shape) == 3:
        diff_gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    else:
        diff_gray = diff

    threshold_val = float(config.get("threshold", 30))
    _, mask = cv2.threshold(diff_gray, threshold_val, 255, cv2.THRESH_BINARY)

    # Clean noise with morphology open
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask_clean = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    changed_pixels = int(np.count_nonzero(mask_clean))
    metadata = {
        "threshold": threshold_val,
        "changed_pixels": changed_pixels,
        "change_percent": round((changed_pixels / float(h * w)) * 100.0, 2),
    }

    return {"image_out": mask_clean, "mask_out": mask_clean}, metadata


def image_registration_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Aligns input image to reference image using ORB feature matching and homography warp."""
    img = inputs.get("image_in")
    ref_img = inputs.get("reference_in")

    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Image Registration requires valid 'image_in' input frame.")
    if ref_img is None or not isinstance(ref_img, np.ndarray):
        raise ValueError("Image Registration requires valid 'reference_in' input frame.")

    max_features = int(config.get("maxFeatures", 500))
    orb = cv2.ORB_create(max_features)

    g1 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    g2 = cv2.cvtColor(ref_img, cv2.COLOR_BGR2GRAY) if len(ref_img.shape) == 3 else ref_img

    kp1, des1 = orb.detectAndCompute(g1, None)
    kp2, des2 = orb.detectAndCompute(g2, None)

    if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
        # Fallback to direct copy if features are insufficient
        return {"image_out": img.copy()}, {"aligned": False, "reason": "Insufficient ORB features"}

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = matcher.match(des1, des2)
    matches = sorted(matches, key=lambda x: x.distance)
    good_matches = matches[: max(10, int(len(matches) * 0.3))]

    if len(good_matches) < 4:
        return {"image_out": img.copy()}, {"aligned": False, "reason": "Insufficient good matches"}

    src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

    homography, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    if homography is None:
        return {"image_out": img.copy()}, {"aligned": False, "reason": "Homography computation failed"}

    h_ref, w_ref = ref_img.shape[:2]
    aligned = cv2.warpPerspective(img, homography, (w_ref, h_ref))

    metadata = {
        "aligned": True,
        "features_detected": len(kp1),
        "good_matches": len(good_matches),
    }

    return {"image_out": aligned}, metadata
