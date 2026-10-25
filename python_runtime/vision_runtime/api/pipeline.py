"""Pipeline Execution and Preview API Endpoints."""

import os
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from vision_runtime.engine.executor import pipeline_executor
from vision_runtime.engine.buffer import execution_buffer
from vision_runtime.engine.validator import validate_pipeline_definition
from vision_runtime.registry import runtime_registry

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


class ExecutePipelineRequest(BaseModel):
    pipeline: Dict[str, Any]
    inputs_override: Optional[Dict[str, Any]] = None
    workspace_dir: Optional[str] = None


class ValidatePipelineRequest(BaseModel):
    pipeline: Dict[str, Any]
    check_resources: bool = False
    workspace_dir: Optional[str] = None


@router.get("/supported-nodes", summary="List supported runtime nodes")
async def list_supported_nodes() -> Dict[str, Any]:
    """Returns list of nodes with verified execution handlers in runtime."""
    return {
        "supported_nodes": runtime_registry.list_supported_nodes(),
        "total": len(runtime_registry.list_supported_nodes()),
    }


@router.post("/validate", summary="Validate pipeline DAG compilation and contracts")
async def validate_pipeline(req: ValidatePipelineRequest) -> Dict[str, Any]:
    """
    Validates DAG structure, node availability, port compatibility, config safety,
    and produces a topological execution plan.
    Preserves backward-compatible fields (`valid`, `total_nodes`, `execution_plan`,
    `unsupported_nodes`, `error`) while adding structured Phase 2 `errors` and `can_release`.
    """
    nodes = req.pipeline.get("nodes", [])
    edges = req.pipeline.get("edges", [])

    # Ensure backward compatibility if minimal test payload omits id/schemaVersion
    normalized_payload = dict(req.pipeline)
    normalized_payload.setdefault("id", "temp_validation_pipeline")
    normalized_payload.setdefault("name", "Validation Pipeline")
    normalized_payload.setdefault("schemaVersion", "1.0.0")

    val_result = validate_pipeline_definition(
        raw_pipeline=normalized_payload,
        check_resources=req.check_resources,
        workspace_dir=req.workspace_dir,
    )

    try:
        plan = pipeline_executor.compile_execution_plan(nodes, edges)
        plan_summary = [
            {"order": i + 1, "id": n["id"], "type": n.get("nodeType", ""), "name": n.get("name", "")}
            for i, n in enumerate(plan)
        ]
    except Exception as e:
        return {
            "valid": False,
            "can_release": False,
            "error": str(e),
            "errors": [err.model_dump(mode="json") for err in val_result.errors],
            "warnings": [w.model_dump(mode="json") for w in val_result.warnings],
            "execution_plan": [],
            "unsupported_nodes": val_result.unsupported_nodes,
        }

    first_error = val_result.errors[0].message if val_result.errors else None
    response: Dict[str, Any] = {
        "valid": val_result.valid,
        "can_release": val_result.can_release,
        "total_nodes": len(nodes),
        "execution_plan": plan_summary if val_result.valid else val_result.execution_plan,
        "unsupported_nodes": val_result.unsupported_nodes,
        "errors": [err.model_dump(mode="json") for err in val_result.errors],
        "warnings": [w.model_dump(mode="json") for w in val_result.warnings],
    }
    if first_error:
        response["error"] = first_error
    return response


@router.post("/execute", summary="Execute vision pipeline sequentially")
async def execute_pipeline(req: ExecutePipelineRequest) -> Dict[str, Any]:
    """
    Executes vision pipeline using OpenCV handlers.
    Returns execution status, per-node metrics, errors and preview references.
    """
    # Use workspace dir if specified or resolve from environment/cwd
    workspace = req.workspace_dir or os.getcwd()
    executor = pipeline_executor
    executor.workspace_dir = workspace

    result = executor.execute_pipeline(
        pipeline=req.pipeline,
        inputs_override=req.inputs_override,
    )

    return result


@router.get(
    "/executions/{execution_id}/nodes/{node_id}/preview",
    summary="Get node output image preview",
    responses={
        200: {
            "content": {"image/jpeg": {}},
            "description": "Output preview image bytes",
        },
        404: {"description": "Preview not found"},
    },
)
async def get_node_preview(
    execution_id: str,
    node_id: str,
    port_id: Optional[str] = Query(None, description="Specific output port ID"),
):
    """
    Returns encoded JPEG preview image for the executed node.
    Bounded memory access scoped only to the specific execution and node ID.
    """
    preview_bytes = execution_buffer.get_preview(
        execution_id=execution_id,
        node_id=node_id,
        port_id=port_id,
    )

    if preview_bytes is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No image preview available for execution '{execution_id}', node '{node_id}'.",
        )

    return Response(
        content=preview_bytes,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, max-age=60",
            "Content-Disposition": f'inline; filename="{node_id}_preview.jpg"',
        },
    )


@router.delete("/executions/{execution_id}", summary="Free execution buffer resources")
async def clear_execution(execution_id: str) -> Dict[str, Any]:
    """Explicitly releases all cached intermediate frames and previews for an execution."""
    success = execution_buffer.clear_execution(execution_id)
    return {
        "execution_id": execution_id,
        "cleared": success,
    }
