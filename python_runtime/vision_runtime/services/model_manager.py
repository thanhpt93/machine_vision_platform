"""Centralized ONNX Runtime Inference Service and Model Manager.

Manages:
- Hardware execution provider detection (CPU, CUDA when verified).
- Session lifecycle and caching (no reloading for every image).
- Thread-safe model loading and execution.
- Memory management and safe session unloading.
"""

import os
import threading
import multiprocessing
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

try:
    import onnxruntime as ort
except ImportError:
    ort = None

from vision_runtime.schemas.ai_model import HardwareInfo


class ModelManager:
    """Singleton ONNX Runtime Session and Execution Provider Manager."""

    _instance: Optional["ModelManager"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "ModelManager":
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ModelManager, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return

        self._sessions: Dict[str, ort.InferenceSession] = {}
        self._session_lock = threading.Lock()
        self._verified_providers: Optional[List[str]] = None
        self._cuda_verified: Optional[bool] = None
        self._initialized = True

    def get_hardware_info(self) -> HardwareInfo:
        """Detects available and verified ONNX execution providers without false CUDA claims."""
        if ort is None:
            return HardwareInfo(
                available_providers=[],
                selected_provider="None",
                cuda_available=False,
                device_name=None,
                cpu_cores=multiprocessing.cpu_count(),
            )

        raw_providers = ort.get_available_providers()
        cuda_supported = False
        device_name = None

        if "CUDAExecutionProvider" in raw_providers:
            # Verify CUDA really works by creating a minimal dummy session or checking torch.cuda
            try:
                import torch
                if torch.cuda.is_available():
                    cuda_supported = True
                    device_name = torch.cuda.get_device_name(0)
            except Exception:
                cuda_supported = False

        selected = "CUDAExecutionProvider" if cuda_supported else "CPUExecutionProvider"

        verified = []
        if cuda_supported:
            verified.append("CUDAExecutionProvider")
        if "CPUExecutionProvider" in raw_providers:
            verified.append("CPUExecutionProvider")
        if not verified:
            verified = raw_providers

        return HardwareInfo(
            available_providers=verified,
            selected_provider=selected,
            cuda_available=cuda_supported,
            device_name=device_name,
            cpu_cores=multiprocessing.cpu_count(),
        )

    def resolve_providers(self, requested_provider: Optional[str] = None) -> List[str]:
        """Resolves valid execution providers, falling back gracefully to CPUExecutionProvider."""
        hw = self.get_hardware_info()
        if requested_provider:
            req = requested_provider.strip()
            if req == "CUDAExecutionProvider":
                if hw.cuda_available:
                    return ["CUDAExecutionProvider", "CPUExecutionProvider"]
                else:
                    return ["CPUExecutionProvider"]
            elif req == "CPUExecutionProvider":
                return ["CPUExecutionProvider"]

        return [hw.selected_provider, "CPUExecutionProvider"] if hw.cuda_available else ["CPUExecutionProvider"]

    def get_or_create_session(
        self,
        model_id: str,
        onnx_file_path: str,
        version: str = "1.0.0",
        requested_provider: Optional[str] = None,
        intra_op_threads: int = 0,
        inter_op_threads: int = 0,
    ) -> ort.InferenceSession:
        """
        Retrieves an active cached session or instantiates a new one.
        Ensures thread-safe initialization and prevents duplicate memory overhead.
        """
        if ort is None:
            raise RuntimeError("onnxruntime is not installed in the environment.")

        if not os.path.isfile(onnx_file_path):
            raise FileNotFoundError(f"ONNX model file not found: {onnx_file_path}")

        cache_key = f"{model_id}:{version}:{requested_provider or 'default'}"

        with self._session_lock:
            if cache_key in self._sessions:
                return self._sessions[cache_key]

            providers = self.resolve_providers(requested_provider)

            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            if intra_op_threads > 0:
                sess_options.intra_op_num_threads = intra_op_threads
            if inter_op_threads > 0:
                sess_options.inter_op_num_threads = inter_op_threads

            try:
                session = ort.InferenceSession(
                    onnx_file_path,
                    sess_options=sess_options,
                    providers=providers,
                )
            except Exception as e:
                # If CUDA failed, fallback unconditionally to CPU
                if "CUDAExecutionProvider" in providers:
                    session = ort.InferenceSession(
                        onnx_file_path,
                        sess_options=sess_options,
                        providers=["CPUExecutionProvider"],
                    )
                else:
                    raise RuntimeError(f"Failed to load ONNX session for '{model_id}': {e}") from e

            self._sessions[cache_key] = session
            return session

    def run_inference(
        self,
        session: ort.InferenceSession,
        input_feed: Dict[str, np.ndarray],
        output_names: Optional[List[str]] = None,
    ) -> List[np.ndarray]:
        """Runs inference synchronously through the ONNX Runtime session."""
        return session.run(output_names, input_feed)

    def unload_model(self, model_id: str) -> int:
        """Unloads all cached sessions for the given model ID."""
        with self._session_lock:
            keys_to_remove = [k for k in self._sessions if k.startswith(f"{model_id}:")]
            for k in keys_to_remove:
                del self._sessions[k]
            return len(keys_to_remove)

    def clear_cache(self) -> int:
        """Clears all cached sessions from memory."""
        with self._session_lock:
            count = len(self._sessions)
            self._sessions.clear()
            return count

    def is_model_loaded(self, model_id: str) -> bool:
        """Checks if a model currently has an active session loaded in memory."""
        with self._session_lock:
            return any(k.startswith(f"{model_id}:") for k in self._sessions)


# Global singleton instance
model_manager = ModelManager()
