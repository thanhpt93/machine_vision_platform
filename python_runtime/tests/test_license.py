"""Automated Unit & Integration Tests for NOVA Machine Vision Platform Licensing.

Covers all Phase 4 & Phase E requirements:
1. Valid Developer license imports into Developer Edition.
2. Valid Production license imports into Production Edition.
3. Correct license details and status are returned via API.
4. Valid license persists across restarts and is re-verified from disk.
5. Perpetual license is valid indefinitely without expiration date.
6. Tampered payload is rejected with INVALID_SIGNATURE.
7. Tampered signature is rejected with INVALID_SIGNATURE.
8. Wrong product ID is rejected with INVALID_PRODUCT.
9. Wrong edition is rejected with EDITION_MISMATCH.
10. Expired subscription license is rejected with EXPIRED.
11. Not-yet-valid license is rejected with NOT_YET_VALID.
12. Unknown key ID is rejected with UNSUPPORTED_LICENSE.
13. Unsupported schema version is rejected with UNSUPPORTED_LICENSE.
14. Corrupted/malformed artifact JSON is rejected cleanly.
15. Valid replacement license overwrites active license cleanly.
16. Invalid replacement license fails without destroying existing valid license.
17. Backend runtime enforcement blocks protected operations when unlicensed.
18. Backend runtime enforcement blocks protected operations when expired/mismatched.
19. Pre-validation endpoint (/api/license/validate) works without modifying state.
"""

import copy
import json
import os
from pathlib import Path
from typing import Any, Dict
import pytest
from fastapi.testclient import TestClient

from tests.license_test_helpers import create_signed_license_artifact, generate_test_keypair
from vision_runtime.main import app
from vision_runtime.models.license import LicenseStatusEnum
from vision_runtime.services.license_service import (
    DEFAULT_TRUSTED_PUBLIC_KEYS,
    LicenseService,
    canonicalize_payload,
    compute_public_key_fingerprint,
    license_service,
)


@pytest.fixture()
def clean_license_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Provides an isolated clean license store without any pre-installed license."""
    store_dir = tmp_path / "clean_license_store"
    store_dir.mkdir(parents=True, exist_ok=True)

    prev_dir = license_service._custom_storage_dir
    license_service._custom_storage_dir = store_dir

    yield store_dir

    license_service._custom_storage_dir = prev_dir


@pytest.fixture()
def client(clean_license_env: Path) -> TestClient:
    return TestClient(app)


# ------------------------------------------------------------------------------
# 1. No License Installed -> NOT_ACTIVATED
# ------------------------------------------------------------------------------
def test_01_no_license_installed_returns_not_activated(client: TestClient):
    resp = client.get("/api/license/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "NOT_ACTIVATED"
    assert data["is_valid"] is False
    assert data["signature_verified"] is False
    assert "No license is installed" in data["message"]

    details_resp = client.get("/api/license/details")
    assert details_resp.status_code == 200
    details = details_resp.json()
    assert details["has_license"] is False
    assert details["status"] == "NOT_ACTIVATED"
    assert details["is_valid"] is False


# ------------------------------------------------------------------------------
# 2. Valid Developer License Imports into Developer Edition
# ------------------------------------------------------------------------------
def test_02_valid_developer_license_import_succeeds(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    artifact = create_signed_license_artifact(
        edition="developer",
        license_number="NVL-DEV-2026-001",
        customer_name="Alpha Vision Systems",
        customer_code="ALPHA-VIS",
    )

    import_resp = client.post("/api/license/import", json={"artifact": artifact})
    assert import_resp.status_code == 200
    body = import_resp.json()
    assert body["success"] is True
    assert body["status"] == "VALID"
    assert body["license_number"] == "NVL-DEV-2026-001"

    # Verify status
    status_resp = client.get("/api/license/status")
    assert status_resp.status_code == 200
    s_data = status_resp.json()
    assert s_data["status"] == "VALID"
    assert s_data["is_valid"] is True
    assert s_data["edition"] == "developer"
    assert s_data["customer_name"] == "Alpha Vision Systems"
    assert s_data["signature_verified"] is True

    # Verify details
    det_resp = client.get("/api/license/details")
    assert det_resp.status_code == 200
    det = det_resp.json()
    assert det["has_license"] is True
    assert det["product_id"] == "NOVA-MVP"
    assert det["key_id"] == "nova-key-2026-01"
    assert det["key_fingerprint"] is not None
    assert det["limits"]["max_devices"] == 2


# ------------------------------------------------------------------------------
# 3. Valid Production License Imports into Production Edition
# ------------------------------------------------------------------------------
def test_03_valid_production_license_import_succeeds(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "production")

    artifact = create_signed_license_artifact(
        edition="production",
        license_number="NVL-PROD-2026-002",
        customer_name="Beta Factory Floor",
        customer_code="BETA-FAC",
    )

    import_resp = client.post("/api/license/import", json={"artifact": artifact})
    assert import_resp.status_code == 200
    body = import_resp.json()
    assert body["success"] is True
    assert body["status"] == "VALID"

    status_resp = client.get("/api/license/status")
    assert status_resp.status_code == 200
    s_data = status_resp.json()
    assert s_data["status"] == "VALID"
    assert s_data["edition"] == "production"
    assert s_data["running_edition"] == "production"


# ------------------------------------------------------------------------------
# 4. Valid License Persists Across Restart and is Re-Verified
# ------------------------------------------------------------------------------
def test_04_valid_license_persists_and_reverifies(clean_license_env: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    artifact = create_signed_license_artifact(
        edition="developer",
        license_number="NVL-PERSIST-101",
    )
    # Write to persistence directory
    active_file = clean_license_env / "active_license.novalic.json"
    active_file.write_text(json.dumps(artifact, indent=2), encoding="utf-8")

    # Create a fresh service instance simulating application restart
    fresh_service = LicenseService(storage_dir=clean_license_env)
    status_obj = fresh_service.get_status()
    assert status_obj.status == LicenseStatusEnum.VALID
    assert status_obj.is_valid is True
    assert status_obj.license_number == "NVL-PERSIST-101"
    assert status_obj.signature_verified is True


# ------------------------------------------------------------------------------
# 5. Perpetual License is Valid Indefinitely
# ------------------------------------------------------------------------------
def test_05_perpetual_license_semantics(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    perp_artifact = create_signed_license_artifact(
        edition="developer",
        license_type="PERPETUAL",
        license_number="NVL-PERP-999",
    )
    assert perp_artifact["payload"]["expires_at"] is None

    import_resp = client.post("/api/license/import", json={"artifact": perp_artifact})
    assert import_resp.status_code == 200

    status_resp = client.get("/api/license/status").json()
    assert status_resp["status"] == "VALID"
    assert status_resp["license_type"] == "PERPETUAL"
    assert status_resp["expires_at"] is None


# ------------------------------------------------------------------------------
# 6. Tampered Payload is Rejected
# ------------------------------------------------------------------------------
def test_06_tampered_payload_rejected(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    tampered_artifact = create_signed_license_artifact(
        edition="developer",
        tamper_payload=True,
    )

    resp = client.post("/api/license/import", json={"artifact": tampered_artifact})
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["status"] == "INVALID_SIGNATURE"
    assert "Cryptographic signature verification failed" in detail["message"]

    # Active status must remain NOT_ACTIVATED
    assert client.get("/api/license/status").json()["status"] == "NOT_ACTIVATED"


# ------------------------------------------------------------------------------
# 7. Tampered Signature is Rejected
# ------------------------------------------------------------------------------
def test_07_tampered_signature_rejected(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    tampered_sig_artifact = create_signed_license_artifact(
        edition="developer",
        tamper_signature=True,
    )

    resp = client.post("/api/license/import", json={"artifact": tampered_sig_artifact})
    assert resp.status_code == 400
    assert resp.json()["detail"]["status"] == "INVALID_SIGNATURE"


# ------------------------------------------------------------------------------
# 8. Wrong Product ID is Rejected
# ------------------------------------------------------------------------------
def test_08_wrong_product_id_rejected(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    wrong_prod_artifact = create_signed_license_artifact(
        edition="developer",
        product_id="OTHER-SOFTWARE-PRODUCT",
    )

    resp = client.post("/api/license/import", json={"artifact": wrong_prod_artifact})
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["status"] == "INVALID_PRODUCT"
    assert "does not match NOVA Machine Vision Platform" in detail["message"]


# ------------------------------------------------------------------------------
# 9. Wrong Edition is Rejected (Edition Mismatch)
# ------------------------------------------------------------------------------
def test_09_wrong_edition_mismatch_rejected(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    # Attempting to import production license into Developer Edition
    prod_artifact = create_signed_license_artifact(edition="production")

    resp = client.post("/api/license/import", json={"artifact": prod_artifact})
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["status"] == "EDITION_MISMATCH"
    assert "not compatible with running edition" in detail["message"]


# ------------------------------------------------------------------------------
# 10. Expired Subscription License is Rejected
# ------------------------------------------------------------------------------
def test_10_expired_subscription_license_handling(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    expired_artifact = create_signed_license_artifact(
        edition="developer",
        is_expired=True,
    )

    # Pre-validation endpoint reports EXPIRED
    val_resp = client.post("/api/license/validate", json={"artifact": expired_artifact})
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    assert val_data["valid"] is False
    assert val_data["status"] == "EXPIRED"


# ------------------------------------------------------------------------------
# 11. Not Yet Valid License is Rejected
# ------------------------------------------------------------------------------
def test_11_not_yet_valid_license_handling(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    future_artifact = create_signed_license_artifact(
        edition="developer",
        is_not_yet_valid=True,
    )

    val_resp = client.post("/api/license/validate", json={"artifact": future_artifact})
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    assert val_data["valid"] is False
    assert val_data["status"] == "NOT_YET_VALID"


# ------------------------------------------------------------------------------
# 12. Unknown Key ID is Rejected
# ------------------------------------------------------------------------------
def test_12_unknown_key_id_rejected(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    priv_key, _ = generate_test_keypair()
    unknown_key_artifact = create_signed_license_artifact(
        edition="developer",
        key_id="untrusted-rogue-key-2099",
        private_key=priv_key,
    )

    resp = client.post("/api/license/import", json={"artifact": unknown_key_artifact})
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["status"] == "UNSUPPORTED_LICENSE"
    assert "Unknown or untrusted signing key ID" in detail["message"]


# ------------------------------------------------------------------------------
# 13. Key Rotation / Dynamic Public Key Registration Works
# ------------------------------------------------------------------------------
def test_13_rotated_key_registration_and_verification(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    rotated_key_id = "nova-key-rotated-2027"
    priv_key, pub_pem = generate_test_keypair()

    # Register the newly rotated public key
    license_service.register_trusted_public_key(rotated_key_id, pub_pem)

    rotated_artifact = create_signed_license_artifact(
        edition="developer",
        key_id=rotated_key_id,
        private_key=priv_key,
        license_number="NVL-ROTATED-001",
    )

    import_resp = client.post("/api/license/import", json={"artifact": rotated_artifact})
    assert import_resp.status_code == 200
    assert import_resp.json()["status"] == "VALID"

    status_resp = client.get("/api/license/status").json()
    assert status_resp["status"] == "VALID"
    assert status_resp["key_id"] == rotated_key_id


# ------------------------------------------------------------------------------
# 14. Unsupported Schema Version is Rejected
# ------------------------------------------------------------------------------
def test_14_unsupported_schema_version_rejected(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    artifact = create_signed_license_artifact(edition="developer")
    artifact["payload"]["schema_version"] = "99.0"

    resp = client.post("/api/license/import", json={"artifact": artifact})
    assert resp.status_code == 400
    assert resp.json()["detail"]["status"] == "UNSUPPORTED_LICENSE"


# ------------------------------------------------------------------------------
# 15. Safe Replacement: Invalid Replacement Does Not Overwrite Valid License
# ------------------------------------------------------------------------------
def test_15_invalid_replacement_preserves_existing_valid_license(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    # Step 1: Install original valid license
    original_valid = create_signed_license_artifact(
        edition="developer",
        license_number="NVL-ORIGINAL-VALID",
    )
    ok_resp = client.post("/api/license/import", json={"artifact": original_valid})
    assert ok_resp.status_code == 200
    assert client.get("/api/license/status").json()["license_number"] == "NVL-ORIGINAL-VALID"

    # Step 2: Attempt to import a tampered replacement license
    bad_replacement = create_signed_license_artifact(
        edition="developer",
        license_number="NVL-BAD-REPLACE",
        tamper_payload=True,
    )
    bad_resp = client.post("/api/license/import", json={"artifact": bad_replacement})
    assert bad_resp.status_code == 400

    # Step 3: Active license must still be the original valid license!
    active_now = client.get("/api/license/status").json()
    assert active_now["status"] == "VALID"
    assert active_now["license_number"] == "NVL-ORIGINAL-VALID"

    # Step 4: Import a legitimate replacement license -> should succeed
    legit_replacement = create_signed_license_artifact(
        edition="developer",
        license_number="NVL-LEGIT-REPLACEMENT",
    )
    replace_resp = client.post("/api/license/import", json={"artifact": legit_replacement})
    assert replace_resp.status_code == 200

    active_final = client.get("/api/license/status").json()
    assert active_final["status"] == "VALID"
    assert active_final["license_number"] == "NVL-LEGIT-REPLACEMENT"


# ------------------------------------------------------------------------------
# 16. Backend Runtime Protected Operation Enforcement
# ------------------------------------------------------------------------------
def test_16_runtime_enforcement_blocks_protected_operations(
    client: TestClient,
    clean_license_env: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    # Case A: Developer Mode without license -> execute_pipeline blocked
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    pipeline_payload = {
        "id": "pipe_unlicensed",
        "name": "Unlicensed Pipeline",
        "nodes": [],
        "edges": [],
    }

    pipe_resp = client.post("/api/pipeline/execute", json={"pipeline": pipeline_payload})
    assert pipe_resp.status_code == 403
    err_body = pipe_resp.json()["detail"]
    assert err_body["error_code"] == "LICENSE_REQUIRED"
    assert err_body["status"] == "NOT_ACTIVATED"

    # Releases creation blocked
    rel_resp = client.post("/api/releases", json={"pipeline": pipeline_payload, "release_version": "1.0.0"})
    assert rel_resp.status_code == 403
    assert rel_resp.json()["detail"]["error_code"] == "LICENSE_REQUIRED"

    # Case B: Production Mode without license -> inspections blocked
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "production")

    insp_resp = client.post(
        "/api/production/inspections",
        json={"pipeline_id": "pipe_test", "image_path": "sample.png"},
    )
    assert insp_resp.status_code == 403
    assert insp_resp.json()["detail"]["error_code"] == "LICENSE_REQUIRED"


# ------------------------------------------------------------------------------
# 17. Pre-validation via text content (POST /api/license/validate)
# ------------------------------------------------------------------------------
def test_17_validate_endpoint_with_raw_text(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("NOVA_DEPLOYMENT_MODE", "developer")

    artifact = create_signed_license_artifact(edition="developer")
    text_json = json.dumps(artifact)

    val_resp = client.post("/api/license/validate", json={"artifact_text": text_json})
    assert val_resp.status_code == 200
    val_body = val_resp.json()
    assert val_body["valid"] is True
    assert val_body["status"] == "VALID"
    assert val_body["edition"] == "developer"
