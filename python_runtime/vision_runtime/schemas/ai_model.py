"""Pydantic schemas for AI Models, Packages, and Inference Results."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class InputTensorSchema(BaseModel):
    name: str
    shape: List[Any]
    data_type: str = "float32"


class OutputTensorSchema(BaseModel):
    name: str
    shape: List[Any]
    data_type: str = "float32"
    semantics: Optional[str] = None


class PreprocessingSchema(BaseModel):
    input_size: List[int] = Field(default_factory=lambda: [224, 224])
    channels: int = 3
    color_space: str = "RGB"
    resize_policy: str = "bilinear"
    normalization: Optional[Dict[str, List[float]]] = None
    coordinate_system: Optional[str] = None


class PostprocessingSchema(BaseModel):
    coordinate_format: str = "xyxy"
    confidence_threshold: float = 0.5
    iou_threshold: float = 0.5
    max_detections: int = 100
    background_class_index: int = 0
    output_semantics: Optional[Dict[str, str]] = None


class ModelClassInfo(BaseModel):
    index: int
    name: str
    id: Optional[str] = None
    label_id: Optional[str] = None
    color: Optional[str] = None
    is_background: bool = False


class ModelMetadataSchema(BaseModel):
    model_name: str
    task_type: str  # "IMAGE_CLASSIFICATION" or "OBJECT_DETECTION"
    architecture: str
    framework: str = "PyTorch"
    export_format: str = "ONNX"
    input_tensor: InputTensorSchema
    output_tensor: Optional[OutputTensorSchema] = None
    output_tensors: Optional[List[OutputTensorSchema]] = None
    preprocessing: PreprocessingSchema
    postprocessing: Optional[PostprocessingSchema] = None
    num_classes: int
    onnx_sha256: str
    schema_version: str = "1.0.0"


class ModelCatalogItem(BaseModel):
    id: str
    name: str
    task_type: str  # "IMAGE_CLASSIFICATION" or "OBJECT_DETECTION"
    architecture: str
    version: str = "1.0.0"
    format: str = "ONNX"
    input_size: List[int]
    num_classes: int
    classes: List[ModelClassInfo]
    source: str = "NOVA AI Trainer"
    status: str = "valid"  # "valid", "invalid", "unsupported"
    import_date: str
    file_size_bytes: int
    checksum_sha256: str
    artifact_path: str
    metadata: Dict[str, Any]
    validation_report: Optional[Dict[str, Any]] = None


class ImportModelRequest(BaseModel):
    source_path: str = Field(..., description="Absolute path to exported package directory or zip file")
    custom_name: Optional[str] = Field(None, description="Optional custom display name for the model")


class ImportValidationSummary(BaseModel):
    is_valid: bool
    package_name: str
    task_type: str
    architecture: str
    input_size: List[int]
    num_classes: int
    files_checked: Dict[str, bool]
    checksum_verified: bool
    onnx_runtime_compatible: bool
    execution_provider: str
    error_message: Optional[str] = None


class ModelValidationResponse(BaseModel):
    model_id: str
    is_valid: bool
    status: str
    checksum_verified: bool
    session_ready: bool
    execution_provider: str
    errors: List[str] = Field(default_factory=list)


class HardwareInfo(BaseModel):
    available_providers: List[str]
    selected_provider: str
    cuda_available: bool
    device_name: Optional[str] = None
    cpu_cores: int


class BoundingBox(BaseModel):
    x_min: float
    y_min: float
    x_max: float
    y_max: float


class DetectionItem(BaseModel):
    detection_id: str
    class_index: int
    class_id: Optional[str] = None
    class_name: str
    confidence: float
    bbox: BoundingBox
    color: Optional[str] = None


class ClassificationItem(BaseModel):
    class_index: int
    class_id: Optional[str] = None
    class_name: str
    confidence: float
    color: Optional[str] = None


class ExecutionMetrics(BaseModel):
    provider: str
    inference_time_ms: float
    preprocessing_time_ms: float = 0.0
    postprocessing_time_ms: float = 0.0


class ClassificationResult(BaseModel):
    task_type: str = "IMAGE_CLASSIFICATION"
    model_id: str
    model_version: str = "1.0.0"
    predictions: List[ClassificationItem]
    top_prediction: Optional[str] = None
    execution: ExecutionMetrics


class DetectionResult(BaseModel):
    task_type: str = "OBJECT_DETECTION"
    model_id: str
    model_version: str = "1.0.0"
    image_width: int
    image_height: int
    detections: List[DetectionItem]
    count: int
    execution: ExecutionMetrics
