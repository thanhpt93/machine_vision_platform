"""Phase 2 Automated Unit & Integration Tests — Pipeline Validation & Release Management.

Covers all 16 required Phase 2 test scenarios:
1. Valid pipeline passes validation.
2. Pipeline with missing required input fails validation.
3. Pipeline with incompatible port types fails validation.
4. Pipeline with unknown node type fails validation.
5. Pipeline with missing Runtime handler fails validation.
6. Pipeline with invalid node config fails validation.
7. Pipeline with cycle fails validation.
8. Editing a validated pipeline returns it to Draft.
9. Creating a release from a validated pipeline succeeds.
10. Creating a release from an invalid or unvalidated pipeline fails.
11. Creating a duplicate release version for the same pipeline fails.
12. Released pipeline snapshot remains unchanged after the draft is edited.
13. Release checksum verification passes for valid release and fails when tampered with.
14. Archiving a release marks it archived without deleting the artifact.
15. Rollback/selection of an earlier valid release works.
16. Existing .mvp files still load and save correctly (plus migration & unsupported version rejection).
"""

import copy
import json
from pathlib import Path
from typing import Any, Dict
import pytest
from fastapi.testclient import TestClient

from vision_runtime.engine.validator import migrate_mvp_pipeline, validate_pipeline_definition
from vision_runtime.main import app
from vision_runtime.registry import NodeContract, runtime_registry
from vision_runtime.services.release_manager import ReleaseManager, release_manager


def _make_valid_pipeline(pipeline_id: str = "pipe_bottle_cap_1") -> Dict[str, Any]:
    return {
        "fileFormat": "MVP_PIPELINE",
        "schemaVersion": "1.0.0",
        "id": pipeline_id,
        "name": "Bottle Cap Metrology Pipeline",
        "description": "Valid test pipeline",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
        "metadata": {"station": "LINE_A"},
        "nodes": [
            {
                "id": "n_img",
                "nodeType": "image_file",
                "name": "Source Image",
                "position": {"x": 50, "y": 100},
                "config": {"filePath": "sample_images/bottle_cap.png"},
            },
            {
                "id": "n_gray",
                "nodeType": "grayscale",
                "name": "Grayscale",
                "position": {"x": 300, "y": 100},
                "config": {"equalizeHist": False},
            },
            {
                "id": "n_thresh",
                "nodeType": "threshold",
                "name": "Threshold",
                "position": {"x": 550, "y": 100},
                "config": {"threshold": 125, "mode": "BINARY", "maxVal": 255},
            },
        ],
        "edges": [
            {
                "id": "e1",
                "sourceNodeId": "n_img",
                "sourcePortId": "image",
                "targetNodeId": "n_gray",
                "targetPortId": "image_in",
            },
            {
                "id": "e2",
                "sourceNodeId": "n_gray",
                "sourcePortId": "image_out",
                "targetNodeId": "n_thresh",
                "targetPortId": "image_in",
            },
        ],
    }


@pytest.fixture()
def isolated_release_manager(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> ReleaseManager:
    """Provides a clean isolated temporary storage directory for release_manager during each test."""
    original_dir = release_manager.storage_dir
    release_manager.storage_dir = tmp_path / "runtime_data"
    yield release_manager
    release_manager.storage_dir = original_dir


@pytest.fixture()
def client(isolated_release_manager: ReleaseManager) -> TestClient:
    return TestClient(app)


# ------------------------------------------------------------------------------
# 1. Valid pipeline passes validation
# ------------------------------------------------------------------------------
def test_01_valid_pipeline_passes_validation():
    pipeline = _make_valid_pipeline()
    res = validate_pipeline_definition(pipeline)
    assert res.valid is True
    assert res.can_release is True
    assert len(res.errors) == 0
    assert [step["id"] for step in res.execution_plan] == ["n_img", "n_gray", "n_thresh"]


# ------------------------------------------------------------------------------
# 2. Pipeline with missing required input fails validation
# ------------------------------------------------------------------------------
def test_02_missing_required_input_fails_validation():
    pipeline = _make_valid_pipeline()
    # Remove edge feeding n_thresh.image_in
    pipeline["edges"] = [pipeline["edges"][0]]

    res = validate_pipeline_definition(pipeline)
    assert res.valid is False
    assert res.can_release is False
    codes = [e.code for e in res.errors]
    assert "MISSING_REQUIRED_INPUT" in codes
    err = next(e for e in res.errors if e.code == "MISSING_REQUIRED_INPUT")
    assert err.node_id == "n_thresh"
    assert err.port_id == "image_in"


# ------------------------------------------------------------------------------
# 3. Pipeline with incompatible port types fails validation
# ------------------------------------------------------------------------------
def test_03_incompatible_port_types_fails_validation():
    pipeline = {
        "fileFormat": "MVP_PIPELINE",
        "schemaVersion": "1.0.0",
        "id": "pipe_mismatch",
        "name": "Port Mismatch Pipeline",
        "nodes": [
            {
                "id": "n_dist",
                "nodeType": "distance_measurement",
                "name": "Distance",
                "position": {"x": 0, "y": 0},
                "config": {},
            },
            {
                "id": "n_gray",
                "nodeType": "grayscale",
                "name": "Grayscale",
                "position": {"x": 200, "y": 0},
                "config": {},
            },
        ],
        "edges": [
            {
                "id": "e_bad_type",
                "sourceNodeId": "n_dist",
                "sourcePortId": "scalar_value",  # Scalar output
                "targetNodeId": "n_gray",
                "targetPortId": "image_in",  # Expects ImageFrame
            }
        ],
    }

    res = validate_pipeline_definition(pipeline)
    assert res.valid is False
    assert res.can_release is False
    assert any(e.code == "PORT_TYPE_MISMATCH" for e in res.errors)


# ------------------------------------------------------------------------------
# 4. Pipeline with unknown node type fails validation
# ------------------------------------------------------------------------------
def test_04_unknown_node_type_fails_validation():
    pipeline = _make_valid_pipeline()
    pipeline["nodes"].append(
        {
            "id": "n_unknown",
            "nodeType": "non_existent_quantum_filter",
            "name": "Quantum Filter",
            "position": {"x": 800, "y": 100},
            "config": {},
        }
    )

    res = validate_pipeline_definition(pipeline)
    assert res.valid is False
    assert res.can_release is False
    assert any(e.code == "UNKNOWN_NODE_TYPE" and e.node_id == "n_unknown" for e in res.errors)


# ------------------------------------------------------------------------------
# 5. Pipeline with missing Runtime handler fails validation
# ------------------------------------------------------------------------------
def test_05_missing_runtime_handler_fails_validation():
    # Register a temporary UI-only contract with no handler_fn
    temp_node_type = "ui_only_test_node_phase2"
    if runtime_registry.get_contract(temp_node_type) is None:
        runtime_registry.register(
            NodeContract(
                node_type=temp_node_type,
                version="1.0.0",
                display_name="UI Only Node",
                category="image_processing",
                inputs=[],
                outputs=[],
                is_supported=False,
            ),
            handler_fn=None,
        )

    pipeline = _make_valid_pipeline()
    pipeline["nodes"].append(
        {
            "id": "n_unimplemented",
            "nodeType": temp_node_type,
            "name": "Unimplemented Node",
            "position": {"x": 800, "y": 100},
            "config": {},
        }
    )

    res = validate_pipeline_definition(pipeline)
    assert res.valid is False
    assert res.can_release is False
    assert "n_unimplemented" in res.unsupported_nodes
    assert any(e.code == "UNSUPPORTED_RUNTIME_NODE" and e.node_id == "n_unimplemented" for e in res.errors)


# ------------------------------------------------------------------------------
# 6. Pipeline with invalid node config (or executable payload) fails validation
# ------------------------------------------------------------------------------
def test_06_invalid_node_config_fails_validation():
    pipeline = _make_valid_pipeline()
    # Set invalid threshold (> 255) and dangerous payload
    pipeline["nodes"][2]["config"]["threshold"] = 999
    pipeline["nodes"][0]["config"]["filePath"] = "__import__('os').system('calc')"

    res = validate_pipeline_definition(pipeline)
    assert res.valid is False
    assert res.can_release is False
    codes = {e.code for e in res.errors}
    assert "INVALID_NODE_CONFIG" in codes
    assert "DANGEROUS_CONFIG_PAYLOAD" in codes


# ------------------------------------------------------------------------------
# 7. Pipeline with cycle fails validation
# ------------------------------------------------------------------------------
def test_07_cycle_in_pipeline_fails_validation():
    pipeline = _make_valid_pipeline()
    # Connect n_thresh back to n_gray to create a cycle
    pipeline["edges"].append(
        {
            "id": "e_cycle",
            "sourceNodeId": "n_thresh",
            "sourcePortId": "image_out",
            "targetNodeId": "n_gray",
            "targetPortId": "image_in",
        }
    )

    res = validate_pipeline_definition(pipeline)
    assert res.valid is False
    assert res.can_release is False
    assert any(e.code == "CYCLE_DETECTED" for e in res.errors)


# ------------------------------------------------------------------------------
# 8. Editing a validated pipeline returns it to Draft
# ------------------------------------------------------------------------------
def test_08_editing_validated_pipeline_returns_it_to_draft(client: TestClient):
    pipeline = _make_valid_pipeline("pipe_lifecycle_test")

    # Mark Validated
    val_resp = client.post("/api/releases/validate", json={"pipeline": pipeline})
    assert val_resp.status_code == 200
    body = val_resp.json()
    assert body["validation"]["valid"] is True
    assert body["working_record"]["lifecycle_status"] == "Validated"

    # Edit the pipeline and save draft
    edited_pipeline = copy.deepcopy(pipeline)
    edited_pipeline["nodes"][2]["config"]["threshold"] = 140
    draft_resp = client.post("/api/releases/drafts", json={"pipeline": edited_pipeline})
    assert draft_resp.status_code == 200
    assert draft_resp.json()["lifecycle_status"] == "Draft"
    assert draft_resp.json()["validated_checksum"] is None


# ------------------------------------------------------------------------------
# 9. Creating a release from a validated pipeline succeeds
# ------------------------------------------------------------------------------
def test_09_creating_release_from_validated_pipeline_succeeds(client: TestClient):
    pipeline = _make_valid_pipeline("pipe_release_ok")

    # Validate first
    val_resp = client.post("/api/releases/validate", json={"pipeline": pipeline})
    assert val_resp.status_code == 200
    assert val_resp.json()["working_record"]["lifecycle_status"] == "Validated"

    # Create release 1.0.0 requiring prior validation
    rel_resp = client.post(
        "/api/releases",
        json={
            "pipeline_id": "pipe_release_ok",
            "release_version": "1.0.0",
            "release_notes": "Initial production release",
            "require_prior_validation": True,
        },
    )
    assert rel_resp.status_code == 201
    rel_data = rel_resp.json()
    assert rel_data["pipeline_id"] == "pipe_release_ok"
    assert rel_data["release_version"] == "1.0.0"
    assert rel_data["status"] == "Released"
    assert rel_data["is_active"] is True
    assert len(rel_data["checksum"]) == 64
    assert rel_data["node_versions"] == {
        "image_file": "1.0.0",
        "grayscale": "1.0.0",
        "threshold": "1.0.0",
    }


# ------------------------------------------------------------------------------
# 10. Creating a release from an invalid or unvalidated pipeline fails
# ------------------------------------------------------------------------------
def test_10_creating_release_from_invalid_or_unvalidated_pipeline_fails(client: TestClient):
    # Case A: Unvalidated draft when require_prior_validation=True
    draft_pipe = _make_valid_pipeline("pipe_unvalidated")
    client.post("/api/releases/drafts", json={"pipeline": draft_pipe})

    unval_resp = client.post(
        "/api/releases",
        json={
            "pipeline_id": "pipe_unvalidated",
            "release_version": "1.0.0",
            "require_prior_validation": True,
        },
    )
    assert unval_resp.status_code == 400
    assert "Validated" in unval_resp.json()["detail"]

    # Case B: Invalid pipeline (missing required input)
    invalid_pipe = _make_valid_pipeline("pipe_invalid")
    invalid_pipe["edges"] = []
    inv_resp = client.post(
        "/api/releases",
        json={
            "pipeline": invalid_pipe,
            "release_version": "1.0.0",
        },
    )
    assert inv_resp.status_code == 400
    assert "Cannot create release for invalid pipeline" in inv_resp.json()["detail"]


# ------------------------------------------------------------------------------
# 11. Creating a duplicate release version for the same pipeline fails
# ------------------------------------------------------------------------------
def test_11_duplicate_release_version_fails(client: TestClient):
    pipeline = _make_valid_pipeline("pipe_dup_ver")

    first = client.post(
        "/api/releases",
        json={"pipeline": pipeline, "release_version": "1.0.0"},
    )
    assert first.status_code == 201

    duplicate = client.post(
        "/api/releases",
        json={"pipeline": pipeline, "release_version": "1.0.0"},
    )
    assert duplicate.status_code == 409
    assert "already exists" in duplicate.json()["detail"]


# ------------------------------------------------------------------------------
# 12. Released pipeline snapshot remains unchanged after the draft is edited
# ------------------------------------------------------------------------------
def test_12_released_snapshot_remains_immutable_after_draft_edit(client: TestClient):
    pipeline = _make_valid_pipeline("pipe_immutable")
    client.post("/api/releases/validate", json={"pipeline": pipeline})
    rel_resp = client.post(
        "/api/releases",
        json={"pipeline_id": "pipe_immutable", "release_version": "1.0.0"},
    )
    assert rel_resp.status_code == 201
    original_checksum = rel_resp.json()["checksum"]

    # Mutate draft heavily
    mutated_draft = copy.deepcopy(pipeline)
    mutated_draft["name"] = "Heavily Edited Draft Name"
    mutated_draft["nodes"][2]["config"]["threshold"] = 210
    client.post("/api/releases/drafts", json={"pipeline": mutated_draft})

    # Fetch stored release 1.0.0 and verify it is completely untouched
    fetched = client.get("/api/releases/pipe_immutable/1.0.0")
    assert fetched.status_code == 200
    fetched_data = fetched.json()
    assert fetched_data["checksum"] == original_checksum
    assert fetched_data["pipeline"]["name"] == "Bottle Cap Metrology Pipeline"
    assert fetched_data["pipeline"]["nodes"][2]["config"]["threshold"] == 125
    assert fetched_data["integrity"]["valid_integrity"] is True


# ------------------------------------------------------------------------------
# 13. Release checksum verification passes for valid release and fails when tampered with
# ------------------------------------------------------------------------------
def test_13_release_checksum_verification_detects_tampering(
    client: TestClient, isolated_release_manager: ReleaseManager
):
    pipeline = _make_valid_pipeline("pipe_tamper_check")
    client.post(
        "/api/releases",
        json={"pipeline": pipeline, "release_version": "1.0.0"},
    )

    # Valid integrity check
    ok_verify = client.get("/api/releases/pipe_tamper_check/1.0.0/verify")
    assert ok_verify.status_code == 200
    assert ok_verify.json()["valid_integrity"] is True

    # Tamper directly with the release JSON file on disk
    release_file = isolated_release_manager.releases_dir / "pipe_tamper_check" / "1.0.0.json"
    with open(release_file, "r", encoding="utf-8") as f:
        raw_disk_data = json.load(f)
    raw_disk_data["pipeline"]["nodes"][2]["config"]["threshold"] = 42
    with open(release_file, "w", encoding="utf-8") as f:
        json.dump(raw_disk_data, f)

    # Verification must now fail and report checksum mismatch
    bad_verify = client.get("/api/releases/pipe_tamper_check/1.0.0/verify")
    assert bad_verify.status_code == 200
    bad_body = bad_verify.json()
    assert bad_body["valid_integrity"] is False
    assert bad_body["stored_checksum"] != bad_body["computed_checksum"]
    assert "mismatch" in bad_body["message"].lower()

    # Resolving active release on tampered artifact must also fail
    active_resp = client.get("/api/releases/pipe_tamper_check/active")
    assert active_resp.status_code == 422


# ------------------------------------------------------------------------------
# 14. Archiving a release marks it archived without deleting the artifact
# ------------------------------------------------------------------------------
def test_14_archiving_release_preserves_artifact_and_excludes_from_active(
    client: TestClient, isolated_release_manager: ReleaseManager
):
    pipeline = _make_valid_pipeline("pipe_archive")
    client.post("/api/releases", json={"pipeline": pipeline, "release_version": "1.0.0"})

    arch_resp = client.post("/api/releases/pipe_archive/1.0.0/archive")
    assert arch_resp.status_code == 200
    arch_data = arch_resp.json()
    assert arch_data["status"] == "Archived"
    assert arch_data["is_active"] is False
    assert arch_data["archived_at"] is not None

    # Artifact still exists on disk and can be retrieved by version
    release_file = isolated_release_manager.releases_dir / "pipe_archive" / "1.0.0.json"
    assert release_file.exists()

    # Default listing excludes archived releases
    active_list = client.get("/api/releases?pipeline_id=pipe_archive").json()
    assert active_list["total"] == 0

    # Listing with include_archived=true returns the archived artifact
    all_list = client.get("/api/releases?pipeline_id=pipe_archive&include_archived=true").json()
    assert all_list["total"] == 1
    assert all_list["releases"][0]["status"] == "Archived"


# ------------------------------------------------------------------------------
# 15. Rollback/selection of an earlier valid release works
# ------------------------------------------------------------------------------
def test_15_rollback_to_earlier_valid_release_works(client: TestClient):
    p_v1 = _make_valid_pipeline("pipe_rollback")
    client.post("/api/releases", json={"pipeline": p_v1, "release_version": "1.0.0", "activate": True})

    p_v2 = copy.deepcopy(p_v1)
    p_v2["nodes"][2]["config"]["threshold"] = 160
    client.post("/api/releases", json={"pipeline": p_v2, "release_version": "2.0.0", "activate": True})

    # Verify 2.0.0 is currently active
    active_now = client.get("/api/releases/pipe_rollback/active").json()
    assert active_now["release_version"] == "2.0.0"

    # Rollback to 1.0.0
    rb_resp = client.post(
        "/api/releases/rollback",
        json={"pipeline_id": "pipe_rollback", "target_release_version": "1.0.0"},
    )
    assert rb_resp.status_code == 200
    assert rb_resp.json()["release_version"] == "1.0.0"
    assert rb_resp.json()["is_active"] is True

    # Verify active release is now 1.0.0 and 2.0.0 is deactivated
    active_after = client.get("/api/releases/pipe_rollback/active").json()
    assert active_after["release_version"] == "1.0.0"
    v2_details = client.get("/api/releases/pipe_rollback/2.0.0").json()
    assert v2_details["is_active"] is False


# ------------------------------------------------------------------------------
# 16. Existing .mvp files still load/migrate and unsupported versions fail cleanly
# ------------------------------------------------------------------------------
def test_16_mvp_migration_and_backward_compatibility():
    # Compatible 0.9.0 .mvp payload
    legacy_mvp = {
        "schemaVersion": "0.9.0",
        "id": "legacy_mvp_01",
        "name": "Legacy 0.9 Pipeline",
        "metadata": {"line": "B2", "__transientExecutionState": "strip_me"},
        "nodes": [
            {
                "id": "n1",
                "node_type": "image_file",
                "name": "Source",
                "position": {"x": 10, "y": 20},
                "config": {"filePath": "sample_images/bottle_cap.png"},
            }
        ],
        "edges": [],
    }
    ok, migrated, migrated_from, err = migrate_mvp_pipeline(legacy_mvp)
    assert ok is True
    assert err is None
    assert migrated_from == "0.9.0"
    assert migrated is not None
    assert migrated["schemaVersion"] == "1.0.0"
    assert migrated["nodes"][0]["nodeType"] == "image_file"
    assert migrated["metadata"]["line"] == "B2"
    assert "__transientExecutionState" not in migrated["metadata"]

    # Unsupported future version 3.0.0 fails clearly
    ok_bad, _, _, err_bad = migrate_mvp_pipeline({"schemaVersion": "3.0.0", "id": "p", "nodes": [], "edges": []})
    assert ok_bad is False
    assert err_bad is not None
    assert "3.0.0" in err_bad
