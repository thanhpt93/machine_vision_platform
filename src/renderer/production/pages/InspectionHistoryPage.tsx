import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ExternalLink,
  Eye,
  Filter,
  History,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useProductionStore } from '../store/productionStore';
import {
  ExecutionStatusBadge,
  InspectionOutcomeBadge,
} from '../components/InspectionStatusBadges';
import { ProductionImageViewer } from '../components/ProductionImageViewer';
import { InspectionResultPanel } from '../components/InspectionResultPanel';
import { InspectionRecord } from '../../types/api';

export const InspectionHistoryPage: React.FC = () => {
  const inspectionsHistory = useProductionStore((s) => s.inspectionsHistory);
  const isLoadingHistory = useProductionStore((s) => s.isLoadingHistory);
  const historyError = useProductionStore((s) => s.historyError);
  const fetchInspectionsHistory = useProductionStore((s) => s.fetchInspectionsHistory);
  const viewInspectionRecord = useProductionStore((s) => s.viewInspectionRecord);
  const preferences = useProductionStore((s) => s.preferences);
  const allReleases = useProductionStore((s) => s.allReleases);

  const [searchQuery, setSearchQuery] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [execStatusFilter, setExecStatusFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  const [selectedRecordModal, setSelectedRecordModal] = useState<InspectionRecord | null>(null);

  const pageSize = preferences.historyPageSize || 25;

  const pipelineNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const rel of allReleases) {
      map.set(rel.pipeline_id, rel.pipeline_name);
    }
    return map;
  }, [allReleases]);

  // Unique pipelines for filter dropdown
  const uniquePipelines = useMemo(() => {
    const map = new Map<string, string>();
    for (const rec of inspectionsHistory) {
      const display = pipelineNameLookup.get(rec.pipeline_id) || rec.pipeline_id;
      map.set(rec.pipeline_id, display);
    }
    return Array.from(map.entries());
  }, [inspectionsHistory, pipelineNameLookup]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inspectionsHistory.filter((rec) => {
      if (q) {
        const fileName = rec.input_image?.filename || '';
        const resolvedPath = rec.input_image?.resolved_path || '';
        const pipeName = pipelineNameLookup.get(rec.pipeline_id) || rec.pipeline_id;
        const matchesId = rec.inspection_id.toLowerCase().includes(q);
        const matchesFile =
          fileName.toLowerCase().includes(q) || resolvedPath.toLowerCase().includes(q);
        const matchesPipeline =
          rec.pipeline_id.toLowerCase().includes(q) || pipeName.toLowerCase().includes(q);
        if (!matchesId && !matchesFile && !matchesPipeline) return false;
      }

      if (pipelineFilter !== 'ALL' && rec.pipeline_id !== pipelineFilter) {
        return false;
      }

      if (outcomeFilter !== 'ALL' && rec.inspection_outcome !== outcomeFilter) {
        return false;
      }

      if (execStatusFilter !== 'ALL' && rec.execution_status !== execStatusFilter) {
        return false;
      }

      if (dateFilter) {
        const ts = rec.started_at || rec.created_at || '';
        const recDate = ts ? ts.slice(0, 10) : '';
        if (recDate !== dateFilter) return false;
      }

      return true;
    });
  }, [
    inspectionsHistory,
    searchQuery,
    pipelineFilter,
    outcomeFilter,
    execStatusFilter,
    dateFilter,
    pipelineNameLookup,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRecords = filteredRecords.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setPipelineFilter('ALL');
    setOutcomeFilter('ALL');
    setExecStatusFilter('ALL');
    setDateFilter('');
    setPage(1);
  };

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 p-5 space-y-4"
      data-testid="inspection-history-page"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2">
            <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Inspection History</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Search, filter, and audit historical inspection executions, decisions, and node measurements.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => fetchInspectionsHistory(200)}
            disabled={isLoadingHistory}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh History</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 shadow-xs shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          {/* Search by ID or filename */}
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Search ID or Image Filename
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="e.g. insp_1a2b or bottle_cap.png..."
                className="w-full pl-8 pr-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                data-testid="history-search-input"
              />
            </div>
          </div>

          {/* Filter by Pipeline */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Pipeline
            </label>
            <select
              value={pipelineFilter}
              onChange={(e) => {
                setPipelineFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Pipelines</option>
              {uniquePipelines.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Inspection Outcome */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Inspection Outcome
            </label>
            <select
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              data-testid="history-outcome-filter"
            >
              <option value="ALL">All Outcomes</option>
              <option value="OK">OK</option>
              <option value="NG">NG</option>
              <option value="UNKNOWN">UNKNOWN</option>
            </select>
          </div>

          {/* Filter by Execution Status */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Execution Status
            </label>
            <select
              value={execStatusFilter}
              onChange={(e) => {
                setExecStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              data-testid="history-exec-status-filter"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="RUNNING">RUNNING</option>
            </select>
          </div>

          {/* Filter by Date + Reset */}
          <div className="flex items-end space-x-2">
            <div className="flex-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Date
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-8 pr-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetFilters}
              title="Reset all filters"
              className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {historyError && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 shrink-0">
          Failed to load inspection history: {historyError}
        </div>
      )}

      {/* Results Table */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xs flex flex-col overflow-hidden min-h-0">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 shrink-0 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>
              Showing <strong>{paginatedRecords.length}</strong> of{' '}
              <strong>{filteredRecords.length}</strong> matching inspections
            </span>
          </div>
          <span>Page Size: {pageSize} rows</span>
        </div>

        <div className="flex-1 overflow-auto">
          {paginatedRecords.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400">
              No inspection records match the active filter criteria.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Inspection ID</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Pipeline</th>
                  <th className="py-2.5 px-3">Version</th>
                  <th className="py-2.5 px-3">Image Filename</th>
                  <th className="py-2.5 px-3">Execution Status</th>
                  <th className="py-2.5 px-3">Inspection Outcome</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {paginatedRecords.map((rec) => {
                  const fileName = rec.input_image?.filename || '—';
                  const displayPipeName =
                    pipelineNameLookup.get(rec.pipeline_id) || rec.pipeline_id;
                  return (
                    <tr
                      key={rec.inspection_id}
                      onClick={() => setSelectedRecordModal(rec)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono text-[11px] font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {rec.inspection_id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {new Date(rec.started_at || rec.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {displayPipeName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        v{rec.release_version}
                      </td>
                      <td
                        className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[180px]"
                        title={rec.input_image?.resolved_path || undefined}
                      >
                        {fileName}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <ExecutionStatusBadge status={rec.execution_status} size="sm" />
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <InspectionOutcomeBadge
                          outcome={rec.inspection_outcome}
                          executionStatus={rec.execution_status}
                          size="sm"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {rec.duration_ms.toFixed(2)} ms
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecordModal(rec);
                          }}
                          className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/60 text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 text-[11px] font-medium border border-slate-200 dark:border-slate-700"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar */}
        <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 shrink-0 bg-slate-50/40 dark:bg-slate-900/40">
          <span>
            Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
          </span>
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Inspection Record Detail Modal / Drawer */}
      {selectedRecordModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900 shrink-0">
              <div className="flex items-center space-x-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                  Inspection Record: {selectedRecordModal.inspection_id}
                </h3>
                <ExecutionStatusBadge status={selectedRecordModal.execution_status} size="sm" />
                <InspectionOutcomeBadge
                  outcome={selectedRecordModal.inspection_outcome}
                  executionStatus={selectedRecordModal.execution_status}
                  size="sm"
                />
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const rec = selectedRecordModal;
                    setSelectedRecordModal(null);
                    viewInspectionRecord(rec, 'inspection');
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Workstation</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRecordModal(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Split Content: Image Viewer (Left) + Result Panel (Right) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0">
              <div className="lg:col-span-7 h-full overflow-hidden border-r border-slate-200 dark:border-slate-800 p-3 bg-slate-100 dark:bg-slate-950">
                <ProductionImageViewer
                  selectedImagePath={selectedRecordModal.input_image?.resolved_path || null}
                  selectedImageMeta={selectedRecordModal.input_image || null}
                  inspectionRecord={selectedRecordModal}
                />
              </div>
              <div className="lg:col-span-5 h-full overflow-y-auto p-3 bg-slate-50 dark:bg-slate-950">
                <InspectionResultPanel
                  record={selectedRecordModal}
                  pipelineName={
                    pipelineNameLookup.get(selectedRecordModal.pipeline_id) ||
                    selectedRecordModal.pipeline_id
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
