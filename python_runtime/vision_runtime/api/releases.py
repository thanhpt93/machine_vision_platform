"""Phase 2 Release Management & Pipeline Lifecycle API Endpoints."""

import os
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Query, status

from vision_runtime.models.release import (
    CreateReleaseRequest,
    MarkValidatedRequest,
    RollbackReleaseRequest,
    SaveDraftRequest,
)
from vision_runtime.services.release_manager import release_manager
from vision_runtime.services.license_service import license_service

router = APIRouter(prefix="/api/releases", tags=["releases"])


def _ensure_developer_edition_for_mutation() -> None:
    if os.environ.get("NOVA_DEPLOYMENT_MODE", "developer").strip().lower() == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pipeline draft and release creation endpoints are disabled in Production Edition.",
        )


@router.post("/drafts", summary="Save or update a working pipeline draft")
async def save_working_draft(req: SaveDraftRequest) -> Dict[str, Any]:
    """Saves a working pipeline in Draft state. Any edit returns a Validated pipeline to Draft."""
    _ensure_developer_edition_for_mutation()
    try:
        record = release_manager.save_working_draft(req.pipeline)
        return record.model_dump(mode="json")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/drafts/{pipeline_id}", summary="Get working pipeline lifecycle record")
async def get_working_draft(pipeline_id: str) -> Dict[str, Any]:
    _ensure_developer_edition_for_mutation()
    try:
        record = release_manager.get_working_pipeline(pipeline_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Working pipeline '{pipeline_id}' not found.",
        )
    return record.model_dump(mode="json")


@router.post("/validate", summary="Validate pipeline and transition Draft -> Validated")
async def mark_pipeline_validated(req: MarkValidatedRequest) -> Dict[str, Any]:
    """
    Performs strict Phase 2 pipeline validation.
    If valid, marks the working pipeline record as 'Validated' and returns its structural checksum.
    """
    _ensure_developer_edition_for_mutation()
    try:
        val_result, record = release_manager.mark_pipeline_validated(
            raw_pipeline=req.pipeline,
            check_resources=req.check_resources,
            workspace_dir=req.workspace_dir,
        )
        return {
            "validation": val_result.model_dump(mode="json"),
            "working_record": record.model_dump(mode="json") if record else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create an immutable pipeline release")
async def create_release(req: CreateReleaseRequest) -> Dict[str, Any]:
    """
    Creates an immutable ReleaseSnapshot from a validated pipeline.
    Protected operation: requires an active and valid Developer Edition license.
    Rejects unvalidated/invalid pipelines and duplicate release versions.
    """
    _ensure_developer_edition_for_mutation()
    license_service.require_valid_license("create_release")
    try:
        snapshot = release_manager.create_release(
            release_version=req.release_version,
            pipeline=req.pipeline,
            pipeline_id=req.pipeline_id,
            release_notes=req.release_notes,
            activate=req.activate,
            require_prior_validation=req.require_prior_validation,
            check_resources=req.check_resources,
            workspace_dir=req.workspace_dir,
        )
        return snapshot.model_dump(mode="json")
    except FileExistsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", summary="List pipeline releases")
async def list_releases(
    pipeline_id: Optional[str] = Query(None, description="Filter by pipeline_id"),
    include_archived: bool = Query(False, description="Include archived releases"),
) -> Dict[str, Any]:
    try:
        releases = release_manager.list_releases(
            pipeline_id=pipeline_id,
            include_archived=include_archived,
        )
        return {
            "releases": [r.model_dump(mode="json") for r in releases],
            "total": len(releases),
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{pipeline_id}/active", summary="Get currently active release for a pipeline")
async def get_active_release(pipeline_id: str) -> Dict[str, Any]:
    try:
        snap = release_manager.resolve_active_release(pipeline_id=pipeline_id)
        return snap.model_dump(mode="json")
    except (LookupError, FileNotFoundError) as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.get("/{pipeline_id}/{release_version}", summary="Get specific pipeline release details")
async def get_release_details(pipeline_id: str, release_version: str) -> Dict[str, Any]:
    try:
        snap = release_manager.get_release(pipeline_id, release_version)
        if snap is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Release '{release_version}' for pipeline '{pipeline_id}' not found.",
            )
        integrity = release_manager.verify_release_integrity(pipeline_id, release_version)
        data = snap.model_dump(mode="json")
        data["integrity"] = integrity.model_dump(mode="json")
        return data
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/{pipeline_id}/{release_version}/verify",
    summary="Verify SHA-256 checksum integrity of a release artifact",
)
async def verify_release(pipeline_id: str, release_version: str) -> Dict[str, Any]:
    try:
        report = release_manager.verify_release_integrity(pipeline_id, release_version)
        return report.model_dump(mode="json")
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/{pipeline_id}/{release_version}/archive",
    summary="Archive a release without deleting its artifact",
)
async def archive_release(pipeline_id: str, release_version: str) -> Dict[str, Any]:
    _ensure_developer_edition_for_mutation()
    try:
        snap = release_manager.archive_release(pipeline_id, release_version)
        return snap.model_dump(mode="json")
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/rollback", summary="Rollback or activate a specific verified release version")
async def rollback_release(req: RollbackReleaseRequest) -> Dict[str, Any]:
    _ensure_developer_edition_for_mutation()
    try:
        snap = release_manager.rollback_or_activate_release(
            pipeline_id=req.pipeline_id,
            target_release_version=req.target_release_version,
        )
        return snap.model_dump(mode="json")
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
