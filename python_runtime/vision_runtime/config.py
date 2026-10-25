"""Configuration for the Vision Runtime service."""

import os
from pathlib import Path
from pydantic import BaseModel, Field

_DEFAULT_RUNTIME_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_DATA_DIR = _DEFAULT_RUNTIME_ROOT / "data"


class RuntimeConfig(BaseModel):
    service_name: str = "Vision Runtime"
    version: str = "0.1.0"
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = False
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "app://-",
    ]
    # Phase 2 & 3 Local Persistence & Safety Limits
    data_dir: str = Field(
        default_factory=lambda: os.environ.get(
            "MVP_RUNTIME_DATA_DIR", str(_DEFAULT_DATA_DIR)
        )
    )
    max_image_file_bytes: int = 50 * 1024 * 1024  # 50 MB max input image size
    max_image_pixels: int = 25_000_000  # 25 Megapixels max decoded dimensions
    supported_image_extensions: list[str] = [
        ".png",
        ".jpg",
        ".jpeg",
        ".bmp",
        ".tif",
        ".tiff",
        ".webp",
    ]


settings = RuntimeConfig()
