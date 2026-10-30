"""Runtime Node Registry Contract (Python Vision Runtime)

Separates the UI/Editor metadata registry from the actual Python execution engine.
Maps node types and contract versions to Python handler implementations across all 9 categories.
"""

from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field

import vision_runtime.handlers as H


class PortContract(BaseModel):
    id: str
    name: str
    data_type: str
    required: bool = True


class NodeContract(BaseModel):
    node_type: str
    version: str = "1.0.0"
    display_name: str
    category: str
    inputs: List[PortContract] = Field(default_factory=list)
    outputs: List[PortContract] = Field(default_factory=list)
    handler: Optional[str] = None
    is_supported: bool = True


class RuntimeNodeRegistry:
    """Python Runtime Node Registry. Tracks implemented nodes ready for DAG execution."""

    def __init__(self):
        self._registry: Dict[str, NodeContract] = {}
        self._handlers: Dict[str, Callable[..., Any]] = {}

    def register(
        self,
        contract: NodeContract,
        handler_fn: Optional[Callable[..., Any]] = None,
    ) -> None:
        if contract.node_type in self._registry:
            raise ValueError(f"Duplicate node type registered in runtime: {contract.node_type}")
        self._registry[contract.node_type] = contract
        if handler_fn:
            self._handlers[contract.node_type] = handler_fn

    def get_contract(self, node_type: str) -> Optional[NodeContract]:
        return self._registry.get(node_type)

    def get_handler(self, node_type: str) -> Optional[Callable[..., Any]]:
        return self._handlers.get(node_type)

    def is_supported(self, node_type: str) -> bool:
        contract = self.get_contract(node_type)
        return contract is not None and contract.is_supported and node_type in self._handlers

    def list_supported_nodes(self) -> List[str]:
        return [k for k, v in self._registry.items() if v.is_supported and k in self._handlers]


# Global Runtime Registry Instance
runtime_registry = RuntimeNodeRegistry()

# ==============================================================================
# CATEGORY 1: IMAGE ACQUISITION
# ==============================================================================
runtime_registry.register(
    NodeContract(
        node_type="image_file",
        version="1.0.0",
        display_name="Image File",
        category="image_acquisition",
        outputs=[PortContract(id="image", name="Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.acquisition.image_file_handler",
        is_supported=True,
    ),
    handler_fn=H.image_file_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="image_folder",
        version="1.0.0",
        display_name="Image Folder",
        category="image_acquisition",
        outputs=[
            PortContract(id="image", name="Image", data_type="ImageFrame"),
            PortContract(id="file_path", name="File Path", data_type="String"),
        ],
        handler="vision_runtime.handlers.acquisition.image_folder_handler",
        is_supported=True,
    ),
    handler_fn=H.image_folder_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="image_sequence",
        version="1.0.0",
        display_name="Image Sequence",
        category="image_acquisition",
        outputs=[PortContract(id="image", name="Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.acquisition.image_sequence_handler",
        is_supported=True,
    ),
    handler_fn=H.image_sequence_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="image_copy",
        version="1.0.0",
        display_name="Image Copy",
        category="image_acquisition",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Copied Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.acquisition.image_copy_handler",
        is_supported=True,
    ),
    handler_fn=H.image_copy_handler,
)

# ==============================================================================
# CATEGORY 2: IMAGE PREPARATION
# ==============================================================================
runtime_registry.register(
    NodeContract(
        node_type="roi_crop",
        version="1.0.0",
        display_name="ROI Crop",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Cropped Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.roi_crop_handler",
        is_supported=True,
    ),
    handler_fn=H.roi_crop_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="resize",
        version="1.0.0",
        display_name="Resize",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Resized Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.resize_handler",
        is_supported=True,
    ),
    handler_fn=H.resize_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="color_convert",
        version="1.0.0",
        display_name="Color Space Convert",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Converted Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.color_convert_handler",
        is_supported=True,
    ),
    handler_fn=H.color_convert_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="grayscale",
        version="1.0.0",
        display_name="Grayscale",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Color Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Grayscale Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.grayscale",
        is_supported=True,
    ),
    handler_fn=H.grayscale_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="normalize",
        version="1.0.0",
        display_name="Normalize",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Normalized Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.normalize_handler",
        is_supported=True,
    ),
    handler_fn=H.normalize_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="blur_denoise",
        version="1.0.0",
        display_name="Blur & Denoise",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Filtered Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.blur_denoise_handler",
        is_supported=True,
    ),
    handler_fn=H.blur_denoise_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="gaussian_blur",
        version="1.0.0",
        display_name="Gaussian Blur",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Blurred Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.gaussian_blur",
        is_supported=True,
    ),
    handler_fn=H.gaussian_blur_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="brightness_contrast",
        version="1.0.0",
        display_name="Brightness & Contrast",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Adjusted Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.brightness_contrast_handler",
        is_supported=True,
    ),
    handler_fn=H.brightness_contrast_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="histogram_equalize",
        version="1.0.0",
        display_name="Histogram Equalization",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Equalized Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.histogram_equalize_handler",
        is_supported=True,
    ),
    handler_fn=H.histogram_equalize_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="sharpen",
        version="1.0.0",
        display_name="Sharpen",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Sharpened Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.sharpen_handler",
        is_supported=True,
    ),
    handler_fn=H.sharpen_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="invert",
        version="1.0.0",
        display_name="Invert",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Inverted Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.invert_handler",
        is_supported=True,
    ),
    handler_fn=H.invert_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="image_arithmetic",
        version="1.0.0",
        display_name="Image Arithmetic",
        category="image_preparation",
        inputs=[
            PortContract(id="image_a", name="Image A", data_type="ImageFrame"),
            PortContract(id="image_b", name="Image B", data_type="ImageFrame"),
        ],
        outputs=[PortContract(id="image_out", name="Result Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.image_arithmetic_handler",
        is_supported=True,
    ),
    handler_fn=H.image_arithmetic_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="flip_rotate",
        version="1.0.0",
        display_name="Flip & Rotate",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Transformed Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.flip_rotate_handler",
        is_supported=True,
    ),
    handler_fn=H.flip_rotate_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="padding_border",
        version="1.0.0",
        display_name="Padding & Border",
        category="image_preparation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Bordered Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.preparation.padding_border_handler",
        is_supported=True,
    ),
    handler_fn=H.padding_border_handler,
)

# ==============================================================================
# CATEGORY 3: IMAGE PROCESSING
# ==============================================================================
runtime_registry.register(
    NodeContract(
        node_type="threshold",
        version="1.0.0",
        display_name="Threshold",
        category="image_processing",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="image_out", name="Binary Image", data_type="MaskFrame"),
            PortContract(id="mask_out", name="Mask Out", data_type="MaskFrame"),
        ],
        handler="vision_runtime.handlers.processing.threshold_handler",
        is_supported=True,
    ),
    handler_fn=H.threshold_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="adaptive_threshold",
        version="1.0.0",
        display_name="Adaptive Threshold",
        category="image_processing",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="image_out", name="Adaptive Mask", data_type="MaskFrame"),
            PortContract(id="mask_out", name="Mask Out", data_type="MaskFrame"),
        ],
        handler="vision_runtime.handlers.processing.adaptive_threshold_handler",
        is_supported=True,
    ),
    handler_fn=H.adaptive_threshold_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="otsu_threshold",
        version="1.0.0",
        display_name="Otsu Threshold",
        category="image_processing",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="image_out", name="Otsu Mask", data_type="MaskFrame"),
            PortContract(id="mask_out", name="Mask Out", data_type="MaskFrame"),
            PortContract(id="threshold_value", name="Computed Threshold", data_type="Scalar"),
        ],
        handler="vision_runtime.handlers.processing.otsu_threshold_handler",
        is_supported=True,
    ),
    handler_fn=H.otsu_threshold_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="color_threshold",
        version="1.0.0",
        display_name="Color Threshold",
        category="image_processing",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="image_out", name="Color Mask", data_type="MaskFrame"),
            PortContract(id="mask_out", name="Mask Out", data_type="MaskFrame"),
        ],
        handler="vision_runtime.handlers.processing.color_threshold_handler",
        is_supported=True,
    ),
    handler_fn=H.color_threshold_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="morphology",
        version="1.0.0",
        display_name="Morphology",
        category="image_processing",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Morph Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.processing.morphology_handler",
        is_supported=True,
    ),
    handler_fn=H.morphology_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="edge_detection",
        version="1.0.0",
        display_name="Edge Detection",
        category="image_processing",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Edges", data_type="ImageFrame")],
        handler="vision_runtime.handlers.processing.edge_detection_handler",
        is_supported=True,
    ),
    handler_fn=H.edge_detection_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="gradient_derivatives",
        version="1.0.0",
        display_name="Gradient & Derivatives",
        category="image_processing",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Gradient Magnitude", data_type="ImageFrame")],
        handler="vision_runtime.handlers.processing.gradient_derivatives_handler",
        is_supported=True,
    ),
    handler_fn=H.gradient_derivatives_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="image_filter",
        version="1.0.0",
        display_name="Image Filter",
        category="image_processing",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Filtered Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.processing.image_filter_handler",
        is_supported=True,
    ),
    handler_fn=H.image_filter_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="hough_transform",
        version="1.0.0",
        display_name="Hough Transform",
        category="image_processing",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="image_out", name="Annotated Lines/Circles", data_type="ImageFrame"),
            PortContract(id="detections", name="Detections", data_type="FeatureSet"),
        ],
        handler="vision_runtime.handlers.processing.hough_transform_handler",
        is_supported=True,
    ),
    handler_fn=H.hough_transform_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="template_matching",
        version="1.0.0",
        display_name="Template Matching",
        category="image_processing",
        inputs=[
            PortContract(id="image_in", name="Search Image", data_type="ImageFrame"),
            PortContract(id="template_in", name="Template Image", data_type="ImageFrame"),
        ],
        outputs=[
            PortContract(id="image_out", name="Matched Preview", data_type="ImageFrame"),
            PortContract(id="detections", name="Match Result", data_type="DetectionResult"),
        ],
        handler="vision_runtime.handlers.processing.template_matching_handler",
        is_supported=True,
    ),
    handler_fn=H.template_matching_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="background_subtraction",
        version="1.0.0",
        display_name="Background Subtraction",
        category="image_processing",
        inputs=[
            PortContract(id="image_in", name="Current Image", data_type="ImageFrame"),
            PortContract(id="reference_in", name="Reference Image", data_type="ImageFrame"),
        ],
        outputs=[
            PortContract(id="image_out", name="Difference Mask", data_type="MaskFrame"),
            PortContract(id="mask_out", name="Mask Out", data_type="MaskFrame"),
        ],
        handler="vision_runtime.handlers.processing.background_subtraction_handler",
        is_supported=True,
    ),
    handler_fn=H.background_subtraction_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="image_registration",
        version="1.0.0",
        display_name="Image Registration",
        category="image_processing",
        inputs=[
            PortContract(id="image_in", name="Input Image", data_type="ImageFrame"),
            PortContract(id="reference_in", name="Target Reference", data_type="ImageFrame"),
        ],
        outputs=[PortContract(id="image_out", name="Aligned Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.processing.image_registration_handler",
        is_supported=True,
    ),
    handler_fn=H.image_registration_handler,
)

# ==============================================================================
# CATEGORY 4: SEGMENTATION
# ==============================================================================
runtime_registry.register(
    NodeContract(
        node_type="threshold_segmentation",
        version="1.0.0",
        display_name="Threshold Segmentation",
        category="segmentation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="mask_out", name="Segmentation Mask", data_type="MaskFrame"),
            PortContract(id="image_out", name="Mask Preview", data_type="ImageFrame"),
        ],
        handler="vision_runtime.handlers.segmentation.threshold_segmentation_handler",
        is_supported=True,
    ),
    handler_fn=H.threshold_segmentation_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="color_segmentation",
        version="1.0.0",
        display_name="Color Segmentation",
        category="segmentation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="mask_out", name="Color Mask", data_type="MaskFrame"),
            PortContract(id="image_out", name="Preview", data_type="ImageFrame"),
        ],
        handler="vision_runtime.handlers.segmentation.color_segmentation_handler",
        is_supported=True,
    ),
    handler_fn=H.color_segmentation_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="connected_components",
        version="1.0.0",
        display_name="Connected Components",
        category="segmentation",
        inputs=[PortContract(id="mask_in", name="Binary Mask", data_type="MaskFrame")],
        outputs=[
            PortContract(id="mask_out", name="Filtered Mask", data_type="MaskFrame"),
            PortContract(id="image_out", name="Labeled Color Map", data_type="ImageFrame"),
            PortContract(id="detections", name="Component Stats", data_type="FeatureSet"),
        ],
        handler="vision_runtime.handlers.segmentation.connected_components_handler",
        is_supported=True,
    ),
    handler_fn=H.connected_components_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="watershed_segmentation",
        version="1.0.0",
        display_name="Watershed Segmentation",
        category="segmentation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Watershed Boundaries", data_type="ImageFrame")],
        handler="vision_runtime.handlers.segmentation.watershed_segmentation_handler",
        is_supported=True,
    ),
    handler_fn=H.watershed_segmentation_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="grabcut_segmentation",
        version="1.0.0",
        display_name="GrabCut Segmentation",
        category="segmentation",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="image_out", name="Foreground Image", data_type="ImageFrame"),
            PortContract(id="mask_out", name="Binary Mask", data_type="MaskFrame"),
        ],
        handler="vision_runtime.handlers.segmentation.grabcut_segmentation_handler",
        is_supported=True,
    ),
    handler_fn=H.grabcut_segmentation_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="mask_operations",
        version="1.0.0",
        display_name="Mask Operations",
        category="segmentation",
        inputs=[
            PortContract(id="mask_a", name="Mask A", data_type="MaskFrame"),
            PortContract(id="mask_b", name="Mask B", data_type="MaskFrame", required=False),
        ],
        outputs=[
            PortContract(id="mask_out", name="Result Mask", data_type="MaskFrame"),
            PortContract(id="image_out", name="Preview", data_type="ImageFrame"),
        ],
        handler="vision_runtime.handlers.segmentation.mask_operations_handler",
        is_supported=True,
    ),
    handler_fn=H.mask_operations_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="region_filter",
        version="1.0.0",
        display_name="Region Filter",
        category="segmentation",
        inputs=[PortContract(id="mask_in", name="Binary Mask", data_type="MaskFrame")],
        outputs=[
            PortContract(id="mask_out", name="Filtered Mask", data_type="MaskFrame"),
            PortContract(id="image_out", name="Preview", data_type="ImageFrame"),
        ],
        handler="vision_runtime.handlers.segmentation.region_filter_handler",
        is_supported=True,
    ),
    handler_fn=H.region_filter_handler,
)

# ==============================================================================
# CATEGORY 5: FEATURE EXTRACTION
# ==============================================================================
runtime_registry.register(
    NodeContract(
        node_type="contour_detection",
        version="1.0.0",
        display_name="Contour Detection",
        category="feature_extraction",
        inputs=[PortContract(id="mask_in", name="Binary Mask In", data_type="MaskFrame")],
        outputs=[
            PortContract(id="detections", name="Detections", data_type="DetectionResult"),
            PortContract(id="image_out", name="Annotated Preview", data_type="ImageFrame"),
            PortContract(id="contours_out", name="Contours", data_type="ContourSet"),
            PortContract(id="contours", name="Contours Data", data_type="ContourSet"),
        ],
        handler="vision_runtime.handlers.features.contour_detection_handler",
        is_supported=True,
    ),
    handler_fn=H.contour_detection_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="contour_filter",
        version="1.0.0",
        display_name="Contour Filter",
        category="feature_extraction",
        inputs=[PortContract(id="mask_in", name="Binary Mask", data_type="MaskFrame", required=False)],
        outputs=[PortContract(id="contours_out", name="Filtered Contours", data_type="ContourSet")],
        handler="vision_runtime.handlers.features.contour_filter_handler",
        is_supported=True,
    ),
    handler_fn=H.contour_filter_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="blob_analysis",
        version="1.0.0",
        display_name="Blob Analysis",
        category="feature_extraction",
        inputs=[PortContract(id="mask_in", name="Binary Mask", data_type="MaskFrame")],
        outputs=[PortContract(id="detections", name="Blobs", data_type="FeatureSet")],
        handler="vision_runtime.handlers.features.blob_analysis_handler",
        is_supported=True,
    ),
    handler_fn=H.blob_analysis_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="shape_analysis",
        version="1.0.0",
        display_name="Shape Analysis",
        category="feature_extraction",
        inputs=[PortContract(id="mask_in", name="Binary Mask", data_type="MaskFrame")],
        outputs=[
            PortContract(id="features", name="Shape Descriptors", data_type="FeatureSet"),
            PortContract(id="measurement", name="Measurement", data_type="MeasurementResult"),
        ],
        handler="vision_runtime.handlers.features.shape_analysis_handler",
        is_supported=True,
    ),
    handler_fn=H.shape_analysis_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="bounding_geometry",
        version="1.0.0",
        display_name="Bounding Geometry",
        category="feature_extraction",
        inputs=[PortContract(id="mask_in", name="Binary Mask", data_type="MaskFrame")],
        outputs=[PortContract(id="geometry", name="Geometry Descriptors", data_type="FeatureSet")],
        handler="vision_runtime.handlers.features.bounding_geometry_handler",
        is_supported=True,
    ),
    handler_fn=H.bounding_geometry_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="corner_detection",
        version="1.0.0",
        display_name="Corner Detection",
        category="feature_extraction",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="image_out", name="Annotated Corners", data_type="ImageFrame"),
            PortContract(id="detections", name="Corner Points", data_type="FeatureSet"),
        ],
        handler="vision_runtime.handlers.features.corner_detection_handler",
        is_supported=True,
    ),
    handler_fn=H.corner_detection_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="keypoint_detection",
        version="1.0.0",
        display_name="Keypoint Detection",
        category="feature_extraction",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Keypoints Preview", data_type="ImageFrame")],
        handler="vision_runtime.handlers.features.keypoint_detection_handler",
        is_supported=True,
    ),
    handler_fn=H.keypoint_detection_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="line_circle_extraction",
        version="1.0.0",
        display_name="Line & Circle Extraction",
        category="feature_extraction",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="features", name="Fitted Primitives", data_type="FeatureSet")],
        handler="vision_runtime.handlers.features.line_circle_extraction_handler",
        is_supported=True,
    ),
    handler_fn=H.line_circle_extraction_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="image_statistics",
        version="1.0.0",
        display_name="Image Statistics",
        category="feature_extraction",
        inputs=[
            PortContract(id="image_in", name="Image In", data_type="ImageFrame"),
            PortContract(id="mask_in", name="ROI Mask (Optional)", data_type="MaskFrame", required=False),
        ],
        outputs=[
            PortContract(id="statistics", name="Statistics", data_type="MeasurementResult"),
            PortContract(id="measurement", name="Measurement", data_type="MeasurementResult"),
        ],
        handler="vision_runtime.handlers.features.image_statistics_handler",
        is_supported=True,
    ),
    handler_fn=H.image_statistics_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="projection_profile",
        version="1.0.0",
        display_name="Projection Profile",
        category="feature_extraction",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="profile", name="Profile Curves", data_type="FeatureSet")],
        handler="vision_runtime.handlers.features.projection_profile_handler",
        is_supported=True,
    ),
    handler_fn=H.projection_profile_handler,
)

# ==============================================================================
# CATEGORY 6: MEASUREMENT & METROLOGY
# ==============================================================================
runtime_registry.register(
    NodeContract(
        node_type="distance_measurement",
        version="1.0.0",
        display_name="Distance Measurement",
        category="measurement_metrology",
        inputs=[],
        outputs=[
            PortContract(id="measurement", name="Measurement", data_type="MeasurementResult"),
            PortContract(id="scalar_value", name="Distance", data_type="Scalar"),
        ],
        handler="vision_runtime.handlers.measurement.distance_measurement_handler",
        is_supported=True,
    ),
    handler_fn=H.distance_measurement_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="line_measurement",
        version="1.0.0",
        display_name="Line Measurement",
        category="measurement_metrology",
        inputs=[],
        outputs=[
            PortContract(id="measurement", name="Measurement", data_type="MeasurementResult"),
            PortContract(id="scalar_value", name="Length", data_type="Scalar"),
        ],
        handler="vision_runtime.handlers.measurement.line_measurement_handler",
        is_supported=True,
    ),
    handler_fn=H.line_measurement_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="circle_measurement",
        version="1.0.0",
        display_name="Circle Measurement",
        category="measurement_metrology",
        inputs=[
            PortContract(id="mask_in", name="Mask / Contour (Optional)", data_type="MaskFrame", required=False),
            PortContract(id="features_in", name="Features In (Optional)", data_type="FeatureSet", required=False),
        ],
        outputs=[
            PortContract(id="measurement", name="Measurement", data_type="MeasurementResult"),
            PortContract(id="scalar_value", name="Diameter", data_type="Scalar"),
            PortContract(id="image_out", name="Measurement Preview", data_type="ImageFrame"),
        ],
        handler="vision_runtime.handlers.measurement.circle_measurement_handler",
        is_supported=True,
    ),
    handler_fn=H.circle_measurement_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="rectangle_measurement",
        version="1.0.0",
        display_name="Rectangle Measurement",
        category="measurement_metrology",
        inputs=[PortContract(id="mask_in", name="Mask / Contour (Optional)", data_type="MaskFrame", required=False)],
        outputs=[
            PortContract(id="measurement", name="Measurement", data_type="MeasurementResult"),
            PortContract(id="scalar_value", name="Width", data_type="Scalar"),
        ],
        handler="vision_runtime.handlers.measurement.rectangle_measurement_handler",
        is_supported=True,
    ),
    handler_fn=H.rectangle_measurement_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="angle_measurement",
        version="1.0.0",
        display_name="Angle Measurement",
        category="measurement_metrology",
        inputs=[],
        outputs=[
            PortContract(id="measurement", name="Measurement", data_type="MeasurementResult"),
            PortContract(id="scalar_value", name="Angle Deg", data_type="Scalar"),
        ],
        handler="vision_runtime.handlers.measurement.angle_measurement_handler",
        is_supported=True,
    ),
    handler_fn=H.angle_measurement_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="caliper_measurement",
        version="1.0.0",
        display_name="Caliper / Edge Measurement",
        category="measurement_metrology",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="measurement", name="Edge Measurement", data_type="MeasurementResult"),
            PortContract(id="scalar_value", name="Edge Position", data_type="Scalar"),
        ],
        handler="vision_runtime.handlers.measurement.caliper_measurement_handler",
        is_supported=True,
    ),
    handler_fn=H.caliper_measurement_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="gap_measurement",
        version="1.0.0",
        display_name="Gap & Width Measurement",
        category="measurement_metrology",
        inputs=[],
        outputs=[
            PortContract(id="measurement", name="Measurement", data_type="MeasurementResult"),
            PortContract(id="scalar_value", name="Gap", data_type="Scalar"),
        ],
        handler="vision_runtime.handlers.measurement.gap_measurement_handler",
        is_supported=True,
    ),
    handler_fn=H.gap_measurement_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="area_measurement",
        version="1.0.0",
        display_name="Area Measurement",
        category="measurement_metrology",
        inputs=[PortContract(id="mask_in", name="Mask (Optional)", data_type="MaskFrame", required=False)],
        outputs=[
            PortContract(id="measurement", name="Measurement", data_type="MeasurementResult"),
            PortContract(id="scalar_value", name="Physical Area", data_type="Scalar"),
        ],
        handler="vision_runtime.handlers.measurement.area_measurement_handler",
        is_supported=True,
    ),
    handler_fn=H.area_measurement_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="tolerance_check",
        version="1.0.0",
        display_name="Tolerance Check",
        category="measurement_metrology",
        inputs=[PortContract(id="value_in", name="Measured Value", data_type="Scalar", required=False)],
        outputs=[
            PortContract(id="boolean_out", name="Pass Flag", data_type="Boolean"),
            PortContract(id="measurement", name="Tolerance Details", data_type="MeasurementResult"),
        ],
        handler="vision_runtime.handlers.measurement.tolerance_check_handler",
        is_supported=True,
    ),
    handler_fn=H.tolerance_check_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="pixel_calibration",
        version="1.0.0",
        display_name="Pixel-to-Unit Conversion",
        category="measurement_metrology",
        inputs=[PortContract(id="pixels_in", name="Pixels In", data_type="Scalar", required=False)],
        outputs=[
            PortContract(id="measurement", name="Calibrated Metric", data_type="MeasurementResult"),
            PortContract(id="scalar_value", name="Unit Value", data_type="Scalar"),
        ],
        handler="vision_runtime.handlers.measurement.pixel_calibration_handler",
        is_supported=True,
    ),
    handler_fn=H.pixel_calibration_handler,
)

# ==============================================================================
# CATEGORY 7: DECISION & INSPECTION LOGIC
# ==============================================================================
runtime_registry.register(
    NodeContract(
        node_type="compare",
        version="1.0.0",
        display_name="Compare",
        category="decision_inspection_logic",
        inputs=[PortContract(id="value_in", name="Value In", data_type="Scalar", required=False)],
        outputs=[PortContract(id="boolean_out", name="Result Flag", data_type="Boolean")],
        handler="vision_runtime.handlers.logic.compare_handler",
        is_supported=True,
    ),
    handler_fn=H.compare_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="range_check",
        version="1.0.0",
        display_name="Range Check",
        category="decision_inspection_logic",
        inputs=[PortContract(id="value_in", name="Value In", data_type="Scalar", required=False)],
        outputs=[PortContract(id="boolean_out", name="In Range", data_type="Boolean")],
        handler="vision_runtime.handlers.logic.range_check_handler",
        is_supported=True,
    ),
    handler_fn=H.range_check_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="logic_gate",
        version="1.0.0",
        display_name="AND / OR / NOT",
        category="decision_inspection_logic",
        inputs=[
            PortContract(id="a", name="Condition A", data_type="Boolean", required=False),
            PortContract(id="b", name="Condition B", data_type="Boolean", required=False),
        ],
        outputs=[PortContract(id="boolean_out", name="Output Flag", data_type="Boolean")],
        handler="vision_runtime.handlers.logic.logic_gate_handler",
        is_supported=True,
    ),
    handler_fn=H.logic_gate_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="conditional_branch",
        version="1.0.0",
        display_name="Conditional Branch",
        category="decision_inspection_logic",
        inputs=[
            PortContract(id="condition", name="Condition", data_type="Boolean", required=False),
            PortContract(id="true_input", name="True Data", data_type="String", required=False),
            PortContract(id="false_input", name="False Data", data_type="String", required=False),
        ],
        outputs=[PortContract(id="selected_out", name="Selected Output", data_type="String")],
        handler="vision_runtime.handlers.logic.conditional_branch_handler",
        is_supported=True,
    ),
    handler_fn=H.conditional_branch_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="count_check",
        version="1.0.0",
        display_name="Count Check",
        category="decision_inspection_logic",
        inputs=[PortContract(id="detections_in", name="Detections In", data_type="DetectionResult", required=False)],
        outputs=[
            PortContract(id="boolean_out", name="Count OK", data_type="Boolean"),
            PortContract(id="count", name="Total Count", data_type="Scalar"),
        ],
        handler="vision_runtime.handlers.logic.count_check_handler",
        is_supported=True,
    ),
    handler_fn=H.count_check_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="presence_check",
        version="1.0.0",
        display_name="Presence / Absence Check",
        category="decision_inspection_logic",
        inputs=[PortContract(id="detections_in", name="Detections In", data_type="DetectionResult", required=False)],
        outputs=[PortContract(id="boolean_out", name="Pass Flag", data_type="Boolean")],
        handler="vision_runtime.handlers.logic.presence_check_handler",
        is_supported=True,
    ),
    handler_fn=H.presence_check_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="rule_evaluation",
        version="1.0.0",
        display_name="Rule Evaluation",
        category="decision_inspection_logic",
        inputs=[],
        outputs=[
            PortContract(id="boolean_out", name="All Rules Passed", data_type="Boolean"),
            PortContract(id="rule_report", name="Rule Report", data_type="InspectionResult"),
        ],
        handler="vision_runtime.handlers.logic.rule_evaluation_handler",
        is_supported=True,
    ),
    handler_fn=H.rule_evaluation_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="decision_ok_ng",
        version="1.0.0",
        display_name="OK / NG Decision",
        category="decision_inspection_logic",
        inputs=[PortContract(id="condition", name="Condition Flag", data_type="Boolean", required=False)],
        outputs=[
            PortContract(id="verdict", name="Verdict (OK/NG)", data_type="String"),
            PortContract(id="boolean_out", name="Is OK", data_type="Boolean"),
            PortContract(id="inspection_result", name="Inspection Result", data_type="InspectionResult"),
        ],
        handler="vision_runtime.handlers.logic.decision_ok_ng_handler",
        is_supported=True,
    ),
    handler_fn=H.decision_ok_ng_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="result_aggregation",
        version="1.0.0",
        display_name="Result Aggregation",
        category="decision_inspection_logic",
        inputs=[],
        outputs=[PortContract(id="inspection_result", name="Consolidated Result", data_type="InspectionResult")],
        handler="vision_runtime.handlers.logic.result_aggregation_handler",
        is_supported=True,
    ),
    handler_fn=H.result_aggregation_handler,
)

# ==============================================================================
# CATEGORY 8: VISUALIZATION
# ==============================================================================
runtime_registry.register(
    NodeContract(
        node_type="result_viewer",
        version="1.0.0",
        display_name="Result Viewer",
        category="visualization",
        inputs=[
            PortContract(id="image_in", name="Display Image", data_type="ImageFrame"),
            PortContract(id="detections_in", name="Detections (Optional)", data_type="DetectionResult", required=False),
        ],
        outputs=[PortContract(id="image_out", name="Inspected Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.visualization.result_viewer_handler",
        is_supported=True,
    ),
    handler_fn=H.result_viewer_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="image_overlay",
        version="1.0.0",
        display_name="Image Overlay",
        category="visualization",
        inputs=[
            PortContract(id="image_in", name="Base Image", data_type="ImageFrame"),
            PortContract(id="overlay_in", name="Overlay Image / Mask", data_type="ImageFrame"),
        ],
        outputs=[PortContract(id="image_out", name="Blended Output", data_type="ImageFrame")],
        handler="vision_runtime.handlers.visualization.image_overlay_handler",
        is_supported=True,
    ),
    handler_fn=H.image_overlay_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="draw_roi",
        version="1.0.0",
        display_name="Draw ROI",
        category="visualization",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Annotated Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.visualization.draw_roi_handler",
        is_supported=True,
    ),
    handler_fn=H.draw_roi_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="draw_contours",
        version="1.0.0",
        display_name="Draw Contours",
        category="visualization",
        inputs=[
            PortContract(id="image_in", name="Image In", data_type="ImageFrame"),
            PortContract(id="mask_in", name="Mask (Optional)", data_type="MaskFrame", required=False),
        ],
        outputs=[PortContract(id="image_out", name="Annotated Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.visualization.draw_contours_handler",
        is_supported=True,
    ),
    handler_fn=H.draw_contours_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="draw_measurement",
        version="1.0.0",
        display_name="Draw Measurement",
        category="visualization",
        inputs=[
            PortContract(id="image_in", name="Image In", data_type="ImageFrame"),
            PortContract(id="measurement_in", name="Measurement In", data_type="MeasurementResult", required=False),
        ],
        outputs=[PortContract(id="image_out", name="Dimensioned Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.visualization.draw_measurement_handler",
        is_supported=True,
    ),
    handler_fn=H.draw_measurement_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="draw_labels",
        version="1.0.0",
        display_name="Draw Labels",
        category="visualization",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Labeled Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.visualization.draw_labels_handler",
        is_supported=True,
    ),
    handler_fn=H.draw_labels_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="mask_viewer",
        version="1.0.0",
        display_name="False Color / Mask Viewer",
        category="visualization",
        inputs=[PortContract(id="mask_in", name="Binary Mask", data_type="MaskFrame")],
        outputs=[PortContract(id="image_out", name="Colorized Mask", data_type="ImageFrame")],
        handler="vision_runtime.handlers.visualization.mask_viewer_handler",
        is_supported=True,
    ),
    handler_fn=H.mask_viewer_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="histogram_viewer",
        version="1.0.0",
        display_name="Histogram Viewer",
        category="visualization",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Histogram Chart", data_type="ImageFrame")],
        handler="vision_runtime.handlers.visualization.histogram_viewer_handler",
        is_supported=True,
    ),
    handler_fn=H.histogram_viewer_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="inspection_result_viewer",
        version="1.0.0",
        display_name="Inspection Result Viewer",
        category="visualization",
        inputs=[PortContract(id="image_in", name="Image In (Optional)", data_type="ImageFrame", required=False)],
        outputs=[PortContract(id="image_out", name="Verdict Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.visualization.inspection_result_viewer_handler",
        is_supported=True,
    ),
    handler_fn=H.inspection_result_viewer_handler,
)

# ==============================================================================
# CATEGORY 9: DATA & LOGGING
# ==============================================================================
runtime_registry.register(
    NodeContract(
        node_type="save_image",
        version="1.0.0",
        display_name="Save Image",
        category="data_logging",
        inputs=[PortContract(id="image_in", name="Image to Save", data_type="ImageFrame")],
        outputs=[
            PortContract(id="file_path", name="Saved Path", data_type="FileReference"),
            PortContract(id="image_out", name="Pass Through", data_type="ImageFrame"),
        ],
        handler="vision_runtime.handlers.data_logging.save_image_handler",
        is_supported=True,
    ),
    handler_fn=H.save_image_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="save_defect_image",
        version="1.0.0",
        display_name="Save Defect Image",
        category="data_logging",
        inputs=[PortContract(id="image_in", name="Image to Save", data_type="ImageFrame")],
        outputs=[
            PortContract(id="file_path", name="Saved Path", data_type="FileReference"),
            PortContract(id="image_out", name="Pass Through", data_type="ImageFrame"),
        ],
        handler="vision_runtime.handlers.data_logging.save_defect_image_handler",
        is_supported=True,
    ),
    handler_fn=H.save_defect_image_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="save_measurement",
        version="1.0.0",
        display_name="Save Measurement Result",
        category="data_logging",
        inputs=[PortContract(id="measurement", name="Measurement Data", data_type="MeasurementResult", required=False)],
        outputs=[PortContract(id="file_path", name="Saved JSON File", data_type="FileReference")],
        handler="vision_runtime.handlers.data_logging.save_measurement_handler",
        is_supported=True,
    ),
    handler_fn=H.save_measurement_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="export_csv",
        version="1.0.0",
        display_name="Export CSV",
        category="data_logging",
        inputs=[],
        outputs=[PortContract(id="file_path", name="CSV File", data_type="FileReference")],
        handler="vision_runtime.handlers.data_logging.export_csv_handler",
        is_supported=True,
    ),
    handler_fn=H.export_csv_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="inspection_logger",
        version="1.0.0",
        display_name="Inspection Logger",
        category="data_logging",
        inputs=[],
        outputs=[PortContract(id="log_entry", name="Log Line", data_type="String")],
        handler="vision_runtime.handlers.data_logging.inspection_logger_handler",
        is_supported=True,
    ),
    handler_fn=H.inspection_logger_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="result_history",
        version="1.0.0",
        display_name="Result History",
        category="data_logging",
        inputs=[],
        outputs=[PortContract(id="history", name="Audit History", data_type="FeatureSet")],
        handler="vision_runtime.handlers.data_logging.result_history_handler",
        is_supported=True,
    ),
    handler_fn=H.result_history_handler,
)

# ==============================================================================
# CATEGORY 10: AI INFERENCE
# ==============================================================================
runtime_registry.register(
    NodeContract(
        node_type="ai_classification",
        version="1.0.0",
        display_name="AI Image Classification",
        category="ai_inference",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="classification_result", name="Classification Result", data_type="ClassificationResult"),
            PortContract(id="top_prediction", name="Top Prediction", data_type="String"),
            PortContract(id="image_out", name="Preview Image", data_type="ImageFrame"),
        ],
        handler="vision_runtime.handlers.ai_inference.ai_classification_handler",
        is_supported=True,
    ),
    handler_fn=H.ai_classification_handler,
)

runtime_registry.register(
    NodeContract(
        node_type="ai_detection",
        version="1.0.0",
        display_name="AI Object Detection",
        category="ai_inference",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[
            PortContract(id="detections", name="Detections", data_type="DetectionResult"),
            PortContract(id="count", name="Total Count", data_type="Scalar"),
            PortContract(id="image_out", name="Annotated Image", data_type="ImageFrame"),
        ],
        handler="vision_runtime.handlers.ai_inference.ai_detection_handler",
        is_supported=True,
    ),
    handler_fn=H.ai_detection_handler,
)
