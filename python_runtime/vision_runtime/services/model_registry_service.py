"""AI Model Registry and Package Importer Service for Machine Vision Platform.

Implements:
- Package structure and metadata validation
- Checksum verification against export_manifest.json
- Path traversal & archive extraction safety
- Managed local storage under {data_dir}/models/registry/{model_id}
- Catalog persistence in {data_dir}/models/catalog.json
- Model integrity re-validation and safe deletion with pipeline dependency protection
"""

import os
import re
import json
import shutil
import zipfile
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    import onnx
    import onnxruntime as ort
except ImportError:
    onnx = None
    ort = None

from vision_runtime.config import settings
from vision_runtime.schemas.ai_model import (
    ModelCatalogItem,
    ModelClassInfo,
    ModelMetadataSchema,
    ImportValidationSummary,
    ModelValidationResponse,
)
from vision_runtime.services.model_manager import model_manager


class ModelRegistryService:
    """Manages imported AI models, verification, storage, and catalog persistence."""

    def __init__(self, data_dir: Optional[str] = None):
        self.data_dir = Path(data_dir or settings.data_dir)
        self.models_dir = self.data_dir / "models"
        self.registry_dir = self.models_dir / "registry"
        self.catalog_file = self.models_dir / "catalog.json"
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        self.registry_dir.mkdir(parents=True, exist_ok=True)
        if not self.catalog_file.exists():
            with open(self.catalog_file, "w", encoding="utf-8") as f:
                json.dump([], f, indent=2)

    def _read_catalog(self) -> List[Dict[str, Any]]:
        if not self.catalog_file.exists():
            return []
        try:
            with open(self.catalog_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _write_catalog(self, catalog: List[Dict[str, Any]]) -> None:
        temp_file = self.catalog_file.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(catalog, f, indent=2)
        temp_file.replace(self.catalog_file)

    @staticmethod
    def calculate_sha256(file_path: Path) -> str:
        hasher = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()

    def _safe_extract_zip(self, zip_path: Path, target_dir: Path) -> Path:
        """Safely extracts a ZIP archive preventing path traversal."""
        target_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.infolist():
                # Check for path traversal attacks
                norm = os.path.normpath(member.filename)
                if norm.startswith("..") or os.path.isabs(norm):
                    raise ValueError(f"Unsafe archive member path: {member.filename}")
                dest_path = (target_dir / norm).resolve()
                if not str(dest_path).startswith(str(target_dir.resolve())):
                    raise ValueError(f"Zip slip detected for entry: {member.filename}")
            zf.extractall(target_dir)

        # If archive contains a single root folder, return that subfolder
        extracted_items = [p for p in target_dir.iterdir() if p.name != "__MACOSX"]
        if len(extracted_items) == 1 and extracted_items[0].is_dir():
            return extracted_items[0]
        return target_dir

    def scan_and_validate_package(self, package_dir: Path) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        Validates package files, manifest checksums, metadata, and ONNX graph.
        Returns: (is_valid, validation_data, error_message)
        """
        if not package_dir.exists() or not package_dir.is_dir():
            return False, {}, f"Package directory does not exist: {package_dir}"

        required_files = ["model.onnx", "model_metadata.json", "labels.json", "preprocessing.json"]
        files_checked = {}
        for fname in required_files:
            fpath = package_dir / fname
            exists = fpath.is_file()
            files_checked[fname] = exists
            if not exists:
                return False, {"files_checked": files_checked}, f"Required package file missing: '{fname}'"

        # 1. Read metadata
        meta_file = package_dir / "model_metadata.json"
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                metadata = json.load(f)
        except Exception as e:
            return False, {}, f"Failed to parse model_metadata.json: {e}"

        task_type = metadata.get("task_type", "").upper()
        if task_type not in ["IMAGE_CLASSIFICATION", "OBJECT_DETECTION"]:
            return False, {}, f"Unsupported task_type in metadata: '{task_type}'. Must be IMAGE_CLASSIFICATION or OBJECT_DETECTION."

        # If object detection, postprocessing.json is required
        if task_type == "OBJECT_DETECTION":
            post_file = package_dir / "postprocessing.json"
            if not post_file.is_file():
                files_checked["postprocessing.json"] = False
                return False, {"files_checked": files_checked}, "Object detection package requires 'postprocessing.json'"
            files_checked["postprocessing.json"] = True

        # 2. Read labels
        labels_file = package_dir / "labels.json"
        try:
            with open(labels_file, "r", encoding="utf-8") as f:
                labels_data = json.load(f)
        except Exception as e:
            return False, {}, f"Failed to parse labels.json: {e}"

        raw_classes = labels_data.get("classes", [])
        if not isinstance(raw_classes, list) or len(raw_classes) == 0:
            return False, {}, "labels.json must contain a non-empty 'classes' list."

        # 3. Read preprocessing
        prep_file = package_dir / "preprocessing.json"
        try:
            with open(prep_file, "r", encoding="utf-8") as f:
                prep_data = json.load(f)
        except Exception as e:
            return False, {}, f"Failed to parse preprocessing.json: {e}"

        input_size = prep_data.get("input_size")
        if not input_size or len(input_size) != 2:
            return False, {}, "preprocessing.json must specify 'input_size' as [height, width] or [width, height]."

        # 4. Check integrity checksums against export_manifest.json if available
        manifest_file = package_dir / "export_manifest.json"
        checksum_verified = True
        if manifest_file.is_file():
            files_checked["export_manifest.json"] = True
            try:
                with open(manifest_file, "r", encoding="utf-8") as f:
                    manifest_data = json.load(f)
                exported_files = manifest_data.get("exported_files", {})
                for fname, fmeta in exported_files.items():
                    fpath = package_dir / fname
                    if fpath.is_file() and "sha256" in fmeta:
                        computed = self.calculate_sha256(fpath)
                        if computed.lower() != fmeta["sha256"].lower():
                            return (
                                False,
                                {"files_checked": files_checked},
                                f"Checksum mismatch for '{fname}'. Expected {fmeta['sha256']}, got {computed}",
                            )
            except Exception as e:
                return False, {}, f"Failed validating export manifest: {e}"
        else:
            files_checked["export_manifest.json"] = False

        # 5. Check ONNX graph validity and smoke test with ONNX Runtime
        onnx_file = package_dir / "model.onnx"
        if onnx is not None:
            try:
                onnx_model = onnx.load(str(onnx_file))
                onnx.checker.check_model(onnx_model)
            except Exception as e:
                return False, {}, f"ONNX graph validation failed: {e}"

        if ort is not None:
            try:
                smoke_sess = ort.InferenceSession(str(onnx_file), providers=["CPUExecutionProvider"])
                input_node = smoke_sess.get_inputs()[0]
                in_name = input_node.name

                # Build synthetic dummy tensor matching input_tensor specs
                h, w = input_size[0], input_size[1]
                if task_type == "IMAGE_CLASSIFICATION":
                    dummy = np.random.randn(1, 3, h, w).astype(np.float32)
                else:
                    # Faster R-CNN expects [3, H, W]
                    dummy = np.random.randn(3, h, w).astype(np.float32)

                smoke_out = smoke_sess.run(None, {in_name: dummy})
                if smoke_out is None or len(smoke_out) == 0:
                    return False, {}, "ONNX Runtime smoke inference returned no outputs."
            except Exception as e:
                return False, {}, f"ONNX Runtime smoke inference failed: {e}"

        # Parse normalized class list
        parsed_classes: List[ModelClassInfo] = []
        for idx, item in enumerate(raw_classes):
            c_idx = item.get("index", idx)
            c_name = item.get("name", f"Class_{c_idx}")
            c_id = item.get("id") or item.get("label_id") or f"lbl-{c_idx}"
            c_color = item.get("color")
            is_bg = item.get("is_background", False) or c_name == "__background__"
            parsed_classes.append(
                ModelClassInfo(
                    index=c_idx,
                    name=c_name,
                    id=c_id,
                    label_id=c_id,
                    color=c_color,
                    is_background=is_bg,
                )
            )

        # Read optional validation report
        val_report = None
        val_file = package_dir / "validation_report.json"
        if val_file.is_file():
            try:
                with open(val_file, "r", encoding="utf-8") as f:
                    val_report = json.load(f)
            except Exception:
                val_report = None

        validation_data = {
            "metadata": metadata,
            "labels": labels_data,
            "classes": [c.model_dump() for c in parsed_classes],
            "preprocessing": prep_data,
            "postprocessing": (
                json.load(open(package_dir / "postprocessing.json", "r", encoding="utf-8"))
                if (package_dir / "postprocessing.json").is_file()
                else None
            ),
            "validation_report": val_report,
            "files_checked": files_checked,
            "checksum_verified": checksum_verified,
            "onnx_sha256": self.calculate_sha256(onnx_file),
            "file_size_bytes": onnx_file.stat().st_size,
        }

        return True, validation_data, None

    def import_model_package(
        self,
        source_path: str,
        custom_name: Optional[str] = None,
    ) -> ModelCatalogItem:
        """
        Imports an exported model package into managed storage and registers it in the catalog.
        Accepts directory or ZIP archive.
        """
        src = Path(source_path)
        if not src.exists():
            raise FileNotFoundError(f"Source package path does not exist: {source_path}")

        extracted_temp_dir: Optional[Path] = None
        if src.is_file():
            if src.suffix.lower() == ".zip":
                temp_extract = self.models_dir / f"tmp_extract_{int(datetime.now().timestamp())}"
                extracted_package = self._safe_extract_zip(src, temp_extract)
                extracted_temp_dir = temp_extract
                package_dir = extracted_package
            else:
                raise ValueError("Supported model archive format is .zip only.")
        else:
            package_dir = src

        try:
            is_valid, val_data, err_msg = self.scan_and_validate_package(package_dir)
            if not is_valid:
                raise ValueError(f"Model package validation failed: {err_msg}")

            metadata = val_data["metadata"]
            raw_name = custom_name or metadata.get("model_name") or package_dir.name
            slug = re.sub(r"[^a-zA-Z0-9_\-]", "_", raw_name).strip("_").lower()
            short_hash = hashlib.sha256(raw_name.encode("utf-8")).hexdigest()[:8]
            model_id = f"{slug}_{short_hash}"

            dest_dir = self.registry_dir / model_id
            if dest_dir.exists():
                # Handle versioning or collision
                suffix = int(datetime.now().timestamp())
                model_id = f"{slug}_{suffix}"
                dest_dir = self.registry_dir / model_id

            dest_dir.mkdir(parents=True, exist_ok=True)

            # Copy verified package files into managed storage
            for item in package_dir.iterdir():
                if item.is_file() and not item.name.startswith("."):
                    shutil.copy2(item, dest_dir / item.name)

            # Register in catalog
            now_iso = datetime.now(timezone.utc).isoformat()
            catalog_item = ModelCatalogItem(
                id=model_id,
                name=raw_name,
                task_type=metadata.get("task_type", "IMAGE_CLASSIFICATION"),
                architecture=metadata.get("architecture", "unknown"),
                version=metadata.get("schema_version", "1.0.0"),
                format="ONNX",
                input_size=val_data["preprocessing"].get("input_size", [224, 224]),
                num_classes=metadata.get("num_classes", len(val_data["classes"])),
                classes=[ModelClassInfo(**c) for c in val_data["classes"]],
                source="NOVA AI Trainer",
                status="valid",
                import_date=now_iso,
                file_size_bytes=val_data["file_size_bytes"],
                checksum_sha256=val_data["onnx_sha256"],
                artifact_path=str(dest_dir / "model.onnx"),
                metadata=metadata,
                validation_report=val_data["validation_report"],
            )

            catalog = self._read_catalog()
            # Remove any previous item with same id
            catalog = [c for c in catalog if c.get("id") != model_id]
            catalog.append(catalog_item.model_dump())
            self._write_catalog(catalog)

            return catalog_item

        finally:
            if extracted_temp_dir and extracted_temp_dir.exists():
                shutil.rmtree(extracted_temp_dir, ignore_errors=True)

    def list_models(self, task_type: Optional[str] = None) -> List[ModelCatalogItem]:
        """Lists all registered models, optionally filtered by task type."""
        catalog = self._read_catalog()
        items = []
        for entry in catalog:
            try:
                item = ModelCatalogItem(**entry)
                if task_type and item.task_type.upper() != task_type.strip().upper():
                    continue
                items.append(item)
            except Exception:
                continue
        return items

    def get_model(self, model_id: str) -> Optional[ModelCatalogItem]:
        """Gets registered model by model_id."""
        catalog = self._read_catalog()
        for entry in catalog:
            if entry.get("id") == model_id:
                try:
                    return ModelCatalogItem(**entry)
                except Exception:
                    return None
        return None

    def validate_registered_model(self, model_id: str) -> ModelValidationResponse:
        """Re-verifies model files, checksums, and onnx session loading from managed storage."""
        model = self.get_model(model_id)
        if not model:
            return ModelValidationResponse(
                model_id=model_id,
                is_valid=False,
                status="invalid",
                checksum_verified=False,
                session_ready=False,
                execution_provider="None",
                errors=[f"Model '{model_id}' is not registered."],
            )

        model_dir = self.registry_dir / model_id
        if not model_dir.exists():
            return ModelValidationResponse(
                model_id=model_id,
                is_valid=False,
                status="invalid",
                checksum_verified=False,
                session_ready=False,
                execution_provider="None",
                errors=[f"Managed model directory missing on disk: {model_dir}"],
            )

        is_valid, _, err = self.scan_and_validate_package(model_dir)
        errors = [err] if err else []

        # Test session loading
        session_ready = False
        provider = "CPUExecutionProvider"
        try:
            sess = model_manager.get_or_create_session(
                model_id=model_id,
                onnx_file_path=str(model_dir / "model.onnx"),
                version=model.version,
            )
            session_ready = sess is not None
            provider = sess.get_providers()[0] if sess else "CPUExecutionProvider"
        except Exception as e:
            errors.append(f"Failed to create ONNX session: {e}")

        final_valid = is_valid and session_ready
        return ModelValidationResponse(
            model_id=model_id,
            is_valid=final_valid,
            status="valid" if final_valid else "invalid",
            checksum_verified=is_valid,
            session_ready=session_ready,
            execution_provider=provider,
            errors=errors,
        )

    def delete_model(self, model_id: str, force: bool = False, workspace_dir: str = "") -> bool:
        """
        Deletes a model from managed storage and catalog.
        Checks pipeline dependencies unless force is True.
        """
        model = self.get_model(model_id)
        if not model:
            raise KeyError(f"Model '{model_id}' does not exist in registry.")

        if not force:
            dependencies = self.find_model_pipeline_dependencies(model_id, workspace_dir)
            if dependencies:
                raise ValueError(
                    f"Cannot delete model '{model_id}': Referenced by {len(dependencies)} pipeline(s): "
                    + ", ".join(dependencies[:3])
                )

        # Unload session from ModelManager
        model_manager.unload_model(model_id)

        # Remove directory
        model_dir = self.registry_dir / model_id
        if model_dir.exists():
            shutil.rmtree(model_dir, ignore_errors=True)

        # Update catalog
        catalog = self._read_catalog()
        catalog = [c for c in catalog if c.get("id") != model_id]
        self._write_catalog(catalog)

        return True

    def find_model_pipeline_dependencies(self, model_id: str, workspace_dir: str = "") -> List[str]:
        """Scans saved pipelines for nodes referencing this model_id."""
        matching_pipelines: List[str] = []
        search_dirs = [self.data_dir / "releases"]
        if workspace_dir:
            search_dirs.append(Path(workspace_dir))

        for base in search_dirs:
            if not base.exists():
                continue
            for pfile in base.rglob("*.json"):
                try:
                    with open(pfile, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    nodes = data.get("nodes", [])
                    if any(
                        n.get("config", {}).get("modelId") == model_id
                        for n in nodes
                    ):
                        matching_pipelines.append(pfile.name)
                except Exception:
                    continue

        return list(set(matching_pipelines))


# Global model registry service
model_registry_service = ModelRegistryService()
