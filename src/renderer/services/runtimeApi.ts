import {
  HealthCheckResult,
  HealthStatus,
  InputImageMetadata,
  InspectionRecord,
  ProductionReleaseDetails,
  ProductionReleaseSummary,
} from '../types/api';

const DEFAULT_RUNTIME_URL = 'http://127.0.0.1:8000';

export class RuntimeApiService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else if (typeof window !== 'undefined' && window.electronAPI?.getRuntimeDefaultUrl) {
      this.baseUrl = window.electronAPI.getRuntimeDefaultUrl();
    } else {
      this.baseUrl = DEFAULT_RUNTIME_URL;
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    const checkedAt = new Date().toISOString();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        return {
          data: null,
          latencyMs,
          error: `Runtime returned HTTP ${response.status}: ${response.statusText}`,
          checkedAt,
        };
      }

      const data: HealthStatus = await response.json();
      return {
        data,
        latencyMs,
        error: null,
        checkedAt,
      };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - startTime);
      const errorMessage = err instanceof Error ? err.message : 'Unknown network error';
      return {
        data: null,
        latencyMs,
        error: errorMessage.includes('aborted')
          ? 'Connection timed out after 4000ms'
          : `Failed to connect to ${this.baseUrl}: ${errorMessage}`,
        checkedAt,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 2 & 3 Production Mode & Release Management APIs
  // ---------------------------------------------------------------------------

  public async listProductionReleases(options?: {
    pipelineId?: string;
    includeArchived?: boolean;
  }): Promise<{ releases: ProductionReleaseSummary[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.pipelineId) params.set('pipeline_id', options.pipelineId);
    if (options?.includeArchived) params.set('include_archived', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';

    const response = await fetch(`${this.baseUrl}/api/production/releases${qs}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const detail = await this.extractErrorMessage(response);
      throw new Error(detail);
    }

    return response.json();
  }

  public async getProductionReleaseDetails(
    pipelineId: string,
    releaseVersion: string
  ): Promise<ProductionReleaseDetails> {
    const response = await fetch(
      `${this.baseUrl}/api/production/releases/${encodeURIComponent(pipelineId)}/${encodeURIComponent(releaseVersion)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }
    );

    if (!response.ok) {
      const detail = await this.extractErrorMessage(response);
      throw new Error(detail);
    }

    return response.json();
  }

  public async createReleaseFromEditor(payload: {
    pipeline: Record<string, any>;
    releaseVersion: string;
    releaseNotes?: string;
    activate?: boolean;
  }): Promise<ProductionReleaseDetails> {
    const response = await fetch(`${this.baseUrl}/api/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        pipeline: payload.pipeline,
        release_version: payload.releaseVersion,
        release_notes: payload.releaseNotes || '',
        activate: payload.activate ?? true,
      }),
    });

    if (!response.ok) {
      const detail = await this.extractErrorMessage(response);
      throw new Error(detail);
    }

    return response.json();
  }

  public async getInputImageInfo(imagePath: string): Promise<InputImageMetadata> {
    const params = new URLSearchParams({ image_path: imagePath });
    const response = await fetch(`${this.baseUrl}/api/production/images/info?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const detail = await this.extractErrorMessage(response);
      throw new Error(detail);
    }

    return response.json();
  }

  public getInputImagePreviewUrl(imagePath: string): string {
    const params = new URLSearchParams({ image_path: imagePath });
    return `${this.baseUrl}/api/production/images/preview?${params.toString()}`;
  }

  public getInspectionNodePreviewUrl(inspectionId: string, nodeId: string): string {
    return `${this.baseUrl}/api/production/inspections/${encodeURIComponent(inspectionId)}/nodes/${encodeURIComponent(nodeId)}/preview`;
  }

  public async startInspection(payload: {
    pipelineId: string;
    releaseVersion?: string;
    imagePath: string;
    signal?: AbortSignal;
  }): Promise<InspectionRecord> {
    const response = await fetch(`${this.baseUrl}/api/production/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        pipeline_id: payload.pipelineId,
        release_version: payload.releaseVersion,
        image_path: payload.imagePath,
      }),
      signal: payload.signal,
    });

    if (!response.ok) {
      const detail = await this.extractErrorMessage(response);
      throw new Error(detail);
    }

    return response.json();
  }

  public async getInspectionStatus(inspectionId: string): Promise<{
    inspection_id: string;
    pipeline_id: string;
    release_version: string;
    execution_status: string;
    inspection_outcome: string | null;
    created_at: string;
    started_at?: string | null;
    completed_at?: string | null;
    duration_ms: number;
    error_details?: { code: string; message: string; failed_node_id?: string | null } | null;
  }> {
    const response = await fetch(
      `${this.baseUrl}/api/production/inspections/${encodeURIComponent(inspectionId)}/status`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }
    );

    if (!response.ok) {
      const detail = await this.extractErrorMessage(response);
      throw new Error(detail);
    }

    return response.json();
  }

  public async getInspectionResult(inspectionId: string): Promise<InspectionRecord> {
    const response = await fetch(
      `${this.baseUrl}/api/production/inspections/${encodeURIComponent(inspectionId)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }
    );

    if (!response.ok) {
      const detail = await this.extractErrorMessage(response);
      throw new Error(detail);
    }

    return response.json();
  }

  public async listInspections(limit: number = 100): Promise<{
    inspections: InspectionRecord[];
    total: number;
  }> {
    const response = await fetch(`${this.baseUrl}/api/production/inspections?limit=${limit}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const detail = await this.extractErrorMessage(response);
      throw new Error(detail);
    }

    return response.json();
  }

  public async cancelInspection(inspectionId: string): Promise<InspectionRecord> {
    const response = await fetch(
      `${this.baseUrl}/api/production/inspections/${encodeURIComponent(inspectionId)}/cancel`,
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
      }
    );

    if (!response.ok) {
      const detail = await this.extractErrorMessage(response);
      throw new Error(detail);
    }

    return response.json();
  }

  private async extractErrorMessage(response: Response): Promise<string> {
    try {
      const body = await response.json();
      if (body && typeof body.detail === 'string') {
        return body.detail;
      }
      if (body && typeof body.error === 'string') {
        return body.error;
      }
    } catch {
      // Fallback to text or statusText
    }
    return `HTTP ${response.status}: ${response.statusText || 'Request failed'}`;
  }
}

export const runtimeApi = new RuntimeApiService();
