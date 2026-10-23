"""Configuration for the Vision Runtime service."""

from pydantic import BaseModel


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


settings = RuntimeConfig()
