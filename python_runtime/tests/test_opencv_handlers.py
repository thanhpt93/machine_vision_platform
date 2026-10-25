"""Unit tests for OpenCV vision processing handlers."""

import os
import cv2
import numpy as np
import pytest

from vision_runtime.handlers import (
    image_loader_handler,
    roi_crop_handler,
    grayscale_handler,
    threshold_handler,
    contour_detection_handler,
    result_viewer_handler,
    gaussian_blur_handler,
)


@pytest.fixture
def sample_test_image(tmp_path) -> str:
    """Creates a temporary test image file with known shapes."""
    img_path = str(tmp_path / "test_pattern.png")
    img = np.full((200, 300, 3), (40, 40, 40), dtype=np.uint8)
    # Draw two bright white squares for threshold & contour tests
    cv2.rectangle(img, (20, 20), (80, 80), (255, 255, 255), -1)
    cv2.rectangle(img, (150, 100), (250, 180), (255, 255, 255), -1)
    cv2.imwrite(img_path, img)
    return img_path


def test_image_loader_valid(sample_test_image):
    outputs, meta = image_loader_handler(
        inputs={},
        config={"filePath": sample_test_image},
    )
    assert "image" in outputs
    img = outputs["image"]
    assert isinstance(img, np.ndarray)
    assert meta["width"] == 300
    assert meta["height"] == 200
    assert meta["channels"] == 3
    assert meta["color_space"] == "BGR"


def test_image_loader_missing_file():
    with pytest.raises(FileNotFoundError, match="Image file does not exist"):
        image_loader_handler(
            inputs={},
            config={"filePath": "non_existent_image_12345.png"},
        )


def test_image_loader_empty_path():
    with pytest.raises(ValueError, match="requires 'filePath'"):
        image_loader_handler(inputs={}, config={})


def test_roi_crop_valid(sample_test_image):
    outputs, _ = image_loader_handler({}, {"filePath": sample_test_image})
    img = outputs["image"]

    crop_out, meta = roi_crop_handler(
        inputs={"image_in": img},
        config={"x": 10, "y": 10, "width": 100, "height": 80},
    )
    cropped = crop_out["image_out"]
    assert cropped.shape == (80, 100, 3)
    assert meta["width"] == 100
    assert meta["height"] == 80


def test_roi_crop_out_of_bounds(sample_test_image):
    outputs, _ = image_loader_handler({}, {"filePath": sample_test_image})
    img = outputs["image"]

    with pytest.raises(ValueError, match="exceeds image boundaries"):
        roi_crop_handler(
            inputs={"image_in": img},
            config={"x": 250, "y": 150, "width": 100, "height": 100},
        )


def test_roi_crop_negative_coordinates(sample_test_image):
    outputs, _ = image_loader_handler({}, {"filePath": sample_test_image})
    img = outputs["image"]

    with pytest.raises(ValueError, match="cannot be negative"):
        roi_crop_handler(
            inputs={"image_in": img},
            config={"x": -10, "y": 0, "width": 50, "height": 50},
        )


def test_grayscale_conversion(sample_test_image):
    outputs, _ = image_loader_handler({}, {"filePath": sample_test_image})
    img = outputs["image"]

    gray_out, meta = grayscale_handler(
        inputs={"image_in": img},
        config={"equalizeHist": True},
    )
    gray = gray_out["image_out"]
    assert len(gray.shape) == 2
    assert meta["channels"] == 1
    assert meta["color_space"] == "GRAYSCALE"
    assert meta["histogram_equalized"] is True


def test_threshold_modes(sample_test_image):
    outputs, _ = image_loader_handler({}, {"filePath": sample_test_image})
    gray_out, _ = grayscale_handler({"image_in": outputs["image"]}, {})
    gray = gray_out["image_out"]

    # Test BINARY mode
    thresh_out, meta = threshold_handler(
        inputs={"image_in": gray},
        config={"threshold": 128, "mode": "BINARY", "maxVal": 255},
    )
    mask = thresh_out["image_out"]
    assert mask.shape == gray.shape
    assert meta["mode"] == "BINARY"
    assert meta["white_pixels"] > 0

    # Test OTSU mode
    otsu_out, otsu_meta = threshold_handler(
        inputs={"image_in": gray},
        config={"threshold": 0, "mode": "OTSU", "maxVal": 255},
    )
    assert otsu_meta["mode"] == "OTSU"
    assert otsu_meta["threshold"] > 0


def test_threshold_invalid_range():
    fake_img = np.zeros((50, 50), dtype=np.uint8)
    with pytest.raises(ValueError, match="Threshold value must be between 0 and 255"):
        threshold_handler(
            inputs={"image_in": fake_img},
            config={"threshold": 300, "mode": "BINARY"},
        )


def test_contour_detection(sample_test_image):
    outputs, _ = image_loader_handler({}, {"filePath": sample_test_image})
    gray_out, _ = grayscale_handler({"image_in": outputs["image"]}, {})
    thresh_out, _ = threshold_handler({"image_in": gray_out["image_out"]}, {"threshold": 128})
    mask = thresh_out["image_out"]

    cnt_out, meta = contour_detection_handler(
        inputs={"mask_in": mask},
        config={
            "mode": "RETR_EXTERNAL",
            "method": "CHAIN_APPROX_SIMPLE",
            "minArea": 100,
            "maxArea": 100000,
            "drawBoundingBoxes": True,
        },
    )

    dets = cnt_out["detections"]
    annotated = cnt_out["image_out"]

    assert dets["count"] == 2  # exactly two rectangular white blobs
    assert len(dets["items"]) == 2
    assert meta["detection_count"] == 2
    assert annotated.shape == (200, 300, 3)  # color overlay

    # Inspect first box
    item = dets["items"][0]
    assert item["area"] > 100
    assert "x" in item and "y" in item and "width" in item and "height" in item
    assert len(item["centroid"]) == 2


def test_result_viewer_sink(sample_test_image):
    outputs, _ = image_loader_handler({}, {"filePath": sample_test_image})
    res_out, meta = result_viewer_handler(
        inputs={"image_in": outputs["image"], "detections_in": {"count": 3}},
        config={"title": "Test Viewer"},
    )
    assert meta["title"] == "Test Viewer"
    assert meta["detection_count"] == 3
    assert "display_image" in res_out


def test_gaussian_blur(sample_test_image):
    outputs, _ = image_loader_handler({}, {"filePath": sample_test_image})
    blur_out, meta = gaussian_blur_handler(
        inputs={"image_in": outputs["image"]},
        config={"kernelSize": 7, "sigmaX": 2.0},
    )
    assert blur_out["image_out"].shape == outputs["image"].shape
    assert meta["kernel_size"] == 7
