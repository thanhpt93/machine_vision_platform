"""Sequential DAG Execution Engine for Vision Pipeline."""

import time
import uuid
import traceback
from typing import Any, Dict, List, Optional, Set, Tuple

from vision_runtime.registry import runtime_registry
from vision_runtime.engine.buffer import execution_buffer


class PipelineExecutionError(Exception):
    def __init__(self, node_id: str, message: str):
        super().__init__(message)
        self.node_id = node_id


class PipelineExecutor:
    """
    Validates MVP Pipeline graph and executes nodes in topological order.
    Transfers typed outputs to downstream inputs.
    """

    def __init__(self, workspace_dir: str = ""):
        self.workspace_dir = workspace_dir

    def compile_execution_plan(
        self, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Performs topological sort (Kahn's algorithm) to produce sequential execution plan.
        Raises ValueError if graph contains cycles or invalid dependencies.
        """
        node_map = {n["id"]: n for n in nodes}
        in_degree = {n["id"]: 0 for n in nodes}
        adj_list: Dict[str, List[str]] = {n["id"]: [] for n in nodes}

        for edge in edges:
            src = edge.get("sourceNodeId") or edge.get("source")
            tgt = edge.get("targetNodeId") or edge.get("target")

            if src not in node_map:
                raise ValueError(f"Edge references non-existent source node: {src}")
            if tgt not in node_map:
                raise ValueError(f"Edge references non-existent target node: {tgt}")

            adj_list[src].append(tgt)
            in_degree[tgt] += 1

        # Queue nodes with in_degree == 0
        queue = [n_id for n_id, deg in in_degree.items() if deg == 0]
        sorted_plan: List[Dict[str, Any]] = []

        while queue:
            current_id = queue.pop(0)
            sorted_plan.append(node_map[current_id])

            for neighbor in adj_list[current_id]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(sorted_plan) != len(nodes):
            raise ValueError("Pipeline contains circular dependency (cycle detected). Only DAG is supported.")

        return sorted_plan

    def execute_pipeline(
        self, pipeline: Dict[str, Any], inputs_override: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Executes pipeline end-to-end.
        Returns execution summary dict with per-node metrics and errors.
        """
        execution_id = f"exec_{uuid.uuid4().hex[:12]}"
        pipeline_id = pipeline.get("id", "untitled_pipeline")
        nodes = pipeline.get("nodes", [])
        edges = pipeline.get("edges", [])

        execution_buffer.start_execution(execution_id)

        # 1. Compile DAG into topological order
        try:
            plan = self.compile_execution_plan(nodes, edges)
        except Exception as e:
            return {
                "execution_id": execution_id,
                "pipeline_id": pipeline_id,
                "status": "failed",
                "total_duration_ms": 0.0,
                "nodes_executed": 0,
                "error": f"Failed to compile pipeline DAG: {e}",
                "node_results": {},
            }

        # Build edge lookup: (target_node_id, target_port_id) -> (source_node_id, source_port_id)
        edge_incoming: Dict[Tuple[str, str], Tuple[str, str]] = {}
        for edge in edges:
            src_node = edge.get("sourceNodeId") or edge.get("source")
            src_port = edge.get("sourcePortId") or edge.get("sourceHandle")
            tgt_node = edge.get("targetNodeId") or edge.get("target")
            tgt_port = edge.get("targetPortId") or edge.get("targetHandle")
            if src_node and src_port and tgt_node and tgt_port:
                edge_incoming[(tgt_node, tgt_port)] = (src_node, src_port)

        node_outputs: Dict[str, Dict[str, Any]] = {}
        node_results: Dict[str, Dict[str, Any]] = {}

        overall_start = time.perf_counter()
        failed_node_id: Optional[str] = None
        overall_error: Optional[str] = None
        executed_count = 0

        # 2. Sequential execution loop
        for node in plan:
            node_id = node["id"]
            node_type = node.get("nodeType", "")
            config = dict(node.get("config", {}))

            # Apply any node-level input overrides
            if inputs_override and node_id in inputs_override:
                config.update(inputs_override[node_id])

            # If upstream failed, mark remaining nodes as skipped
            if failed_node_id is not None:
                node_results[node_id] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "status": "skipped",
                    "duration_ms": 0.0,
                    "error": f"Skipped due to upstream failure at node '{failed_node_id}'",
                    "output_metadata": {},
                    "has_preview": False,
                    "preview_url": None,
                    "structured_result": None,
                }
                continue

            # Verify runtime support
            if not runtime_registry.is_supported(node_type):
                failed_node_id = node_id
                overall_error = f"Node type '{node_type}' is not supported by Python Vision Runtime."
                node_results[node_id] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "status": "failed",
                    "duration_ms": 0.0,
                    "error": overall_error,
                    "output_metadata": {},
                    "has_preview": False,
                    "preview_url": None,
                    "structured_result": None,
                }
                continue

            handler_fn = runtime_registry.get_handler(node_type)
            if not handler_fn:
                failed_node_id = node_id
                overall_error = f"No execution handler registered for node type '{node_type}'."
                node_results[node_id] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "status": "failed",
                    "duration_ms": 0.0,
                    "error": overall_error,
                    "output_metadata": {},
                    "has_preview": False,
                    "preview_url": None,
                    "structured_result": None,
                }
                continue

            # 3. Gather input ports data from upstream outputs
            node_contract = runtime_registry.get_contract(node_type)
            inputs_data: Dict[str, Any] = {}
            missing_required_port: Optional[str] = None

            if node_contract:
                for port in node_contract.inputs:
                    incoming = edge_incoming.get((node_id, port.id))
                    if incoming:
                        src_n, src_p = incoming
                        src_outputs = node_outputs.get(src_n, {})
                        if src_p in src_outputs:
                            inputs_data[port.id] = src_outputs[src_p]
                        elif port.required:
                            missing_required_port = f"Port '{port.id}' missing value from upstream '{src_n}:{src_p}'"
                    elif port.required:
                        missing_required_port = f"Required input port '{port.id}' has no incoming connection"

            # Also bind any explicit edge connections targeting this node (supports dynamic/optional ports)
            for (tgt_n, tgt_p), (src_n, src_p) in edge_incoming.items():
                if tgt_n == node_id and tgt_p not in inputs_data:
                    src_outputs = node_outputs.get(src_n, {})
                    if src_p in src_outputs:
                        inputs_data[tgt_p] = src_outputs[src_p]

            if missing_required_port:
                failed_node_id = node_id
                overall_error = missing_required_port
                node_results[node_id] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "status": "failed",
                    "duration_ms": 0.0,
                    "error": missing_required_port,
                    "output_metadata": {},
                    "has_preview": False,
                    "preview_url": None,
                    "structured_result": None,
                }
                continue

            # 4. Execute node with monotonic timer
            node_start = time.perf_counter()
            try:
                outputs, metadata = handler_fn(
                    inputs=inputs_data,
                    config=config,
                    workspace_dir=self.workspace_dir,
                )
                node_duration_ms = (time.perf_counter() - node_start) * 1000.0

                node_outputs[node_id] = outputs
                execution_buffer.store_node_output(execution_id, node_id, outputs, metadata)
                executed_count += 1

                has_prev = execution_buffer.has_preview(execution_id, node_id)
                preview_url = (
                    f"/api/pipeline/executions/{execution_id}/nodes/{node_id}/preview"
                    if has_prev
                    else None
                )

                # Extract any structured detections from output
                structured = outputs.get("detections") or outputs.get("structured_result")

                node_results[node_id] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "status": "completed",
                    "duration_ms": round(node_duration_ms, 2),
                    "error": None,
                    "output_metadata": metadata,
                    "has_preview": has_prev,
                    "preview_url": preview_url,
                    "structured_result": structured,
                }

            except Exception as e:
                node_duration_ms = (time.perf_counter() - node_start) * 1000.0
                err_msg = str(e) or type(e).__name__
                failed_node_id = node_id
                overall_error = f"Error in node '{node_id}' ({node_type}): {err_msg}"

                node_results[node_id] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "status": "failed",
                    "duration_ms": round(node_duration_ms, 2),
                    "error": err_msg,
                    "output_metadata": {},
                    "has_preview": False,
                    "preview_url": None,
                    "structured_result": None,
                }

        total_duration_ms = (time.perf_counter() - overall_start) * 1000.0

        return {
            "execution_id": execution_id,
            "pipeline_id": pipeline_id,
            "status": "completed" if failed_node_id is None else "failed",
            "total_duration_ms": round(total_duration_ms, 2),
            "nodes_executed": executed_count,
            "error": overall_error,
            "node_results": node_results,
        }


# Global pipeline executor
pipeline_executor = PipelineExecutor()
