import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import { useProductionStore } from '../store/productionStore';
import { AppInfo } from '../../../main/preload';
import { runtimeApi } from '../../services/runtimeApi';
import {
  ExecutionStatusBadge,
  InspectionOutcomeBadge,
} from '../components/InspectionStatusBadges';
import { getEditionMetadata } from '../../../shared/editionConfig';

export const SystemStatusPage: React.FC = () => {
  const healthResult = useProductionStore((s) => s.healthResult);
  const isCheckingHealth = useProductionStore((s) => s.isCheckingHealth);
  const refreshHealth = useProductionStore((s) => s.refreshHealth);

  const eligibleReleases = useProductionStore((s) => s.eligibleReleases);
  const allReleases = useProductionStore((s) => s.allReleases);
  const fetchReleases = useProductionStore((s) => s.fetchReleases);

  const inspectionsHistory = useProductionStore((s) => s.inspectionsHistory);
  const isRunningInspection = useProductionStore((s) => s.isRunningInspection);
  const currentInspection = useProductionStore((s) => s.currentInspection);

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [isRestartingRuntime, setIsRestartingRuntime] = useState(false);

  const editionMeta = getEditionMetadata(appInfo?.deploymentMode);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.getAppInfo) {
      const p = window.electronAPI.getAppInfo();
      if (p && typeof p.then === 'function') {
        p.then(setAppInfo).catch(() => {});
      }
    }
  }, []);

  const isRuntimeConnected = Boolean(healthResult?.data && !healthResult?.error);
  const lastInspection = inspectionsHistory.length > 0 ? inspectionsHistory[0] : null;

  const handleRefresh = async () => {
    await Promise.all([refreshHealth(), fetchReleases()]);
  };

  const handleRestartRuntime = async () => {
    setIsRestartingRuntime(true);
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.restartRuntimeProcess) {
        await window.electronAPI.restartRuntimeProcess();
      }
      await Promise.all([refreshHealth(), fetchReleases()]);
    } finally {
      setIsRestartingRuntime(false);
    }
  };

  return (
    <div
      className="h-full w-full overflow-y-auto bg-slate-100 dark:bg-slate-950 p-5 space-y-5"
      data-testid="system-status-page"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2">
            <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>System & Runtime Status</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Verified local workstation runtime connectivity, API health, and execution engine state.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isCheckingHealth}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin text-blue-600' : ''}`} />
            <span>Run Health Probe</span>
          </button>
        </div>
      </div>

      {/* Degraded / Offline Banner if Runtime is unreachable */}
      {!isRuntimeConnected && (
        <div
          className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 flex items-start justify-between gap-4 text-rose-900 dark:text-rose-200"
          data-testid="system-status-degraded-alert"
        >
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-bold text-sm">
                Degraded State: Python Vision Runtime Unreachable
              </div>
              <p>
                The desktop client could not establish a connection to the local FastAPI Runtime at{' '}
                <code className="font-mono bg-rose-100 dark:bg-rose-900/60 px-1 py-0.5 rounded">
                  {runtimeApi.getBaseUrl()}
                </code>
                . Production inspections are disabled until connectivity is restored.
              </p>
              {healthResult?.error && (
                <div className="font-mono text-[11px] text-rose-700 dark:text-rose-300 pt-1">
                  Error Details: {healthResult.error}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleRestartRuntime}
            disabled={isRestartingRuntime}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-semibold shrink-0 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRestartingRuntime ? 'animate-spin' : ''}`} />
            <span>{isRestartingRuntime ? 'Starting Runtime...' : 'Retry / Start Runtime'}</span>
          </button>
        </div>
      )}

      {/* Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Python Vision Runtime Connection */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Python Vision Runtime
              </h3>
            </div>
            {isRuntimeConnected ? (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3" />
                <span>Connected</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                <XCircle className="w-3 h-3" />
                <span>Disconnected</span>
              </span>
            )}
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Endpoint Base URL</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {runtimeApi.getBaseUrl()}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">API Health Status</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {healthResult?.data?.status ? healthResult.data.status.toUpperCase() : 'OFFLINE'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Runtime Version</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {healthResult?.data?.version || '—'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Python Runtime</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {healthResult?.data?.python_version
                  ? `v${healthResult.data.python_version}`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Ping Latency</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {isRuntimeConnected ? `${healthResult?.latencyMs ?? 0} ms` : '—'}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Last Health Check</span>
              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                {healthResult?.checkedAt
                  ? new Date(healthResult.checkedAt).toLocaleTimeString()
                  : 'Never'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Inspection Engine & Release Repository State */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Execution Engine State
              </h3>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {isRunningInspection ? 'BUSY (RUNNING)' : 'IDLE (READY)'}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Current Workstation State</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {isRunningInspection ? 'Executing Inspection' : 'Ready for Trigger'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Eligible Released Pipelines</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                {eligibleReleases.length}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Total Stored Releases</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {allReleases.length}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Last Inspection Time</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {lastInspection
                  ? new Date(lastInspection.started_at || lastInspection.created_at).toLocaleString()
                  : 'None recorded'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Last Inspection Status</span>
              {lastInspection ? (
                <div className="flex items-center space-x-1.5">
                  <ExecutionStatusBadge status={lastInspection.execution_status} size="sm" />
                  <InspectionOutcomeBadge
                    outcome={lastInspection.inspection_outcome}
                    executionStatus={lastInspection.execution_status}
                    size="sm"
                  />
                </div>
              ) : (
                <span className="font-mono text-slate-400">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Desktop Host Environment */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Desktop Host Environment
              </h3>
            </div>
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
              <ShieldCheck className="w-3 h-3" />
              <span>IPC Isolated</span>
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Application Edition</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {editionMeta.editionName}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Deployment Mode</span>
              <span className="font-mono font-bold uppercase text-blue-600 dark:text-blue-400">
                {editionMeta.deploymentMode}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">Application Version</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                v{appInfo?.version || '0.1.0'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-500">OS Platform & Arch</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {appInfo?.platform || 'win32'} ({appInfo?.arch || 'x64'})
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Electron Runtime</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                v{appInfo?.electronVersion || '35.0.0'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active / Last Inspection Diagnostic Summary */}
      {currentInspection && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs">
          <div className="flex items-center space-x-2 mb-3">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Active Session Inspection Diagnostics
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">Inspection ID</div>
              <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {currentInspection.inspection_id}
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">Pipeline Release</div>
              <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                {currentInspection.pipeline_id} (v{currentInspection.release_version})
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">Execution Timing</div>
              <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {currentInspection.duration_ms.toFixed(2)} ms
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">Nodes Evaluated</div>
              <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                {Object.keys(currentInspection.node_results || {}).length} nodes
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
