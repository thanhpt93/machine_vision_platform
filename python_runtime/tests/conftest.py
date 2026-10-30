"""Pytest configuration and global fixtures for NOVA Vision Runtime tests."""

import json
import os
from pathlib import Path
import pytest

from tests.license_test_helpers import create_signed_license_artifact, get_official_dev_key
from vision_runtime.services.license_service import license_service


@pytest.fixture(autouse=True)
def setup_test_license_environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Autouse fixture that provides an isolated license store with an active valid license
    matching the running edition for each test, preventing interference across tests.
    """
    mode = os.environ.get("NOVA_DEPLOYMENT_MODE", "developer").strip().lower()
    edition = "production" if mode == "production" else "developer"

    license_dir = tmp_path / "test_license_store"
    license_dir.mkdir(parents=True, exist_ok=True)

    # Ensure dev/mock signing key is registered
    get_official_dev_key()

    # Generate and install a valid signed license
    artifact = create_signed_license_artifact(edition=edition)
    (license_dir / "active_license.novalic.json").write_text(
        json.dumps(artifact, indent=2), encoding="utf-8"
    )

    prev_custom_dir = license_service._custom_storage_dir
    license_service._custom_storage_dir = license_dir

    yield license_dir

    license_service._custom_storage_dir = prev_custom_dir
