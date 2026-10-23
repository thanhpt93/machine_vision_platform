"""Tests for Health endpoint in Vision Runtime."""

import pytest
from fastapi.testclient import TestClient
from vision_runtime.main import app

client = TestClient(app)


def test_root_endpoint():
    """Verify root endpoint returns service info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "Vision Runtime"
    assert "version" in data
    assert data["health"] == "/health"


def test_health_endpoint_success():
    """Verify health endpoint returns healthy status and required metadata."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "Vision Runtime"
    assert "version" in data
    assert "timestamp" in data
    assert "uptime_seconds" in data
    assert data["uptime_seconds"] >= 0
    assert "python_version" in data
    assert "platform" in data
