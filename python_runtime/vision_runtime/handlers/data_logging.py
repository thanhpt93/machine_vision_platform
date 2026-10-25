"""Data & Logging Handlers (Category 9).

Includes:
- save_image: Writes ImageFrame to disk (PNG, JPG, BMP)
- save_defect_image: Conditionally archives image when status is NG/defect
- save_measurement: Appends measurement data to JSON/text file
- export_csv: Appends inspection record rows to CSV
- inspection_logger: Records execution metrics into structured log
- result_history: In-memory & local ring buffer of last N runs
"""

import os
import csv
import json
import time
import cv2
import numpy as np
from typing import Any, Dict, List, Tuple

_GLOBAL_HISTORY_BUFFER: List[Dict[str, Any]] = []


def save_image_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Saves image frame to local file path."""
    img = inputs.get("image_in")
    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Save Image requires valid 'image_in' input frame.")

    output_dir = config.get("directory", "output_images").strip()
    prefix = config.get("prefix", "frame").strip()
    ext = config.get("format", "png").lstrip(".").lower()

    target_dir = output_dir
    if not os.path.isabs(target_dir) and workspace_dir:
        target_dir = os.path.join(workspace_dir, target_dir)

    os.makedirs(target_dir, exist_ok=True)
    filename = f"{prefix}_{int(time.time() * 1000)}.{ext}"
    full_path = os.path.join(target_dir, filename)

    # Encode with imencode then write to handle unicode paths
    encode_ext = f".{ext}"
    success, encoded = cv2.imencode(encode_ext, img)
    if not success:
        raise ValueError(f"Failed to encode image to format: {ext}")

    with open(full_path, "wb") as f:
        f.write(encoded.tobytes())

    metadata = {
        "saved_path": full_path,
        "filename": filename,
        "size_bytes": os.path.getsize(full_path),
    }

    return {"file_path": full_path, "image_out": img}, metadata


def save_defect_image_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Saves image only when inspection status is NG or defect is detected."""
    img = inputs.get("image_in")
    verdict = inputs.get("verdict", config.get("verdict", "NG"))
    is_defect = verdict == "NG" or verdict is False or verdict == "FAIL"

    if img is None or not isinstance(img, np.ndarray):
        raise ValueError("Save Defect Image requires valid 'image_in'.")

    saved_path = None
    if is_defect:
        output_dir = config.get("directory", "defects_archive").strip()
        target_dir = output_dir
        if not os.path.isabs(target_dir) and workspace_dir:
            target_dir = os.path.join(workspace_dir, target_dir)
        os.makedirs(target_dir, exist_ok=True)

        filename = f"defect_{int(time.time() * 1000)}.png"
        saved_path = os.path.join(target_dir, filename)
        cv2.imwrite(saved_path, img)

    metadata = {
        "is_defect": is_defect,
        "saved_path": saved_path,
    }

    return {"file_path": saved_path or "", "image_out": img}, metadata


def save_measurement_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Appends measurement record to a local JSON file."""
    measurement = inputs.get("measurement", config.get("data", {}))
    output_file = config.get("outputFile", "measurements.json").strip()

    target_file = output_file
    if not os.path.isabs(target_file) and workspace_dir:
        target_file = os.path.join(workspace_dir, target_file)

    os.makedirs(os.path.dirname(os.path.abspath(target_file)), exist_ok=True)

    record = {
        "timestamp": time.time(),
        "measurement": measurement,
    }

    records = []
    if os.path.exists(target_file):
        try:
            with open(target_file, "r", encoding="utf-8") as f:
                records = json.load(f)
                if not isinstance(records, list):
                    records = [records]
        except Exception:
            records = []

    records.append(record)
    with open(target_file, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)

    return {"file_path": target_file}, {"total_records": len(records), "saved_file": target_file}


def export_csv_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Appends inspection record row to CSV."""
    csv_file = config.get("csvFile", "inspection_log.csv").strip()
    target_file = csv_file
    if not os.path.isabs(target_file) and workspace_dir:
        target_file = os.path.join(workspace_dir, target_file)

    os.makedirs(os.path.dirname(os.path.abspath(target_file)), exist_ok=True)

    val = inputs.get("value_in", config.get("value", 0))
    verdict = inputs.get("verdict", config.get("verdict", "OK"))

    file_exists = os.path.exists(target_file)
    with open(target_file, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "verdict", "value"])
        writer.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), verdict, val])

    return {"file_path": target_file}, {"exported": True, "csv_file": target_file}


def inspection_logger_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Logs inspection events into structured text/log format."""
    log_file = config.get("logFile", "inspection.log").strip()
    target_file = log_file
    if not os.path.isabs(target_file) and workspace_dir:
        target_file = os.path.join(workspace_dir, target_file)

    os.makedirs(os.path.dirname(os.path.abspath(target_file)), exist_ok=True)

    event_msg = str(config.get("message", "Inspection completed"))
    verdict = inputs.get("verdict", "OK")

    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] STATUS={verdict} - {event_msg}\n"
    with open(target_file, "a", encoding="utf-8") as f:
        f.write(line)

    return {"log_entry": line.strip()}, {"logged": True, "log_file": target_file}


def result_history_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Maintains an in-memory execution history buffer for the last N runs."""
    global _GLOBAL_HISTORY_BUFFER
    max_history = int(config.get("maxHistory", 50))

    verdict = inputs.get("verdict", "OK")
    entry = {
        "timestamp": time.time(),
        "verdict": verdict,
        "data": inputs.get("data", {}),
    }

    _GLOBAL_HISTORY_BUFFER.append(entry)
    if len(_GLOBAL_HISTORY_BUFFER) > max_history:
        _GLOBAL_HISTORY_BUFFER = _GLOBAL_HISTORY_BUFFER[-max_history:]

    pass_count = sum(1 for e in _GLOBAL_HISTORY_BUFFER if e["verdict"] == "OK")
    total_count = len(_GLOBAL_HISTORY_BUFFER)
    yield_rate = round((pass_count / float(total_count)) * 100.0, 1) if total_count > 0 else 100.0

    history_summary = {
        "history_count": total_count,
        "pass_count": pass_count,
        "fail_count": total_count - pass_count,
        "yield_rate_percent": yield_rate,
        "recent_history": _GLOBAL_HISTORY_BUFFER[-10:],
    }

    return {"history": history_summary}, history_summary
