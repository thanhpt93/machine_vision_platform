"""Tests for Phase 3 Production Edition runtime restrictions and userData relative path resolution."""

import os
from pathlib import Path
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from vision_runtime.main import app
from vision_runtime.services.inspection_service import validate_and_inspect_image_file


def test_production_edition_blocks_draft_and_release_creation_mutations(monkeypatch):
    """When NOVA_DEPLOYMENT_MODE=production, mutable draft/release creation endpoints return 403."""
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "production")
    client = TestClient(app)

    # Draft creation must be blocked in Production Edition
    resp_draft = client.post(
        "/api/releases/drafts",
        json={
            "pipeline": {
                "id": "prod_blocked_pipe",
                "name": "Blocked Draft",
                "schemaVersion": "1.0.0",
                "nodes": [],
                "edges": [],
            }
        },
    )
    assert resp_draft.status_code == 403
    assert "disabled in Production Edition" in resp_draft.json()["detail"]

    # Release creation must be blocked in Production Edition
    resp_rel = client.post(
        "/api/releases",
        json={
            "release_version": "1.0.0",
            "pipeline": {
                "id": "prod_blocked_pipe",
                "name": "Blocked Release",
                "schemaVersion": "1.0.0",
                "nodes": [],
                "edges": [],
            },
        },
    )
    assert resp_rel.status_code == 403

    # Read-only production release listing remains available
    resp_list = client.get("/api/production/releases")
    assert resp_list.status_code == 200


def test_validate_image_resolves_relative_path_from_mvp_runtime_data_dir(tmp_path, monkeypatch):
    """In packaged Production Edition, relative sample_images/... paths resolve via MVP_RUNTIME_DATA_DIR."""
    runtime_data_dir = tmp_path / "runtime_data"
    sample_dir = runtime_data_dir / "sample_images"
    sample_dir.mkdir(parents=True, exist_ok=True)

    img_file = sample_dir / "bottle_cap.png"
    img = np.zeros((64, 64, 3), dtype=np.uint8)
    cv2.imwrite(str(img_file), img)

    monkeypatch.setenv("MVP_RUNTIME_DATA_DIR", str(runtime_data_dir))

    # Resolve using an unrelated workspace_dir to simulate running from Program Files
    unrelated_cwd = tmp_path / "program_files_app"
    unrelated_cwd.mkdir(parents=True, exist_ok=True)

    meta = validate_and_inspect_image_file(
        image_path="sample_images/bottle_cap.png",
        workspace_dir=str(unrelated_cwd),
    )
    assert meta.filename == "bottle_cap.png"
    assert meta.width == 64
    assert meta.height == 64
    assert Path(meta.resolved_path) == img_file.resolve()
