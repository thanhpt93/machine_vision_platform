"""FastAPI router for AI Model Registry and Management."""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from vision_runtime.schemas.ai_model import (
    HardwareInfo,
    ImportModelRequest,
    ModelCatalogItem,
    ModelValidationResponse,
)
from vision_runtime.services.model_manager import model_manager
from vision_runtime.services.model_registry_service import model_registry_service

router = APIRouter(prefix="/api/models", tags=["AI Models"])


@router.get("/hardware/info", response_model=HardwareInfo, summary="Get hardware execution provider info")
def get_hardware_info():
    return model_manager.get_hardware_info()


@router.get("", response_model=List[ModelCatalogItem], summary="List registered AI models")
def list_models(task_type: Optional[str] = Query(None, description="Filter by task type")):
    return model_registry_service.list_models(task_type=task_type)


@router.post("/import", response_model=ModelCatalogItem, status_code=status.HTTP_201_CREATED, summary="Import AI model package")
def import_model(request: ImportModelRequest):
    try:
        imported = model_registry_service.import_model_package(
            source_path=request.source_path,
            custom_name=request.custom_name,
        )
        return imported
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Unexpected error importing model: {e}")


@router.get("/{model_id}", response_model=ModelCatalogItem, summary="Get details for a registered AI model")
def get_model(model_id: str):
    model = model_registry_service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Model '{model_id}' not found.")
    return model


@router.post("/{model_id}/validate", response_model=ModelValidationResponse, summary="Validate registered model integrity and session")
def validate_model(model_id: str):
    return model_registry_service.validate_registered_model(model_id)


@router.delete("/{model_id}", summary="Delete an AI model from registry")
def delete_model(
    model_id: str,
    force: bool = Query(False, description="Force delete even if referenced by pipelines"),
    workspace_dir: str = Query("", description="Workspace directory to check pipeline references"),
):
    try:
        success = model_registry_service.delete_model(
            model_id=model_id,
            force=force,
            workspace_dir=workspace_dir,
        )
        return {"success": success, "message": f"Model '{model_id}' deleted successfully."}
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/{model_id}/unload", summary="Unload active session from memory cache")
def unload_model(model_id: str):
    unloaded_count = model_manager.unload_model(model_id)
    return {"model_id": model_id, "unloaded_sessions": unloaded_count}
