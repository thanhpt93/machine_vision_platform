"""Server-side Pipeline Validator for Vision Runtime (Phase 2).

Validates:
1. .mvp schema version compatibility ("1.0.0", migrating "0.1.0"/"0.9.0"/"1.0" safely)
2. Valid pipeline structure (id, name, nodes, edges)
3. Node ID uniqueness and non-empty IDs
4. All nodes exist in RuntimeNodeRegistry and have supported runtime handlers
5. Required inputs connected
6. Compatible input/output port data types
7. Valid node configuration values (rejects dangerous executable expressions & path traversal)
8. Optional external file reference checks
9. Acyclic execution graph (DAG verification via Kahn's algorithm)
"""

from collections import deque
import os
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

from vision_runtime.registry import runtime_registry


class ValidationIssue(BaseModel):
    severity: str = Field(..., pattern="^(error|warning)$")
    code: str
    node_id: Optional[str] = None
    edge_id: Optional[str] = None
    port_id: Optional[str] = None
    field: Optional[str] = None
    message: str


class PipelineValidationResult(BaseModel):
    valid: bool
    can_release: bool
    schema_version: str = "1.0.0"
    migrated_from_version: Optional[str] = None
    total_nodes: int = 0
    errors: List[ValidationIssue] = Field(default_factory=list)
    warnings: List[ValidationIssue] = Field(default_factory=list)
    execution_plan: List[Dict[str, Any]] = Field(default_factory=list)
    unsupported_nodes: List[str] = Field(default_factory=list)


_DANGEROUS_CONFIG_PATTERNS = [
    re.compile(r"__import__\s*\(", re.IGNORECASE),
    re.compile(r"\beval\s*\(", re.IGNORECASE),
    re.compile(r"\bexec\s*\(", re.IGNORECASE),
    re.compile(r"\bos\.system\s*\(", re.IGNORECASE),
    re.compile(r"\bsubprocess\.", re.IGNORECASE),
    re.compile(r"<script\b", re.IGNORECASE),
]

_MIGRATABLE_SCHEMA_VERSIONS = {"0.1.0", "0.9.0", "1.0", "1.0.0"}


def are_port_types_compatible(source_type: str, target_type: str) -> bool:
    """Checks compatibility between output port and input port data types (matches TypeScript contract)."""
    if source_type == target_type:
        return True

    image_group = {"IMAGE", "ImageFrame", "VisualizationResult"}
    mask_group = {"MaskFrame", "BINARY_IMAGE"}
    number_group = {"NUMBER", "Scalar", "NUMERIC"}
    boolean_group = {"BOOLEAN", "Boolean"}
    string_group = {"STRING", "String", "FileReference"}
    contour_group = {"CONTOURS", "ContourSet"}
    detection_group = {"DETECTIONS", "DetectionResult", "FeatureSet"}
    classification_group = {"CLASSIFICATION", "ClassificationResult"}

    if source_type in image_group and target_type in image_group:
        return True
    if source_type in mask_group and (target_type in image_group or target_type in mask_group):
        return True
    if source_type in number_group and target_type in number_group:
        return True
    if source_type in boolean_group and target_type in boolean_group:
        return True
    if source_type in string_group and target_type in string_group:
        return True
    if source_type in contour_group and target_type in contour_group:
        return True
    if source_type in detection_group and target_type in detection_group:
        return True
    if source_type in {"ContourSet", "FeatureSet"} and target_type in {"DetectionResult", "FeatureSet"}:
        return True
    if source_type in classification_group and target_type in classification_group:
        return True
    if target_type == "JSON" and source_type in {
        "MeasurementResult",
        "InspectionResult",
        "OCRResult",
        "DetectionResult",
        "ClassificationResult",
        "ContourSet",
        "FeatureSet",
    }:
        return True
    # MeasurementResult can also feed into Tolerance/Compare/Draw nodes that accept Scalar or MeasurementResult
    if source_type == "MeasurementResult" and target_type in {"MeasurementResult", "Scalar"}:
        return True

    return False


def migrate_mvp_pipeline(raw_pipeline: Dict[str, Any]) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str], Optional[str]]:
    """
    Validates and migrates an .mvp pipeline dictionary to schemaVersion "1.0.0".
    Returns (success, migrated_pipeline, migrated_from_version, error_message).
    """
    if not isinstance(raw_pipeline, dict):
        return False, None, None, "Pipeline payload must be a JSON object."

    raw_version = raw_pipeline.get("schemaVersion") or raw_pipeline.get("schema_version") or "1.0.0"
    if not isinstance(raw_version, str):
        return False, None, None, "Invalid schemaVersion type: expected string."

    if raw_version not in _MIGRATABLE_SCHEMA_VERSIONS:
        return (
            False,
            None,
            None,
            f"Unsupported .mvp schemaVersion '{raw_version}'. Supported version is '1.0.0'.",
        )

    migrated_from = raw_version if raw_version != "1.0.0" else None

    raw_nodes = raw_pipeline.get("nodes")
    raw_edges = raw_pipeline.get("edges")
    if not isinstance(raw_nodes, list) or not isinstance(raw_edges, list):
        return False, None, None, "Pipeline must contain 'nodes' (array) and 'edges' (array)."

    metadata = dict(raw_pipeline.get("metadata") or {}) if isinstance(raw_pipeline.get("metadata"), dict) else {}
    metadata.pop("__transientExecutionState", None)
    metadata.pop("__nodeExecutionStates", None)

    normalized_nodes: List[Dict[str, Any]] = []
    for n in raw_nodes:
        if not isinstance(n, dict):
            return False, None, None, "Each item in 'nodes' must be an object."
        pos = n.get("position") if isinstance(n.get("position"), dict) else {}
        cfg = dict(n.get("config") or {}) if isinstance(n.get("config"), dict) else {}
        normalized_nodes.append(
            {
                "id": str(n.get("id", "")),
                "nodeType": str(n.get("nodeType") or n.get("node_type") or ""),
                "name": str(n.get("name") or n.get("id") or "Unnamed Node"),
                "position": {
                    "x": float(pos.get("x", 0)),
                    "y": float(pos.get("y", 0)),
                },
                "config": cfg,
            }
        )

    normalized_edges: List[Dict[str, Any]] = []
    for e in raw_edges:
        if not isinstance(e, dict):
            return False, None, None, "Each item in 'edges' must be an object."
        normalized_edges.append(
            {
                "id": str(e.get("id", "")),
                "sourceNodeId": str(e.get("sourceNodeId") or e.get("source_node_id") or e.get("source") or ""),
                "sourcePortId": str(e.get("sourcePortId") or e.get("source_port_id") or e.get("sourceHandle") or ""),
                "targetNodeId": str(e.get("targetNodeId") or e.get("target_node_id") or e.get("target") or ""),
                "targetPortId": str(e.get("targetPortId") or e.get("target_port_id") or e.get("targetHandle") or ""),
            }
        )

    migrated = {
        "fileFormat": "MVP_PIPELINE",
        "schemaVersion": "1.0.0",
        "id": str(raw_pipeline.get("id") or ""),
        "name": str(raw_pipeline.get("name") or "Untitled Pipeline"),
        "description": str(raw_pipeline.get("description") or ""),
        "createdAt": str(raw_pipeline.get("createdAt") or raw_pipeline.get("created_at") or "2026-01-01T00:00:00Z"),
        "updatedAt": str(raw_pipeline.get("updatedAt") or raw_pipeline.get("updated_at") or "2026-01-01T00:00:00Z"),
        "metadata": metadata,
        "nodes": normalized_nodes,
        "edges": normalized_edges,
    }

    if not migrated["id"].strip():
        return False, None, None, "Pipeline 'id' must be a non-empty string."

    return True, migrated, migrated_from, None


def _validate_node_config(
    node_id: str,
    node_type: str,
    node_name: str,
    config: Dict[str, Any],
    check_resources: bool = False,
    workspace_dir: Optional[str] = None,
) -> List[ValidationIssue]:
    issues: List[ValidationIssue] = []

    if not isinstance(config, dict):
        issues.append(
            ValidationIssue(
                severity="error",
                code="INVALID_NODE_CONFIG",
                node_id=node_id,
                field="config",
                message=f"[{node_name}] Node config must be a JSON object.",
            )
        )
        return issues

    # 1. Reject dangerous executable payloads or path traversal
    for key, val in config.items():
        if isinstance(val, str):
            for pattern in _DANGEROUS_CONFIG_PATTERNS:
                if pattern.search(val):
                    issues.append(
                        ValidationIssue(
                            severity="error",
                            code="DANGEROUS_CONFIG_PAYLOAD",
                            node_id=node_id,
                            field=key,
                            message=f"[{node_name}] Unsafe or executable expression detected in config field '{key}'.",
                        )
                    )
                    break

            if ("path" in key.lower() or "file" in key.lower()) and ("..\\.." in val or "../" in val or "..\\" in val):
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="DANGEROUS_CONFIG_PAYLOAD",
                        node_id=node_id,
                        field=key,
                        message=f"[{node_name}] Directory traversal path is not allowed in '{key}'.",
                    )
                )

    # 2. Validate specific numeric parameter constraints for common OpenCV nodes
    if node_type == "threshold":
        thresh = config.get("threshold", 127)
        if not isinstance(thresh, (int, float)) or isinstance(thresh, bool) or thresh < 0 or thresh > 255:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="INVALID_NODE_CONFIG",
                    node_id=node_id,
                    field="threshold",
                    message=f"[{node_name}] Invalid 'threshold': must be a number between 0 and 255.",
                )
            )
    elif node_type == "roi_crop":
        for dim_field in ("width", "height"):
            if dim_field in config:
                val = config[dim_field]
                if not isinstance(val, (int, float)) or isinstance(val, bool) or val <= 0:
                    issues.append(
                        ValidationIssue(
                            severity="error",
                            code="INVALID_NODE_CONFIG",
                            node_id=node_id,
                            field=dim_field,
                            message=f"[{node_name}] Invalid '{dim_field}': must be greater than 0.",
                        )
                    )
    elif node_type == "resize":
        for dim_field in ("width", "height"):
            if dim_field in config:
                val = config[dim_field]
                if not isinstance(val, (int, float)) or isinstance(val, bool) or val <= 0:
                    issues.append(
                        ValidationIssue(
                            severity="error",
                            code="INVALID_NODE_CONFIG",
                            node_id=node_id,
                            field=dim_field,
                            message=f"[{node_name}] Invalid '{dim_field}': must be greater than 0.",
                        )
                    )
    elif node_type in ("gaussian_blur", "blur_denoise"):
        ksize = config.get("kernelSize", config.get("ksize", 5))
        if not isinstance(ksize, (int, float)) or isinstance(ksize, bool) or ksize < 1:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="INVALID_NODE_CONFIG",
                    node_id=node_id,
                    field="kernelSize",
                    message=f"[{node_name}] Invalid 'kernelSize': must be >= 1.",
                )
            )
    elif node_type == "circle_measurement":
        scale = config.get("scale", 1.0)
        if not isinstance(scale, (int, float)) or isinstance(scale, bool) or scale <= 0:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="INVALID_NODE_CONFIG",
                    node_id=node_id,
                    field="scale",
                    message=f"[{node_name}] Invalid 'scale': must be a positive number.",
                )
            )

    # 3. Optional external file reference check (when check_resources=True)
    if check_resources and node_type == "image_file":
        file_path = config.get("filePath") or config.get("file_path")
        if file_path and isinstance(file_path, str) and not file_path.startswith("sample_images/"):
            base_dir = Path(workspace_dir or os.getcwd())
            candidate = Path(file_path) if os.path.isabs(file_path) else (base_dir / file_path)
            if not candidate.exists() or not candidate.is_file():
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="INVALID_FILE_REFERENCE",
                        node_id=node_id,
                        field="filePath",
                        message=f"[{node_name}] Referenced image file does not exist: '{file_path}'.",
                    )
                )

    return issues


def validate_pipeline_definition(
    raw_pipeline: Dict[str, Any],
    check_resources: bool = False,
    workspace_dir: Optional[str] = None,
) -> PipelineValidationResult:
    """
    Performs comprehensive Phase 2 validation on a pipeline definition.
    """
    errors: List[ValidationIssue] = []
    warnings: List[ValidationIssue] = []
    unsupported_nodes: List[str] = []

    ok, migrated, migrated_from, migration_err = migrate_mvp_pipeline(raw_pipeline)
    if not ok or migrated is None:
        errors.append(
            ValidationIssue(
                severity="error",
                code="INVALID_SCHEMA",
                message=migration_err or "Invalid .mvp pipeline schema.",
            )
        )
        return PipelineValidationResult(
            valid=False,
            can_release=False,
            errors=errors,
            warnings=warnings,
        )

    nodes = migrated["nodes"]
    edges = migrated["edges"]

    if len(nodes) == 0:
        errors.append(
            ValidationIssue(
                severity="error",
                code="EMPTY_PIPELINE",
                message="Pipeline must contain at least one node.",
            )
        )

    # 1. Node ID uniqueness & contract validation
    node_map: Dict[str, Dict[str, Any]] = {}
    duplicate_ids = set()

    for node in nodes:
        nid = node.get("id", "").strip()
        ntype = node.get("nodeType", "").strip()
        nname = node.get("name") or nid

        if not nid:
            errors.append(
                ValidationIssue(
                    severity="error",
                    code="INVALID_NODE_ID",
                    message="Node has an empty or invalid ID.",
                )
            )
            continue

        if nid in node_map:
            duplicate_ids.add(nid)
        else:
            node_map[nid] = node

        contract = runtime_registry.get_contract(ntype)
        if contract is None:
            unsupported_nodes.append(nid)
            errors.append(
                ValidationIssue(
                    severity="error",
                    code="UNKNOWN_NODE_TYPE",
                    node_id=nid,
                    message=f"Unknown or unregistered node type '{ntype}' on node '{nname}'.",
                )
            )
            continue

        if not runtime_registry.is_supported(ntype):
            unsupported_nodes.append(nid)
            errors.append(
                ValidationIssue(
                    severity="error",
                    code="UNSUPPORTED_RUNTIME_NODE",
                    node_id=nid,
                    message=f"Node '{nname}' ({ntype}) does not have a supported Python Runtime handler.",
                )
            )

        # Config validation
        cfg_issues = _validate_node_config(
            node_id=nid,
            node_type=ntype,
            node_name=nname,
            config=node.get("config", {}),
            check_resources=check_resources,
            workspace_dir=workspace_dir,
        )
        errors.extend(cfg_issues)

    for dup_id in sorted(duplicate_ids):
        errors.append(
            ValidationIssue(
                severity="error",
                code="DUPLICATE_NODE_ID",
                node_id=dup_id,
                message=f"Duplicate node ID detected: '{dup_id}'.",
            )
        )

    # 2. Edge & Port Compatibility Validation
    target_port_connections: Dict[str, List[str]] = {}
    valid_edges: List[Dict[str, Any]] = []

    for edge in edges:
        eid = edge.get("id", "")
        src_id = edge.get("sourceNodeId", "")
        src_port_id = edge.get("sourcePortId", "")
        tgt_id = edge.get("targetNodeId", "")
        tgt_port_id = edge.get("targetPortId", "")

        if src_id == tgt_id:
            errors.append(
                ValidationIssue(
                    severity="error",
                    code="SELF_CONNECTION",
                    edge_id=eid,
                    node_id=src_id,
                    message=f"Self-connection detected on node '{src_id}'.",
                )
            )
            continue

        src_node = node_map.get(src_id)
        if not src_node:
            errors.append(
                ValidationIssue(
                    severity="error",
                    code="MISSING_SOURCE_NODE",
                    edge_id=eid,
                    message=f"Edge '{eid}' references non-existent source node '{src_id}'.",
                )
            )
            continue

        tgt_node = node_map.get(tgt_id)
        if not tgt_node:
            errors.append(
                ValidationIssue(
                    severity="error",
                    code="MISSING_TARGET_NODE",
                    edge_id=eid,
                    message=f"Edge '{eid}' references non-existent target node '{tgt_id}'.",
                )
            )
            continue

        src_contract = runtime_registry.get_contract(src_node.get("nodeType", ""))
        tgt_contract = runtime_registry.get_contract(tgt_node.get("nodeType", ""))
        if not src_contract or not tgt_contract:
            continue

        src_port = next((p for p in src_contract.outputs if p.id == src_port_id), None)
        if not src_port:
            errors.append(
                ValidationIssue(
                    severity="error",
                    code="INVALID_SOURCE_PORT",
                    edge_id=eid,
                    node_id=src_id,
                    port_id=src_port_id,
                    message=f"Source node '{src_node.get('name')}' does not have output port '{src_port_id}'.",
                )
            )
            continue

        tgt_port = next((p for p in tgt_contract.inputs if p.id == tgt_port_id), None)
        if not tgt_port:
            errors.append(
                ValidationIssue(
                    severity="error",
                    code="INVALID_TARGET_PORT",
                    edge_id=eid,
                    node_id=tgt_id,
                    port_id=tgt_port_id,
                    message=f"Target node '{tgt_node.get('name')}' does not have input port '{tgt_port_id}'.",
                )
            )
            continue

        if not are_port_types_compatible(src_port.data_type, tgt_port.data_type):
            errors.append(
                ValidationIssue(
                    severity="error",
                    code="PORT_TYPE_MISMATCH",
                    edge_id=eid,
                    node_id=tgt_id,
                    port_id=tgt_port_id,
                    message=(
                        f"Incompatible port types on edge '{eid}': cannot connect "
                        f"'{src_node.get('name')}.{src_port_id}' ({src_port.data_type}) to "
                        f"'{tgt_node.get('name')}.{tgt_port_id}' ({tgt_port.data_type})."
                    ),
                )
            )
            continue

        target_key = f"{tgt_id}:{tgt_port_id}"
        target_port_connections.setdefault(target_key, []).append(eid)
        if len(target_port_connections[target_key]) > 1:
            errors.append(
                ValidationIssue(
                    severity="error",
                    code="MULTIPLE_INPUT_CONNECTIONS",
                    edge_id=eid,
                    node_id=tgt_id,
                    port_id=tgt_port_id,
                    message=f"Input port '{tgt_port_id}' on node '{tgt_node.get('name')}' cannot accept multiple incoming connections.",
                )
            )

        valid_edges.append(edge)

    # 3. Required Inputs Check
    for nid, node in node_map.items():
        contract = runtime_registry.get_contract(node.get("nodeType", ""))
        if not contract:
            continue
        for req_input in contract.inputs:
            if req_input.required:
                connected = any(
                    e.get("targetNodeId") == nid and e.get("targetPortId") == req_input.id
                    for e in edges
                )
                if not connected:
                    errors.append(
                        ValidationIssue(
                            severity="error",
                            code="MISSING_REQUIRED_INPUT",
                            node_id=nid,
                            port_id=req_input.id,
                            message=f"Required input '{req_input.name}' ({req_input.id}) on node '{node.get('name')}' is not connected.",
                        )
                    )

    # 4. Cycle Detection & Topological Plan (Kahn's Algorithm)
    in_degree: Dict[str, int] = {nid: 0 for nid in node_map}
    adj: Dict[str, List[str]] = {nid: [] for nid in node_map}

    for edge in valid_edges:
        u = edge["sourceNodeId"]
        v = edge["targetNodeId"]
        if u in adj and v in in_degree:
            adj[u].append(v)
            in_degree[v] += 1

    queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
    ordered_ids: List[str] = []

    while queue:
        curr = queue.popleft()
        ordered_ids.append(curr)
        for neighbor in adj[curr]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(ordered_ids) != len(node_map):
        cycle_ids = [nid for nid, deg in in_degree.items() if deg > 0]
        errors.append(
            ValidationIssue(
                severity="error",
                code="CYCLE_DETECTED",
                node_id=cycle_ids[0] if cycle_ids else None,
                message=f"Cycle detected in pipeline graph involving nodes: {cycle_ids}.",
            )
        )
        execution_plan: List[Dict[str, Any]] = []
    else:
        execution_plan = [
            {
                "order": idx + 1,
                "id": nid,
                "type": node_map[nid].get("nodeType", ""),
                "name": node_map[nid].get("name", ""),
            }
            for idx, nid in enumerate(ordered_ids)
        ]

    is_valid = len(errors) == 0 and len(nodes) > 0

    return PipelineValidationResult(
        valid=is_valid,
        can_release=is_valid,
        schema_version="1.0.0",
        migrated_from_version=migrated_from,
        total_nodes=len(nodes),
        errors=errors,
        warnings=warnings,
        execution_plan=execution_plan,
        unsupported_nodes=unsupported_nodes,
    )
