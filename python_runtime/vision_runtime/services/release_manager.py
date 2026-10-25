"""Phase 2 Release Management Service (Atomic Local Persistence & Checksum Verification).

Responsibilities:
- Enforce pipeline lifecycle states: Draft -> Validated -> Released -> Archived
- Compute deterministic canonical SHA-256 checksums over release content
- Persist working drafts and immutable release snapshots atomically (temp file + os.replace)
- Prevent duplicate release versions for the same pipeline_id
- Verify release integrity before activation, rollback, or production execution
- Support archiving releases without deleting historical artifacts
- Support rollback / activation of earlier verified releases
"""

import copy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import threading
from typing import Any, Dict, List, Optional, Tuple

from vision_runtime.config import settings
from vision_runtime.engine.validator import (
    PipelineValidationResult,
    migrate_mvp_pipeline,
    validate_pipeline_definition,
)
from vision_runtime.models.release import (
    PipelineLifecycleState,
    ReleaseIntegrityReport,
    ReleaseSnapshot,
    WorkingPipelineRecord,
)
from vision_runtime.registry import runtime_registry


_SAFE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9._-]+$")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sanitize_filename_token(token: str) -> str:
    cleaned = token.strip()
    if not cleaned or not _SAFE_ID_PATTERN.match(cleaned):
        raise ValueError(
            f"Invalid identifier '{token}': only alphanumeric characters, '.', '_', and '-' are allowed."
        )
    return cleaned


def compute_canonical_pipeline_checksum(pipeline_def: Dict[str, Any]) -> str:
    """Computes a deterministic SHA-256 checksum of the structural pipeline definition."""
    canonical_copy = copy.deepcopy(pipeline_def)
    # Exclude volatile timestamps from draft structural hash so validating and immediately releasing matches
    canonical_copy.pop("updatedAt", None)
    canonical_copy.pop("updated_at", None)
    canonical_bytes = json.dumps(
        canonical_copy, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(canonical_bytes).hexdigest()


def compute_canonical_release_checksum(
    pipeline_id: str,
    release_version: str,
    schema_version: str,
    pipeline: Dict[str, Any],
    node_versions: Dict[str, str],
    created_at: str,
    release_notes: str,
) -> str:
    """
    Computes a deterministic canonical SHA-256 checksum over the immutable release payload,
    excluding mutable lifecycle flags (`status`, `is_active`, `archived_at`) and `checksum` itself.
    """
    canonical_payload = {
        "pipeline_id": pipeline_id,
        "release_version": release_version,
        "schema_version": schema_version,
        "pipeline": pipeline,
        "node_versions": node_versions,
        "created_at": created_at,
        "release_notes": release_notes,
    }
    serialized = json.dumps(
        canonical_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def atomic_write_json(target_path: Path, data: Dict[str, Any]) -> None:
    """Writes a JSON dictionary atomically to disk using a temporary file and os.replace."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path_str = tempfile.mkstemp(
        dir=str(target_path.parent),
        prefix=f".{target_path.name}.",
        suffix=".tmp",
    )
    tmp_path = Path(tmp_path_str)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(str(tmp_path), str(target_path))
    except Exception:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise


class ReleaseManager:
    """Manages pipeline lifecycle states and immutable release snapshots on local storage."""

    def __init__(self, storage_dir: Optional[str] = None):
        self._storage_dir = Path(storage_dir or settings.data_dir)
        self._lock = threading.RLock()

    @property
    def storage_dir(self) -> Path:
        return self._storage_dir

    @storage_dir.setter
    def storage_dir(self, value: str | Path) -> None:
        self._storage_dir = Path(value)

    @property
    def drafts_dir(self) -> Path:
        return self._storage_dir / "drafts"

    @property
    def releases_dir(self) -> Path:
        return self._storage_dir / "releases"

    def _draft_path(self, pipeline_id: str) -> Path:
        safe_id = _sanitize_filename_token(pipeline_id)
        return self.drafts_dir / f"{safe_id}.json"

    def _pipeline_releases_dir(self, pipeline_id: str) -> Path:
        safe_id = _sanitize_filename_token(pipeline_id)
        return self.releases_dir / safe_id

    def _release_path(self, pipeline_id: str, release_version: str) -> Path:
        safe_id = _sanitize_filename_token(pipeline_id)
        safe_ver = _sanitize_filename_token(release_version)
        return self.releases_dir / safe_id / f"{safe_ver}.json"

    # ------------------------------------------------------------------
    # Working Draft & Validation Lifecycle (Draft <-> Validated)
    # ------------------------------------------------------------------
    def save_working_draft(self, raw_pipeline: Dict[str, Any]) -> WorkingPipelineRecord:
        """Saves or updates a mutable pipeline in Draft state. Any edit resets Validated -> Draft."""
        with self._lock:
            ok, migrated, _, err = migrate_mvp_pipeline(raw_pipeline)
            if not ok or migrated is None:
                raise ValueError(err or "Invalid pipeline schema.")

            pipeline_id = _sanitize_filename_token(migrated["id"])
            now = _utc_now_iso()
            record = WorkingPipelineRecord(
                pipeline_id=pipeline_id,
                name=migrated.get("name", pipeline_id),
                lifecycle_status=PipelineLifecycleState.DRAFT,
                pipeline=migrated,
                validated_checksum=None,
                last_validated_at=None,
                updated_at=now,
            )
            atomic_write_json(self._draft_path(pipeline_id), record.model_dump(mode="json"))
            return record

    def get_working_pipeline(self, pipeline_id: str) -> Optional[WorkingPipelineRecord]:
        with self._lock:
            path = self._draft_path(pipeline_id)
            if not path.exists():
                return None
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return WorkingPipelineRecord(**data)

    def mark_pipeline_validated(
        self,
        raw_pipeline: Dict[str, Any],
        check_resources: bool = False,
        workspace_dir: Optional[str] = None,
    ) -> Tuple[PipelineValidationResult, Optional[WorkingPipelineRecord]]:
        """
        Validates a pipeline definition and, if valid, transitions its working record to Validated.
        If invalid, keeps/resets working record to Draft and returns structured errors.
        """
        with self._lock:
            val_result = validate_pipeline_definition(
                raw_pipeline=raw_pipeline,
                check_resources=check_resources,
                workspace_dir=workspace_dir,
            )
            if not val_result.valid or not val_result.can_release:
                return val_result, None

            _, migrated, _, _ = migrate_mvp_pipeline(raw_pipeline)
            assert migrated is not None
            pipeline_id = _sanitize_filename_token(migrated["id"])
            now = _utc_now_iso()
            struct_checksum = compute_canonical_pipeline_checksum(migrated)

            record = WorkingPipelineRecord(
                pipeline_id=pipeline_id,
                name=migrated.get("name", pipeline_id),
                lifecycle_status=PipelineLifecycleState.VALIDATED,
                pipeline=migrated,
                validated_checksum=struct_checksum,
                last_validated_at=now,
                updated_at=now,
            )
            atomic_write_json(self._draft_path(pipeline_id), record.model_dump(mode="json"))
            return val_result, record

    # ------------------------------------------------------------------
    # Release Creation & Immutability (Validated -> Released)
    # ------------------------------------------------------------------
    def create_release(
        self,
        release_version: str,
        pipeline: Optional[Dict[str, Any]] = None,
        pipeline_id: Optional[str] = None,
        release_notes: str = "",
        activate: bool = True,
        require_prior_validation: bool = False,
        check_resources: bool = False,
        workspace_dir: Optional[str] = None,
    ) -> ReleaseSnapshot:
        """
        Creates an immutable ReleaseSnapshot from a validated pipeline.
        - Rejects invalid pipelines.
        - If require_prior_validation=True (or if only pipeline_id is passed), verifies the working
          pipeline is currently in 'Validated' state and has not been modified since validation.
        - Rejects duplicate release_version for the same pipeline_id.
        """
        with self._lock:
            safe_ver = _sanitize_filename_token(release_version)

            working_record: Optional[WorkingPipelineRecord] = None
            target_pipeline = pipeline

            if target_pipeline is None:
                if not pipeline_id:
                    raise ValueError("Either 'pipeline' or 'pipeline_id' must be provided to create a release.")
                working_record = self.get_working_pipeline(pipeline_id)
                if working_record is None:
                    raise ValueError(f"Working pipeline '{pipeline_id}' not found.")
                if working_record.lifecycle_status != PipelineLifecycleState.VALIDATED:
                    raise ValueError(
                        f"Cannot release pipeline '{pipeline_id}': current lifecycle state is "
                        f"'{working_record.lifecycle_status.value}', expected 'Validated'."
                    )
                target_pipeline = working_record.pipeline
            else:
                ok, migrated_candidate, _, err = migrate_mvp_pipeline(target_pipeline)
                if not ok or migrated_candidate is None:
                    raise ValueError(err or "Invalid pipeline schema.")
                resolved_id = _sanitize_filename_token(pipeline_id or migrated_candidate["id"])
                working_record = self.get_working_pipeline(resolved_id)

                if require_prior_validation:
                    if working_record is None or working_record.lifecycle_status != PipelineLifecycleState.VALIDATED:
                        raise ValueError(
                            f"Pipeline '{resolved_id}' must be in 'Validated' state before creating a release."
                        )
                    candidate_hash = compute_canonical_pipeline_checksum(migrated_candidate)
                    if working_record.validated_checksum != candidate_hash:
                        # Edited after validation -> reset working record to Draft and reject release
                        self.save_working_draft(migrated_candidate)
                        raise ValueError(
                            f"Pipeline '{resolved_id}' was modified after validation and has been reset to 'Draft'. "
                            "Re-validate before creating a release."
                        )

            # Always run full server-side validation before creating a release snapshot
            val_result = validate_pipeline_definition(
                raw_pipeline=target_pipeline,
                check_resources=check_resources,
                workspace_dir=workspace_dir,
            )
            if not val_result.valid or not val_result.can_release:
                first_err = val_result.errors[0].message if val_result.errors else "Pipeline failed validation."
                raise ValueError(f"Cannot create release for invalid pipeline: {first_err}")

            _, migrated, _, _ = migrate_mvp_pipeline(target_pipeline)
            assert migrated is not None

            resolved_pipeline_id = _sanitize_filename_token(pipeline_id or migrated["id"])
            migrated["id"] = resolved_pipeline_id

            release_file = self._release_path(resolved_pipeline_id, safe_ver)
            if release_file.exists():
                raise FileExistsError(
                    f"Release version '{safe_ver}' already exists for pipeline '{resolved_pipeline_id}'. "
                    "Releases are immutable and cannot be overwritten."
                )

            # Collect node type + contract version map
            node_versions: Dict[str, str] = {}
            for node in migrated.get("nodes", []):
                ntype = node.get("nodeType", "")
                contract = runtime_registry.get_contract(ntype)
                node_versions[ntype] = contract.version if contract else "1.0.0"

            created_at = _utc_now_iso()
            immutable_pipeline = copy.deepcopy(migrated)

            checksum = compute_canonical_release_checksum(
                pipeline_id=resolved_pipeline_id,
                release_version=safe_ver,
                schema_version="1.0.0",
                pipeline=immutable_pipeline,
                node_versions=node_versions,
                created_at=created_at,
                release_notes=release_notes,
            )

            snapshot = ReleaseSnapshot(
                pipeline_id=resolved_pipeline_id,
                release_version=safe_ver,
                schema_version="1.0.0",
                status=PipelineLifecycleState.RELEASED,
                is_active=bool(activate),
                pipeline=immutable_pipeline,
                node_versions=node_versions,
                created_at=created_at,
                release_notes=release_notes,
                checksum=checksum,
            )

            if activate:
                self._deactivate_other_releases(resolved_pipeline_id, exclude_version=safe_ver)

            atomic_write_json(release_file, snapshot.model_dump(mode="json"))

            # Update working record status if present
            if working_record is not None:
                working_record.lifecycle_status = PipelineLifecycleState.RELEASED
                working_record.updated_at = created_at
                atomic_write_json(
                    self._draft_path(resolved_pipeline_id),
                    working_record.model_dump(mode="json"),
                )

            return copy.deepcopy(snapshot)

    def _deactivate_other_releases(self, pipeline_id: str, exclude_version: str) -> None:
        p_dir = self._pipeline_releases_dir(pipeline_id)
        if not p_dir.exists():
            return
        for file_path in sorted(p_dir.glob("*.json")):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("release_version") != exclude_version and data.get("is_active"):
                    data["is_active"] = False
                    atomic_write_json(file_path, data)
            except Exception:
                continue

    # ------------------------------------------------------------------
    # Querying, Integrity Verification, Archiving & Rollback
    # ------------------------------------------------------------------
    def get_release(self, pipeline_id: str, release_version: str) -> Optional[ReleaseSnapshot]:
        """Loads a release snapshot from disk and returns a deep copy so callers cannot mutate storage."""
        with self._lock:
            path = self._release_path(pipeline_id, release_version)
            if not path.exists():
                return None
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return ReleaseSnapshot(**data)

    def verify_release_integrity(
        self, pipeline_id: str, release_version: str
    ) -> ReleaseIntegrityReport:
        """Recomputes the canonical SHA-256 checksum of a stored release and detects tampering."""
        with self._lock:
            path = self._release_path(pipeline_id, release_version)
            if not path.exists():
                raise FileNotFoundError(
                    f"Release '{release_version}' for pipeline '{pipeline_id}' does not exist."
                )
            with open(path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            stored_checksum = str(raw_data.get("checksum", ""))
            computed_checksum = compute_canonical_release_checksum(
                pipeline_id=str(raw_data.get("pipeline_id", "")),
                release_version=str(raw_data.get("release_version", "")),
                schema_version=str(raw_data.get("schema_version", "1.0.0")),
                pipeline=raw_data.get("pipeline", {}),
                node_versions=raw_data.get("node_versions", {}),
                created_at=str(raw_data.get("created_at", "")),
                release_notes=str(raw_data.get("release_notes", "")),
            )

            is_valid = stored_checksum == computed_checksum
            status_val = PipelineLifecycleState(raw_data.get("status", "Released"))
            is_active = bool(raw_data.get("is_active", False))

            return ReleaseIntegrityReport(
                pipeline_id=pipeline_id,
                release_version=release_version,
                valid_integrity=is_valid,
                stored_checksum=stored_checksum,
                computed_checksum=computed_checksum,
                status=status_val,
                is_active=is_active,
                message=(
                    "Release checksum verified."
                    if is_valid
                    else "CRITICAL: Release artifact checksum mismatch (tampered or corrupted)."
                ),
            )

    def list_releases(
        self,
        pipeline_id: Optional[str] = None,
        include_archived: bool = False,
    ) -> List[ReleaseSnapshot]:
        """Lists release snapshots across one or all pipelines. Excludes Archived by default."""
        with self._lock:
            if not self.releases_dir.exists():
                return []

            target_dirs: List[Path] = []
            if pipeline_id:
                p_dir = self._pipeline_releases_dir(pipeline_id)
                if p_dir.exists():
                    target_dirs.append(p_dir)
            else:
                target_dirs = [d for d in sorted(self.releases_dir.iterdir()) if d.is_dir()]

            results: List[ReleaseSnapshot] = []
            for p_dir in target_dirs:
                for file_path in sorted(p_dir.glob("*.json")):
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    snap = ReleaseSnapshot(**data)
                    if not include_archived and snap.status == PipelineLifecycleState.ARCHIVED:
                        continue
                    results.append(snap)

            results.sort(key=lambda r: (r.pipeline_id, r.created_at, r.release_version))
            return results

    def archive_release(self, pipeline_id: str, release_version: str) -> ReleaseSnapshot:
        """
        Transitions a release from Released -> Archived without deleting the release artifact.
        Archived releases are deactivated and excluded from active production selection.
        """
        with self._lock:
            path = self._release_path(pipeline_id, release_version)
            if not path.exists():
                raise FileNotFoundError(
                    f"Release '{release_version}' for pipeline '{pipeline_id}' does not exist."
                )

            integrity = self.verify_release_integrity(pipeline_id, release_version)
            if not integrity.valid_integrity:
                raise ValueError(integrity.message)

            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            data["status"] = PipelineLifecycleState.ARCHIVED.value
            data["is_active"] = False
            data["archived_at"] = _utc_now_iso()
            atomic_write_json(path, data)
            return ReleaseSnapshot(**data)

    def rollback_or_activate_release(
        self, pipeline_id: str, target_release_version: str
    ) -> ReleaseSnapshot:
        """
        Selects/rolls back to a specific existing release version for a pipeline.
        Verifies checksum integrity and ensures the target release is not Archived.
        """
        with self._lock:
            path = self._release_path(pipeline_id, target_release_version)
            if not path.exists():
                raise FileNotFoundError(
                    f"Target release '{target_release_version}' for pipeline '{pipeline_id}' does not exist."
                )

            integrity = self.verify_release_integrity(pipeline_id, target_release_version)
            if not integrity.valid_integrity:
                raise ValueError(integrity.message)

            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if data.get("status") == PipelineLifecycleState.ARCHIVED.value:
                raise ValueError(
                    f"Cannot activate or roll back to archived release '{target_release_version}' "
                    f"of pipeline '{pipeline_id}'."
                )

            self._deactivate_other_releases(pipeline_id, exclude_version=target_release_version)
            data["is_active"] = True
            atomic_write_json(path, data)
            return ReleaseSnapshot(**data)

    def resolve_active_release(
        self, pipeline_id: str, release_version: Optional[str] = None
    ) -> ReleaseSnapshot:
        """
        Resolves the release to execute in Production:
        - If release_version is specified, loads that exact version.
        - Otherwise, resolves the currently active release for pipeline_id.
        - Verifies the release is in 'Released' status (not Archived) and passes SHA-256 integrity check.
        """
        with self._lock:
            if release_version:
                snap = self.get_release(pipeline_id, release_version)
                if snap is None:
                    raise FileNotFoundError(
                        f"Release '{release_version}' for pipeline '{pipeline_id}' does not exist."
                    )
            else:
                releases = self.list_releases(pipeline_id=pipeline_id, include_archived=False)
                active_candidates = [r for r in releases if r.is_active]
                if not active_candidates:
                    raise LookupError(
                        f"No active release found for pipeline '{pipeline_id}'."
                    )
                snap = active_candidates[-1]

            if snap.status == PipelineLifecycleState.ARCHIVED:
                raise ValueError(
                    f"Release '{snap.release_version}' for pipeline '{pipeline_id}' is Archived and cannot be executed."
                )

            integrity = self.verify_release_integrity(pipeline_id, snap.release_version)
            if not integrity.valid_integrity:
                raise ValueError(integrity.message)

            return snap


# Singleton ReleaseManager instance
release_manager = ReleaseManager()
