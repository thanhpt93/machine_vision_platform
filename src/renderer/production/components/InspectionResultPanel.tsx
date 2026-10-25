import React from 'react';
import {
  Clock,
  FileImage,
  GitBranch,
  AlertTriangle,
  Ruler,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Hash,
  Layers,
} from 'lucide-react';
import { InspectionRecord } from '../../types/api';
import {
  ExecutionStatusBadge,
  InspectionOutcomeBadge,
} from './InspectionStatusBadges';

interface InspectionResultPanelProps {
  record: InspectionRecord | null;
  pipelineName?: string;
}

export const InspectionResultPanel: React.FC<InspectionResultPanelProps> = ({
  record,
  pipelineName,
}) => {
  if (!record) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-center space-y-2 shadow-xs">
        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mx-auto text-slate-400">
          <HelpCircle className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          No Inspection Executed Yet
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
          Select a released pipeline and an input image, then click{' '}
          <strong className="text-slate-700 dark:text-slate-200">Run Inspection</strong> to view real
          OpenCV inspection verdicts and metrology data.
        </p>
      </div>
    );
  }

  const decisions = record.result_data?.decisions || [];
  const measurementsMap = record.result_data?.measurements || {};
  const measurementEntries = Object.entries(measurementsMap);
  const nodeEntries = Object.values(record.node_results || {});

  const isFailed = record.execution_status === 'FAILED';
  const outcome = record.inspection_outcome;

  // Banner styling based on semantic rules
  const bannerStyle = isFailed
    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800'
    : outcome === 'OK'
    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800'
    : outcome === 'NG'
    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800'
    : 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700';

  return (
    <div className="space-y-4">
      {/* Primary Verdict & Execution Status Card */}
      <div className={`border rounded-xl p-4 shadow-xs ${bannerStyle}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
              Inspection Outcome (Decision Verdict)
            </span>
            <InspectionOutcomeBadge
              outcome={record.inspection_outcome}
              executionStatus={record.execution_status}
              size="lg"
            />
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
              Runtime Execution Status
            </span>
            <ExecutionStatusBadge status={record.execution_status} size="md" />
          </div>
        </div>

        {/* Semantic Clarification Note when UNKNOWN or FAILED */}
        {record.execution_status === 'COMPLETED' && record.inspection_outcome === 'UNKNOWN' && (
          <p className="mt-2.5 text-[11px] text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-950/60 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800">
            Pipeline execution completed without errors, but the pipeline does not include an explicit
            OK/NG decision node. Outcome is reported as <strong>UNKNOWN</strong>.
          </p>
        )}

        {/* Error Details if Execution FAILED */}
        {record.error_details && (
          <div className="mt-3 p-3 rounded-lg bg-rose-100/80 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 space-y-1">
            <div className="flex items-center space-x-1.5 font-semibold text-rose-800 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Execution Error ({record.error_details.code})
                {record.error_details.failed_node_id
                  ? ` at node "${record.error_details.failed_node_id}"`
                  : ''}
              </span>
            </div>
            <p className="font-mono text-[11px] break-words">{record.error_details.message}</p>
          </div>
        )}
      </div>

      {/* Inspection Metadata Grid */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
          <Hash className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Inspection Metadata</span>
        </h4>

        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Inspection ID</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate block">
              {record.inspection_id}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
              Processing Duration
            </span>
            <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>{record.duration_ms.toFixed(2)} ms</span>
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
              Pipeline & Version
            </span>
            <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center space-x-1 truncate">
              <GitBranch className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{pipelineName || record.pipeline_id}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 shrink-0">
                v{record.release_version}
              </span>
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Input Image</span>
            <span
              className="font-mono text-slate-800 dark:text-slate-200 flex items-center space-x-1 truncate"
              title={record.input_image?.resolved_path}
            >
              <FileImage className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{record.input_image?.filename || 'N/A'}</span>
            </span>
          </div>

          <div className="col-span-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Started At</span>
            <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
              {record.started_at ? new Date(record.started_at).toLocaleString() : record.created_at}
            </span>
          </div>
        </div>
      </div>

      {/* Decision Rules Breakdown (if any) */}
      {decisions.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Decision & Tolerance Verdicts ({decisions.length})</span>
          </h4>
          <div className="space-y-2">
            {decisions.map((d) => (
              <div
                key={d.node_id}
                className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {d.node_name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 ml-1.5">
                    ({d.node_type})
                  </span>
                  {d.details?.value !== undefined && d.details?.nominal !== undefined && (
                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                      Measured: <strong>{d.details.value}</strong> | Nominal: {d.details.nominal} [
                      {d.details.min_limit} .. {d.details.max_limit}]
                    </div>
                  )}
                </div>
                <InspectionOutcomeBadge outcome={d.outcome} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrology & Feature Measurements Returned by Runtime */}
      {measurementEntries.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
            <Ruler className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Measurements & Inspection Details ({measurementEntries.length})</span>
          </h4>

          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {measurementEntries.map(([nodeId, item]) => {
              const scalarEntries = Object.entries(item.metrics || {}).filter(
                ([, v]) => v !== null && typeof v !== 'object'
              );
              const circles = Array.isArray(item.metrics?.circles) ? item.metrics.circles : null;

              return (
                <div
                  key={nodeId}
                  className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {item.node_name}
                    </span>
                    <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
                      {item.node_type}
                    </span>
                  </div>

                  {scalarEntries.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                      {scalarEntries.slice(0, 10).map(([k, v]) => (
                        <div
                          key={k}
                          className="bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 flex justify-between items-center overflow-hidden"
                        >
                          <span className="text-slate-500 dark:text-slate-400 truncate mr-1">
                            {k}:
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {typeof v === 'number'
                              ? Number.isInteger(v)
                                ? v
                                : v.toFixed(2)
                              : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {circles && circles.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-slate-200 dark:border-slate-800">
                      {circles.map((c: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[11px] font-mono bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-800"
                        >
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">
                            C{idx + 1} ({c.label || `#${idx + 1}`}):
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            D={c.diameter} {c.unit} (R={c.radius} {c.unit})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Node Execution Timing Breakdown */}
      {nodeEntries.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>Pipeline Node Execution Timings ({nodeEntries.length})</span>
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {nodeEntries.map((n) => (
              <div
                key={n.node_id}
                className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] font-mono"
              >
                <div className="flex items-center space-x-2 truncate">
                  {n.status === 'completed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : n.status === 'failed' ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className="text-slate-800 dark:text-slate-200 truncate">{n.node_id}</span>
                  <span className="text-slate-400">({n.node_type})</span>
                </div>
                <span className="text-slate-600 dark:text-slate-400 shrink-0">
                  {n.duration_ms.toFixed(2)} ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
