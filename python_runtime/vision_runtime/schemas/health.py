"""Health check schemas."""

from typing import Optional
from pydantic import BaseModel, Field


class HealthStatus(BaseModel):
    status: str = Field(default="healthy", description="Status string: healthy, degraded, or unhealthy")
    service: str = Field(..., description="Service name")
    version: str = Field(..., description="Service version")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    uptime_seconds: float = Field(..., description="Process uptime in seconds")
    python_version: str = Field(..., description="Python environment version")
    platform: str = Field(..., description="Operating system platform details")
    supported_nodes_count: int = Field(default=0, description="Total registered runtime nodes")
    is_inspection_running: bool = Field(default=False, description="Whether a production inspection is currently executing")
    active_inspection_id: Optional[str] = Field(default=None, description="Currently running inspection ID, if any")
