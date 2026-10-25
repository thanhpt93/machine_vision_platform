import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Eye,
  Hash,
  Layers,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useProductionStore } from '../store/productionStore';
import { runtimeApi } from '../../services/runtimeApi';
import { ProductionReleaseDetails, ProductionReleaseSummary } from '../../types/api';

export const ReleasedPipelinePage: React.FC = () => {
  const allReleases = useProductionStore((s) => s.allReleases);
  const isLoadingReleases = useProductionStore((s) => s.isLoadingReleases);
  const releasesError = useProductionStore((s) => s.releasesError);
  const fetchReleases = useProductionStore((s) => s.fetchReleases);
  const selectRelease = useProductionStore((s) => s.selectRelease);
  const setActivePage = useProductionStore((s) => s.setActivePage);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ELIGIBLE' | 'ARCHIVED'>('ALL');
  const [inspectingDetails, setInspectingDetails] = useState<ProductionReleaseDetails | null>(null);
  const [loadingDetailsKey, setLoadingDetailsKey] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const filteredReleases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allReleases.filter((rel) => {
      if (q) {
        const matchesName = rel.pipeline_name.toLowerCase().includes(q);
        const matchesId = rel.pipeline_id.toLowerCase().includes(q);
        const matchesVer = rel.release_version.toLowerCase().includes(q);
        const matchesDesc =
          (rel.description || '').toLowerCase().includes(q) ||
          (rel.release_notes || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesVer && !matchesDesc) return false;
      }

      const isEligible = rel.status === 'Released' && rel.valid_integrity !== false;
      if (statusFilter === 'ELIGIBLE' && !isEligible) return false;
      if (statusFilter === 'ARCHIVED' && rel.status !== 'Archived') return false;

      return true;
    });
  }, [allReleases, searchQuery, statusFilter]);

  const handleOpenReleaseDetails = async (rel: ProductionReleaseSummary) => {
    const key = `${rel.pipeline_id}::${rel.release_version}`;
    setLoadingDetailsKey(key);
    setDetailsError(null);
    try {
      const details = await runtimeApi.getProductionReleaseDetails(
        rel.pipeline_id,
        rel.release_version
      );
      setInspectingDetails(details);
    } catch (err: unknown) {
      setDetailsError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDetailsKey(null);
    }
  };

  const handleSelectForInspection = async (rel: ProductionReleaseSummary) => {
    await selectRelease(rel.pipeline_id, rel.release_version);
    setActivePage('inspection');
  };

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 p-5 space-y-4"
      data-testid="released-pipeline-page"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Pipeline Management (Read-Only)
            </h2>
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
              <Lock className="w-3 h-3" />
              <span>Immutable Snapshots</span>
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Inspect released pipeline versions, SHA-256 integrity checksums, and node manifests. Graph
            editing is disabled in Production Mode.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchReleases()}
          disabled={isLoadingReleases}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReleases ? 'animate-spin text-blue-600' : ''}`} />
          <span>Refresh Releases</span>
        </button>
      </div>

      {/* Search & Status Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pipeline name, ID, version, or description..."
            className="w-full pl-8 pr-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-1.5">
          {(['ALL', 'ELIGIBLE', 'ARCHIVED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {st === 'ALL'
                ? `All Releases (${allReleases.length})`
                : st === 'ELIGIBLE'
                ? 'Eligible for Execution'
                : 'Archived'}
            </button>
          ))}
        </div>
      </div>

      {(releasesError || detailsError) && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 shrink-0">
          {releasesError || detailsError}
        </div>
      )}

      {/* Releases Table */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xs overflow-auto min-h-0">
        {filteredReleases.length === 0 ? (
          <div className="p-12 text-center">
            <Layers className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No Released Pipelines Found
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Switch to Developer Mode in the top bar and use the &ldquo;Release for Production&rdquo;
              action to validate and publish an immutable pipeline version for Production execution.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-3.5">Pipeline Name & ID</th>
                <th className="py-2.5 px-3">Version</th>
                <th className="py-2.5 px-3">Release Date / Time</th>
                <th className="py-2.5 px-3">Description / Notes</th>
                <th className="py-2.5 px-3">Topology</th>
                <th className="py-2.5 px-3">Integrity (SHA-256)</th>
                <th className="py-2.5 px-3">Status & Eligibility</th>
                <th className="py-2.5 px-3.5 text-right">Read-Only Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {filteredReleases.map((rel) => {
                const key = `${rel.pipeline_id}::${rel.release_version}`;
                const isEligible = rel.status === 'Released' && rel.valid_integrity !== false;
                return (
                  <tr
                    key={key}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center space-x-1.5">
                        <span>{rel.pipeline_name}</span>
                        {rel.is_active && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                            Active Default
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                        ID: {rel.pipeline_id}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      v{rel.release_version}
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {new Date(rel.created_at).toLocaleString()}
                    </td>

                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-[240px]">
                      <div
                        className="truncate"
                        title={rel.description || rel.release_notes || undefined}
                      >
                        {rel.description || rel.release_notes || '—'}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {rel.node_count ?? 0} nodes / {rel.edge_count ?? 0} edges
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {rel.valid_integrity !== false ? (
                        <div
                          className="inline-flex items-center space-x-1 text-[11px] font-mono text-emerald-700 dark:text-emerald-400"
                          title={`SHA-256: ${rel.checksum}`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{rel.checksum.slice(0, 10)}...</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center space-x-1 text-[11px] font-mono text-rose-700 dark:text-rose-400">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Tampered / Invalid</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {isEligible ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Released (Eligible)</span>
                        </span>
                      ) : rel.status === 'Archived' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                          <Archive className="w-3 h-3" />
                          <span>Archived (Blocked)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Ineligible</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3.5 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenReleaseDetails(rel)}
                        disabled={loadingDetailsKey === key}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium border border-slate-300 dark:border-slate-700 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        <span>{loadingDetailsKey === key ? 'Loading...' : 'View Manifest'}</span>
                      </button>

                      {isEligible && (
                        <button
                          type="button"
                          onClick={() => handleSelectForInspection(rel)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Use in Inspection</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Read-Only Manifest & Node List Modal */}
      {inspectingDetails && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[82vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900 shrink-0">
              <div className="flex items-center space-x-2.5">
                <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {inspectingDetails.pipeline?.name || inspectingDetails.pipeline_id} — v
                    {inspectingDetails.release_version}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Immutable Release Snapshot (Read-Only)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingDetails(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Pipeline ID</div>
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5 break-all">
                    {inspectingDetails.pipeline_id}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Released At</div>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                    {new Date(inspectingDetails.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Status</div>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                    {inspectingDetails.status}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex items-center space-x-1.5 text-[10px] uppercase font-bold text-slate-400">
                  <Hash className="w-3 h-3" />
                  <span>SHA-256 Checksum Integrity</span>
                </div>
                <div className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 break-all">
                  {inspectingDetails.checksum}
                </div>
              </div>

              {(inspectingDetails.pipeline?.description || inspectingDetails.release_notes) && (
                <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Description & Release Notes
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">
                    {inspectingDetails.pipeline?.description || inspectingDetails.release_notes}
                  </p>
                </div>
              )}

              {/* Read-Only Node Summary Table */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                  Pipeline Nodes ({inspectingDetails.pipeline?.nodes?.length || 0} Nodes,{' '}
                  {inspectingDetails.pipeline?.edges?.length || 0} Connections)
                </h4>
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-950 text-[10px] font-bold uppercase text-slate-500">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Node Label</th>
                        <th className="py-2 px-3">Node Type ID</th>
                        <th className="py-2 px-3 text-right">Handler Version</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {(inspectingDetails.pipeline?.nodes || []).map((n, i) => (
                        <tr key={n.id} className="bg-white dark:bg-slate-900">
                          <td className="py-2 px-3 font-mono text-slate-400">{i + 1}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                            {n.name}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-blue-600 dark:text-blue-400">
                            {n.nodeType}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            v{inspectingDetails.node_versions?.[n.nodeType] || '1.0.0'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
