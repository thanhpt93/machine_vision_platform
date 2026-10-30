"""Main entrypoint for Vision Runtime FastAPI service."""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from vision_runtime.api.health import router as health_router
from vision_runtime.api.license import router as license_router
from vision_runtime.api.pipeline import router as pipeline_router
from vision_runtime.api.production import router as production_router
from vision_runtime.api.releases import router as releases_router
from vision_runtime.api.models import router as models_router
from vision_runtime.config import settings

_DEPLOYMENT_MODE = os.environ.get("NOVA_DEPLOYMENT_MODE", "developer").strip().lower()
_IS_PRODUCTION_EDITION = _DEPLOYMENT_MODE == "production"

app = FastAPI(
    title=settings.service_name,
    version=settings.version,
    description="Local runtime API for industrial machine vision inspection platform",
    docs_url=None if _IS_PRODUCTION_EDITION else "/docs",
    redoc_url=None if _IS_PRODUCTION_EDITION else "/redoc",
)

# Allow CORS for Electron renderer and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Local runtime controlled access
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(license_router)
app.include_router(production_router)
app.include_router(releases_router)
app.include_router(models_router)

# Only register mutable Pipeline Editor execution/draft compilation router in Developer Mode
if not _IS_PRODUCTION_EDITION:
    app.include_router(pipeline_router)


@app.get("/", summary="Root status")
async def root():
    return {
        "service": settings.service_name,
        "version": settings.version,
        "deployment_mode": "production" if _IS_PRODUCTION_EDITION else "developer",
        "docs": None if _IS_PRODUCTION_EDITION else "/docs",
        "health": "/health",
        "license_api": "/api/license",
        "models_api": "/api/models",
        "pipeline_api": None if _IS_PRODUCTION_EDITION else "/api/pipeline",
        "releases_api": "/api/releases",
        "production_api": "/api/production",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "vision_runtime.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
