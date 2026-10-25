"""Phase 3 Production Execution API Endpoints.

Provides HTTP endpoints for:
1. Listing released pipelines eligible for Production execution (including archived for read-only pipeline management)
2. Getting release details and integrity status
3. Validating and previewing a selected local input image file before execution
4. Starting an inspection (against an immutable verified release and validated input image)
5. Getting inspection status
6. Getting full inspection result
7. Getting node image preview scoped to inspection_id and node_id
8. Cancelling an inspection
"""

from typing import Any, Dict, Optional
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, Query, Response, status

from vision_runtime.models.inspection import StartInspectionRequest
from vision_runtime.services.inspection_service import (
    InspectionBusyError,
    InvalidInspectionInputError,
    inspection_service,
    validate_and_inspect_image_file,
)
from vision_runtime.services.release_manager import release_manager

router = APIRouter(prefix="/api/production", tags=["production"])


@router.get("/releases", summary="List released pipelines eligible for Production execution")
async def list_production_releases(
    pipeline_id: Optional[str] = Query(None, description="Optional pipeline_id filter"),
    include_archived: bool = Query(False, description="Include archived releases for read-only audit"),
) -> Dict[str, Any]:
    """
    Returns pipeline releases with their checksum integrity, node count, and input requirements.
    By default returns only eligible ('Released', non-archived) releases.
    """
    try:
        releases = release_manager.list_releases(
            pipeline_id=pipeline_id,
            include_archived=include_archived,
        )
        items = []
        for rel in releases:
            integrity = release_manager.verify_release_integrity(
                rel.pipeline_id, rel.release_version
            )
            nodes = rel.pipeline.get("nodes", [])
            edges = rel.pipeline.get("edges", [])
            has_image_input = any(n.get("nodeType") == "image_file" for n in nodes)
            eligible = (
                rel.status.value == "Released"
                and integrity.valid_integrity
            )
            items.append(
                {
                    "pipeline_id": rel.pipeline_id,
                    "pipeline_name": rel.pipeline.get("name", rel.pipeline_id),
                    "description": rel.pipeline.get("description", ""),
                    "release_version": rel.release_version,
                    "schema_version": rel.schema_version,
                    "status": rel.status.value,
                    "is_active": rel.is_active,
                    "eligible_for_execution": eligible,
                    "created_at": rel.created_at,
                    "archived_at": rel.archived_at,
                    "release_notes": rel.release_notes,
                    "checksum": rel.checksum,
                    "valid_integrity": integrity.valid_integrity,
                    "integrity_message": integrity.message,
                    "node_count": len(nodes),
                    "edge_count": len(edges),
                    "node_versions": rel.node_versions,
                    "input_requirements": {
                        "requires_image_file": has_image_input,
                        "supported_formats": [".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"],
                    },
                }
            )
        return {
            "releases": items,
            "total": len(items),
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/releases/{pipeline_id}/{release_version}",
    summary="Get production release details and integrity status",
)
async def get_production_release_details(
    pipeline_id: str,
    release_version: str,
) -> Dict[str, Any]:
    try:
        snap = release_manager.get_release(pipeline_id, release_version)
        if snap is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Release '{release_version}' for pipeline '{pipeline_id}' not found.",
            )
        integrity = release_manager.verify_release_integrity(pipeline_id, release_version)
        result = snap.model_dump(mode="json")
        result["integrity"] = integrity.model_dump(mode="json")
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/images/info",
    summary="Validate a local input image path and return its dimensions & metadata",
)
async def get_input_image_info(
    image_path: str = Query(..., min_length=1, description="Local path to input image file"),
    workspace_dir: Optional[str] = Query(None),
) -> Dict[str, Any]:
    try:
        meta = validate_and_inspect_image_file(image_path=image_path, workspace_dir=workspace_dir)
        return meta.model_dump(mode="json")
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InvalidInspectionInputError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/images/preview",
    summary="Render JPEG preview of a validated local input image file",
    responses={
        200: {
            "content": {"image/jpeg": {}},
            "description": "Encoded JPEG preview of the selected input image",
        },
        400: {"description": "Invalid or unsupported image file"},
        404: {"description": "Image file not found"},
    },
)
async def get_input_image_preview(
    image_path: str = Query(..., min_length=1, description="Local path to input image file"),
    workspace_dir: Optional[str] = Query(None),
):
    try:
        meta = validate_and_inspect_image_file(image_path=image_path, workspace_dir=workspace_dir)
        file_bytes = np.fromfile(meta.resolved_path, dtype=np.uint8)
        decoded = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        if decoded is None:
            raise InvalidInspectionInputError(f"Failed to decode image '{meta.filename}'.")
        ok, encoded = cv2.imencode(".jpg", decoded, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if not ok:
            raise InvalidInspectionInputError(f"Failed to encode JPEG preview for '{meta.filename}'.")
        return Response(
            content=encoded.tobytes(),
            media_type="image/jpeg",
            headers={
                "Cache-Control": "private, max-age=30",
                "X-Image-Width": str(meta.width),
                "X-Image-Height": str(meta.height),
                "X-Image-Channels": str(meta.channels),
                "X-Image-Filename": meta.filename,
            },
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InvalidInspectionInputError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/inspections",
    status_code=status.HTTP_201_CREATED,
    summary="Start a production inspection using a verified release",
)
async def start_production_inspection(req: StartInspectionRequest) -> Dict[str, Any]:
    """
    Starts a production inspection:
    - Verifies the selected/active release exists, is not Archived, and passes SHA-256 checksum verification
    - Validates the input image path, existence, format, size, and pixel dimensions
    - Enforces bounded single-active-inspection concurrency
    - Executes using the existing DAG pipeline_executor and records execution_status + inspection_outcome
    """
    try:
        record = inspection_service.start_inspection(
            pipeline_id=req.pipeline_id,
            image_path=req.image_path,
            release_version=req.release_version,
            workspace_dir=req.workspace_dir,
        )
        return record.model_dump(mode="json")
    except InspectionBusyError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InvalidInspectionInputError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e))


@router.get("/inspections", summary="List recent production inspections")
async def list_inspections(
    limit: int = Query(50, ge=1, le=500),
) -> Dict[str, Any]:
    records = inspection_service.list_inspections(limit=limit)
    return {
        "inspections": [r.model_dump(mode="json") for r in records],
        "total": len(records),
    }


@router.get(
    "/inspections/{inspection_id}/status",
    summary="Get current status of a production inspection",
)
async def get_inspection_status(inspection_id: str) -> Dict[str, Any]:
    record = inspection_service.get_inspection(inspection_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inspection '{inspection_id}' not found.",
        )
    return {
        "inspection_id": record.inspection_id,
        "pipeline_id": record.pipeline_id,
        "release_version": record.release_version,
        "execution_status": record.execution_status.value,
        "inspection_outcome": record.inspection_outcome.value if record.inspection_outcome else None,
        "created_at": record.created_at,
        "started_at": record.started_at,
        "completed_at": record.completed_at,
        "duration_ms": record.duration_ms,
        "error_details": record.error_details.model_dump(mode="json") if record.error_details else None,
    }


@router.get(
    "/inspections/{inspection_id}",
    summary="Get full production inspection result",
)
async def get_inspection_result(inspection_id: str) -> Dict[str, Any]:
    record = inspection_service.get_inspection(inspection_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inspection '{inspection_id}' not found.",
        )
    return record.model_dump(mode="json")


@router.get(
    "/inspections/{inspection_id}/nodes/{node_id}/preview",
    summary="Get image preview for a specific inspection and node",
    responses={
        200: {
            "content": {"image/jpeg": {}},
            "description": "Encoded JPEG preview image bytes",
        },
        404: {"description": "Preview not found"},
    },
)
async def get_inspection_node_preview(
    inspection_id: str,
    node_id: str,
    port_id: Optional[str] = Query(None, description="Optional specific output port ID"),
):
    preview_bytes = inspection_service.get_inspection_node_preview(
        inspection_id=inspection_id,
        node_id=node_id,
        port_id=port_id,
    )
    if preview_bytes is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No image preview available for inspection '{inspection_id}', node '{node_id}'.",
        )
    return Response(
        content=preview_bytes,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, max-age=60",
            "Content-Disposition": f'inline; filename="{inspection_id}_{node_id}_preview.jpg"',
        },
    )


@router.post(
    "/inspections/{inspection_id}/cancel",
    summary="Cancel a queued or running inspection",
)
async def cancel_inspection(inspection_id: str) -> Dict[str, Any]:
    try:
        record = inspection_service.cancel_inspection(inspection_id)
        return record.model_dump(mode="json")
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
