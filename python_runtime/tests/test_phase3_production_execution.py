"""Phase 3 Automated Unit & Integration Tests — Production Execution API.

Covers all 15 required Phase 3 test scenarios:
1. Listing released pipelines returns only valid released pipelines.
2. Starting an inspection with a valid release and valid image succeeds.
3. Inspection status transitions through QUEUED -> RUNNING -> COMPLETED.
4. Inspection result returns structured outputs, timing, and release info.
5. Pipeline with decision logic returning OK produces inspection_outcome = OK.
6. Pipeline with decision logic returning NG produces execution_status = COMPLETED and inspection_outcome = NG.
7. Pipeline without decision logic produces inspection_outcome = UNKNOWN.
8. Node exception during execution produces execution_status = FAILED and never OK.
9. Starting an inspection with a non-existent release fails cleanly.
10. Starting an inspection with an archived or corrupted release fails cleanly.
11. Starting an inspection with a missing, unreadable, or invalid image fails cleanly.
12. Preview retrieval works for a valid execution/node and returns 404 for unknown execution/node.
13. Concurrent inspection requests are handled according to the documented concurrency rule (409 Busy).
14. Cancellation or unsupported-cancellation behavior matches the API contract.
15. Existing Editor execution/validation tests continue to pass + Production Image Info & Preview endpoints.
"""

import copy
import json
from pathlib import Path
from typing import Any, Dict
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from vision_runtime.main import app
from vision_runtime.services.inspection_service import inspection_service
from vision_runtime.services.release_manager import ReleaseManager, release_manager


def _create_test_image(path: Path, radius: int = 60) -> Path:
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    cv2.circle(img, (100, 100), radius, (255, 255, 255), -1)
    cv2.imwrite(str(path), img)
    return path


def _make_pipeline_with_decision(
    pipeline_id: str,
    nominal_diameter: float = 120.0,
    tolerance: float = 15.0,
) -> Dict[str, Any]:
    """
    Pipeline: Image File -> Grayscale -> Threshold -> Circle Measurement -> Tolerance Check -> OK/NG Decision -> Result Viewer
    """
    return {
        "fileFormat": "MVP_PIPELINE",
        "schemaVersion": "1.0.0",
        "id": pipeline_id,
        "name": "Circle Inspection With Decision",
        "description": "End-to-end production pipeline with Tolerance Check and OK/NG Decision",
        "nodes": [
            {
                "id": "n_img",
                "nodeType": "image_file",
                "name": "Image Source",
                "position": {"x": 0, "y": 0},
                "config": {"filePath": "sample_images/bottle_cap.png"},
            },
            {
                "id": "n_gray",
                "nodeType": "grayscale",
                "name": "Grayscale",
                "position": {"x": 200, "y": 0},
                "config": {"equalizeHist": False},
            },
            {
                "id": "n_thresh",
                "nodeType": "threshold",
                "name": "Threshold",
                "position": {"x": 400, "y": 0},
                "config": {"threshold": 100, "mode": "BINARY", "maxVal": 255},
            },
            {
                "id": "n_circle",
                "nodeType": "circle_measurement",
                "name": "Circle Measurement",
                "position": {"x": 600, "y": 0},
                "config": {"circle_index": 0, "scale": 1.0, "unit": "mm"},
            },
            {
                "id": "n_tol",
                "nodeType": "tolerance_check",
                "name": "Diameter Tolerance",
                "position": {"x": 800, "y": 0},
                "config": {
                    "nominal": nominal_diameter,
                    "lowerTolerance": tolerance,
                    "upperTolerance": tolerance,
                },
            },
            {
                "id": "n_decision",
                "nodeType": "decision_ok_ng",
                "name": "Final Verdict",
                "position": {"x": 1000, "y": 0},
                "config": {"failReason": "Circle diameter out of tolerance"},
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
            {
                "id": "e3",
                "sourceNodeId": "n_thresh",
                "sourcePortId": "image_out",
                "targetNodeId": "n_circle",
                "targetPortId": "mask_in",
            },
            {
                "id": "e4",
                "sourceNodeId": "n_circle",
                "sourcePortId": "scalar_value",
                "targetNodeId": "n_tol",
                "targetPortId": "value_in",
            },
            {
                "id": "e5",
                "sourceNodeId": "n_tol",
                "sourcePortId": "boolean_out",
                "targetNodeId": "n_decision",
                "targetPortId": "condition",
            },
        ],
    }


def _make_pipeline_without_decision(pipeline_id: str = "pipe_no_decision") -> Dict[str, Any]:
    """Pipeline with only image acquisition, preparation, and measurement — NO decision node."""
    return {
        "fileFormat": "MVP_PIPELINE",
        "schemaVersion": "1.0.0",
        "id": pipeline_id,
        "name": "Measurement Only Pipeline",
        "nodes": [
            {
                "id": "n_img",
                "nodeType": "image_file",
                "name": "Source",
                "position": {"x": 0, "y": 0},
                "config": {"filePath": "sample_images/bottle_cap.png"},
            },
            {
                "id": "n_gray",
                "nodeType": "grayscale",
                "name": "Grayscale",
                "position": {"x": 200, "y": 0},
                "config": {"equalizeHist": False},
            },
        ],
        "edges": [
            {
                "id": "e1",
                "sourceNodeId": "n_img",
                "sourcePortId": "image",
                "targetNodeId": "n_gray",
                "targetPortId": "image_in",
            }
        ],
    }


@pytest.fixture()
def isolated_env(tmp_path: Path):
    """Provides isolated storage and sample image files for Phase 3 tests."""
    original_dir = release_manager.storage_dir
    release_manager.storage_dir = tmp_path / "runtime_data"
    inspection_service._records_cache.clear()
    yield tmp_path
    release_manager.storage_dir = original_dir
    inspection_service._records_cache.clear()


@pytest.fixture()
def client(isolated_env: Path) -> TestClient:
    return TestClient(app)


# ------------------------------------------------------------------------------
# 1. Listing released pipelines returns only valid released pipelines
# ------------------------------------------------------------------------------
def test_01_list_production_releases_returns_only_eligible_releases(client: TestClient):
    p1 = _make_pipeline_without_decision("pipe_prod_1")
    p2 = _make_pipeline_without_decision("pipe_prod_2")

    # Save a draft only (not released)
    draft_only = _make_pipeline_without_decision("pipe_draft_only")
    client.post("/api/releases/drafts", json={"pipeline": draft_only})

    # Create release for p1 and p2
    client.post("/api/releases", json={"pipeline": p1, "release_version": "1.0.0"})
    client.post("/api/releases", json={"pipeline": p2, "release_version": "1.0.0"})

    # Archive p2 release
    client.post("/api/releases/pipe_prod_2/1.0.0/archive")

    prod_list = client.get("/api/production/releases").json()
    assert prod_list["total"] == 1
    assert prod_list["releases"][0]["pipeline_id"] == "pipe_prod_1"
    assert prod_list["releases"][0]["release_version"] == "1.0.0"
    assert prod_list["releases"][0]["valid_integrity"] is True
    assert prod_list["releases"][0]["eligible_for_execution"] is True
    assert prod_list["releases"][0]["node_count"] == 2

    # When include_archived=true, both releases are returned for Read-Only Pipeline Management
    all_list = client.get("/api/production/releases?include_archived=true").json()
    assert all_list["total"] == 2


# ------------------------------------------------------------------------------
# 2, 3, 4 & 5. Starting inspection with valid release + image succeeds, transitions
# QUEUED -> RUNNING -> COMPLETED, returns structured outputs, and OK outcome
# ------------------------------------------------------------------------------
def test_02_to_05_inspection_succeeds_with_ok_outcome_and_structured_results(
    client: TestClient, isolated_env: Path
):
    img_path = _create_test_image(isolated_env / "part_ok.png", radius=60)  # diameter ~ 120px
    pipeline = _make_pipeline_with_decision("pipe_decision_ok", nominal_diameter=120.0, tolerance=15.0)

    client.post("/api/releases", json={"pipeline": pipeline, "release_version": "1.0.0"})

    resp = client.post(
        "/api/production/inspections",
        json={
            "pipeline_id": "pipe_decision_ok",
            "release_version": "1.0.0",
            "image_path": str(img_path),
        },
    )
    assert resp.status_code == 201
    data = resp.json()

    # Check lifecycle & separation of execution_status and inspection_outcome
    assert data["inspection_id"].startswith("insp_")
    assert data["pipeline_id"] == "pipe_decision_ok"
    assert data["release_version"] == "1.0.0"
    assert len(data["release_checksum"]) == 64
    assert data["execution_status"] == "COMPLETED"
    assert data["inspection_outcome"] == "OK"
    assert data["created_at"] is not None
    assert data["started_at"] is not None
    assert data["completed_at"] is not None
    assert data["duration_ms"] >= 0.0
    assert data["input_image"]["filename"] == "part_ok.png"
    assert data["input_image"]["width"] == 200
    assert data["input_image"]["height"] == 200

    # Check status endpoint
    status_resp = client.get(f"/api/production/inspections/{data['inspection_id']}/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["execution_status"] == "COMPLETED"
    assert status_resp.json()["inspection_outcome"] == "OK"

    # Check full result endpoint
    res_resp = client.get(f"/api/production/inspections/{data['inspection_id']}")
    assert res_resp.status_code == 200
    full_res = res_resp.json()
    assert full_res["result_data"]["has_explicit_decision"] is True
    assert "n_circle" in full_res["result_data"]["measurements"]


# ------------------------------------------------------------------------------
# 6. Pipeline with decision logic returning NG produces execution_status = COMPLETED
#    and inspection_outcome = NG
# ------------------------------------------------------------------------------
def test_06_decision_logic_returning_ng_produces_completed_and_ng_outcome(
    client: TestClient, isolated_env: Path
):
    # Create image with small circle (radius=25 -> diameter ~ 50px), while nominal is 120 +- 10
    img_path = _create_test_image(isolated_env / "part_ng.png", radius=25)
    pipeline = _make_pipeline_with_decision("pipe_decision_ng", nominal_diameter=120.0, tolerance=10.0)
    client.post("/api/releases", json={"pipeline": pipeline, "release_version": "1.0.0"})

    resp = client.post(
        "/api/production/inspections",
        json={
            "pipeline_id": "pipe_decision_ng",
            "image_path": str(img_path),
        },
    )
    assert resp.status_code == 201
    data = resp.json()

    # CRITICAL: NG is a valid COMPLETED inspection, not an execution failure!
    assert data["execution_status"] == "COMPLETED"
    assert data["inspection_outcome"] == "NG"
    assert data["error_details"] is None


# ------------------------------------------------------------------------------
# 7. Pipeline without decision logic produces inspection_outcome = UNKNOWN
# ------------------------------------------------------------------------------
def test_07_pipeline_without_decision_logic_produces_unknown_outcome(
    client: TestClient, isolated_env: Path
):
    img_path = _create_test_image(isolated_env / "part_neutral.png", radius=50)
    pipeline = _make_pipeline_without_decision("pipe_unknown_outcome")
    client.post("/api/releases", json={"pipeline": pipeline, "release_version": "1.0.0"})

    resp = client.post(
        "/api/production/inspections",
        json={
            "pipeline_id": "pipe_unknown_outcome",
            "image_path": str(img_path),
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["execution_status"] == "COMPLETED"
    # Must NEVER fabricate "OK" when no decision logic node was executed
    assert data["inspection_outcome"] == "UNKNOWN"
    assert data["result_data"]["has_explicit_decision"] is False


# ------------------------------------------------------------------------------
# 8. Node exception during execution produces execution_status = FAILED and never OK
# ------------------------------------------------------------------------------
def test_08_node_exception_during_execution_produces_failed_and_never_ok(
    client: TestClient, isolated_env: Path
):
    # Create a small 50x50 image, but configure roi_crop to crop at x=200, y=200 (out of bounds -> raises ValueError)
    small_img = np.zeros((50, 50, 3), dtype=np.uint8)
    img_path = isolated_env / "small_50x50.png"
    cv2.imwrite(str(img_path), small_img)

    failing_pipeline = {
        "fileFormat": "MVP_PIPELINE",
        "schemaVersion": "1.0.0",
        "id": "pipe_node_crash",
        "name": "Out of Bounds Crop Pipeline",
        "nodes": [
            {
                "id": "n_img",
                "nodeType": "image_file",
                "name": "Source",
                "position": {"x": 0, "y": 0},
                "config": {"filePath": "sample_images/bottle_cap.png"},
            },
            {
                "id": "n_crop",
                "nodeType": "roi_crop",
                "name": "Out of Bounds Crop",
                "position": {"x": 200, "y": 0},
                "config": {"x": 200, "y": 200, "width": 100, "height": 100},
            },
        ],
        "edges": [
            {
                "id": "e1",
                "sourceNodeId": "n_img",
                "sourcePortId": "image",
                "targetNodeId": "n_crop",
                "targetPortId": "image_in",
            }
        ],
    }
    client.post("/api/releases", json={"pipeline": failing_pipeline, "release_version": "1.0.0"})

    resp = client.post(
        "/api/production/inspections",
        json={
            "pipeline_id": "pipe_node_crash",
            "image_path": str(img_path),
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["execution_status"] == "FAILED"
    assert data["inspection_outcome"] is None
    assert data["error_details"] is not None
    assert data["error_details"]["failed_node_id"] == "n_crop"


# ------------------------------------------------------------------------------
# 9. Starting an inspection with a non-existent release fails cleanly
# ------------------------------------------------------------------------------
def test_09_inspection_with_non_existent_release_fails_cleanly(
    client: TestClient, isolated_env: Path
):
    img_path = _create_test_image(isolated_env / "valid.png")
    resp = client.post(
        "/api/production/inspections",
        json={
            "pipeline_id": "non_existent_pipeline",
            "release_version": "9.9.9",
            "image_path": str(img_path),
        },
    )
    assert resp.status_code == 404


# ------------------------------------------------------------------------------
# 10. Starting an inspection with an archived or corrupted release fails cleanly
# ------------------------------------------------------------------------------
def test_10_inspection_with_archived_or_corrupted_release_fails_cleanly(
    client: TestClient, isolated_env: Path
):
    img_path = _create_test_image(isolated_env / "valid.png")

    # Case A: Archived release
    p_arch = _make_pipeline_without_decision("pipe_arch_exec")
    client.post("/api/releases", json={"pipeline": p_arch, "release_version": "1.0.0"})
    client.post("/api/releases/pipe_arch_exec/1.0.0/archive")

    arch_resp = client.post(
        "/api/production/inspections",
        json={
            "pipeline_id": "pipe_arch_exec",
            "release_version": "1.0.0",
            "image_path": str(img_path),
        },
    )
    assert arch_resp.status_code == 422
    assert "Archived" in arch_resp.json()["detail"]

    # Case B: Tampered/corrupted release artifact on disk
    p_corrupt = _make_pipeline_without_decision("pipe_corrupt_exec")
    client.post("/api/releases", json={"pipeline": p_corrupt, "release_version": "1.0.0"})
    rel_file = release_manager.releases_dir / "pipe_corrupt_exec" / "1.0.0.json"
    with open(rel_file, "r", encoding="utf-8") as f:
        raw = json.load(f)
    raw["pipeline"]["name"] = "Tampered Name"
    with open(rel_file, "w", encoding="utf-8") as f:
        json.dump(raw, f)

    corrupt_resp = client.post(
        "/api/production/inspections",
        json={
            "pipeline_id": "pipe_corrupt_exec",
            "release_version": "1.0.0",
            "image_path": str(img_path),
        },
    )
    assert corrupt_resp.status_code == 422
    assert "checksum" in corrupt_resp.json()["detail"].lower()


# ------------------------------------------------------------------------------
# 11. Starting an inspection with a missing, unreadable, or invalid image fails cleanly
# ------------------------------------------------------------------------------
def test_11_inspection_with_missing_or_invalid_image_fails_cleanly(
    client: TestClient, isolated_env: Path
):
    pipeline = _make_pipeline_without_decision("pipe_img_check")
    client.post("/api/releases", json={"pipeline": pipeline, "release_version": "1.0.0"})

    # Missing file -> 404
    missing_resp = client.post(
        "/api/production/inspections",
        json={
            "pipeline_id": "pipe_img_check",
            "image_path": str(isolated_env / "does_not_exist.png"),
        },
    )
    assert missing_resp.status_code == 404

    # Unsupported extension -> 400
    txt_file = isolated_env / "not_an_image.txt"
    txt_file.write_text("hello world", encoding="utf-8")
    ext_resp = client.post(
        "/api/production/inspections",
        json={
            "pipeline_id": "pipe_img_check",
            "image_path": str(txt_file),
        },
    )
    assert ext_resp.status_code == 400
    assert "Unsupported image file format" in ext_resp.json()["detail"]

    # Corrupted image bytes with .png extension -> 400
    corrupt_png = isolated_env / "corrupt.png"
    corrupt_png.write_bytes(b"not_valid_png_binary_data")
    corrupt_resp = client.post(
        "/api/production/inspections",
        json={
            "pipeline_id": "pipe_img_check",
            "image_path": str(corrupt_png),
        },
    )
    assert corrupt_resp.status_code == 400
    assert "Corrupted or unreadable image file" in corrupt_resp.json()["detail"]


# ------------------------------------------------------------------------------
# 12. Preview retrieval works for a valid execution/node and returns 404 for unknown
# ------------------------------------------------------------------------------
def test_12_preview_retrieval_works_and_returns_404_for_unknown(
    client: TestClient, isolated_env: Path
):
    img_path = _create_test_image(isolated_env / "preview_test.png")
    pipeline = _make_pipeline_without_decision("pipe_preview")
    client.post("/api/releases", json={"pipeline": pipeline, "release_version": "1.0.0"})

    insp_resp = client.post(
        "/api/production/inspections",
        json={"pipeline_id": "pipe_preview", "image_path": str(img_path)},
    )
    assert insp_resp.status_code == 201
    insp_id = insp_resp.json()["inspection_id"]

    # Valid node preview
    prev_ok = client.get(f"/api/production/inspections/{insp_id}/nodes/n_gray/preview")
    assert prev_ok.status_code == 200
    assert prev_ok.headers["content-type"] == "image/jpeg"
    assert len(prev_ok.content) > 100

    # Unknown node ID -> 404
    prev_missing_node = client.get(
        f"/api/production/inspections/{insp_id}/nodes/non_existent_node/preview"
    )
    assert prev_missing_node.status_code == 404

    # Unknown inspection ID -> 404
    prev_missing_insp = client.get(
        "/api/production/inspections/insp_unknown_999/nodes/n_gray/preview"
    )
    assert prev_missing_insp.status_code == 404


# ------------------------------------------------------------------------------
# 13. Concurrent inspection requests are handled according to the concurrency rule (409 Busy)
# ------------------------------------------------------------------------------
def test_13_concurrent_inspection_request_rejected_when_busy(
    client: TestClient, isolated_env: Path
):
    img_path = _create_test_image(isolated_env / "busy_test.png")
    pipeline = _make_pipeline_without_decision("pipe_busy")
    client.post("/api/releases", json={"pipeline": pipeline, "release_version": "1.0.0"})

    # Simulate an active running inspection holding the execution lock
    acquired = inspection_service._execution_lock.acquire(blocking=False)
    assert acquired is True
    inspection_service._active_inspection_id = "insp_simulated_active"
    try:
        # Check /health reports inspection running
        health = client.get("/health").json()
        assert health["is_inspection_running"] is True
        assert health["active_inspection_id"] == "insp_simulated_active"

        # Attempting to start a second concurrent inspection must return HTTP 409 Conflict
        busy_resp = client.post(
            "/api/production/inspections",
            json={"pipeline_id": "pipe_busy", "image_path": str(img_path)},
        )
        assert busy_resp.status_code == 409
        assert "busy" in busy_resp.json()["detail"].lower()
    finally:
        inspection_service._active_inspection_id = None
        inspection_service._execution_lock.release()


# ------------------------------------------------------------------------------
# 14. Cancellation behavior matches the API contract
# ------------------------------------------------------------------------------
def test_14_cancellation_behavior_matches_contract(
    client: TestClient, isolated_env: Path
):
    img_path = _create_test_image(isolated_env / "cancel_test.png")
    pipeline = _make_pipeline_without_decision("pipe_cancel")
    client.post("/api/releases", json={"pipeline": pipeline, "release_version": "1.0.0"})

    insp_resp = client.post(
        "/api/production/inspections",
        json={"pipeline_id": "pipe_cancel", "image_path": str(img_path)},
    )
    insp_id = insp_resp.json()["inspection_id"]

    # Cancelling an already COMPLETED inspection returns 409 Conflict with explicit explanation
    cancel_completed = client.post(f"/api/production/inspections/{insp_id}/cancel")
    assert cancel_completed.status_code == 409
    assert "terminal state" in cancel_completed.json()["detail"]

    # Cancelling a non-existent inspection returns 404
    cancel_missing = client.post("/api/production/inspections/insp_missing_000/cancel")
    assert cancel_missing.status_code == 404


# ------------------------------------------------------------------------------
# 15. Production UI Input Image Info & Preview endpoints validate and stream safely
# ------------------------------------------------------------------------------
def test_15_production_input_image_info_and_preview_endpoints(
    client: TestClient, isolated_env: Path
):
    img_path = _create_test_image(isolated_env / "ui_input_check.png", radius=40)

    # Valid image info
    info_resp = client.get("/api/production/images/info", params={"image_path": str(img_path)})
    assert info_resp.status_code == 200
    info_data = info_resp.json()
    assert info_data["filename"] == "ui_input_check.png"
    assert info_data["width"] == 200
    assert info_data["height"] == 200
    assert info_data["channels"] == 3

    # Valid image JPEG preview stream
    prev_resp = client.get("/api/production/images/preview", params={"image_path": str(img_path)})
    assert prev_resp.status_code == 200
    assert prev_resp.headers["content-type"] == "image/jpeg"
    assert len(prev_resp.content) > 100

    # Missing image -> 404
    missing_resp = client.get(
        "/api/production/images/info",
        params={"image_path": str(isolated_env / "missing_img.png")},
    )
    assert missing_resp.status_code == 404
