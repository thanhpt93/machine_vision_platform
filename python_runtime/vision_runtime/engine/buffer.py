"""In-memory Execution Buffer and Preview Manager."""

import time
import cv2
import numpy as np
from typing import Any, Dict, Optional, Tuple


class ExecutionBuffer:
    """
    Manages in-memory execution outputs and encoded image previews.
    Ensures bounded memory retention with automatic cleanup.
    """

    def __init__(self, max_retained_executions: int = 10, ttl_seconds: float = 1800.0):
        self.max_retained = max_retained_executions
        self.ttl_seconds = ttl_seconds
        # execution_id -> { "created_at": float, "nodes": { node_id: { "outputs": dict, "previews": dict } } }
        self._executions: Dict[str, Dict[str, Any]] = {}

    def start_execution(self, execution_id: str) -> None:
        self._prune_expired()
        self._executions[execution_id] = {
            "created_at": time.time(),
            "nodes": {},
        }

    def store_node_output(
        self,
        execution_id: str,
        node_id: str,
        outputs: Dict[str, Any],
        metadata: Dict[str, Any],
    ) -> None:
        if execution_id not in self._executions:
            self._executions[execution_id] = {
                "created_at": time.time(),
                "nodes": {},
            }

        node_entry = {
            "outputs": outputs,
            "metadata": metadata,
            "cached_previews": {},
        }

        # Check for image outputs and generate a thumbnail/preview cache
        for port_id, val in outputs.items():
            if isinstance(val, np.ndarray):
                # Encode preview image
                preview_bytes = self._encode_preview(val)
                if preview_bytes is not None:
                    node_entry["cached_previews"][port_id] = preview_bytes

        self._executions[execution_id]["nodes"][node_id] = node_entry

    def get_preview(
        self, execution_id: str, node_id: str, port_id: Optional[str] = None
    ) -> Optional[bytes]:
        exec_data = self._executions.get(execution_id)
        if not exec_data:
            return None

        node_data = exec_data["nodes"].get(node_id)
        if not node_data:
            return None

        cached = node_data.get("cached_previews", {})
        if port_id and port_id in cached:
            return cached[port_id]

        # Return first available preview if port_id not specified
        if cached:
            return next(iter(cached.values()))

        # Check raw outputs if not cached
        for p_id, val in node_data.get("outputs", {}).items():
            if isinstance(val, np.ndarray):
                encoded = self._encode_preview(val)
                if encoded:
                    cached[p_id] = encoded
                    return encoded

        return None

    def has_preview(self, execution_id: str, node_id: str) -> bool:
        exec_data = self._executions.get(execution_id)
        if not exec_data:
            return False
        node_data = exec_data["nodes"].get(node_id)
        if not node_data:
            return False
        return len(node_data.get("cached_previews", {})) > 0 or any(
            isinstance(v, np.ndarray) for v in node_data.get("outputs", {}).values()
        )

    def clear_execution(self, execution_id: str) -> bool:
        if execution_id in self._executions:
            del self._executions[execution_id]
            return True
        return False

    def clear_all(self) -> None:
        self._executions.clear()

    def _encode_preview(self, img: np.ndarray, max_dim: int = 1280) -> Optional[bytes]:
        """Encodes numpy frame into high-quality JPEG preview bytes."""
        try:
            h, w = img.shape[:2]
            target = img
            if max(h, w) > max_dim:
                scale = max_dim / float(max(h, w))
                new_w, new_h = int(w * scale), int(h * scale)
                target = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

            # Convert 1-channel or 3-channel to JPEG
            success, encoded = cv2.imencode(".jpg", target, [cv2.IMWRITE_JPEG_QUALITY, 88])
            if success:
                return encoded.tobytes()
        except Exception:
            return None
        return None

    def _prune_expired(self) -> None:
        now = time.time()
        # Remove expired by TTL
        expired_keys = [
            k for k, v in self._executions.items() if now - v["created_at"] > self.ttl_seconds
        ]
        for k in expired_keys:
            del self._executions[k]

        # Remove oldest if exceeding max_retained
        if len(self._executions) >= self.max_retained:
            sorted_by_age = sorted(self._executions.items(), key=lambda item: item[1]["created_at"])
            excess = len(self._executions) - self.max_retained + 1
            for k, _ in sorted_by_age[:excess]:
                del self._executions[k]


# Global execution buffer instance
execution_buffer = ExecutionBuffer()
