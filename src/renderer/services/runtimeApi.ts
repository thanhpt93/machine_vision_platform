import { HealthCheckResult, HealthStatus } from '../types/api';

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
          'Accept': 'application/json',
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
}

export const runtimeApi = new RuntimeApiService();
