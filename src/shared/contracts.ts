/**
 * Architecture Contracts & Pipeline Schema Definitions
 * 
 * Enforces:
 * 1. Versioned JSON format for vision pipelines
 * 2. Node contract with strict input/output port typing & validated config
 * 3. No arbitrary executable code inside pipeline JSON
 */

import { z } from 'zod';

export const DataTypeSchema = z.enum([
  'IMAGE',        // OpenCV BGR / Grayscale Mat
  'NUMPY_ARRAY',  // Raw tensor / matrix data
  'DETECTIONS',   // Bounding boxes, labels, confidences
  'CONTOURS',     // OpenCV contours list
  'CLASSIFICATION', // Class name + score
  'NUMBER',       // Scalar measurement / threshold
  'BOOLEAN',      // Pass / Fail decision flag
  'STRING',       // Serialized text / barcode data
  'JSON',         // Structured metadata
]);

export type DataType = z.infer<typeof DataTypeSchema>;

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

export const NodeContractSchema = z.object({
  nodeType: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  displayName: z.string().min(1),
  category: NodeCategorySchema,
  description: z.string(),
  inputs: z.array(PortDefinitionSchema),
  outputs: z.array(PortDefinitionSchema),
  defaultConfig: z.record(z.any()),
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
