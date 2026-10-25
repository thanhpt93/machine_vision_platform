"""OpenCV Vision Handlers Package (9 Categories)."""

# Legacy imports for backward compatibility
from .image_loader import image_loader_handler
from .roi_crop import roi_crop_handler
from .grayscale import grayscale_handler
from .threshold import threshold_handler
from .contour_detection import contour_detection_handler
from .result_viewer import result_viewer_handler
from .gaussian_blur import gaussian_blur_handler

# Category 1: Image Acquisition
from .acquisition import (
    image_file_handler,
    image_folder_handler,
    image_sequence_handler,
    image_copy_handler,
)

# Category 2: Image Preparation
from .preparation import (
    resize_handler,
    color_convert_handler,
    normalize_handler,
    blur_denoise_handler,
    brightness_contrast_handler,
    histogram_equalize_handler,
    sharpen_handler,
    invert_handler,
    image_arithmetic_handler,
    flip_rotate_handler,
    padding_border_handler,
)

# Category 3: Image Processing
from .processing import (
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
    image_registration_handler,
)

# Category 4: Segmentation
from .segmentation import (
    threshold_segmentation_handler,
    color_segmentation_handler,
    connected_components_handler,
    watershed_segmentation_handler,
    grabcut_segmentation_handler,
    mask_operations_handler,
    region_filter_handler,
)

# Category 5: Feature Extraction
from .features import (
    contour_filter_handler,
    blob_analysis_handler,
    shape_analysis_handler,
    bounding_geometry_handler,
    corner_detection_handler,
    keypoint_detection_handler,
    line_circle_extraction_handler,
    image_statistics_handler,
    projection_profile_handler,
)

# Category 6: Measurement & Metrology
from .measurement import (
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
)

# Category 7: Decision & Inspection Logic
from .logic import (
    compare_handler,
    range_check_handler,
    logic_gate_handler,
    conditional_branch_handler,
    count_check_handler,
    presence_check_handler,
    rule_evaluation_handler,
    decision_ok_ng_handler,
    result_aggregation_handler,
)

# Category 8: Visualization
from .visualization import (
    image_overlay_handler,
    draw_roi_handler,
    draw_contours_handler,
    draw_measurement_handler,
    draw_labels_handler,
    mask_viewer_handler,
    histogram_viewer_handler,
    inspection_result_viewer_handler,
)

# Category 9: Data & Logging
from .data_logging import (
    save_image_handler,
    save_defect_image_handler,
    save_measurement_handler,
    export_csv_handler,
    inspection_logger_handler,
    result_history_handler,
)

__all__ = [
    # Legacy
    "image_loader_handler",
    "roi_crop_handler",
    "grayscale_handler",
    "threshold_handler",
    "contour_detection_handler",
    "result_viewer_handler",
    "gaussian_blur_handler",

    # Category 1: Acquisition
    "image_file_handler",
    "image_folder_handler",
    "image_sequence_handler",
    "image_copy_handler",

    # Category 2: Preparation
    "resize_handler",
    "color_convert_handler",
    "normalize_handler",
    "blur_denoise_handler",
    "brightness_contrast_handler",
    "histogram_equalize_handler",
    "sharpen_handler",
    "invert_handler",
    "image_arithmetic_handler",
    "flip_rotate_handler",
    "padding_border_handler",

    # Category 3: Processing
    "adaptive_threshold_handler",
    "otsu_threshold_handler",
    "color_threshold_handler",
    "morphology_handler",
    "edge_detection_handler",
    "gradient_derivatives_handler",
    "image_filter_handler",
    "hough_transform_handler",
    "template_matching_handler",
    "background_subtraction_handler",
    "image_registration_handler",

    # Category 4: Segmentation
    "threshold_segmentation_handler",
    "color_segmentation_handler",
    "connected_components_handler",
    "watershed_segmentation_handler",
    "grabcut_segmentation_handler",
    "mask_operations_handler",
    "region_filter_handler",

    # Category 5: Feature Extraction
    "contour_filter_handler",
    "blob_analysis_handler",
    "shape_analysis_handler",
    "bounding_geometry_handler",
    "corner_detection_handler",
    "keypoint_detection_handler",
    "line_circle_extraction_handler",
    "image_statistics_handler",
    "projection_profile_handler",

    # Category 6: Measurement
    "distance_measurement_handler",
    "line_measurement_handler",
    "circle_measurement_handler",
    "rectangle_measurement_handler",
    "angle_measurement_handler",
    "caliper_measurement_handler",
    "gap_measurement_handler",
    "area_measurement_handler",
    "tolerance_check_handler",
    "pixel_calibration_handler",

    # Category 7: Logic
    "compare_handler",
    "range_check_handler",
    "logic_gate_handler",
    "conditional_branch_handler",
    "count_check_handler",
    "presence_check_handler",
    "rule_evaluation_handler",
    "decision_ok_ng_handler",
    "result_aggregation_handler",

    # Category 8: Visualization
    "image_overlay_handler",
    "draw_roi_handler",
    "draw_contours_handler",
    "draw_measurement_handler",
    "draw_labels_handler",
    "mask_viewer_handler",
    "histogram_viewer_handler",
    "inspection_result_viewer_handler",

    # Category 9: Data & Logging
    "save_image_handler",
    "save_defect_image_handler",
    "save_measurement_handler",
    "export_csv_handler",
    "inspection_logger_handler",
    "result_history_handler",
]
