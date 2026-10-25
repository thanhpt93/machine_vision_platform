import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  FileImage,
  HelpCircle,
  Layers,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useProductionStore } from '../store/productionStore';
import {
  ExecutionStatusBadge,
  InspectionOutcomeBadge,
} from '../components/InspectionStatusBadges';
import { InspectionRecord } from '../../types/api';

function isTodayIso(isoStr: string | null | undefined): boolean {
  if (!isoStr) return false;
  try {
    const dt = new Date(isoStr);
    const now = new Date();
    return (
      dt.getFullYear() === now.getFullYear() &&
      dt.getMonth() === now.getMonth() &&
      dt.getDate() === now.getDate()
    );
  } catch {
    return false;
  }
}

export const ProductionDashboard: React.FC = () => {
  const healthResult = useProductionStore((s) => s.healthResult);
  const isCheckingHealth = useProductionStore((s) => s.isCheckingHealth);
  const refreshHealth = useProductionStore((s) => s.refreshHealth);

  const eligibleReleases = useProductionStore((s) => s.eligibleReleases);
  const inspectionsHistory = useProductionStore((s) => s.inspectionsHistory);
  const isLoadingHistory = useProductionStore((s) => s.isLoadingHistory);
  const fetchInspectionsHistory = useProductionStore((s) => s.fetchInspectionsHistory);
  const fetchReleases = useProductionStore((s) => s.fetchReleases);

  const setActivePage = useProductionStore((s) => s.setActivePage);
  const viewInspectionRecord = useProductionStore((s) => s.viewInspectionRecord);

  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const isRuntimeConnected = Boolean(healthResult?.data && !healthResult?.error);

  // Real statistics computed strictly from actual inspection history records
  const stats = useMemo(() => {
    const todayRecords = inspectionsHistory.filter((r) => isTodayIso(r.started_at || r.created_at));
    const targetPool = todayRecords.length > 0 ? todayRecords : inspectionsHistory;
    const isTodayPool = todayRecords.length > 0;

    let okCount = 0;
    let ngCount = 0;
    let unknownCount = 0;
    let failedExecCount = 0;

    for (const rec of targetPool) {
      if (rec.execution_status === 'FAILED') {
        failedExecCount += 1;
      }
      if (rec.execution_status === 'COMPLETED') {
        if (rec.inspection_outcome === 'OK') okCount += 1;
        else if (rec.inspection_outcome === 'NG') ngCount += 1;
        else unknownCount += 1;
      } else if (rec.inspection_outcome === 'NG') {
        ngCount += 1;
      }
    }

    return {
      totalToday: todayRecords.length,
      totalAll: inspectionsHistory.length,
      isTodayPool,
      okCount,
      ngCount,
      unknownCount,
      failedExecCount,
    };
  }, [inspectionsHistory]);

  const sortedRecent = useMemo(() => {
    const copy = [...inspectionsHistory];
    copy.sort((a, b) => {
      const tA = new Date(a.started_at || a.created_at || 0).getTime();
      const tB = new Date(b.started_at || b.created_at || 0).getTime();
      return sortOrder === 'desc' ? tB - tA : tA - tB;
    });
    return copy;
  }, [inspectionsHistory, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedRecent.length / pageSize));
  const paginatedRecent = sortedRecent.slice((page - 1) * pageSize, page * pageSize);

  const lastInspection = inspectionsHistory.length > 0 ? inspectionsHistory[0] : null;
  const activeRelease =
    eligibleReleases.find((r) => r.is_active) ||
    (eligibleReleases.length > 0 ? eligibleReleases[0] : null);

  const handleRefreshAll = async () => {
    await Promise.all([refreshHealth(), fetchReleases(), fetchInspectionsHistory()]);
  };

  const handleOpenRecord = (record: InspectionRecord) => {
    viewInspectionRecord(record, 'inspection');
  };

  return (
    <div
      className="h-full w-full overflow-y-auto p-5 space-y-5 bg-slate-100 dark:bg-slate-950"
      data-testid="production-dashboard-page"
    >
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Production Workstation Dashboard
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Real-time inspection summary, runtime connectivity, and recent workstation activity.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isLoadingHistory || isCheckingHealth}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isLoadingHistory || isCheckingHealth ? 'animate-spin text-blue-600' : ''
              }`}
            />
            <span>Refresh Data</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage('inspection')}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Open Inspection Workstation</span>
          </button>
        </div>
      </div>

      {/* 5 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Total Inspections Today */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Inspections Today
            </span>
            <div className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <FileImage className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span
              className="text-2xl font-bold font-mono text-slate-900 dark:text-white"
              data-testid="dashboard-total-today"
            >
              {stats.totalToday}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ({stats.totalAll} total recorded)
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            Actual runtime inspection records
          </div>
        </div>

        {/* Card 2: OK Count */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              OK Outcome
            </span>
            <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span
              className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400"
              data-testid="dashboard-ok-count"
            >
              {stats.okCount}
            </span>
            {stats.unknownCount > 0 && (
              <span
                className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center space-x-0.5"
                title="Completed inspections without an explicit pass/fail decision node report UNKNOWN outcome"
              >
                <HelpCircle className="w-3 h-3 mr-0.5 inline" />
                {stats.unknownCount} UNKNOWN
              </span>
            )}
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {stats.isTodayPool ? 'Today verified OK decisions' : 'All recorded OK decisions'}
          </div>
        </div>

        {/* Card 3: NG Count */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              NG Outcome
            </span>
            <div className="p-1.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span
              className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-400"
              data-testid="dashboard-ng-count"
            >
              {stats.ngCount}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {stats.isTodayPool ? 'Today verified NG rejects' : 'All recorded NG rejects'}
          </div>
        </div>

        {/* Card 4: Failed Executions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Failed Executions
            </span>
            <div className="p-1.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span
              className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400"
              data-testid="dashboard-failed-count"
            >
              {stats.failedExecCount}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            Runtime / pipeline execution errors
          </div>
        </div>

        {/* Card 5: Current Runtime Status */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Runtime Status
            </span>
            <div
              className={`p-1.5 rounded-md ${
                isRuntimeConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
              }`}
            >
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-center space-x-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isRuntimeConnected ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'
              }`}
            />
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              {isRuntimeConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
            {isRuntimeConnected
              ? `Python ${healthResult?.data?.python_version} (${healthResult?.latencyMs}ms)`
              : healthResult?.error || 'Runtime unreachable'}
          </div>
        </div>
      </div>

      {/* Main Content Grid: Recent Inspections Table (Left 8 cols) + Runtime Status Card (Right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Recent Inspections Table */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xs flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/80">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Recent Inspections
              </h3>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {inspectionsHistory.length}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
                className="text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Sort: {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
              </button>
              <button
                type="button"
                onClick={() => setActivePage('history')}
                className="flex items-center space-x-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>Full History</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {paginatedRecent.length === 0 ? (
            <div className="p-8 text-center">
              <FileImage className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No Inspections Recorded Yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                Select a released pipeline and an input image on the Inspection page to run your first
                production inspection.
              </p>
              <button
                type="button"
                onClick={() => setActivePage('inspection')}
                className="mt-4 inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start First Inspection</span>
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Pipeline & Version</th>
                      <th className="py-2.5 px-3">Image File</th>
                      <th className="py-2.5 px-3">Execution</th>
                      <th className="py-2.5 px-3">Outcome</th>
                      <th className="py-2.5 px-3 text-right">Duration</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {paginatedRecent.map((item) => {
                      const fileName = item.input_image?.filename || '—';
                      return (
                        <tr
                          key={item.inspection_id}
                          onClick={() => handleOpenRecord(item)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {new Date(item.started_at || item.created_at).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                              {item.pipeline_id}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500">
                              v{item.release_version}
                            </div>
                          </td>
                          <td
                            className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[150px]"
                            title={item.input_image?.resolved_path || undefined}
                          >
                            {fileName}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <ExecutionStatusBadge status={item.execution_status} size="sm" />
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <InspectionOutcomeBadge
                              outcome={item.inspection_outcome}
                              executionStatus={item.execution_status}
                              size="sm"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {item.duration_ms.toFixed(1)} ms
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenRecord(item);
                              }}
                              className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/60 text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 text-[11px] font-medium border border-slate-200 dark:border-slate-700 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              {totalPages > 1 && (
                <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 bg-slate-50/40 dark:bg-slate-900/40">
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Runtime Status & Active Release Card */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Runtime Status Summary
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePage('system_status')}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Details
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400">API Connection</span>
                <span
                  className={`font-semibold ${
                    isRuntimeConnected
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {isRuntimeConnected ? 'Connected (HTTP 200)' : 'Disconnected'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400">Active Pipeline Release</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                  {activeRelease
                    ? `${activeRelease.pipeline_name} (v${activeRelease.release_version})`
                    : 'None Released'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400">Eligible Releases</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {eligibleReleases.length}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400">Last Inspection Time</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {lastInspection
                    ? new Date(lastInspection.started_at || lastInspection.created_at).toLocaleTimeString()
                    : 'No inspections run'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500 dark:text-slate-400">Last Execution Duration</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {lastInspection ? `${lastInspection.duration_ms.toFixed(2)} ms` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Released Pipelines Quick Access Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Released Pipelines
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePage('pipelines')}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                View All
              </button>
            </div>

            {eligibleReleases.length === 0 ? (
              <div className="p-3 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-800 dark:text-amber-300">
                No eligible released pipelines found. Switch to Developer Mode to validate and release
                a pipeline.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {eligibleReleases.slice(0, 4).map((rel) => (
                  <div
                    key={`${rel.pipeline_id}::${rel.release_version}`}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {rel.pipeline_name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        v{rel.release_version} • {rel.node_count ?? 0} nodes
                      </div>
                    </div>
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Released</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
