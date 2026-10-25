"""Phase 3 Production Execution & Inspection Service.

Responsibilities:
- Execute only verified, immutable 'Released' pipeline snapshots (never unvalidated drafts or archived releases)
- Verify release SHA-256 checksum integrity before starting an inspection
- Validate input image file safety, existence, format, file size, and decoded pixel dimensions
- Enforce single active inspection concurrency lock (returns structured busy error if an inspection is RUNNING)
- Reuse existing `pipeline_executor` and `execution_buffer` (no second execution engine)
- Keep `execution_status` (QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED) strictly separate from
  `inspection_outcome` (OK, NG, UNKNOWN):
    * Completed pipeline with decision/tolerance pass -> execution_status=COMPLETED, inspection_outcome=OK
    * Completed pipeline with decision/tolerance fail -> execution_status=COMPLETED, inspection_outcome=NG
    * Completed pipeline without any decision/logic node -> execution_status=COMPLETED, inspection_outcome=UNKNOWN
    * Failed node execution -> execution_status=FAILED, inspection_outcome=None (never OK)
- Persist lightweight JSON inspection records atomically (no raw image arrays or large Base64 blobs)
"""

import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import threading
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from vision_runtime.config import settings
from vision_runtime.engine.buffer import execution_buffer
from vision_runtime.engine.executor import pipeline_executor
from vision_runtime.models.inspection import (
    ExecutionStatus,
    InputImageMetadata,
    InspectionErrorDetails,
    InspectionNodeSummary,
    InspectionOutcome,
    InspectionRecord,
)
from vision_runtime.services.release_manager import (
    ReleaseManager,
    atomic_write_json,
    release_manager,
)


class InspectionBusyError(RuntimeError):
    """Raised when a new production inspection is requested while another inspection is currently RUNNING."""


class InvalidInspectionInputError(ValueError):
    """Raised when the input image path, format, size, or decoded frame is invalid."""


_DECISION_NODE_TYPES = {
    "decision_ok_ng",
    "result_aggregation",
    "tolerance_check",
    "compare",
    "range_check",
    "logic_gate",
    "count_check",
    "presence_check",
    "rule_evaluation",
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_and_inspect_image_file(
    image_path: str,
    workspace_dir: Optional[str] = None,
    max_file_bytes: Optional[int] = None,
    max_pixels: Optional[int] = None,
) -> InputImageMetadata:
    """
    Validates that the requested input image path is safe, exists, has a supported extension,
    is within size limits, and decodes to a valid non-empty OpenCV image within pixel limits.
    """
    if not image_path or not isinstance(image_path, str) or not image_path.strip():
        raise InvalidInspectionInputError("Input image path must be a non-empty string.")

    raw_path = image_path.strip()

    # Reject path traversal sequences
    if "..\\.." in raw_path or "../" in raw_path or "..\\" in raw_path:
        raise InvalidInspectionInputError(
            f"Directory traversal sequences are not allowed in image_path: '{raw_path}'."
        )

    base_dir = Path(workspace_dir or os.getcwd()).resolve()
    candidate = Path(raw_path)

    if not candidate.is_absolute():
        resolved = (base_dir / candidate).resolve()
        # Fallback to parent workspace if running from python_runtime/ subdirectory
        if not resolved.exists() and (base_dir.parent / candidate).exists():
            resolved = (base_dir.parent / candidate).resolve()
        # Fallback to MVP_RUNTIME_DATA_DIR if sample_images or relative assets are stored in userData
        runtime_data_env = os.environ.get("MVP_RUNTIME_DATA_DIR", "").strip()
        if not resolved.exists() and runtime_data_env:
            data_dir_candidate = (Path(runtime_data_env).resolve() / candidate).resolve()
            if data_dir_candidate.exists():
                resolved = data_dir_candidate
    else:
        resolved = candidate.resolve()

    if not resolved.exists() or not resolved.is_file():
        raise FileNotFoundError(f"Input image file does not exist: '{raw_path}'.")

    ext = resolved.suffix.lower()
    allowed_exts = {e.lower() for e in settings.supported_image_extensions}
    if ext not in allowed_exts:
        raise InvalidInspectionInputError(
            f"Unsupported image file format '{ext}'. Supported extensions: {sorted(allowed_exts)}."
        )

    file_size = resolved.stat().st_size
    if file_size <= 0:
        raise InvalidInspectionInputError(f"Input image file '{resolved.name}' is empty (0 bytes).")

    limit_bytes = max_file_bytes if max_file_bytes is not None else settings.max_image_file_bytes
    if file_size > limit_bytes:
        raise InvalidInspectionInputError(
            f"Input image file '{resolved.name}' ({file_size} bytes) exceeds maximum allowed size ({limit_bytes} bytes)."
        )

    # Safely decode image header/frame using numpy + cv2.imdecode (handles Windows Unicode paths reliably)
    try:
        file_bytes = np.fromfile(str(resolved), dtype=np.uint8)
        decoded = cv2.imdecode(file_bytes, cv2.IMREAD_UNCHANGED)
    except Exception as e:
        raise InvalidInspectionInputError(f"Failed to decode image file '{resolved.name}': {e}")

    if decoded is None or not isinstance(decoded, np.ndarray) or decoded.size == 0:
        raise InvalidInspectionInputError(
            f"Corrupted or unreadable image file: '{resolved.name}' could not be decoded by OpenCV."
        )

    height, width = int(decoded.shape[0]), int(decoded.shape[1])
    channels = 1 if len(decoded.shape) == 2 else int(decoded.shape[2])
    total_pixels = width * height

    limit_pixels = max_pixels if max_pixels is not None else settings.max_image_pixels
    if total_pixels <= 0 or total_pixels > limit_pixels:
        raise InvalidInspectionInputError(
            f"Image dimensions {width}x{height} ({total_pixels} pixels) exceed maximum allowed pixel limit ({limit_pixels})."
        )

    return InputImageMetadata(
        filename=resolved.name,
        resolved_path=str(resolved),
        file_size_bytes=file_size,
        width=width,
        height=height,
        channels=channels,
    )


def _extract_outcome_and_result_data(
    plan_nodes: List[Dict[str, Any]],
    node_results: Dict[str, Dict[str, Any]],
) -> Tuple[InspectionOutcome, Dict[str, Any]]:
    """
    Determines `inspection_outcome` (OK, NG, UNKNOWN) and structured `result_data`
    from a COMPLETED pipeline execution.
    - Never fabricates 'OK' if no decision/logic/tolerance node produced a verdict!
    """
    measurements: Dict[str, Any] = {}
    decisions: List[Dict[str, Any]] = []
    explicit_verdicts: List[InspectionOutcome] = []

    for node in plan_nodes:
        nid = node["id"]
        ntype = node.get("nodeType", "")
        nres = node_results.get(nid, {})
        if nres.get("status") != "completed":
            continue

        meta = nres.get("output_metadata") or {}

        # Collect metrology / feature measurements
        if meta and ntype not in ("image_file", "grayscale", "result_viewer"):
            measurements[nid] = {
                "node_name": node.get("name", nid),
                "node_type": ntype,
                "metrics": meta,
            }

        # Check if this node is a decision / tolerance / logic node
        if ntype in _DECISION_NODE_TYPES:
            verdict_val: Optional[InspectionOutcome] = None

            if "verdict" in meta:
                raw_v = str(meta["verdict"]).upper()
                if raw_v in ("OK", "PASS", "TRUE"):
                    verdict_val = InspectionOutcome.OK
                elif raw_v in ("NG", "FAIL", "FALSE"):
                    verdict_val = InspectionOutcome.NG
                else:
                    verdict_val = InspectionOutcome.UNKNOWN
            elif "status" in meta and str(meta["status"]).upper() in ("PASS", "FAIL"):
                verdict_val = (
                    InspectionOutcome.OK
                    if str(meta["status"]).upper() == "PASS"
                    else InspectionOutcome.NG
                )
            elif "passed" in meta and isinstance(meta["passed"], bool):
                verdict_val = InspectionOutcome.OK if meta["passed"] else InspectionOutcome.NG
            elif "in_range" in meta and isinstance(meta["in_range"], bool):
                verdict_val = InspectionOutcome.OK if meta["in_range"] else InspectionOutcome.NG
            elif "all_passed" in meta and isinstance(meta["all_passed"], bool):
                verdict_val = InspectionOutcome.OK if meta["all_passed"] else InspectionOutcome.NG
            elif "result" in meta and isinstance(meta["result"], bool):
                verdict_val = InspectionOutcome.OK if meta["result"] else InspectionOutcome.NG
            elif "is_ok" in meta and isinstance(meta["is_ok"], bool):
                verdict_val = InspectionOutcome.OK if meta["is_ok"] else InspectionOutcome.NG
            elif "is_pass" in meta and isinstance(meta["is_pass"], bool):
                verdict_val = InspectionOutcome.OK if meta["is_pass"] else InspectionOutcome.NG

            if verdict_val is not None:
                explicit_verdicts.append(verdict_val)
                decisions.append(
                    {
                        "node_id": nid,
                        "node_name": node.get("name", nid),
                        "node_type": ntype,
                        "outcome": verdict_val.value,
                        "details": meta,
                    }
                )

    if not explicit_verdicts:
        final_outcome = InspectionOutcome.UNKNOWN
    else:
        # Terminal decision node (last in topological order) takes precedence,
        # unless any decision node reported NG and there is no downstream override
        terminal_verdict = explicit_verdicts[-1]
        if terminal_verdict == InspectionOutcome.NG or InspectionOutcome.NG in explicit_verdicts:
            # If the final node is explicitly an aggregator/decision node, trust its aggregated verdict
            last_decision_type = decisions[-1]["node_type"]
            if last_decision_type in ("decision_ok_ng", "result_aggregation"):
                final_outcome = terminal_verdict
            else:
                final_outcome = InspectionOutcome.NG
        elif terminal_verdict == InspectionOutcome.OK:
            final_outcome = InspectionOutcome.OK
        else:
            final_outcome = InspectionOutcome.UNKNOWN

    result_data = {
        "has_explicit_decision": len(explicit_verdicts) > 0,
        "decisions": decisions,
        "measurements": measurements,
    }
    return final_outcome, result_data


class ProductionInspectionService:
    """Manages production inspection execution, concurrency control, and record persistence."""

    def __init__(self, rel_manager: Optional[ReleaseManager] = None):
        self._rel_manager = rel_manager or release_manager
        self._execution_lock = threading.Lock()
        self._state_lock = threading.RLock()
        self._active_inspection_id: Optional[str] = None
        self._cancel_requested: set[str] = set()
        self._records_cache: Dict[str, InspectionRecord] = {}

    @property
    def inspections_dir(self) -> Path:
        return self._rel_manager.storage_dir / "inspections"

    def _inspection_path(self, inspection_id: str) -> Path:
        return self.inspections_dir / f"{inspection_id}.json"

    def is_busy(self) -> bool:
        return self._execution_lock.locked()

    @property
    def active_inspection_id(self) -> Optional[str]:
        with self._state_lock:
            return self._active_inspection_id

    def _persist_record(self, record: InspectionRecord) -> None:
        with self._state_lock:
            self._records_cache[record.inspection_id] = record
            atomic_write_json(
                self._inspection_path(record.inspection_id),
                record.model_dump(mode="json"),
            )

    def get_inspection(self, inspection_id: str) -> Optional[InspectionRecord]:
        with self._state_lock:
            if inspection_id in self._records_cache:
                return copy.deepcopy(self._records_cache[inspection_id])
            path = self._inspection_path(inspection_id)
            if not path.exists():
                return None
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            rec = InspectionRecord(**data)
            self._records_cache[inspection_id] = rec
            return copy.deepcopy(rec)

    def list_inspections(self, limit: int = 50) -> List[InspectionRecord]:
        with self._state_lock:
            if not self.inspections_dir.exists():
                return []
            records: List[InspectionRecord] = []
            for p in sorted(self.inspections_dir.glob("insp_*.json"), reverse=True):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    records.append(InspectionRecord(**data))
                except Exception:
                    continue
                if len(records) >= limit:
                    break
            records.sort(key=lambda r: r.created_at, reverse=True)
            return records

    def cancel_inspection(self, inspection_id: str) -> InspectionRecord:
        """
        Requests cancellation of a queued/running inspection, or returns explicit state if already finished.
        """
        with self._state_lock:
            rec = self.get_inspection(inspection_id)
            if rec is None:
                raise FileNotFoundError(f"Inspection '{inspection_id}' not found.")

            if rec.execution_status in (
                ExecutionStatus.COMPLETED,
                ExecutionStatus.FAILED,
                ExecutionStatus.CANCELLED,
            ):
                raise ValueError(
                    f"Cannot cancel inspection '{inspection_id}' because it is already in terminal state '{rec.execution_status.value}'."
                )

            self._cancel_requested.add(inspection_id)
            rec.execution_status = ExecutionStatus.CANCELLED
            rec.completed_at = _utc_now_iso()
            rec.inspection_outcome = None
            rec.error_details = InspectionErrorDetails(
                code="INSPECTION_CANCELLED",
                message="Inspection was cancelled by user/API request.",
            )
            self._persist_record(rec)
            return rec

    def start_inspection(
        self,
        pipeline_id: str,
        image_path: str,
        release_version: Optional[str] = None,
        workspace_dir: Optional[str] = None,
    ) -> InspectionRecord:
        """
        Executes a verified immutable pipeline release against a validated input image.
        Enforces bounded single-active-inspection concurrency.
        """
        # 1. Verify release exists, is not Archived, and passes SHA-256 checksum integrity
        release_snapshot = self._rel_manager.resolve_active_release(
            pipeline_id=pipeline_id,
            release_version=release_version,
        )

        # 2. Validate input image path, existence, extension, file size, and decoded dimensions
        img_meta = validate_and_inspect_image_file(
            image_path=image_path,
            workspace_dir=workspace_dir,
        )

        # 3. Acquire bounded single-active-inspection lock (non-blocking)
        acquired = self._execution_lock.acquire(blocking=False)
        if not acquired:
            raise InspectionBusyError(
                f"Runtime is currently busy executing active inspection '{self.active_inspection_id}'. "
                "Wait for completion before starting a new inspection."
            )

        inspection_id = f"insp_{uuid.uuid4().hex[:12]}"
        created_at = _utc_now_iso()

        try:
            with self._state_lock:
                self._active_inspection_id = inspection_id

            # Initial QUEUED record
            record = InspectionRecord(
                inspection_id=inspection_id,
                execution_id="",
                pipeline_id=release_snapshot.pipeline_id,
                release_version=release_snapshot.release_version,
                release_checksum=release_snapshot.checksum,
                input_image=img_meta,
                created_at=created_at,
                execution_status=ExecutionStatus.QUEUED,
                inspection_outcome=None,
            )
            self._persist_record(record)

            # Transition QUEUED -> RUNNING
            record.started_at = _utc_now_iso()
            record.execution_status = ExecutionStatus.RUNNING
            self._persist_record(record)

            # Deep copy the immutable pipeline definition from the release snapshot
            immutable_pipeline = copy.deepcopy(release_snapshot.pipeline)
            nodes = immutable_pipeline.get("nodes", [])
            edges = immutable_pipeline.get("edges", [])

            # Build inputs_override for acquisition nodes so the release snapshot itself is never mutated
            inputs_override: Dict[str, Dict[str, Any]] = {}
            for node in nodes:
                if node.get("nodeType") == "image_file":
                    inputs_override[node["id"]] = {"filePath": img_meta.resolved_path}

            pipeline_executor.workspace_dir = workspace_dir or os.getcwd()
            exec_summary = pipeline_executor.execute_pipeline(
                pipeline=immutable_pipeline,
                inputs_override=inputs_override if inputs_override else None,
            )

            # Check if cancellation was requested during execution
            if inspection_id in self._cancel_requested:
                self._cancel_requested.discard(inspection_id)
                cancelled_rec = self.get_inspection(inspection_id)
                assert cancelled_rec is not None
                return cancelled_rec

            execution_id = exec_summary["execution_id"]
            raw_node_results = exec_summary.get("node_results", {})

            node_summaries: Dict[str, InspectionNodeSummary] = {}
            preview_refs: Dict[str, str] = {}

            for nid, nitem in raw_node_results.items():
                has_prev = bool(nitem.get("has_preview"))
                prev_url = (
                    f"/api/production/inspections/{inspection_id}/nodes/{nid}/preview"
                    if has_prev
                    else None
                )
                if has_prev and prev_url:
                    preview_refs[nid] = prev_url

                node_summaries[nid] = InspectionNodeSummary(
                    node_id=nid,
                    node_type=nitem.get("node_type", ""),
                    status=nitem.get("status", "failed"),
                    duration_ms=float(nitem.get("duration_ms", 0.0)),
                    error=nitem.get("error"),
                    output_metadata=nitem.get("output_metadata") or {},
                    has_preview=has_prev,
                    preview_url=prev_url,
                )

            completed_at = _utc_now_iso()
            total_duration = float(exec_summary.get("total_duration_ms", 0.0))

            if exec_summary.get("status") == "completed":
                plan_nodes = pipeline_executor.compile_execution_plan(nodes, edges)
                outcome, result_data = _extract_outcome_and_result_data(
                    plan_nodes=plan_nodes,
                    node_results=raw_node_results,
                )
                record.execution_id = execution_id
                record.completed_at = completed_at
                record.duration_ms = total_duration
                record.execution_status = ExecutionStatus.COMPLETED
                record.inspection_outcome = outcome
                record.node_results = node_summaries
                record.result_data = result_data
                record.preview_references = preview_refs
                record.error_details = None
            else:
                failed_nid = next(
                    (nid for nid, r in raw_node_results.items() if r.get("status") == "failed"),
                    None,
                )
                err_msg = exec_summary.get("error") or "Pipeline execution failed."
                record.execution_id = execution_id
                record.completed_at = completed_at
                record.duration_ms = total_duration
                record.execution_status = ExecutionStatus.FAILED
                record.inspection_outcome = None  # Never fabricate OK on node failure!
                record.node_results = node_summaries
                record.result_data = {}
                record.preview_references = preview_refs
                record.error_details = InspectionErrorDetails(
                    code="NODE_EXECUTION_FAILED",
                    message=err_msg,
                    failed_node_id=failed_nid,
                )

            self._persist_record(record)
            return copy.deepcopy(record)

        finally:
            with self._state_lock:
                self._active_inspection_id = None
            self._execution_lock.release()

    def get_inspection_node_preview(
        self,
        inspection_id: str,
        node_id: str,
        port_id: Optional[str] = None,
    ) -> Optional[bytes]:
        """
        Retrieves JPEG preview bytes scoped strictly to the given inspection_id and node_id.
        Prevents cross-inspection buffer leakage.
        """
        record = self.get_inspection(inspection_id)
        if record is None or not record.execution_id:
            return None
        if node_id not in record.node_results:
            return None
        return execution_buffer.get_preview(
            execution_id=record.execution_id,
            node_id=node_id,
            port_id=port_id,
        )


# Singleton ProductionInspectionService instance
inspection_service = ProductionInspectionService()
