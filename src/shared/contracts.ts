/**
 * Architecture Contracts & Pipeline Schema Definitions
 * 
 * Enforces:
 * 1. Versioned MVP/JSON format for vision pipelines
 * 2. Node contract with strict input/output port typing & validated config
 * 3. 9 Traditional Computer Vision categories
 * 4. No arbitrary executable code inside pipeline JSON
 * 5. Pipeline lifecycle states (Draft -> Validated -> Released -> Archived)
 * 6. Immutable Release Snapshot contracts and .mvp migration support
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
  'ContourSet',           // Hierarchical geometric contours list
  'FeatureSet',           // Keypoints, descriptors, geometric features
  'DetectionResult',      // Bounding boxes, keypoints, class IDs
  'ClassificationResult', // Prediction classes & confidence scores
  'OCRResult',            // Text recognition strings & bounding quadrilaterals
  'MeasurementResult',    // Metrology measurements (distance, radius, angle)
  'InspectionResult',     // Final Pass/Fail verdict with defect breakdown
  'VisualizationResult',  // Rendered visual inspection card / annotated frame
  'FileReference',        // Disk path or URI reference
  'Scalar',               // Single floating-point measurement or parameter
  'Boolean',              // Logical boolean flag
  'String',               // Text label or message
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
  const isImageGroup = (t: DataType) => t === 'IMAGE' || t === 'ImageFrame' || t === 'VisualizationResult';
  const isMaskGroup = (t: DataType) => t === 'MaskFrame';
  const isNumberGroup = (t: DataType) => t === 'NUMBER' || t === 'Scalar';
  const isBooleanGroup = (t: DataType) => t === 'BOOLEAN' || t === 'Boolean';
  const isStringGroup = (t: DataType) => t === 'STRING' || t === 'String' || t === 'FileReference';
  const isContourGroup = (t: DataType) => t === 'CONTOURS' || t === 'ContourSet';
  const isDetectionGroup = (t: DataType) => t === 'DETECTIONS' || t === 'DetectionResult' || t === 'FeatureSet';
  const isClassificationGroup = (t: DataType) => t === 'CLASSIFICATION' || t === 'ClassificationResult';

  // ImageFrame / IMAGE / VisualizationResult compatibility
  if (isImageGroup(sourceType) && isImageGroup(targetType)) return true;

  // MaskFrame can feed into image processing ports as grayscale
  if (isMaskGroup(sourceType) && (isImageGroup(targetType) || isMaskGroup(targetType))) return true;

  // Numeric compatibility
  if (isNumberGroup(sourceType) && isNumberGroup(targetType)) return true;

  // Boolean compatibility
  if (isBooleanGroup(sourceType) && isBooleanGroup(targetType)) return true;

  // String compatibility
  if (isStringGroup(sourceType) && isStringGroup(targetType)) return true;

  // Contours compatibility
  if (isContourGroup(sourceType) && isContourGroup(targetType)) return true;

  // Detections compatibility
  if (isDetectionGroup(sourceType) && isDetectionGroup(targetType)) return true;

  // Contours / Features can feed into detection/overlay inputs as well
  if ((sourceType === 'ContourSet' || sourceType === 'FeatureSet') && (targetType === 'DetectionResult' || targetType === 'FeatureSet')) return true;

  // Classification compatibility
  if (isClassificationGroup(sourceType) && isClassificationGroup(targetType)) return true;

  // Generic JSON accepts any structured metadata
  if (targetType === 'JSON' && (
    sourceType === 'MeasurementResult' ||
    sourceType === 'InspectionResult' ||
    sourceType === 'OCRResult' ||
    sourceType === 'DetectionResult' ||
    sourceType === 'ClassificationResult' ||
    sourceType === 'ContourSet' ||
    sourceType === 'FeatureSet'
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

/**
 * Standardized 9 Industrial Machine Vision Categories (Traditional CV + Extensibility)
 */
export const NodeCategorySchema = z.enum([
  // 9 Canonical Categories
  'image_acquisition',
  'image_preparation',
  'image_processing',
  'segmentation',
  'feature_extraction',
  'measurement_metrology',
  'decision_inspection_logic',
  'visualization',
  'data_logging',

  // Extensibility
  'ai_inference',

  // Legacy uppercase aliases for backward compatibility with existing .mvp files & tests
  'ACQUISITION',
  'PREPROCESSING',
  'INSPECTION',
  'AI_INFERENCE',
  'LOGIC_GATE',
  'OUTPUT',
]);

export type NodeCategory = z.infer<typeof NodeCategorySchema>;

export interface CategoryMetadata {
  id: NodeCategory;
  name: string;
  description: string;
  icon: string;
  displayOrder: number;
}

export const CATEGORY_CATALOG: CategoryMetadata[] = [
  {
    id: 'image_acquisition',
    name: 'Image Acquisition',
    description: 'File reading, camera inputs, folder loaders, and frame buffers',
    icon: 'camera',
    displayOrder: 1,
  },
  {
    id: 'image_preparation',
    name: 'Image Preparation',
    description: 'ROI cropping, color conversion, resizing, filtering, and normalization',
    icon: 'sliders',
    displayOrder: 2,
  },
  {
    id: 'image_processing',
    name: 'Image Processing',
    description: 'Thresholding, morphology, edge detection, Hough, and template matching',
    icon: 'zap',
    displayOrder: 3,
  },
  {
    id: 'segmentation',
    name: 'Segmentation',
    description: 'Connected components, watershed, GrabCut, color and mask logic',
    icon: 'scissors',
    displayOrder: 4,
  },
  {
    id: 'feature_extraction',
    name: 'Feature Extraction',
    description: 'Contour detection, blob analysis, shape descriptors, and corner detection',
    icon: 'shapes',
    displayOrder: 5,
  },
  {
    id: 'measurement_metrology',
    name: 'Measurement & Metrology',
    description: 'Distances, calipers, circle/line fitting, angles, and physical unit calibration',
    icon: 'ruler',
    displayOrder: 6,
  },
  {
    id: 'decision_inspection_logic',
    name: 'Decision & Inspection Logic',
    description: 'Tolerance checks, boolean logic, count/presence checks, and OK/NG verdicts',
    icon: 'check-circle-2',
    displayOrder: 7,
  },
  {
    id: 'visualization',
    name: 'Visualization',
    description: 'Result viewers, graphic overlays, annotations, false-color masks, and histograms',
    icon: 'eye',
    displayOrder: 8,
  },
  {
    id: 'data_logging',
    name: 'Data & Logging',
    description: 'Image saving, defect archiving, CSV exports, and execution audit history',
    icon: 'database',
    displayOrder: 9,
  },
  {
    id: 'ai_inference',
    name: 'AI Inference',
    description: 'Deep learning classification and object detection inference models',
    icon: 'brain',
    displayOrder: 10,
  },
];

/**
 * Normalizes legacy category names to canonical category IDs
 */
export function normalizeCategory(cat: NodeCategory): NodeCategory {
  switch (cat) {
    case 'ACQUISITION':
      return 'image_acquisition';
    case 'PREPROCESSING':
      return 'image_preparation';
    case 'INSPECTION':
      return 'feature_extraction';
    case 'LOGIC_GATE':
      return 'decision_inspection_logic';
    case 'OUTPUT':
      return 'visualization';
    case 'AI_INFERENCE':
      return 'ai_inference';
    default:
      return cat;
  }
}

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

/**
 * Pipeline Lifecycle States (Phase 2 Production Foundation)
 * Draft -> Validated -> Released -> Archived
 */
export const PipelineLifecycleStatusSchema = z.enum([
  'Draft',
  'Validated',
  'Released',
  'Archived',
]);

export type PipelineLifecycleStatus = z.infer<typeof PipelineLifecycleStatusSchema>;

/**
 * Validates whether a pipeline lifecycle state transition is allowed.
 * - Draft -> Validated (only when validation passes)
 * - Validated -> Draft (any edit returns pipeline to Draft)
 * - Validated -> Released (creates an immutable release snapshot)
 * - Released -> Archived (retires a release without deleting its artifact)
 */
export function isLifecycleTransitionAllowed(
  fromStatus: PipelineLifecycleStatus,
  toStatus: PipelineLifecycleStatus
): boolean {
  if (fromStatus === toStatus) return true;
  switch (fromStatus) {
    case 'Draft':
      return toStatus === 'Validated';
    case 'Validated':
      return toStatus === 'Draft' || toStatus === 'Released';
    case 'Released':
      return toStatus === 'Archived' || toStatus === 'Draft';
    case 'Archived':
      return false;
    default:
      return false;
  }
}

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

/**
 * Immutable Release Snapshot Contract (Phase 2)
 */
export const ReleaseSnapshotSchema = z.object({
  pipeline_id: z.string().min(1),
  release_version: z.string().min(1),
  schema_version: z.literal('1.0.0'),
  status: z.enum(['Released', 'Archived']).default('Released'),
  is_active: z.boolean().default(false),
  pipeline: PipelineDefinitionSchema,
  node_versions: z.record(z.string(), z.string()),
  created_at: z.string().min(1),
  release_notes: z.string().default(''),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});

export type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>;

/**
 * Migrates older or compatible .mvp pipeline JSON payloads to schemaVersion "1.0.0"
 * while preserving all existing fields and rejecting unsupported future major versions.
 */
export function migratePipelineDefinition(rawInput: unknown): {
  success: boolean;
  pipeline?: PipelineDefinition;
  migratedFromVersion?: string;
  error?: string;
} {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      success: false,
      error: 'Pipeline payload must be a JSON object.',
    };
  }

  const raw = { ...(rawInput as Record<string, any>) };
  const rawVersion = raw.schemaVersion ?? raw.schema_version ?? '1.0.0';

  if (typeof rawVersion !== 'string') {
    return {
      success: false,
      error: 'Invalid schemaVersion type: expected string.',
    };
  }

  // Supported legacy versions that can be safely upgraded to 1.0.0
  const migratableVersions = new Set(['0.1.0', '0.9.0', '1.0', '1.0.0']);
  if (!migratableVersions.has(rawVersion)) {
    return {
      success: false,
      error: `Unsupported .mvp schemaVersion "${rawVersion}". Supported version is "1.0.0".`,
    };
  }

  const now = new Date().toISOString();
  const migratedFromVersion = rawVersion !== '1.0.0' ? rawVersion : undefined;

  // Strip transient runtime execution fields if someone accidentally included them in raw JSON
  const cleanMetadata = { ...(typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {}) };
  delete cleanMetadata.__transientExecutionState;
  delete cleanMetadata.__nodeExecutionStates;

  const normalizedCandidate: Record<string, any> = {
    ...raw,
    fileFormat: 'MVP_PIPELINE',
    schemaVersion: '1.0.0',
    id: raw.id || `pipeline_${Math.random().toString(36).substring(2, 9)}`,
    name: raw.name || 'Migrated Pipeline',
    description: typeof raw.description === 'string' ? raw.description : '',
    createdAt: raw.createdAt || raw.created_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || now,
    metadata: cleanMetadata,
    nodes: Array.isArray(raw.nodes)
      ? raw.nodes.map((n: any) => ({
          id: n?.id ?? '',
          nodeType: n?.nodeType ?? n?.node_type ?? '',
          name: n?.name ?? n?.id ?? 'Unnamed Node',
          position: {
            x: typeof n?.position?.x === 'number' ? n.position.x : 0,
            y: typeof n?.position?.y === 'number' ? n.position.y : 0,
          },
          config: typeof n?.config === 'object' && n?.config !== null ? { ...n.config } : {},
        }))
      : raw.nodes,
    edges: Array.isArray(raw.edges)
      ? raw.edges.map((e: any) => ({
          id: e?.id ?? '',
          sourceNodeId: e?.sourceNodeId ?? e?.source_node_id ?? e?.source ?? '',
          sourcePortId: e?.sourcePortId ?? e?.source_port_id ?? e?.sourceHandle ?? '',
          targetNodeId: e?.targetNodeId ?? e?.target_node_id ?? e?.target ?? '',
          targetPortId: e?.targetPortId ?? e?.target_port_id ?? e?.targetHandle ?? '',
        }))
      : raw.edges,
  };

  const parsed = PipelineDefinitionSchema.safeParse(normalizedCandidate);
  if (!parsed.success) {
    const errorMsg = parsed.error.errors
      .map((e) => `${e.path.join('.') || 'root'}: ${e.message}`)
      .join('; ');
    return {
      success: false,
      error: `Pipeline schema validation failed: ${errorMsg}`,
    };
  }

  return {
    success: true,
    pipeline: parsed.data,
    migratedFromVersion,
  };
}
