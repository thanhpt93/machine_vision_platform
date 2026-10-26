"""FastAPI Router for NOVA Machine Vision Platform License Management.

Endpoints:
- GET  /api/license/status
- POST /api/license/import
- POST /api/license/validate
- GET  /api/license/details
"""

from fastapi import APIRouter, HTTPException, status

from vision_runtime.models.license import (
    LicenseDetailsResponse,
    LicenseImportRequest,
    LicenseImportResponse,
    LicenseStatusResponse,
    LicenseValidateRequest,
    LicenseValidateResponse,
)
from vision_runtime.services.license_service import license_service

router = APIRouter(prefix="/api/license", tags=["License"])


@router.get("/status", response_model=LicenseStatusResponse, summary="Get active license status")
async def get_license_status() -> LicenseStatusResponse:
    """Returns the current sanitized license status for the running application edition.

    Does not leak private keys or sensitive filesystem paths.
    """
    return license_service.get_status()


@router.post("/import", response_model=LicenseImportResponse, summary="Import and activate license artifact")
async def import_license(req: LicenseImportRequest) -> LicenseImportResponse:
    """Cryptographically verifies, activates, and persists a license artifact.

    If verification or compatibility checks fail, the previous valid license is preserved intact.
    """
    success, status_resp = license_service.import_and_activate(
        artifact=req.artifact,
        artifact_text=req.artifact_text,
    )
    if not success:
        # Return HTTP 400 for bad signatures, wrong product, unsupported licenses, etc.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": status_resp.error_code or "LICENSE_IMPORT_FAILED",
                "status": status_resp.status.value,
                "message": status_resp.message,
                "running_edition": status_resp.running_edition,
            },
        )

    return LicenseImportResponse(
        success=True,
        status=status_resp.status,
        license_number=status_resp.license_number,
        message=status_resp.message,
        details=status_resp,
    )


@router.post("/validate", response_model=LicenseValidateResponse, summary="Validate license artifact without activating")
async def validate_license(req: LicenseValidateRequest) -> LicenseValidateResponse:
    """Pre-validates a license artifact envelope without persisting it."""
    return license_service.validate_artifact(
        artifact=req.artifact,
        artifact_text=req.artifact_text,
    )


@router.get("/details", response_model=LicenseDetailsResponse, summary="Get active license details")
async def get_license_details() -> LicenseDetailsResponse:
    """Returns comprehensive details for the currently active license, including feature list and limits."""
    return license_service.get_details()
