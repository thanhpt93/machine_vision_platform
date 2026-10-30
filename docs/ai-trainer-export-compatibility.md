# NOVA AI Trainer ?" Machine Vision Platform Export Compatibility Specification

## Document Overview
- **Author**: Antigravity AI Platform Engineer
- **Date**: 2026-10-30
- **Status**: Verified against `AI_TRAINER_REPO` (`C:\Project\ai_trainer`) and `MACHINE_VISION_REPO` (`C:\Project\machine_vision_platform`)
- **Version**: 1.0.0

---

## 1. Executive Summary

This specification establishes the official contract between model packages exported by **NOVA AI Trainer** and model ingestion & inference inside **NOVA Machine Vision Platform**.

Inspection of `C:\Project\ai_trainer\backend\app\services\model_catalog_service.py` and exported artifacts confirms:
1. Two distinct model task types are exported:
   - `IMAGE_CLASSIFICATION` (e.g. MobileNetV3 Small/Large, ResNet18/50, EfficientNet)
   - `OBJECT_DETECTION` (e.g. Faster R-CNN MobileNetV3-Large 320 FPN, Faster R-CNN ResNet-50 FPN)
2. All models are packaged into self-contained directory bundles containing:
   - `model.onnx`: The compute graph in ONNX Opset 14.
   - `model_metadata.json`: Architectural definition, tensor schemas, semantics, and checksum.
   - `labels.json`: Indexed class list with UUIDs and display names.
   - `preprocessing.json`: Color space, resize dimensions, and ImageNet normalization.
   - `postprocessing.json`: (Object Detection) Coordinate formats, default confidence/IoU thresholds, and background index.
   - `validation_report.json`: Metrics (accuracy/mAP, confusion matrix, per-class metrics).
   - `export_manifest.json`: SHA-256 integrity checksums and file sizes for all files.

---

## 2. Package File Structure

### 2.1 Image Classification Package
```text
classification_model/
├── model.onnx              # ONNX Opset 14 graph (inputs: 'input', outputs: 'output')
├── model_metadata.json     # Metadata definition (schema_version: '1.0.0')
├── labels.json             # Class list with indices, label_ids, names, and hex colors
├── preprocessing.json      # RGB color mode, resize policy, ImageNet mean/std
├── validation_report.json  # Loss, accuracy, macro F1, confusion matrix
└── export_manifest.json    # SHA-256 checksums and verified_with_inference flag
```

### 2.2 Object Detection Package
```text
object_detection_model/
├── model.onnx              # ONNX Opset 14 graph (inputs: 'images', outputs: 'boxes', 'labels', 'scores')
├── model_metadata.json     # Metadata definition (schema_version: '1.0.0')
├── labels.json             # Background index + class list with foreground mappings
├── preprocessing.json      # RGB color mode, input size, ImageNet normalization, coordinate system
├── postprocessing.json     # xyxy coordinates, confidence threshold, IoU threshold, max detections
├── validation_report.json  # COCO mAP, per-class AP, evaluation summary
└── export_manifest.json    # SHA-256 checksums and verified_with_inference flag
```

---

## 3. Metadata Contracts & Schemas

### 3.1 `model_metadata.json` Schema
```json
{
  "model_name": "string",
  "task_type": "IMAGE_CLASSIFICATION" | "OBJECT_DETECTION",
  "architecture": "string",
  "framework": "PyTorch",
  "export_format": "ONNX",
  "input_tensor": {
    "name": "input" | "images",
    "shape": [-1, 3, 224, 224] | [3, 320, 320],
    "data_type": "float32"
  },
  "output_tensor": {
    "name": "output",
    "shape": [-1, "num_classes"],
    "data_type": "float32",
    "semantics": "logits"
  },
  "output_tensors": [
    {
      "name": "boxes",
      "shape": [-1, 4],
      "data_type": "float32",
      "semantics": "bounding_boxes_xyxy"
    },
    {
      "name": "labels",
      "shape": [-1],
      "data_type": "int64",
      "semantics": "class_indices"
    },
    {
      "name": "scores",
      "shape": [-1],
      "data_type": "float32",
      "semantics": "confidence_scores"
    }
  ],
  "preprocessing": { ... },
  "postprocessing": { ... },
  "num_classes": "int",
  "onnx_sha256": "string",
  "schema_version": "1.0.0"
}
```

### 3.2 `labels.json` Schema
#### Classification:
```json
{
  "class_count": 2,
  "classes": [
    {
      "index": 0,
      "label_id": "ad327bf5-5c61-4a3b-b727-31862d06cb36",
      "name": "Good",
      "color": "#06b6d4"
    },
    {
      "index": 1,
      "label_id": "6f485209-d65c-4996-af62-0195e6a05a81",
      "name": "Defect",
      "color": "#ef4444"
    }
  ]
}
```

#### Object Detection:
```json
{
  "class_count": 2,
  "total_classes_with_background": 3,
  "classes": [
    {
      "index": 0,
      "name": "__background__",
      "is_background": true
    },
    {
      "index": 1,
      "id": "3b29c0f4-5b4e-4f76-8a7e-128a1c9e89fa",
      "name": "scratch",
      "color": "#EF4444",
      "is_background": false
    },
    {
      "index": 2,
      "id": "9a12c8b1-3e4a-4b91-b1e9-923a4b8c71ef",
      "name": "dent",
      "color": "#F59E0B",
      "is_background": false
    }
  ],
  "background_class": {
    "index": 0,
    "name": "__background__"
  }
}
```

### 3.3 `preprocessing.json` Schema
```json
{
  "input_size": [224, 224],
  "channels": 3,
  "color_space": "RGB",
  "resize_policy": "bilinear",
  "normalization": {
    "mean": [0.485, 0.456, 0.406],
    "std": [0.229, 0.224, 0.225]
  },
  "coordinate_system": "pixel_xyxy"
}
```

### 3.4 `postprocessing.json` Schema (Object Detection)
```json
{
  "coordinate_format": "xyxy",
  "confidence_threshold": 0.5,
  "iou_threshold": 0.5,
  "max_detections": 100,
  "background_class_index": 0,
  "output_semantics": {
    "boxes": "Predicted bounding boxes in [x1, y1, x2, y2] image coordinates",
    "labels": "Predicted class indices (1..N correspond to user labels)",
    "scores": "Prediction confidence values in range [0, 1]"
  }
}
```

### 3.5 `export_manifest.json` Schema
```json
{
  "package_name": "mobilenet_v3_small_20261028_170820_mobilenet_v3_small",
  "exported_files": {
    "model.onnx": {
      "sha256": "f033ac6ed3a3f82e15d52cfe0e848b2e365e42fcaeecc8b0d5a07c8a743bddfe",
      "size_bytes": 6089255
    },
    "labels.json": { ... },
    "preprocessing.json": { ... },
    "validation_report.json": { ... },
    "model_metadata.json": { ... }
  },
  "verified_with_inference": true
}
```

---

## 4. Input & Output Contract Comparison

| Property | NOVA AI Trainer Classification | NOVA AI Trainer Object Detection | NOVA Machine Vision Platform Pipeline Type |
|---|---|---|---|
| **Input Image** | Numpy ndarray (H, W, 3) | Numpy ndarray (H, W, 3) | `ImageFrame` (OpenCV BGR numpy array) |
| **Color Space Conversion** | BGR -> RGB | BGR -> RGB | Automatically performed by Preprocessor |
| **Input Tensor Name** | `input` | `images` | Bound by `ModelManager` dynamically |
| **Input Tensor Shape** | `[1, 3, H, W]` (dynamic batch) | `[3, H, W]` | Resized and transposed `(H, W, 3) -> (3, H, W)` |
| **Normalization** | Pixel/255 -> `(x - mean) / std` | Pixel/255 -> `(x - mean) / std` | Applied using metadata mean/std |
| **Output Tensor Name** | `output` | `boxes`, `labels`, `scores` | Parsed by task-specific Adapter |
| **Raw Output Type** | Logits `[1, C]` | `boxes`: `[N, 4]`, `labels`: `[N]`, `scores`: `[N]` | Decoded to standardized dictionary |
| **Activation** | Softmax ($\sum p_i = 1$) | Confidence already in $[0, 1]$ | Softmax applied to classification logits |
| **Coordinates** | N/A | `[x1, y1, x2, y2]` in model scale | Scaled back to original image width/height: `x * (orig_w / input_w)` |
| **Class 0 Handling** | Standard class 0 | Background class (filtered out) | Detection ignores background class 0 |
| **Standard Output Port** | `classification_result` (`ClassificationResult`) | `detections` (`DetectionResult`) | Registered in Platform Contracts |

---

## 5. Security & Validation Rules

1. **Path Traversal Protection**: Reject package paths or archive entries with `..`, absolute paths outside target storage, or illegal characters.
2. **Checksum Integrity**: Recompute SHA-256 for each exported file and compare against `export_manifest.json`. Fail import if tampered.
3. **Schema Verification**: Validate presence of required fields in `model_metadata.json`, `labels.json`, `preprocessing.json`, and `postprocessing.json`.
4. **ONNX Graph Verification**:
   - Verify file is valid ONNX using `onnx.checker.check_model`.
   - Verify input tensor names match metadata.
   - Verify output tensor names match metadata.
   - Execute single synthetic inference on CPUExecutionProvider to ensure readiness.
5. **No Code Execution**: Model packages are strictly declarative JSON and ONNX graphs. Never deserialize pickled code or run arbitrary scripts.

---

## 6. Known Compatibility Considerations

1. **Hardware Provider Selection**:
   - `CPUExecutionProvider` is universally supported.
   - `CUDAExecutionProvider` is used only if CUDA runtime and compatible cuDNN libraries are initialized without errors.
2. **NMS Handling**:
   - Torchvision Faster R-CNN incorporates NMS internally in the ONNX graph; downstream does not duplicate NMS unless an explicit stricter IoU threshold is requested by the user.
3. **Aspect Ratio**:
   - AI Trainer uses direct bilinear resize to `[input_size, input_size]`.
   - When converting bounding boxes back to the original image coordinate frame, independent `scale_x = orig_w / input_w` and `scale_y = orig_h / input_h` factors must be applied.
