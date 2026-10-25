/**
 * Architecture Contracts & Pipeline Schema Definitions
 * 
 * Enforces:
 * 1. Versioned MVP/JSON format for vision pipelines
 * 2. Node contract with strict input/output port typing & validated config
 * 3. No arbitrary executable code inside pipeline JSON
 */

import { z } from 'zod';

export const DataTypeSchema = z.enum([
  // Legacy / Fundamental types
  'IMAGE',        // OpenCV BGR / Grayscale Mat
  'NUMPY_ARRAY',  // Raw tensor / matrix data
  'DETECTIONS',   // Bounding boxes, labels, confidences
  'CONTOURS',     // OpenCV contours list
  'CLASSIFICATION', // Class name + score
  'NUMBER',       // Scalar measurement / threshold
  'BOOLEAN',      // Pass / Fail decision flag
  'STRING',       // Serialized text / barcode data
  'JSON',         // Structured metadata

  // Standardized Long-term types
  'ImageFrame',           // Standard 2D visual inspection frame
  'MaskFrame',            // Binary / Segmentation mask
  'DetectionResult',      // Bounding boxes, keypoints, class IDs
  'ClassificationResult', // Prediction classes & confidence scores
  'OCRResult',            // Text recognition strings & bounding quadrilaterals
  'MeasurementResult',    // Metrology measurements (distance, radius, angle)
  'InspectionResult',     // Final Pass/Fail verdict with defect breakdown
  'Scalar',               // Single floating-point measurement or parameter
  'Boolean',              // Logical boolean flag
]);

export type DataType = z.infer<typeof DataTypeSchema>;

/**
 * Checks compatibility between output port and input port data types.
 * Supports exact match and established long-term type equivalences.
 */
export function areDataTypesCompatible(sourceType: DataType, targetType: DataType): boolean {
  if (sourceType === targetType) {
    return true;
  }

  // Equivalence clusters
  const isImageGroup = (t: DataType) => t === 'IMAGE' || t === 'ImageFrame';
  const isMaskGroup = (t: DataType) => t === 'MaskFrame';
  const isNumberGroup = (t: DataType) => t === 'NUMBER' || t === 'Scalar';
  const isBooleanGroup = (t: DataType) => t === 'BOOLEAN' || t === 'Boolean';
  const isDetectionGroup = (t: DataType) => t === 'DETECTIONS' || t === 'DetectionResult';
  const isClassificationGroup = (t: DataType) => t === 'CLASSIFICATION' || t === 'ClassificationResult';

  // ImageFrame / IMAGE compatibility
  if (isImageGroup(sourceType) && isImageGroup(targetType)) return true;

  // MaskFrame can feed into image processing ports as grayscale
  if (isMaskGroup(sourceType) && (isImageGroup(targetType) || isMaskGroup(targetType))) return true;

  // Numeric compatibility
  if (isNumberGroup(sourceType) && isNumberGroup(targetType)) return true;

  // Boolean compatibility
  if (isBooleanGroup(sourceType) && isBooleanGroup(targetType)) return true;

  // Detections compatibility
  if (isDetectionGroup(sourceType) && isDetectionGroup(targetType)) return true;

  // Classification compatibility
  if (isClassificationGroup(sourceType) && isClassificationGroup(targetType)) return true;

  // JSON can accept any structured inspection or measurement results
  if (targetType === 'JSON' && (
    sourceType === 'MeasurementResult' ||
    sourceType === 'InspectionResult' ||
    sourceType === 'OCRResult' ||
    sourceType === 'DetectionResult' ||
    sourceType === 'ClassificationResult'
  )) {
    return true;
  }

  return false;
}

export const PortDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dataType: DataTypeSchema,
  description: z.string().optional(),
  required: z.boolean().default(true),
});

export type PortDefinition = z.infer<typeof PortDefinitionSchema>;

export const NodeCategorySchema = z.enum([
  'ACQUISITION',   // Camera input, image loader
  'PREPROCESSING', // Resize, grayscale, blur, threshold, crop
  'INSPECTION',    // Blob detection, edge detection, template matching
  'AI_INFERENCE',  // ONNX Runtime classification/detection
  'LOGIC_GATE',    // Pass/Fail evaluation, threshold comparator
  'OUTPUT',        // Display, save image, CSV log
]);

export type NodeCategory = z.infer<typeof NodeCategorySchema>;

export const NodeRuntimeMetadataSchema = z.object({
  supported: z.boolean().default(true),
  minRuntimeVersion: z.string().optional(),
  handler: z.string().optional(),
  notes: z.string().optional(),
});

export type NodeRuntimeMetadata = z.infer<typeof NodeRuntimeMetadataSchema>;

export const NodeContractSchema = z.object({
  nodeType: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  displayName: z.string().min(1),
  category: NodeCategorySchema,
  description: z.string(),
  inputs: z.array(PortDefinitionSchema),
  outputs: z.array(PortDefinitionSchema),
  defaultConfig: z.record(z.any()),
  tags: z.array(z.string()).optional().default([]),
  runtime: NodeRuntimeMetadataSchema.optional(),
});

export type NodeContract = z.infer<typeof NodeContractSchema>;

export const PipelineNodeInstanceSchema = z.object({
  id: z.string().min(1),
  nodeType: z.string().min(1),
  name: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  config: z.record(z.any()).default({}),
});

export type PipelineNodeInstance = z.infer<typeof PipelineNodeInstanceSchema>;

export const PipelineEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  sourcePortId: z.string().min(1),
  targetNodeId: z.string().min(1),
  targetPortId: z.string().min(1),
});

export type PipelineEdge = z.infer<typeof PipelineEdgeSchema>;

export const PipelineDefinitionSchema = z.object({
  fileFormat: z.literal('MVP_PIPELINE').optional().default('MVP_PIPELINE'),
  schemaVersion: z.literal('1.0.0'),
  id: z.string().uuid().or(z.string().min(1)),
  name: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.string().datetime().or(z.string()),
  updatedAt: z.string().datetime().or(z.string()),
  metadata: z.record(z.any()).default({}),
  nodes: z.array(PipelineNodeInstanceSchema),
  edges: z.array(PipelineEdgeSchema),
});

export type PipelineDefinition = z.infer<typeof PipelineDefinitionSchema>;
