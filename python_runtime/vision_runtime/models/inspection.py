"""Pydantic models for Phase 3 Production Execution API & Inspection Records."""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ExecutionStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class InspectionOutcome(str, Enum):
    OK = "OK"
    NG = "NG"
    UNKNOWN = "UNKNOWN"


class InputImageMetadata(BaseModel):
    filename: str
    resolved_path: str
    file_size_bytes: int
    width: int
    height: int
    channels: int


class InspectionNodeSummary(BaseModel):
    node_id: str
    node_type: str
    status: str
    duration_ms: float
    error: Optional[str] = None
    output_metadata: Dict[str, Any] = Field(default_factory=dict)
    has_preview: bool = False
    preview_url: Optional[str] = None


class InspectionErrorDetails(BaseModel):
    code: str
    message: str
    failed_node_id: Optional[str] = None


class InspectionRecord(BaseModel):
    inspection_id: str
    execution_id: str
    pipeline_id: str
    release_version: str
    release_checksum: str
    input_image: InputImageMetadata
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    execution_status: ExecutionStatus
    inspection_outcome: Optional[InspectionOutcome] = None
    duration_ms: float = 0.0
    node_results: Dict[str, InspectionNodeSummary] = Field(default_factory=dict)
    result_data: Dict[str, Any] = Field(default_factory=dict)
    preview_references: Dict[str, str] = Field(default_factory=dict)
    error_details: Optional[InspectionErrorDetails] = None


class StartInspectionRequest(BaseModel):
    pipeline_id: str = Field(..., min_length=1)
    release_version: Optional[str] = Field(
        default=None,
        description="Specific release version to execute. If omitted, resolves the active release for pipeline_id.",
    )
    image_path: str = Field(..., min_length=1, description="Path to the input image file to inspect.")
    workspace_dir: Optional[str] = None
