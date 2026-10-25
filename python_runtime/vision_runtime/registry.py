"""
Runtime Node Registry Contract (Python Vision Runtime)

Separates the UI/Editor metadata registry from the actual Python execution engine.
Maps node types and contract versions to Python handler implementations.
"""

from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field

from vision_runtime.handlers import (
    image_loader_handler,
    roi_crop_handler,
    grayscale_handler,
    threshold_handler,
    contour_detection_handler,
    result_viewer_handler,
    gaussian_blur_handler,
)


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
    """
    Python Runtime Node Registry.
    Tracks implemented nodes ready for DAG execution.
    """

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

# 1. Image File Source
runtime_registry.register(
    NodeContract(
        node_type="image_file",
        version="1.0.0",
        display_name="Image File",
        category="ACQUISITION",
        outputs=[PortContract(id="image", name="Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.image_loader",
        is_supported=True,
    ),
    handler_fn=image_loader_handler,
)

# 2. ROI Crop
runtime_registry.register(
    NodeContract(
        node_type="roi_crop",
        version="1.0.0",
        display_name="ROI Crop",
        category="PREPROCESSING",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Cropped Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.roi_crop",
        is_supported=True,
    ),
    handler_fn=roi_crop_handler,
)

# 3. Grayscale (Phase 3 Core Node)
runtime_registry.register(
    NodeContract(
        node_type="grayscale",
        version="1.0.0",
        display_name="Grayscale",
        category="PREPROCESSING",
        inputs=[PortContract(id="image_in", name="Color Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Grayscale Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.grayscale",
        is_supported=True,
    ),
    handler_fn=grayscale_handler,
)

# 4. Threshold
runtime_registry.register(
    NodeContract(
        node_type="threshold",
        version="1.0.0",
        display_name="Threshold",
        category="PREPROCESSING",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Binary Image", data_type="MaskFrame")],
        handler="vision_runtime.handlers.threshold",
        is_supported=True,
    ),
    handler_fn=threshold_handler,
)

# 5. Contour Detection (Phase 3 Core Inspection Node)
runtime_registry.register(
    NodeContract(
        node_type="contour_detection",
        version="1.0.0",
        display_name="Contour Detection",
        category="INSPECTION",
        inputs=[PortContract(id="mask_in", name="Binary Mask In", data_type="MaskFrame")],
        outputs=[
            PortContract(id="detections", name="Detections", data_type="DetectionResult"),
            PortContract(id="image_out", name="Annotated Preview", data_type="ImageFrame"),
        ],
        handler="vision_runtime.handlers.contour_detection",
        is_supported=True,
    ),
    handler_fn=contour_detection_handler,
)

# 6. Result Viewer
runtime_registry.register(
    NodeContract(
        node_type="result_viewer",
        version="1.0.0",
        display_name="Result Viewer",
        category="OUTPUT",
        inputs=[
            PortContract(id="image_in", name="Display Image", data_type="ImageFrame"),
            PortContract(id="detections_in", name="Detections (Optional)", data_type="DetectionResult", required=False),
        ],
        handler="vision_runtime.handlers.result_viewer",
        is_supported=True,
    ),
    handler_fn=result_viewer_handler,
)

# 7. Gaussian Blur
runtime_registry.register(
    NodeContract(
        node_type="gaussian_blur",
        version="1.0.0",
        display_name="Gaussian Blur",
        category="PREPROCESSING",
        inputs=[PortContract(id="image_in", name="Image In", data_type="ImageFrame")],
        outputs=[PortContract(id="image_out", name="Blurred Image", data_type="ImageFrame")],
        handler="vision_runtime.handlers.gaussian_blur",
        is_supported=True,
    ),
    handler_fn=gaussian_blur_handler,
)

# Note: 'ai_detection' is intentionally omitted to reflect that
# AI inference requires ONNX Runtime engine in a later phase.
