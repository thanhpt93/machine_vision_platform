export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  timestamp: string;
  uptime_seconds: number;
  python_version: string;
  platform: string;
}

export interface HealthCheckResult {
  data: HealthStatus | null;
  latencyMs: number;
  error: string | null;
  checkedAt: string;
}
