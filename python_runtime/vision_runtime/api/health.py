"""Health check API router."""

import platform
import sys
import time
from datetime import datetime, timezone
from fastapi import APIRouter
from vision_runtime.config import settings
from vision_runtime.schemas.health import HealthStatus

router = APIRouter(tags=["Health"])

START_TIME = time.time()


@router.get("/health", response_model=HealthStatus, summary="System Health Check")
async def get_health() -> HealthStatus:
    """Check health and runtime environment status."""
    uptime = time.time() - START_TIME
    now_iso = datetime.now(timezone.utc).isoformat()
    return HealthStatus(
        status="healthy",
        service=settings.service_name,
        version=settings.version,
        timestamp=now_iso,
        uptime_seconds=round(uptime, 2),
        python_version=sys.version.split()[0],
        platform=f"{platform.system()} {platform.release()} ({platform.machine()})",
    )
