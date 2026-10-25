"""Image Preparation Handlers (Category 2).

Includes:
- roi_crop: Rectangular ROI slicing with boundary validation
- resize: Dimension resizing with aspect-ratio preservation & interpolation
- color_convert: Color space conversions (BGR/RGB/GRAY/HSV/Lab/YCrCb)
- normalize: Min-Max range normalization
- blur_denoise: Box, Gaussian, Median, Bilateral filter
- brightness_contrast: Linear alpha/beta and gamma correction
- histogram_equalize: Global equalization and CLAHE
- sharpen: Unsharp masking & Laplacian kernel sharpening
- invert: Intensity inversion (255 - img)
- image_arithmetic: Add, Subtract, Multiply, Divide, Weighted Blend, AbsDiff
- flip_rotate: Flip horizontal/vertical/both, rotate 90/180/270 and arbitrary angle
- padding_border: Constant, Replicate, Reflect border padding
"""

import cv2
import numpy as np
from typing import Any, Dict, Tuple


def roi_crop_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Crops a Region of Interest with bounds validation."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("ROI Crop node requires valid 'image_in' input frame.")

    h_img, w_img = img.shape[:2]

    try:
        x = int(config.get("x", 0))
        y = int(config.get("y", 0))
        width = int(config.get("width", w_img))
        height = int(config.get("height", h_img))
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid ROI crop parameter types: {e}")

    if width <= 0 or height <= 0:
        raise ValueError(f"ROI width and height must be strictly positive (got width={width}, height={height}).")

    if x < 0 or y < 0:
        raise ValueError(f"ROI coordinates (x, y) cannot be negative (got x={x}, y={y}).")

    if x + width > w_img or y + height > h_img:
        raise ValueError(
            f"ROI crop [x={x}, y={y}, w={width}, h={height}] exceeds image boundaries [width={w_img}, height={h_img}]."
        )

    cropped = img[y : y + height, x : x + width].copy()

    metadata = {
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "original_width": w_img,
        "original_height": h_img,
        "channels": 1 if len(cropped.shape) == 2 else cropped.shape[2],
        "dtype": str(cropped.dtype),
    }

    return {"image_out": cropped}, metadata


def resize_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Resizes an image frame with interpolation and optional aspect ratio lock."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Resize node requires valid 'image_in' input frame.")

    h_img, w_img = img.shape[:2]
    target_width = int(config.get("width", w_img))
    target_height = int(config.get("height", h_img))
    keep_aspect_ratio = bool(config.get("keepAspectRatio", False))
    interp_name = str(config.get("interpolation", "LINEAR")).upper()

    interp_map = {
        "NEAREST": cv2.INTER_NEAREST,
        "LINEAR": cv2.INTER_LINEAR,
        "CUBIC": cv2.INTER_CUBIC,
        "AREA": cv2.INTER_AREA,
    }
    interpolation = interp_map.get(interp_name, cv2.INTER_LINEAR)

    if target_width <= 0 or target_height <= 0:
        raise ValueError("Target width and height must be strictly positive.")

    if keep_aspect_ratio:
        scale = min(target_width / float(w_img), target_height / float(h_img))
        out_w = max(1, int(w_img * scale))
        out_h = max(1, int(h_img * scale))
    else:
        out_w = target_width
        out_h = target_height

    resized = cv2.resize(img, (out_w, out_h), interpolation=interpolation)

    metadata = {
        "original_width": w_img,
        "original_height": h_img,
        "width": out_w,
        "height": out_h,
        "interpolation": interp_name,
    }

    return {"image_out": resized}, metadata


def color_convert_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Converts image color space (BGR/RGB/GRAY/HSV/Lab/YCrCb)."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Color Space Convert node requires valid 'image_in' input frame.")

    conversion = str(config.get("conversion", "BGR2GRAY")).upper()
    is_3ch = len(img.shape) == 3 and img.shape[2] >= 3
    is_1ch = len(img.shape) == 2 or (len(img.shape) == 3 and img.shape[2] == 1)

    code_map = {
        "BGR2GRAY": cv2.COLOR_BGR2GRAY,
        "RGB2GRAY": cv2.COLOR_RGB2GRAY,
        "GRAY2BGR": cv2.COLOR_GRAY2BGR,
        "BGR2RGB": cv2.COLOR_BGR2RGB,
        "RGB2BGR": cv2.COLOR_RGB2BGR,
        "BGR2HSV": cv2.COLOR_BGR2HSV,
        "HSV2BGR": cv2.COLOR_HSV2BGR,
        "BGR2LAB": cv2.COLOR_BGR2LAB,
        "LAB2BGR": cv2.COLOR_LAB2BGR,
        "BGR2YCRCB": cv2.COLOR_BGR2YCrCb,
        "YCRCB2BGR": cv2.COLOR_YCrCb2BGR,
    }

    if conversion in ("BGR2GRAY", "RGB2GRAY", "BGR2HSV", "BGR2LAB", "BGR2YCRCB") and not is_3ch:
        # If already single-channel and asking for GRAY, pass through
        if conversion in ("BGR2GRAY", "RGB2GRAY"):
            converted = img.copy()
        else:
            raise ValueError(f"Conversion {conversion} requires 3-channel BGR input frame.")
    elif conversion == "GRAY2BGR" and not is_1ch:
        converted = img.copy()
    else:
        code = code_map.get(conversion)
        if code is None:
            raise ValueError(f"Unsupported color conversion '{conversion}'. Supported: {list(code_map.keys())}")
        converted = cv2.cvtColor(img, code)

    h, w = converted.shape[:2]
    channels = 1 if len(converted.shape) == 2 else converted.shape[2]

    metadata = {
        "conversion": conversion,
        "width": w,
        "height": h,
        "channels": channels,
        "dtype": str(converted.dtype),
    }

    return {"image_out": converted}, metadata


def normalize_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Min-Max or L2 normalization."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Normalize node requires valid 'image_in' input frame.")

    min_val = float(config.get("minVal", 0.0))
    max_val = float(config.get("maxVal", 255.0))
    norm_type_str = str(config.get("normType", "MINMAX")).upper()

    norm_type = cv2.NORM_MINMAX if norm_type_str == "MINMAX" else cv2.NORM_INF

    # Handle float vs uint8 output
    if max_val <= 1.0:
        normalized = cv2.normalize(img, None, alpha=min_val, beta=max_val, norm_type=norm_type, dtype=cv2.CV_32F)
    else:
        normalized = cv2.normalize(img, None, alpha=min_val, beta=max_val, norm_type=norm_type, dtype=cv2.CV_8U)

    metadata = {
        "minVal": min_val,
        "maxVal": max_val,
        "normType": norm_type_str,
        "dtype": str(normalized.dtype),
    }

    return {"image_out": normalized}, metadata


def blur_denoise_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Applies Box, Gaussian, Median, or Bilateral blur filtering."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Blur & Denoise node requires valid 'image_in' input frame.")

    filter_type = str(config.get("filterType", "GAUSSIAN")).upper()
    kernel_size = int(config.get("kernelSize", 5))

    # Kernel size must be positive and odd
    if kernel_size <= 0:
        kernel_size = 5
    if kernel_size % 2 == 0:
        kernel_size += 1

    if filter_type == "BOX":
        blurred = cv2.blur(img, (kernel_size, kernel_size))
    elif filter_type == "MEDIAN":
        blurred = cv2.medianBlur(img, kernel_size)
    elif filter_type == "BILATERAL":
        sigma_color = float(config.get("sigmaColor", 75.0))
        sigma_space = float(config.get("sigmaSpace", 75.0))
        d = kernel_size
        blurred = cv2.bilateralFilter(img, d, sigma_color, sigma_space)
    else:  # GAUSSIAN
        sigma_x = float(config.get("sigmaX", 1.5))
        blurred = cv2.GaussianBlur(img, (kernel_size, kernel_size), sigmaX=sigma_x)

    metadata = {
        "filterType": filter_type,
        "kernelSize": kernel_size,
    }

    return {"image_out": blurred}, metadata


def brightness_contrast_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Adjusts brightness and contrast linearly (alpha, beta) and applies gamma correction."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Brightness & Contrast node requires valid 'image_in' input frame.")

    alpha = float(config.get("alpha", 1.0))  # Contrast gain (1.0 = unchanged)
    beta = float(config.get("beta", 0.0))    # Brightness bias (-100 to +100)
    gamma = float(config.get("gamma", 1.0))  # Gamma correction (1.0 = unchanged)

    # Linear transformation: out = alpha * in + beta
    adjusted = cv2.convertScaleAbs(img, alpha=alpha, beta=beta)

    # Gamma correction if gamma != 1.0
    if abs(gamma - 1.0) > 0.01 and gamma > 0:
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        adjusted = cv2.LUT(adjusted, table)

    metadata = {
        "alpha": alpha,
        "beta": beta,
        "gamma": gamma,
    }

    return {"image_out": adjusted}, metadata


def histogram_equalize_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Global Histogram Equalization or CLAHE."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Histogram Equalization node requires valid 'image_in' input frame.")

    method = str(config.get("method", "CLAHE")).upper()
    clip_limit = float(config.get("clipLimit", 2.0))
    tile_size = int(config.get("tileGridSize", 8))

    is_color = len(img.shape) == 3 and img.shape[2] >= 3

    if method == "CLAHE":
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile_size, tile_size))
        if is_color:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            l_eq = clahe.apply(l)
            merged = cv2.merge((l_eq, a, b))
            equalized = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
        else:
            equalized = clahe.apply(img)
    else:  # GLOBAL
        if is_color:
            ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
            y, cr, cb = cv2.split(ycrcb)
            y_eq = cv2.equalizeHist(y)
            merged = cv2.merge((y_eq, cr, cb))
            equalized = cv2.cvtColor(merged, cv2.COLOR_YCrCb2BGR)
        else:
            equalized = cv2.equalizeHist(img)

    metadata = {
        "method": method,
        "clipLimit": clip_limit if method == "CLAHE" else None,
        "tileGridSize": tile_size if method == "CLAHE" else None,
    }

    return {"image_out": equalized}, metadata


def sharpen_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Sharpens image using kernel convolution or unsharp masking."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Sharpen node requires valid 'image_in' input frame.")

    method = str(config.get("method", "UNSHARP")).upper()
    strength = float(config.get("strength", 1.5))

    if method == "UNSHARP":
        gaussian = cv2.GaussianBlur(img, (0, 0), sigmaX=3.0)
        sharpened = cv2.addWeighted(img, 1.0 + strength, gaussian, -strength, 0)
    else:  # KERNEL
        kernel = np.array([[0, -1, 0], [-1, 4 + strength, -1], [0, -1, 0]], dtype=np.float32)
        sharpened = cv2.filter2D(img, -1, kernel)

    metadata = {
        "method": method,
        "strength": strength,
    }

    return {"image_out": sharpened}, metadata


def invert_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Inverts image pixel intensities (bitwise NOT)."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Invert node requires valid 'image_in' input frame.")

    inverted = cv2.bitwise_not(img)
    return {"image_out": inverted}, {"inverted": True}


def image_arithmetic_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Arithmetic operations between two images (ADD, SUBTRACT, MULTIPLY, DIVIDE, BLEND, ABSDIFF)."""
    img_a = inputs.get("image_a")
    img_b = inputs.get("image_b")

    if img_a is None or not isinstance(img_a, np.ndarray):
        raise ValueError("Image Arithmetic node requires valid 'image_a' input.")
    if img_b is None or not isinstance(img_b, np.ndarray):
        raise ValueError("Image Arithmetic node requires valid 'image_b' input.")

    # Match shapes if needed
    h_a, w_a = img_a.shape[:2]
    h_b, w_b = img_b.shape[:2]
    if (h_a, w_a) != (h_b, w_b):
        img_b = cv2.resize(img_b, (w_a, h_a), interpolation=cv2.INTER_LINEAR)

    # Match channel count
    if len(img_a.shape) == 3 and len(img_b.shape) == 2:
        img_b = cv2.cvtColor(img_b, cv2.COLOR_GRAY2BGR)
    elif len(img_a.shape) == 2 and len(img_b.shape) == 3:
        img_a = cv2.cvtColor(img_a, cv2.COLOR_GRAY2BGR)

    operation = str(config.get("operation", "ABSDIFF")).upper()
    alpha = float(config.get("alpha", 0.5))
    beta = float(config.get("beta", 0.5))

    if operation == "ADD":
        res = cv2.add(img_a, img_b)
    elif operation == "SUBTRACT":
        res = cv2.subtract(img_a, img_b)
    elif operation == "MULTIPLY":
        res = cv2.multiply(img_a, img_b, scale=1.0 / 255.0)
    elif operation == "DIVIDE":
        # Safe divide to prevent division by zero
        denom = np.where(img_b == 0, 1, img_b)
        res = np.clip((img_a.astype(np.float32) / denom.astype(np.float32)) * 255.0, 0, 255).astype(np.uint8)
    elif operation == "BLEND":
        res = cv2.addWeighted(img_a, alpha, img_b, beta, 0)
    else:  # ABSDIFF
        res = cv2.absdiff(img_a, img_b)

    metadata = {
        "operation": operation,
        "width": w_a,
        "height": h_a,
    }

    return {"image_out": res}, metadata


def flip_rotate_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Flips (H, V, Both) and rotates (90, 180, 270, arbitrary angle)."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Flip & Rotate node requires valid 'image_in' input frame.")

    flip_mode = str(config.get("flip", "NONE")).upper()
    angle = float(config.get("rotationAngle", 0.0))

    res = img.copy()

    # Flip
    if flip_mode == "HORIZONTAL":
        res = cv2.flip(res, 1)
    elif flip_mode == "VERTICAL":
        res = cv2.flip(res, 0)
    elif flip_mode == "BOTH":
        res = cv2.flip(res, -1)

    # Rotate
    if angle == 90 or angle == -270:
        res = cv2.rotate(res, cv2.ROTATE_90_CLOCKWISE)
    elif angle == 180 or angle == -180:
        res = cv2.rotate(res, cv2.ROTATE_180)
    elif angle == 270 or angle == -90:
        res = cv2.rotate(res, cv2.ROTATE_90_COUNTERCLOCKWISE)
    elif abs(angle) > 0.01:
        h, w = res.shape[:2]
        center = (w / 2.0, h / 2.0)
        matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        res = cv2.warpAffine(res, matrix, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)

    h, w = res.shape[:2]
    metadata = {
        "flip": flip_mode,
        "rotationAngle": angle,
        "width": w,
        "height": h,
    }

    return {"image_out": res}, metadata


def padding_border_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Pads borders around the image frame (Constant, Replicate, Reflect)."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Padding & Border node requires valid 'image_in' input frame.")

    top = int(config.get("top", 10))
    bottom = int(config.get("bottom", 10))
    left = int(config.get("left", 10))
    right = int(config.get("right", 10))
    border_type_str = str(config.get("borderType", "CONSTANT")).upper()
    constant_val = int(config.get("constantValue", 0))

    border_map = {
        "CONSTANT": cv2.BORDER_CONSTANT,
        "REPLICATE": cv2.BORDER_REPLICATE,
        "REFLECT": cv2.BORDER_REFLECT,
    }
    b_type = border_map.get(border_type_str, cv2.BORDER_CONSTANT)

    bordered = cv2.copyMakeBorder(
        img,
        top=top,
        bottom=bottom,
        left=left,
        right=right,
        borderType=b_type,
        value=[constant_val, constant_val, constant_val] if len(img.shape) == 3 else constant_val,
    )

    h, w = bordered.shape[:2]
    metadata = {
        "top": top,
        "bottom": bottom,
        "left": left,
        "right": right,
        "borderType": border_type_str,
        "width": w,
        "height": h,
    }

    return {"image_out": bordered}, metadata
