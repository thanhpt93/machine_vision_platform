import React from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { getNodeContract } from '../registry/nodeRegistry';
import { DynamicConfigForm } from './DynamicConfigForm';
import { ImagePreviewBox } from './ImagePreviewBox';
import {
  Settings2,
  Trash2,
  Info,
  AlertCircle,
  CheckCircle,
  Cpu,
  Clock,
  Activity,
  Layers,
} from 'lucide-react';
import { PortDefinition } from '@/shared/contracts';

export const PropertiesPanel: React.FC = () => {
  const selectedNodeId = usePipelineStore((state) => state.selectedNodeId);
  const nodes = usePipelineStore((state) => state.nodes);
  const updateNodeName = usePipelineStore((state) => state.updateNodeName);
  const updateNodeConfig = usePipelineStore((state) => state.updateNodeConfig);
  const deleteNode = usePipelineStore((state) => state.deleteNode);
  const validationReport = usePipelineStore((state) => state.validationReport);

  // Phase 3 Real Execution State for this node
  const nodeExecutionStates = usePipelineStore((state) => state.nodeExecutionStates);
  const execState = selectedNodeId ? nodeExecutionStates[selectedNodeId] : undefined;

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const contract = selectedNode ? getNodeContract((selectedNode.data as any)?.nodeType) : null;
  const config = (selectedNode?.data as any)?.config || {};
  const nodeName = (selectedNode?.data as any)?.name || '';

  // Get validation errors specifically for this node
  const nodeErrors = validationReport.errors.filter((e) => e.nodeId === selectedNodeId);
  const nodeWarnings = validationReport.warnings.filter((w) => w.nodeId === selectedNodeId);

  const getFieldError = (fieldName: string) => {
    return nodeErrors.find((e) => e.field === fieldName)?.message;
  };

  if (!selectedNode || !contract) {
    return (
      <aside className="w-84 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full select-none shrink-0 transition-colors">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex items-center space-x-2">
          <Settings2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Node Properties
          </h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 dark:text-slate-500 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center text-slate-400">
            <Info className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">No Node Selected</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[200px]">
              Click on any node in the canvas to inspect its parameters, preview OpenCV results, and configure ports.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const isRuntimeSupported = contract.runtime?.supported ?? true;

  return (
    <aside className="w-84 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full select-none shrink-0 overflow-hidden transition-colors">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <Settings2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200 truncate">
              {contract.displayName}
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">{contract.category}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => deleteNode(selectedNode.id)}
          title="Delete selected node"
          className="p-1.5 rounded text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Validation & Runtime status badge */}
      <div className="px-3 py-2 bg-slate-100/60 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
        <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] truncate max-w-[130px]" title={selectedNode.id}>
          ID: {selectedNode.id}
        </span>
        <div className="flex items-center space-x-1.5">
          {/* Runtime Support Badge */}
          <span
            className={`text-[9px] font-mono px-1.5 py-0.2 rounded border flex items-center space-x-1 ${
              isRuntimeSupported
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                : 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800'
            }`}
            title={
              isRuntimeSupported
                ? 'Python Vision Runtime implementation available'
                : 'Runtime implementation pending / not yet available in current runtime stage'
            }
          >
            <Cpu className="w-2.5 h-2.5" />
            <span>{isRuntimeSupported ? 'Runtime Ready' : 'Runtime Pending'}</span>
          </span>

          {/* Validation Status */}
          {nodeErrors.length > 0 ? (
            <span className="flex items-center space-x-1 text-rose-600 dark:text-rose-400 text-[11px]" title={nodeErrors[0]?.message}>
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{nodeErrors.length}</span>
            </span>
          ) : nodeWarnings.length > 0 ? (
            <span className="flex items-center space-x-1 text-amber-600 dark:text-amber-400 text-[11px]" title={nodeWarnings[0]?.message}>
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{nodeWarnings.length}</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 text-[11px]">
              <CheckCircle className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-slate-800 dark:text-slate-200">
        {/* Node Name */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Node Display Name</label>
          <input
            type="text"
            value={nodeName}
            onChange={(e) => updateNodeName(selectedNode.id, e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Runtime Execution Results & Output Preview (Phase 3) */}
        {execState && execState.status !== 'idle' && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950/70 p-3 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div className="flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  OpenCV Execution
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    execState.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                      : execState.status === 'failed'
                      ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800'
                      : execState.status === 'running'
                      ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800'
                      : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                  }`}
                >
                  {execState.status.toUpperCase()}
                </span>
                {execState.status === 'completed' && (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center space-x-0.5 ml-1">
                    <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                    <span>{execState.durationMs.toFixed(1)}ms</span>
                  </span>
                )}
              </div>
            </div>

            {/* Error Message if failed */}
            {execState.error && (
              <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-[11px] text-rose-700 dark:text-rose-300 space-y-1">
                <div className="font-semibold flex items-center space-x-1 text-rose-800 dark:text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Execution Failure</span>
                </div>
                <p className="text-[10px] text-rose-600 dark:text-rose-200 font-mono break-words">{execState.error}</p>
              </div>
            )}

            {/* Robust Image Preview Box (Fixes black box issue!) */}
            {execState.hasPreview && execState.previewUrl && (
              <ImagePreviewBox
                previewUrl={execState.previewUrl}
                nodeName={contract.displayName}
                metadata={execState.outputMetadata}
              />
            )}

            {/* Structured Metadata Badges / Info */}
            {execState.outputMetadata && Object.keys(execState.outputMetadata).length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                  <Layers className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                  <span>Frame Metadata</span>
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                  {Object.entries(execState.outputMetadata).map(([key, val]) => (
                    <div
                      key={key}
                      className="bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 flex justify-between"
                    >
                      <span className="text-slate-500 dark:text-slate-400">{key}:</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold truncate ml-1" title={String(val)}>
                        {typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(2)) : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Structured Detection Results */}
            {execState.structuredResult && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  Detected Features (Count: {execState.structuredResult.count ?? 0})
                </span>
                {Array.isArray(execState.structuredResult.items) && execState.structuredResult.items.length > 0 ? (
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {execState.structuredResult.items.slice(0, 10).map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded p-1.5 text-[10px] font-mono flex items-center justify-between"
                      >
                        <span className="text-cyan-600 dark:text-cyan-400">#{item.index ?? idx + 1}</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          bbox: [{item.bbox?.[0]}, {item.bbox?.[1]}, {item.bbox?.[2]}, {item.bbox?.[3]}]
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{item.area} px²</span>
                      </div>
                    ))}
                    {execState.structuredResult.items.length > 10 && (
                      <div className="text-[9px] text-slate-500 text-center italic">
                        + {execState.structuredResult.items.length - 10} more items...
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">No features detected within area thresholds.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Runtime info notice if not supported */}
        {!isRuntimeSupported && (
          <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
            <div className="font-semibold flex items-center space-x-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Runtime Not Implemented</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-[10px]">
              {contract.runtime?.notes ||
                'This node can be edited and saved in the pipeline, but the Python runtime does not execute this node yet.'}
            </p>
          </div>
        )}

        <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Node Configuration
          </h4>

          {/* Schema-Driven Dynamic Form Generator */}
          <DynamicConfigForm
            contract={contract}
            config={config}
            onConfigChange={(partial) => updateNodeConfig(selectedNode.id, partial)}
            getFieldError={getFieldError}
          />
        </div>

        {/* Node Ports Reference */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Node Ports Contract
          </h4>

          {contract.inputs.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-mono">Inputs:</span>
              {contract.inputs.map((inp: PortDefinition) => (
                <div
                  key={inp.id}
                  className="text-[11px] bg-slate-50 dark:bg-slate-950/60 p-1.5 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                >
                  <span className="text-slate-700 dark:text-slate-300">{inp.name}</span>
                  <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400">{inp.dataType}</span>
                </div>
              ))}
            </div>
          )}

          {contract.outputs.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-mono">Outputs:</span>
              {contract.outputs.map((out: PortDefinition) => (
                <div
                  key={out.id}
                  className="text-[11px] bg-slate-50 dark:bg-slate-950/60 p-1.5 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                >
                  <span className="text-slate-700 dark:text-slate-300">{out.name}</span>
                  <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400">{out.dataType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
