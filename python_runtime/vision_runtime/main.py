"""Main entrypoint for Vision Runtime FastAPI service."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from vision_runtime.api.health import router as health_router
from vision_runtime.api.pipeline import router as pipeline_router
from vision_runtime.config import settings

app = FastAPI(
    title=settings.service_name,
    version=settings.version,
    description="Local runtime API for industrial machine vision inspection platform",
    docs_url="/docs",
    redoc_url="/redoc",
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
app.include_router(pipeline_router)


@app.get("/", summary="Root status")
async def root():
    return {
        "service": settings.service_name,
        "version": settings.version,
        "docs": "/docs",
        "health": "/health",
        "pipeline_api": "/api/pipeline",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "vision_runtime.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
