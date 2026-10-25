"""Pydantic models for Phase 2 Pipeline Lifecycle & Immutable Release Management."""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PipelineLifecycleState(str, Enum):
    DRAFT = "Draft"
    VALIDATED = "Validated"
    RELEASED = "Released"
    ARCHIVED = "Archived"


class WorkingPipelineRecord(BaseModel):
    pipeline_id: str
    name: str
    lifecycle_status: PipelineLifecycleState = PipelineLifecycleState.DRAFT
    pipeline: Dict[str, Any]
    validated_checksum: Optional[str] = None
    last_validated_at: Optional[str] = None
    updated_at: str


class ReleaseSnapshot(BaseModel):
    pipeline_id: str = Field(..., min_length=1)
    release_version: str = Field(..., min_length=1)
    schema_version: str = Field(default="1.0.0")
    status: PipelineLifecycleState = Field(default=PipelineLifecycleState.RELEASED)
    is_active: bool = Field(default=False)
    pipeline: Dict[str, Any]
    node_versions: Dict[str, str] = Field(default_factory=dict)
    created_at: str
    archived_at: Optional[str] = None
    release_notes: str = Field(default="")
    checksum: str = Field(..., min_length=64, max_length=64)


class ReleaseIntegrityReport(BaseModel):
    pipeline_id: str
    release_version: str
    valid_integrity: bool
    stored_checksum: str
    computed_checksum: str
    status: PipelineLifecycleState
    is_active: bool
    message: str


class SaveDraftRequest(BaseModel):
    pipeline: Dict[str, Any]


class MarkValidatedRequest(BaseModel):
    pipeline: Dict[str, Any]
    check_resources: bool = False
    workspace_dir: Optional[str] = None


class CreateReleaseRequest(BaseModel):
    pipeline_id: Optional[str] = None
    pipeline: Optional[Dict[str, Any]] = None
    release_version: str = Field(..., min_length=1)
    release_notes: str = Field(default="")
    activate: bool = Field(default=True)
    require_prior_validation: bool = Field(default=False)
    check_resources: bool = Field(default=False)
    workspace_dir: Optional[str] = None


class RollbackReleaseRequest(BaseModel):
    pipeline_id: str = Field(..., min_length=1)
    target_release_version: str = Field(..., min_length=1)
