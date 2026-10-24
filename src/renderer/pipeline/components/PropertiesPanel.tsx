import React from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { getNodeContract, ThresholdModeSchema } from '../registry/nodeRegistry';
import { Settings2, Trash2, Info, AlertCircle, CheckCircle } from 'lucide-react';
import { PortDefinition } from '@/shared/contracts';

export const PropertiesPanel: React.FC = () => {
  const selectedNodeId = usePipelineStore((state) => state.selectedNodeId);
  const nodes = usePipelineStore((state) => state.nodes);
  const updateNodeName = usePipelineStore((state) => state.updateNodeName);
  const updateNodeConfig = usePipelineStore((state) => state.updateNodeConfig);
  const deleteNode = usePipelineStore((state) => state.deleteNode);
  const validationReport = usePipelineStore((state) => state.validationReport);

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
      <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full select-none shrink-0">
        <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex items-center space-x-2">
          <Settings2 className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Node Properties
          </h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400">
            <Info className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-300">No Node Selected</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
              Click on any node in the canvas to inspect its configuration and parameters.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full select-none shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <Settings2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 truncate">
              {contract.displayName}
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">{contract.category}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => deleteNode(selectedNode.id)}
          title="Delete selected node"
          className="p-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/40 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Validation status badge */}
      <div className="px-3 py-2 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between text-xs">
        <span className="text-slate-400 font-mono text-[11px] truncate max-w-[170px]">
          ID: {selectedNode.id}
        </span>
        {nodeErrors.length > 0 ? (
          <span className="flex items-center space-x-1 text-rose-400 text-[11px]">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{nodeErrors.length} Error(s)</span>
          </span>
        ) : nodeWarnings.length > 0 ? (
          <span className="flex items-center space-x-1 text-amber-400 text-[11px]">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Warning</span>
          </span>
        ) : (
          <span className="flex items-center space-x-1 text-emerald-400 text-[11px]">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Valid</span>
          </span>
        )}
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node Name */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300">Node Display Name</label>
          <input
            type="text"
            value={nodeName}
            onChange={(e) => updateNodeName(selectedNode.id, e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="border-t border-slate-800 pt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Node Configuration
          </h4>

          {/* Dynamic Configuration Form Fields */}
          {selectedNode.data.nodeType === 'image_file' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">File Path</label>
                <input
                  type="text"
                  value={config.filePath || ''}
                  onChange={(e) => updateNodeConfig(selectedNode.id, { filePath: e.target.value })}
                  placeholder="e.g. sample_images/pcb_board.png"
                  className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none ${
                    getFieldError('filePath')
                      ? 'border-rose-500 focus:border-rose-400'
                      : 'border-slate-700 focus:border-cyan-500'
                  }`}
                />
                {getFieldError('filePath') && (
                  <p className="text-[10px] text-rose-400 mt-1">{getFieldError('filePath')}</p>
                )}
              </div>

              {/* Sample file presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Sample Presets:</span>
                <div className="grid grid-cols-1 gap-1">
                  {['samples/pcb_board.png', 'samples/gear_defect.png', 'samples/bottle_cap.png'].map(
                    (sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => updateNodeConfig(selectedNode.id, { filePath: sample })}
                        className="text-left text-[11px] font-mono px-2 py-1 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded text-slate-300 truncate"
                      >
                        {sample}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {selectedNode.data.nodeType === 'roi_crop' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">X Position (px)</label>
                  <input
                    type="number"
                    value={config.x ?? 0}
                    onChange={(e) =>
                      updateNodeConfig(selectedNode.id, { x: parseInt(e.target.value, 10) || 0 })
                    }
                    className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none ${
                      getFieldError('x') ? 'border-rose-500' : 'border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {getFieldError('x') && (
                    <p className="text-[10px] text-rose-400">{getFieldError('x')}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Y Position (px)</label>
                  <input
                    type="number"
                    value={config.y ?? 0}
                    onChange={(e) =>
                      updateNodeConfig(selectedNode.id, { y: parseInt(e.target.value, 10) || 0 })
                    }
                    className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none ${
                      getFieldError('y') ? 'border-rose-500' : 'border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {getFieldError('y') && (
                    <p className="text-[10px] text-rose-400">{getFieldError('y')}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Width (px)</label>
                  <input
                    type="number"
                    value={config.width ?? 100}
                    onChange={(e) =>
                      updateNodeConfig(selectedNode.id, {
                        width: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none ${
                      getFieldError('width')
                        ? 'border-rose-500'
                        : 'border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {getFieldError('width') && (
                    <p className="text-[10px] text-rose-400">{getFieldError('width')}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Height (px)</label>
                  <input
                    type="number"
                    value={config.height ?? 100}
                    onChange={(e) =>
                      updateNodeConfig(selectedNode.id, {
                        height: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none ${
                      getFieldError('height')
                        ? 'border-rose-500'
                        : 'border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {getFieldError('height') && (
                    <p className="text-[10px] text-rose-400">{getFieldError('height')}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {selectedNode.data.nodeType === 'threshold' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">Threshold Value</label>
                  <span className="text-xs font-mono text-cyan-400">{config.threshold ?? 128}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={config.threshold ?? 128}
                  onChange={(e) =>
                    updateNodeConfig(selectedNode.id, {
                      threshold: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                {getFieldError('threshold') && (
                  <p className="text-[10px] text-rose-400">{getFieldError('threshold')}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Threshold Mode</label>
                <select
                  value={config.mode || 'BINARY'}
                  onChange={(e) => updateNodeConfig(selectedNode.id, { mode: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {ThresholdModeSchema.options.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {getFieldError('mode') && (
                  <p className="text-[10px] text-rose-400">{getFieldError('mode')}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Max Value (0-255)</label>
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={config.maxVal ?? 255}
                  onChange={(e) =>
                    updateNodeConfig(selectedNode.id, {
                      maxVal: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none ${
                    getFieldError('maxVal')
                      ? 'border-rose-500'
                      : 'border-slate-700 focus:border-cyan-500'
                  }`}
                />
                {getFieldError('maxVal') && (
                  <p className="text-[10px] text-rose-400">{getFieldError('maxVal')}</p>
                )}
              </div>
            </div>
          )}

          {selectedNode.data.nodeType === 'result_viewer' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Viewer Window Title</label>
                <input
                  type="text"
                  value={config.title || ''}
                  onChange={(e) => updateNodeConfig(selectedNode.id, { title: e.target.value })}
                  className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none ${
                    getFieldError('title')
                      ? 'border-rose-500'
                      : 'border-slate-700 focus:border-cyan-500'
                  }`}
                />
                {getFieldError('title') && (
                  <p className="text-[10px] text-rose-400">{getFieldError('title')}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Default Zoom Level</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={config.zoomLevel ?? 1.0}
                  onChange={(e) =>
                    updateNodeConfig(selectedNode.id, {
                      zoomLevel: parseFloat(e.target.value) || 1.0,
                    })
                  }
                  className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none ${
                    getFieldError('zoomLevel')
                      ? 'border-rose-500'
                      : 'border-slate-700 focus:border-cyan-500'
                  }`}
                />
                {getFieldError('zoomLevel') && (
                  <p className="text-[10px] text-rose-400">{getFieldError('zoomLevel')}</p>
                )}
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="showHistogram"
                  checked={config.showHistogram || false}
                  onChange={(e) =>
                    updateNodeConfig(selectedNode.id, { showHistogram: e.target.checked })
                  }
                  className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <label htmlFor="showHistogram" className="text-xs text-slate-300 select-none">
                  Display Luminance Histogram
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Node Ports Reference */}
        <div className="border-t border-slate-800 pt-3 space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Node Ports Contract
          </h4>

          {contract.inputs.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-mono">Inputs:</span>
              {contract.inputs.map((inp: PortDefinition) => (
                <div
                  key={inp.id}
                  className="text-[11px] bg-slate-950/60 p-1.5 rounded border border-slate-800 flex items-center justify-between"
                >
                  <span className="text-slate-300">{inp.name}</span>
                  <span className="text-[10px] font-mono text-cyan-400">{inp.dataType}</span>
                </div>
              ))}
            </div>
          )}

          {contract.outputs.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-mono">Outputs:</span>
              {contract.outputs.map((out: PortDefinition) => (
                <div
                  key={out.id}
                  className="text-[11px] bg-slate-950/60 p-1.5 rounded border border-slate-800 flex items-center justify-between"
                >
                  <span className="text-slate-300">{out.name}</span>
                  <span className="text-[10px] font-mono text-cyan-400">{out.dataType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
