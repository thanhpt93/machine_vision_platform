import React, { useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  HelpCircle,
  Crosshair,
  Box,
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

interface ExtractedDetection {
  id: string;
  className: string;
  score: number; // 0..1 or 0..100
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
    x_min?: number;
    y_min?: number;
    x_max?: number;
    y_max?: number;
  };
  color?: string;
}

export const InspectionResultPanel: React.FC<InspectionResultPanelProps> = ({
  record,
}) => {
  if (!record) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-center space-y-2 shadow-xs">
        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mx-auto text-slate-400">
          <HelpCircle className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Chưa có lượt kiểm tra
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
          Chọn pipeline đã phát hành và ảnh đầu vào, sau đó nhấn{' '}
          <strong className="text-slate-700 dark:text-slate-200">Run Inspection</strong> để thực thi và xem kết quả phát hiện.
        </p>
      </div>
    );
  }

  const isFailed = record.execution_status === 'FAILED';
  const outcome = record.inspection_outcome;

  // Banner styling based on outcome
  const bannerStyle = isFailed
    ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
    : outcome === 'OK'
    ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
    : outcome === 'NG'
    ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800';

  // Extract detections, predict duration, and object count
  const { detections, predictTimeMs, objectCount, fallbackMeasurements } = useMemo(() => {
    const list: ExtractedDetection[] = [];
    let foundPredictMs: number | null = null;
    let foundCount: number | null = null;

    // Helper to parse detection items
    const parseRawDetections = (rawList: any[]) => {
      rawList.forEach((item: any, idx: number) => {
        const className =
          item.class_name ||
          item.className ||
          item.label ||
          item.name ||
          `Class #${item.class_index !== undefined ? item.class_index : idx + 1}`;
        const score =
          typeof item.confidence === 'number'
            ? item.confidence
            : typeof item.score === 'number'
            ? item.score
            : 1.0;

        let bbox = { x: 0, y: 0, w: 0, h: 0, x_min: 0, y_min: 0, x_max: 0, y_max: 0 };
        if (item.bbox) {
          if (typeof item.bbox.x_min === 'number') {
            const x1 = Math.round(item.bbox.x_min);
            const y1 = Math.round(item.bbox.y_min);
            const x2 = Math.round(item.bbox.x_max);
            const y2 = Math.round(item.bbox.y_max);
            bbox = {
              x: x1,
              y: y1,
              w: Math.max(0, x2 - x1),
              h: Math.max(0, y2 - y1),
              x_min: x1,
              y_min: y1,
              x_max: x2,
              y_max: y2,
            };
          } else if (Array.isArray(item.bbox) && item.bbox.length === 4) {
            const [x, y, w, h] = item.bbox.map((v: number) => Math.round(v));
            bbox = { x, y, w, h, x_min: x, y_min: y, x_max: x + w, y_max: y + h };
          } else if (typeof item.bbox.x === 'number') {
            const bx = Math.round(item.bbox.x);
            const by = Math.round(item.bbox.y);
            const bw = Math.round(item.bbox.width || item.bbox.w || 0);
            const bh = Math.round(item.bbox.height || item.bbox.h || 0);
            bbox = {
              x: bx,
              y: by,
              w: bw,
              h: bh,
              x_min: bx,
              y_min: by,
              x_max: bx + bw,
              y_max: by + bh,
            };
          }
        }

        list.push({
          id: item.detection_id || item.id || `det-${idx + 1}`,
          className,
          score,
          bbox,
          color: item.color,
        });
      });
    };

    // 1. Scan node_results
    if (record.node_results) {
      for (const node of Object.values(record.node_results)) {
        const meta = node.output_metadata || {};
        const structured = (node as any).structured_result;

        if (meta.inference_time_ms !== undefined && foundPredictMs === null) {
          foundPredictMs = Number(meta.inference_time_ms);
        }
        if (meta.count !== undefined && foundCount === null) {
          foundCount = Number(meta.count);
        }

        const rawList =
          (Array.isArray(meta.detections) ? meta.detections : null) ||
          (Array.isArray(meta.detections?.detections) ? meta.detections.detections : null) ||
          (Array.isArray(structured?.detections) ? structured.detections : null);

        if (rawList && rawList.length > 0 && list.length === 0) {
          parseRawDetections(rawList);
        }
      }
    }

    // 2. Scan measurements in result_data if list is still empty
    if (list.length === 0 && record.result_data?.measurements) {
      for (const item of Object.values(record.result_data.measurements)) {
        const metrics = item.metrics || {};
        if (metrics.inference_time_ms !== undefined && foundPredictMs === null) {
          foundPredictMs = Number(metrics.inference_time_ms);
        }
        if (metrics.count !== undefined && foundCount === null) {
          foundCount = Number(metrics.count);
        }

        const rawList =
          (Array.isArray(metrics.detections) ? metrics.detections : null) ||
          (Array.isArray(metrics.detections?.detections) ? metrics.detections.detections : null);

        if (rawList && rawList.length > 0 && list.length === 0) {
          parseRawDetections(rawList);
        }
      }
    }

    const predictTimeMs = foundPredictMs !== null ? foundPredictMs : record.duration_ms;
    const objectCount = foundCount !== null ? foundCount : list.length;
    const measurementsMap = record.result_data?.measurements || {};
    const fallbackMeasurements = Object.entries(measurementsMap);

    return {
      detections: list,
      predictTimeMs,
      objectCount,
      fallbackMeasurements,
    };
  }, [record]);

  return (
    <div className="space-y-3.5">
      {/* Compact Top Status & Verdict Bar */}
      <div className={`border rounded-xl p-3 shadow-xs ${bannerStyle}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <InspectionOutcomeBadge
              outcome={record.inspection_outcome}
              executionStatus={record.execution_status}
              size="md"
            />
            <ExecutionStatusBadge status={record.execution_status} size="sm" />
          </div>

          <span
            className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate"
            title={record.inspection_id}
          >
            {record.inspection_id}
          </span>
        </div>

        {/* Execution Error Alert if FAILED */}
        {record.error_details && (
          <div className="mt-2.5 p-2.5 rounded-lg bg-rose-100/90 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 space-y-1">
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

      {/* Summary KPI Cards: Thời gian predict & Số lượng object */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Thời gian Predict */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs">
          <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
            <span className="text-[11px] font-medium tracking-wide">Thời gian predict</span>
          </div>
          <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
            {predictTimeMs.toFixed(1)} <span className="text-xs font-normal text-slate-500">ms</span>
          </div>
        </div>

        {/* Số lượng Object detect được */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs">
          <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
            <Crosshair className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] font-medium tracking-wide">Số lượng object</span>
          </div>
          <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {objectCount} <span className="text-xs font-normal text-slate-500">đối tượng</span>
          </div>
        </div>
      </div>

      {/* Chi tiết Object Detect: Class, Score, Tọa độ vị trí */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
            <Box className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>Thông tin detect chi tiết</span>
          </h4>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {detections.length} kết quả
          </span>
        </div>

        {detections.length > 0 ? (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {detections.map((det, idx) => {
              const scorePct = det.score <= 1.0 ? det.score * 100 : det.score;
              const scoreColor =
                scorePct >= 80
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800'
                  : scorePct >= 50
                  ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800'
                  : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800';

              return (
                <div
                  key={det.id || idx}
                  className="p-2.5 rounded-lg bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1.5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  {/* Row 1: Index, Class name, Score */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 w-4 h-4 rounded flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span
                        className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate"
                        title={det.className}
                      >
                        {det.className}
                      </span>
                    </div>

                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${scoreColor} shrink-0`}
                    >
                      {scorePct.toFixed(1)}%
                    </span>
                  </div>

                  {/* Row 2: Tọa độ vị trí (Bounding Box) */}
                  <div className="bg-white dark:bg-slate-900 rounded px-2 py-1.5 border border-slate-200/80 dark:border-slate-800/80">
                    <div className="text-[10px] uppercase font-mono text-slate-400 mb-0.5">
                      Tọa độ vị trí [X, Y, W, H]
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-center font-mono text-[11px]">
                      <div className="bg-slate-50 dark:bg-slate-950/60 rounded py-0.5 px-1 border border-slate-100 dark:border-slate-800">
                        <span className="text-[9px] text-slate-400 block">X</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {det.bbox.x}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950/60 rounded py-0.5 px-1 border border-slate-100 dark:border-slate-800">
                        <span className="text-[9px] text-slate-400 block">Y</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {det.bbox.y}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950/60 rounded py-0.5 px-1 border border-slate-100 dark:border-slate-800">
                        <span className="text-[9px] text-slate-400 block">W</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {det.bbox.w}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950/60 rounded py-0.5 px-1 border border-slate-100 dark:border-slate-800">
                        <span className="text-[9px] text-slate-400 block">H</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {det.bbox.h}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : fallbackMeasurements.length > 0 ? (
          // Fallback metrology display if this is a traditional measurement inspection without AI detection
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {fallbackMeasurements.map(([nodeId, item]) => {
              const scalarEntries = Object.entries(item.metrics || {}).filter(
                ([, v]) => v !== null && typeof v !== 'object'
              );
              const circles = Array.isArray(item.metrics?.circles) ? item.metrics.circles : null;

              return (
                <div
                  key={nodeId}
                  className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.node_name}
                    </span>
                    <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
                      {item.node_type}
                    </span>
                  </div>

                  {scalarEntries.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                      {scalarEntries.slice(0, 6).map(([k, v]) => (
                        <div
                          key={k}
                          className="bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 flex justify-between items-center overflow-hidden"
                        >
                          <span className="text-slate-500 dark:text-slate-400 truncate mr-1">
                            {k}:
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {typeof v === 'number'
                              ? (Number.isInteger(v) ? v : v.toFixed(2))
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
                            D={c.diameter} {c.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
            0 đối tượng được phát hiện
          </div>
        )}
      </div>
    </div>
  );
};
