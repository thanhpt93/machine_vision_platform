import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { getNodeContract } from '../registry/nodeRegistry';
import { renderNodeIcon } from './NodeLibrary';
import { usePipelineStore } from '../store/pipelineStore';
import { DataType, PortDefinition } from '@/shared/contracts';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Loader2,
  Clock,
  XCircle,
} from 'lucide-react';

const categoryColorMap: Record<string, { bg: string; text: string; border: string }> = {
  ACQUISITION: { bg: 'bg-emerald-50 dark:bg-emerald-950/80', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700/60' },
  PREPROCESSING: { bg: 'bg-cyan-50 dark:bg-cyan-950/80', text: 'text-cyan-700 dark:text-cyan-400', border: 'border-cyan-300 dark:border-cyan-700/60' },
  INSPECTION: { bg: 'bg-amber-50 dark:bg-amber-950/80', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-700/60' },
  AI_INFERENCE: { bg: 'bg-purple-50 dark:bg-purple-950/80', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-300 dark:border-purple-700/60' },
  LOGIC_GATE: { bg: 'bg-indigo-50 dark:bg-indigo-950/80', text: 'text-indigo-700 dark:text-indigo-400', border: 'border-indigo-300 dark:border-indigo-700/60' },
  OUTPUT: { bg: 'bg-pink-50 dark:bg-pink-950/80', text: 'text-pink-700 dark:text-pink-400', border: 'border-pink-300 dark:border-pink-700/60' },
};

const dataTypeColorMap: Record<DataType, string> = {
  // Legacy
  IMAGE: 'bg-cyan-500 border-cyan-300',
  NUMPY_ARRAY: 'bg-teal-500 border-teal-300',
  DETECTIONS: 'bg-amber-500 border-amber-300',
  CONTOURS: 'bg-emerald-500 border-emerald-300',
  CLASSIFICATION: 'bg-purple-500 border-purple-300',
  NUMBER: 'bg-orange-500 border-orange-300',
  BOOLEAN: 'bg-rose-500 border-rose-300',
  STRING: 'bg-sky-500 border-sky-300',
  JSON: 'bg-slate-500 border-slate-300',

  // Long-term standardized types
  ImageFrame: 'bg-cyan-500 border-cyan-300',
  MaskFrame: 'bg-teal-400 border-teal-200',
  DetectionResult: 'bg-amber-500 border-amber-300',
  ClassificationResult: 'bg-purple-500 border-purple-300',
  OCRResult: 'bg-indigo-400 border-indigo-200',
  MeasurementResult: 'bg-lime-500 border-lime-300',
  InspectionResult: 'bg-rose-500 border-rose-300',
  Scalar: 'bg-orange-500 border-orange-300',
  Boolean: 'bg-rose-500 border-rose-300',
};

export const CustomPipelineNode: React.FC<NodeProps> = memo(({ id, data, selected }) => {
  const nodeType = (data as any)?.nodeType;
  const nodeName = (data as any)?.name || 'Unnamed Node';
  const contract = getNodeContract(nodeType);

  const validationReport = usePipelineStore((state) => state.validationReport);
  const nodeExecState = usePipelineStore((state) => state.nodeExecutionStates[id]);

  const nodeErrors = validationReport.errors.filter((e) => e.nodeId === id);
  const nodeWarnings = validationReport.warnings.filter((w) => w.nodeId === id);
  const hasError = nodeErrors.length > 0;
  const hasWarning = nodeWarnings.length > 0;

  const categoryStyle = contract
    ? categoryColorMap[contract.category] || categoryColorMap.PREPROCESSING
    : categoryColorMap.PREPROCESSING;

  const isRuntimeReady = contract?.runtime?.supported ?? true;
  const isFailed = nodeExecState?.status === 'failed';
  const isRunning = nodeExecState?.status === 'running';
  const isCompleted = nodeExecState?.status === 'completed';

  return (
    <div
      className={`relative min-w-[220px] rounded-lg border bg-white dark:bg-slate-900/95 shadow-md dark:shadow-xl transition-all select-none ${
        selected
          ? 'border-cyan-500 ring-2 ring-cyan-500/40 shadow-cyan-500/20 dark:border-cyan-400 dark:ring-cyan-400/40 dark:shadow-cyan-900/40'
          : isFailed
          ? 'border-rose-500 shadow-rose-500/20 dark:shadow-rose-950/60 ring-1 ring-rose-500/50'
          : isRunning
          ? 'border-cyan-500/80 shadow-cyan-500/30 ring-1 ring-cyan-400 animate-pulse'
          : isCompleted
          ? 'border-emerald-500/70 dark:border-emerald-600/70 shadow-emerald-500/10 dark:shadow-emerald-950/30'
          : hasError
          ? 'border-rose-500 shadow-rose-500/20'
          : hasWarning
          ? 'border-amber-500/80 shadow-amber-500/20'
          : 'border-slate-300 dark:border-slate-700/80 hover:border-slate-400 dark:hover:border-slate-600'
      }`}
    >
      {/* Node Header */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 rounded-t-lg flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-1 rounded bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shrink-0">
            {renderNodeIcon(contract?.icon || 'layers')}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate" title={nodeName}>
              {nodeName}
            </h4>
            <div className="flex items-center space-x-1 mt-0.5">
              <span
                className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded border ${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border}`}
              >
                {contract?.category || 'NODE'}
              </span>
              {!isRuntimeReady && (
                <span
                  className="text-[8px] font-mono px-1 rounded bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800 flex items-center space-x-0.5"
                  title="Runtime implementation pending"
                >
                  <Cpu className="w-2 h-2" />
                  <span>Pending</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Runtime Execution & Validation Status Indicator */}
        <div className="shrink-0 flex items-center space-x-1">
          {isRunning ? (
            <span title="Running in OpenCV Python Runtime...">
              <Loader2 className="w-4 h-4 text-cyan-500 dark:text-cyan-400 animate-spin" />
            </span>
          ) : isCompleted ? (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800 flex items-center space-x-0.5"
              title={`Execution duration: ${nodeExecState.durationMs}ms`}
            >
              <Clock className="w-2.5 h-2.5" />
              <span>{nodeExecState.durationMs}ms</span>
            </span>
          ) : isFailed ? (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-400 dark:border-rose-800 flex items-center space-x-0.5"
              title={nodeExecState.error || 'Execution failed'}
            >
              <XCircle className="w-2.5 h-2.5" />
              <span>Failed</span>
            </span>
          ) : hasError ? (
            <span title={nodeErrors[0]?.message}>
              <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 animate-pulse" />
            </span>
          ) : hasWarning ? (
            <span title={nodeWarnings[0]?.message}>
              <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            </span>
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
          )}
        </div>
      </div>

      {/* Node Ports Body */}
      <div className="p-3 space-y-2 text-[11px]">
        {/* Input Ports */}
        {contract?.inputs && contract.inputs.length > 0 && (
          <div className="space-y-1.5">
            {contract.inputs.map((input: PortDefinition) => {
              const portColor = dataTypeColorMap[input.dataType] || 'bg-slate-400';
              return (
                <div key={input.id} className="relative flex items-center justify-start text-left pl-2">
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={input.id}
                    className={`!w-3 !h-3 !border-2 ${portColor} hover:scale-125 transition-transform`}
                    style={{ left: -7 }}
                  />
                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{input.name}</span>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">({input.dataType})</span>
                    {input.required && <span className="text-rose-500 text-[10px]">*</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Output Ports */}
        {contract?.outputs && contract.outputs.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {contract.outputs.map((output: PortDefinition) => {
              const portColor = dataTypeColorMap[output.dataType] || 'bg-slate-400';
              return (
                <div key={output.id} className="relative flex items-center justify-end text-right pr-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">({output.dataType})</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{output.name}</span>
                  </div>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={output.id}
                    className={`!w-3 !h-3 !border-2 ${portColor} hover:scale-125 transition-transform`}
                    style={{ right: -7 }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-3 py-1 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800/80 rounded-b-lg flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono">
        <span className="truncate max-w-[120px]">{id}</span>
        <span>v{contract?.version || '1.0.0'}</span>
      </div>
    </div>
  );
});

CustomPipelineNode.displayName = 'CustomPipelineNode';
