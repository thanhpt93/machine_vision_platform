export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  timestamp: string;
  uptime_seconds: number;
  python_version: string;
  platform: string;
  supported_nodes_count?: number;
  is_inspection_running?: boolean;
  active_inspection_id?: string | null;
}

export interface HealthCheckResult {
  data: HealthStatus | null;
  latencyMs: number;
  error: string | null;
  checkedAt: string;
}

/**
 * Phase 2 & 3 Production Mode Types (Strictly separating ExecutionStatus from InspectionOutcome)
 */
export type ExecutionStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type InspectionOutcome = 'OK' | 'NG' | 'UNKNOWN';

export interface ProductionReleaseInputRequirements {
  requires_image_file: boolean;
  supported_formats: string[];
}

export interface ProductionReleaseSummary {
  pipeline_id: string;
  pipeline_name: string;
  description?: string;
  release_version: string;
  schema_version: string;
  status: 'Released' | 'Archived';
  is_active: boolean;
  eligible_for_execution?: boolean;
  created_at: string;
  archived_at?: string | null;
  release_notes: string;
  checksum: string;
  valid_integrity: boolean;
  integrity_message?: string;
  node_count?: number;
  edge_count?: number;
  node_versions?: Record<string, string>;
  input_requirements?: ProductionReleaseInputRequirements;
}

export interface ProductionReleaseDetails {
  pipeline_id: string;
  release_version: string;
  schema_version: string;
  status: 'Released' | 'Archived';
  is_active: boolean;
  pipeline: {
    id: string;
    name: string;
    description?: string;
    schemaVersion: string;
    nodes: Array<{
      id: string;
      nodeType: string;
      name: string;
      position: { x: number; y: number };
      config: Record<string, any>;
    }>;
    edges: Array<{
      id: string;
      sourceNodeId: string;
      sourcePortId: string;
      targetNodeId: string;
      targetPortId: string;
    }>;
  };
  node_versions: Record<string, string>;
  created_at: string;
  archived_at?: string | null;
  release_notes: string;
  checksum: string;
  integrity?: {
    pipeline_id: string;
    release_version: string;
    valid_integrity: boolean;
    stored_checksum: string;
    computed_checksum: string;
    status: string;
    is_active: boolean;
    message: string;
  };
}

export interface InputImageMetadata {
  filename: string;
  resolved_path: string;
  file_size_bytes: number;
  width: number;
  height: number;
  channels: number;
}

export interface InspectionNodeSummary {
  node_id: string;
  node_type: string;
  status: string;
  duration_ms: number;
  error?: string | null;
  output_metadata: Record<string, any>;
  has_preview: boolean;
  preview_url?: string | null;
}

export interface InspectionErrorDetails {
  code: string;
  message: string;
  failed_node_id?: string | null;
}

export interface InspectionDecisionItem {
  node_id: string;
  node_name: string;
  node_type: string;
  outcome: InspectionOutcome;
  details: Record<string, any>;
}

export interface InspectionMeasurementItem {
  node_name: string;
  node_type: string;
  metrics: Record<string, any>;
}

export interface InspectionResultData {
  has_explicit_decision?: boolean;
  decisions?: InspectionDecisionItem[];
  measurements?: Record<string, InspectionMeasurementItem>;
}

export interface InspectionRecord {
  inspection_id: string;
  execution_id: string;
  pipeline_id: string;
  release_version: string;
  release_checksum: string;
  input_image: InputImageMetadata;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  execution_status: ExecutionStatus;
  inspection_outcome: InspectionOutcome | null;
  duration_ms: number;
  node_results: Record<string, InspectionNodeSummary>;
  result_data: InspectionResultData;
  preview_references: Record<string, string>;
  error_details?: InspectionErrorDetails | null;
}
