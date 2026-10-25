import os
import tempfile
import numpy as np
import cv2
import pytest

from vision_runtime.engine.executor import pipeline_executor
from vision_runtime.handlers import (
    image_file_handler,
    image_copy_handler,
    roi_crop_handler,
    resize_handler,
    color_convert_handler,
    blur_denoise_handler,
    brightness_contrast_handler,
    histogram_equalize_handler,
    sharpen_handler,
    invert_handler,
    flip_rotate_handler,
    padding_border_handler,
    image_arithmetic_handler,
    threshold_handler,
    adaptive_threshold_handler,
    otsu_threshold_handler,
    color_threshold_handler,
    morphology_handler,
    edge_detection_handler,
    gradient_derivatives_handler,
    image_filter_handler,
    hough_transform_handler,
    template_matching_handler,
    background_subtraction_handler,
    threshold_segmentation_handler,
    color_segmentation_handler,
    connected_components_handler,
    watershed_segmentation_handler,
    grabcut_segmentation_handler,
    mask_operations_handler,
    region_filter_handler,
    contour_detection_handler,
    contour_filter_handler,
    blob_analysis_handler,
    shape_analysis_handler,
    bounding_geometry_handler,
    corner_detection_handler,
    keypoint_detection_handler,
    line_circle_extraction_handler,
    image_statistics_handler,
    projection_profile_handler,
    distance_measurement_handler,
    line_measurement_handler,
    circle_measurement_handler,
    rectangle_measurement_handler,
    angle_measurement_handler,
    caliper_measurement_handler,
    gap_measurement_handler,
    area_measurement_handler,
    tolerance_check_handler,
    pixel_calibration_handler,
    compare_handler,
    range_check_handler,
    logic_gate_handler,
    conditional_branch_handler,
    count_check_handler,
    presence_check_handler,
    rule_evaluation_handler,
    decision_ok_ng_handler,
    result_aggregation_handler,
    result_viewer_handler,
    image_overlay_handler,
    draw_roi_handler,
    draw_contours_handler,
    draw_measurement_handler,
    draw_labels_handler,
    mask_viewer_handler,
    histogram_viewer_handler,
    inspection_result_viewer_handler,
    save_image_handler,
    save_defect_image_handler,
    save_measurement_handler,
    export_csv_handler,
    inspection_logger_handler,
    result_history_handler,
)


@pytest.fixture
def sample_synthetic_bgr():
    """Generates a synthetic 200x200 BGR test frame with geometric shapes."""
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    # Draw white square
    cv2.rectangle(img, (20, 20), (80, 80), (255, 255, 255), -1)
    # Draw bright circle
    cv2.circle(img, (140, 140), 30, (200, 200, 200), -1)
    # Draw color band
    cv2.rectangle(img, (100, 20), (180, 60), (0, 0, 255), -1)
    return img


@pytest.fixture
def sample_synthetic_gray(sample_synthetic_bgr):
    return cv2.cvtColor(sample_synthetic_bgr, cv2.COLOR_BGR2GRAY)


@pytest.fixture
def sample_synthetic_mask(sample_synthetic_gray):
    _, mask = cv2.threshold(sample_synthetic_gray, 50, 255, cv2.THRESH_BINARY)
    return mask


# --------------------------------------------------------------------------
# Category 1: Acquisition Tests
# --------------------------------------------------------------------------
def test_category1_acquisition(sample_synthetic_bgr):
    # Image Copy
    outputs, meta = image_copy_handler({"image_in": sample_synthetic_bgr}, {})
    assert "image_out" in outputs
    assert np.array_equal(outputs["image_out"], sample_synthetic_bgr)
    assert outputs["image_out"] is not sample_synthetic_bgr


# --------------------------------------------------------------------------
# Category 2: Preparation Tests
# --------------------------------------------------------------------------
def test_category2_preparation(sample_synthetic_bgr, sample_synthetic_gray):
    # Resize
    outputs, _ = resize_handler({"image_in": sample_synthetic_bgr}, {"width": 100, "height": 80})
    assert outputs["image_out"].shape == (80, 100, 3)

    # Color Convert
    outputs, _ = color_convert_handler({"image_in": sample_synthetic_bgr}, {"code": "COLOR_BGR2GRAY"})
    assert len(outputs["image_out"].shape) == 2

    # Blur & Denoise
    outputs, _ = blur_denoise_handler({"image_in": sample_synthetic_bgr}, {"method": "gaussian", "kernel_size": 3, "sigma": 1.0})
    assert outputs["image_out"].shape == sample_synthetic_bgr.shape

    # Brightness Contrast
    outputs, _ = brightness_contrast_handler({"image_in": sample_synthetic_bgr}, {"alpha": 1.2, "beta": 10.0})
    assert outputs["image_out"].shape == sample_synthetic_bgr.shape

    # Histogram Equalize
    outputs, _ = histogram_equalize_handler({"image_in": sample_synthetic_gray}, {"clahe": True, "clipLimit": 2.0})
    assert outputs["image_out"].shape == sample_synthetic_gray.shape

    # Sharpen & Invert
    out_sharp, _ = sharpen_handler({"image_in": sample_synthetic_bgr}, {"strength": 1.5})
    assert out_sharp["image_out"].shape == sample_synthetic_bgr.shape
    out_inv, _ = invert_handler({"image_in": sample_synthetic_bgr}, {})
    assert out_inv["image_out"][0, 0, 0] == 255 - sample_synthetic_bgr[0, 0, 0]

    # Flip & Rotate
    out_flip, _ = flip_rotate_handler({"image_in": sample_synthetic_bgr}, {"flip_mode": "horizontal", "rotate_angle": 90})
    assert out_flip["image_out"].shape == sample_synthetic_bgr.shape

    # Padding Border
    out_pad, _ = padding_border_handler({"image_in": sample_synthetic_bgr}, {"top": 10, "bottom": 10, "left": 10, "right": 10})
    assert out_pad["image_out"].shape == (220, 220, 3)

    # Image Arithmetic
    out_add, _ = image_arithmetic_handler({"image_a": sample_synthetic_bgr, "image_b": sample_synthetic_bgr}, {"operation": "add"})
    assert out_add["image_out"].shape == sample_synthetic_bgr.shape


# --------------------------------------------------------------------------
# Category 3: Processing Tests
# --------------------------------------------------------------------------
def test_category3_processing(sample_synthetic_gray, sample_synthetic_bgr):
    # Adaptive & Otsu Threshold
    out_ad, _ = adaptive_threshold_handler({"image_in": sample_synthetic_gray}, {"block_size": 15, "c_value": 2})
    assert "image_out" in out_ad
    out_otsu, _ = otsu_threshold_handler({"image_in": sample_synthetic_gray}, {})
    assert "threshold_value" in out_otsu or "image_out" in out_otsu

    # Color Threshold InRange
    out_cth, _ = color_threshold_handler({"image_in": sample_synthetic_bgr}, {"color_space": "BGR", "lower_b": [0, 0, 200], "upper_b": [50, 50, 255]})
    assert out_cth["image_out"].shape == sample_synthetic_gray.shape

    # Morphology & Edges
    out_morph, _ = morphology_handler({"image_in": sample_synthetic_gray}, {"operation": "open", "kernel_size": 3})
    assert out_morph["image_out"].shape == sample_synthetic_gray.shape
    out_edge, _ = edge_detection_handler({"image_in": sample_synthetic_gray}, {"method": "canny", "threshold1": 50, "threshold2": 150})
    assert out_edge["image_out"].shape == sample_synthetic_gray.shape

    # Gradient & Filter
    out_grad, _ = gradient_derivatives_handler({"image_in": sample_synthetic_gray}, {"operator": "sobel"})
    assert "image_out" in out_grad
    out_filt, _ = image_filter_handler({"image_in": sample_synthetic_gray}, {"preset": "emboss"})
    assert "image_out" in out_filt

    # Template Matching
    patch = sample_synthetic_bgr[20:80, 20:80].copy()
    out_match, _ = template_matching_handler({"image_in": sample_synthetic_bgr, "template_in": patch}, {"match_threshold": 0.8})
    assert "image_out" in out_match

    # Background Subtraction
    out_bg, _ = background_subtraction_handler({"image_in": sample_synthetic_bgr, "reference_in": sample_synthetic_bgr}, {"threshold_val": 10})
    assert np.all(out_bg["image_out"] == 0)


# --------------------------------------------------------------------------
# Category 4: Segmentation Tests
# --------------------------------------------------------------------------
def test_category4_segmentation(sample_synthetic_gray, sample_synthetic_bgr, sample_synthetic_mask):
    # Threshold segmentation
    out_th, _ = threshold_segmentation_handler({"image_in": sample_synthetic_gray}, {"min_thresh": 50, "max_thresh": 255})
    assert "mask_out" in out_th

    # Connected Components
    out_cc, _ = connected_components_handler({"mask_in": sample_synthetic_mask}, {"connectivity": 8})
    assert "image_out" in out_cc

    # Mask Operations
    out_mop, _ = mask_operations_handler({"mask_a": sample_synthetic_mask, "mask_b": sample_synthetic_mask}, {"operation": "and"})
    assert np.array_equal(out_mop["mask_out"], sample_synthetic_mask)

    # Region Filter
    out_rf, _ = region_filter_handler({"mask_in": sample_synthetic_mask}, {"min_area": 500, "max_area": 100000})
    assert "mask_out" in out_rf


# --------------------------------------------------------------------------
# Category 5: Feature Extraction Tests
# --------------------------------------------------------------------------
def test_category5_features(sample_synthetic_mask, sample_synthetic_gray):
    # Contour detection
    out_cont, _ = contour_detection_handler({"mask_in": sample_synthetic_mask}, {"minArea": 10, "maxArea": 50000})
    assert "detections" in out_cont
    assert out_cont["detections"]["count"] >= 2

    # Contour filter
    contours_list = out_cont["contours_out"]
    out_cfilt, _ = contour_filter_handler({"contours_in": contours_list}, {"minArea": 100, "maxArea": 50000})
    assert "contours_out" in out_cfilt

    # Shape Analysis & Bounding Geometry
    out_shape, _ = shape_analysis_handler({"mask_in": sample_synthetic_mask}, {})
    assert "features" in out_shape
    assert "area" in out_shape["features"]

    out_geom, _ = bounding_geometry_handler({"mask_in": sample_synthetic_mask}, {})
    assert "geometry" in out_geom

    # Statistics & Projection Profile
    out_stats, _ = image_statistics_handler({"image_in": sample_synthetic_gray}, {})
    assert out_stats["statistics"]["mean"] > 0
    out_proj, _ = projection_profile_handler({"image_in": sample_synthetic_mask}, {})
    assert "profile" in out_proj


# --------------------------------------------------------------------------
# Category 6: Measurement & Metrology Tests
# --------------------------------------------------------------------------
def test_category6_measurement():
    # Distance Measurement
    out_dist, _ = distance_measurement_handler({}, {"x1": 0, "y1": 0, "x2": 30, "y2": 40, "scale": 2.0, "unit": "mm"})
    assert pytest.approx(out_dist["measurement"]["distance_px"], 0.01) == 50.0
    assert pytest.approx(out_dist["measurement"]["distance"], 0.01) == 25.0
    assert out_dist["measurement"]["unit"] == "mm"

    # Line Measurement
    out_line, _ = line_measurement_handler({}, {"x1": 0, "y1": 0, "x2": 100, "y2": 0})
    assert pytest.approx(out_line["measurement"]["length_px"], 0.01) == 100.0

    # Tolerance Check (Pass & Fail)
    out_tol_ok, _ = tolerance_check_handler({"value_in": 10.5}, {"nominal": 10.0, "upperTolerance": 1.0, "lowerTolerance": 1.0})
    assert out_tol_ok["boolean_out"] is True

    out_tol_ng, _ = tolerance_check_handler({"value_in": 12.5}, {"nominal": 10.0, "upperTolerance": 1.0, "lowerTolerance": 1.0})
    assert out_tol_ng["boolean_out"] is False

    # Pixel Calibration
    out_cal, _ = pixel_calibration_handler({"pixels_in": 100.0}, {"pixelsPerUnit": 10.0, "unit": "mm"})
    assert pytest.approx(out_cal["scalar_value"], 0.001) == 10.0


# --------------------------------------------------------------------------
# Category 7: Decision & Inspection Logic Tests
# --------------------------------------------------------------------------
def test_category7_logic():
    # Compare
    out_cmp, _ = compare_handler({"value_in": 10}, {"operator": ">=", "threshold": 10})
    assert out_cmp["boolean_out"] is True

    # Range Check
    out_rng, _ = range_check_handler({"value_in": 25}, {"minVal": 20, "maxVal": 30, "inclusive": True})
    assert out_rng["boolean_out"] is True

    # Logic Gate
    out_gate, _ = logic_gate_handler({"a": True, "b": False}, {"gate": "AND"})
    assert out_gate["boolean_out"] is False
    out_gate_or, _ = logic_gate_handler({"a": True, "b": False}, {"gate": "OR"})
    assert out_gate_or["boolean_out"] is True

    # Count Check
    contours_mock = {"count": 4}
    out_cnt, _ = count_check_handler({"detections_in": contours_mock}, {"minCount": 2, "maxCount": 5})
    assert out_cnt["boolean_out"] is True

    # Decision OK / NG
    out_dec, _ = decision_ok_ng_handler({"condition": False}, {"failReason": "ERR_DEFECT_BURR"})
    assert out_dec["verdict"] == "NG"
    assert out_dec["boolean_out"] is False


# --------------------------------------------------------------------------
# Category 8: Visualization Tests
# --------------------------------------------------------------------------
def test_category8_visualization(sample_synthetic_bgr, sample_synthetic_mask):
    # Overlay & Draw ROI
    out_ov, _ = image_overlay_handler({"image_in": sample_synthetic_bgr, "overlay_in": sample_synthetic_mask}, {"alpha": 0.5})
    assert out_ov["image_out"].shape == sample_synthetic_bgr.shape

    out_roi, _ = draw_roi_handler({"image_in": sample_synthetic_bgr}, {"x": 10, "y": 10, "width": 50, "height": 50})
    assert out_roi["image_out"].shape == sample_synthetic_bgr.shape

    # Inspection Result Viewer (HUD)
    out_hud, _ = inspection_result_viewer_handler(
        {"image_in": sample_synthetic_bgr, "inspection_in": {"verdict": "OK", "defect_code": "NONE"}},
        {"show_banner": True}
    )
    assert out_hud["image_out"].shape == sample_synthetic_bgr.shape


# --------------------------------------------------------------------------
# Category 9: Data & Logging Tests
# --------------------------------------------------------------------------
def test_category9_data_logging(sample_synthetic_bgr):
    with tempfile.TemporaryDirectory() as tmpdir:
        # Save image
        out_save, _ = save_image_handler({"image_in": sample_synthetic_bgr}, {"directory": tmpdir, "format": "png"})
        assert os.path.exists(out_save["file_path"])

        # Export CSV
        csv_path = os.path.join(tmpdir, "test_log.csv")
        out_csv, _ = export_csv_handler({"verdict": "OK", "value_in": 12.3}, {"csvFile": csv_path})
        assert os.path.exists(out_csv["file_path"])

        # Result history
        out_hist, _ = result_history_handler({"verdict": "OK"}, {"maxHistory": 50})
        assert "history" in out_hist
        assert out_hist["history"]["pass_count"] >= 1


# --------------------------------------------------------------------------
# End-to-End Integration DAG Test 1: Full Inspection Flow with Real Pipeline Executor
# --------------------------------------------------------------------------
def test_e2e_dag_vision_inspection_pipeline(tmp_path):
    # Save a temporary input test image
    test_img = np.zeros((300, 300, 3), dtype=np.uint8)
    cv2.circle(test_img, (150, 150), 40, (255, 255, 255), -1)
    img_path = str(tmp_path / "part_sample.png")
    cv2.imwrite(img_path, test_img)

    csv_path = str(tmp_path / "audit.csv")

    pipeline_spec = {
        "fileFormat": "MVP_PIPELINE",
        "schemaVersion": "1.0.0",
        "id": "e2e_inspection_dag",
        "name": "Full Industrial Inspection Pipeline",
        "nodes": [
            {
                "id": "node_acq",
                "nodeType": "image_file",
                "config": {"filePath": img_path},
            },
            {
                "id": "node_crop",
                "nodeType": "roi_crop",
                "config": {"x": 50, "y": 50, "width": 200, "height": 200},
            },
            {
                "id": "node_gray",
                "nodeType": "color_convert",
                "config": {"code": "COLOR_BGR2GRAY"},
            },
            {
                "id": "node_thresh",
                "nodeType": "threshold",
                "config": {"threshold": 128, "mode": "BINARY", "maxVal": 255},
            },
            {
                "id": "node_contours",
                "nodeType": "contour_detection",
                "config": {"minArea": 100, "maxArea": 100000, "drawBoundingBoxes": True},
            },
            {
                "id": "node_shape",
                "nodeType": "shape_analysis",
                "config": {"fit_ellipse": True, "compute_convex_hull": True},
            },
            {
                "id": "node_tolerance",
                "nodeType": "tolerance_check",
                "config": {"nominal": 5000.0, "upperTolerance": 5000.0, "lowerTolerance": 5000.0},
            },
            {
                "id": "node_decision",
                "nodeType": "decision_ok_ng",
                "config": {"failReason": "DEFECT_OUT_OF_SPEC"},
            },
            {
                "id": "node_hud",
                "nodeType": "inspection_result_viewer",
                "config": {"show_banner": True},
            },
            {
                "id": "node_export",
                "nodeType": "export_csv",
                "config": {"csvFile": csv_path},
            },
            {
                "id": "node_view",
                "nodeType": "result_viewer",
                "config": {"title": "Inspection Final View"},
            },
        ],
        "edges": [
            {"id": "e1", "sourceNodeId": "node_acq", "sourcePortId": "image", "targetNodeId": "node_crop", "targetPortId": "image_in"},
            {"id": "e2", "sourceNodeId": "node_crop", "sourcePortId": "image_out", "targetNodeId": "node_gray", "targetPortId": "image_in"},
            {"id": "e3", "sourceNodeId": "node_gray", "sourcePortId": "image_out", "targetNodeId": "node_thresh", "targetPortId": "image_in"},
            {"id": "e4", "sourceNodeId": "node_thresh", "sourcePortId": "image_out", "targetNodeId": "node_contours", "targetPortId": "mask_in"},
            {"id": "e5", "sourceNodeId": "node_thresh", "sourcePortId": "image_out", "targetNodeId": "node_shape", "targetPortId": "mask_in"},
            {"id": "e6", "sourceNodeId": "node_shape", "sourcePortId": "measurement", "targetNodeId": "node_tolerance", "targetPortId": "value_in"},
            {"id": "e7", "sourceNodeId": "node_tolerance", "sourcePortId": "boolean_out", "targetNodeId": "node_decision", "targetPortId": "condition"},
            {"id": "e8", "sourceNodeId": "node_crop", "sourcePortId": "image_out", "targetNodeId": "node_hud", "targetPortId": "image_in"},
            {"id": "e9", "sourceNodeId": "node_decision", "sourcePortId": "inspection_result", "targetNodeId": "node_hud", "targetPortId": "inspection_in"},
            {"id": "e10", "sourceNodeId": "node_decision", "sourcePortId": "verdict", "targetNodeId": "node_export", "targetPortId": "verdict"},
            {"id": "e11", "sourceNodeId": "node_hud", "sourcePortId": "image_out", "targetNodeId": "node_view", "targetPortId": "image_in"},
        ],
    }

    result = pipeline_executor.execute_pipeline(pipeline_spec)
    if result["status"] != "completed":
        print("PIPELINE ERROR:", result.get("error"))
        for k, v in result.get("node_results", {}).items():
            if v.get("status") == "failed":
                print(f"FAILED NODE {k}:", v.get("error"))

    assert result["status"] == "completed"
    assert result["nodes_executed"] == 11
    assert os.path.exists(csv_path)

    # Verify that HUD and decision produced real outputs
    hud_node_res = result["node_results"]["node_hud"]
    assert hud_node_res["status"] == "completed"
    assert hud_node_res["has_preview"] is True
