import React, { useState } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Code,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';

export const DebugPanel: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeTab = usePipelineStore((state) => state.activeBottomTab);
  const setActiveTab = usePipelineStore((state) => state.setActiveBottomTab);
  const validationReport = usePipelineStore((state) => state.validationReport);
  const logMessages = usePipelineStore((state) => state.logMessages);
  const clearLogs = usePipelineStore((state) => state.clearLogs);
  const exportPipeline = usePipelineStore((state) => state.exportPipeline);
  const selectNode = usePipelineStore((state) => state.selectNode);

  const pipelineJson = exportPipeline();
  const jsonString = JSON.stringify(pipelineJson, null, 2);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalErrors = validationReport.errors.length;
  const totalWarnings = validationReport.warnings.length;

  return (
    <div
      className={`border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/95 flex flex-col transition-all duration-200 select-none ${
        isCollapsed ? 'h-9' : 'h-64'
      }`}
    >
      {/* Panel Bar Header */}
      <div className="h-9 px-4 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between shrink-0 transition-colors">
        {/* Left Tabs */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('validation');
              setIsCollapsed(false);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'validation' && !isCollapsed
                ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 border border-slate-300 dark:border-slate-700 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {totalErrors > 0 ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
            ) : totalWarnings > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
            <span>Validation</span>
            {totalErrors > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800 font-mono">
                {totalErrors}
              </span>
            ) : totalWarnings > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800 font-mono">
                {totalWarnings}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('logs');
              setIsCollapsed(false);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'logs' && !isCollapsed
                ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 border border-slate-300 dark:border-slate-700 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Logs</span>
            <span className="text-[10px] font-mono text-slate-500">({logMessages.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('json');
              setIsCollapsed(false);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'json' && !isCollapsed
                ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 border border-slate-300 dark:border-slate-700 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Pipeline JSON</span>
          </button>
        </div>

        {/* Right Status Summary & Toggle */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Can Save & Execution Badges */}
          <div className="flex items-center space-x-2">
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                validationReport.canSave
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800'
              }`}
              title="State indicates if the pipeline can be saved and edited later"
            >
              {validationReport.canSave ? '✓ SAVEABLE' : '✗ UNSAVEABLE'}
            </span>

            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                validationReport.canExecute
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-400 dark:border-cyan-800'
                  : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
              }`}
              title="State indicates if the pipeline is a complete valid DAG ready for execution"
            >
              {validationReport.canExecute ? '✓ EXECUTION READY' : '○ DRAFT PIPELINE'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Panel Content (when not collapsed) */}
      {!isCollapsed && (
        <div className="flex-1 overflow-hidden p-3 bg-slate-50/50 dark:bg-slate-950/50 transition-colors">
          {activeTab === 'validation' && (
            <div className="h-full overflow-y-auto space-y-2 text-xs">
              {/* DAG Execution Order Info */}
              {validationReport.topologicalOrder && (
                <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center space-x-2">
                  <span className="text-[10px] uppercase font-mono text-cyan-700 dark:text-cyan-400 font-semibold">
                    DAG Execution Flow:
                  </span>
                  <span className="font-mono text-xs text-slate-800 dark:text-slate-300 truncate">
                    {validationReport.topologicalOrder.join(' ➔ ') || '(Empty pipeline)'}
                  </span>
                </div>
              )}

              {/* Cycle Warning if any */}
              {validationReport.cycleNodes && (
                <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-semibold text-rose-800 dark:text-rose-200">Directed Cycle Detected</h5>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300">
                      The pipeline contains a feedback loop involving nodes:{' '}
                      <span className="font-mono">{validationReport.cycleNodes.join(', ')}</span>.
                      Pipeline execution requires a Directed Acyclic Graph (DAG).
                    </p>
                  </div>
                </div>
              )}

              {/* Errors List */}
              {totalErrors > 0 && (
                <div className="space-y-1">
                  <h5 className="text-[11px] font-semibold uppercase text-rose-600 dark:text-rose-400 tracking-wider">
                    Validation Errors ({totalErrors})
                  </h5>
                  <div className="space-y-1">
                    {validationReport.errors.map((err, idx) => (
                      <div
                        key={idx}
                        onClick={() => err.nodeId && selectNode(err.nodeId)}
                        className={`p-2 rounded bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 flex items-center justify-between ${
                          err.nodeId ? 'cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-950/40' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0" />
                          <span>{err.message}</span>
                        </div>
                        {err.nodeId && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-200 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300">
                            Node: {err.nodeId}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings List */}
              {totalWarnings > 0 && (
                <div className="space-y-1 pt-1">
                  <h5 className="text-[11px] font-semibold uppercase text-amber-600 dark:text-amber-400 tracking-wider">
                    Pipeline Warnings ({totalWarnings})
                  </h5>
                  <div className="space-y-1">
                    {validationReport.warnings.map((warn, idx) => (
                      <div
                        key={idx}
                        onClick={() => warn.nodeId && selectNode(warn.nodeId)}
                        className={`p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 flex items-center justify-between ${
                          warn.nodeId ? 'cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/40' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                          <span>{warn.message}</span>
                        </div>
                        {warn.nodeId && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                            Node: {warn.nodeId}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clean State */}
              {totalErrors === 0 && totalWarnings === 0 && (
                <div className="flex flex-col items-center justify-center py-6 text-emerald-600 dark:text-emerald-400 space-y-1">
                  <CheckCircle2 className="w-6 h-6" />
                  <span className="text-xs font-medium">All graph connections & node configurations are valid!</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {validationReport.canExecute
                      ? 'Pipeline is ready for execution.'
                      : 'Add more nodes and connections to build inspection flow.'}
                  </span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="h-full flex flex-col">
              <div className="flex justify-end mb-1">
                <button
                  type="button"
                  onClick={clearLogs}
                  className="flex items-center space-x-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Logs</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[11px]">
                {logMessages.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center space-x-2 py-0.5 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-900 text-slate-800 dark:text-slate-300"
                  >
                    <span className="text-slate-400 dark:text-slate-500 text-[10px]">{log.timestamp}</span>
                    <span
                      className={`text-[10px] uppercase font-semibold ${
                        log.level === 'error'
                          ? 'text-rose-600 dark:text-rose-400'
                          : log.level === 'warn'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-cyan-600 dark:text-cyan-400'
                      }`}
                    >
                      [{log.level}]
                    </span>
                    <span>{log.message}</span>
                  </div>
                ))}
                {logMessages.length === 0 && (
                  <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">No log entries yet.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="h-full flex flex-col relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Versioned Pipeline JSON (Schema v{pipelineJson.schemaVersion})
                </span>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-2">
                <pre className="font-mono text-[11px] text-cyan-800 dark:text-cyan-300/90 whitespace-pre">
                  {jsonString}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
