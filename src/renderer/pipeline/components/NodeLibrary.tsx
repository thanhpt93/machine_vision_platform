import React, { useState } from 'react';
import { NODE_REGISTRY } from '../registry/nodeRegistry';
import { usePipelineStore } from '../store/pipelineStore';
import { Search, Plus, Layers, Camera, Crop, Sliders, Monitor, HelpCircle } from 'lucide-react';
import { NodeCategory } from '@/shared/contracts';

const categoryLabels: Record<NodeCategory, { name: string; color: string }> = {
  ACQUISITION: { name: 'Acquisition', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' },
  PREPROCESSING: { name: 'Preprocessing', color: 'text-cyan-400 bg-cyan-950/60 border-cyan-800' },
  INSPECTION: { name: 'Inspection', color: 'text-amber-400 bg-amber-950/60 border-amber-800' },
  AI_INFERENCE: { name: 'AI Inference', color: 'text-purple-400 bg-purple-950/60 border-purple-800' },
  LOGIC_GATE: { name: 'Logic Gate', color: 'text-indigo-400 bg-indigo-950/60 border-indigo-800' },
  OUTPUT: { name: 'Output View', color: 'text-pink-400 bg-pink-950/60 border-pink-800' },
};

const getNodeIcon = (nodeType: string) => {
  switch (nodeType) {
    case 'image_file':
      return <Camera className="w-4 h-4 text-emerald-400" />;
    case 'roi_crop':
      return <Crop className="w-4 h-4 text-cyan-400" />;
    case 'threshold':
      return <Sliders className="w-4 h-4 text-cyan-400" />;
    case 'result_viewer':
      return <Monitor className="w-4 h-4 text-pink-400" />;
    default:
      return <Layers className="w-4 h-4 text-slate-400" />;
  }
};

export const NodeLibrary: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const addNode = usePipelineStore((state) => state.addNode);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow/nodetype', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const filteredNodes = Object.values(NODE_REGISTRY).filter((node) => {
    const matchesSearch =
      node.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.nodeType.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const categories: NodeCategory[] = [
    'ACQUISITION',
    'PREPROCESSING',
    'INSPECTION',
    'AI_INFERENCE',
    'LOGIC_GATE',
    'OUTPUT',
  ];

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full select-none shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Node Library
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
            {Object.keys(NODE_REGISTRY).length} nodes
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search nodes..."
            className="w-full bg-slate-900/90 border border-slate-700/80 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
      </div>

      {/* Guide Note */}
      <div className="px-3 py-2 bg-slate-950/30 border-b border-slate-800/80 text-[11px] text-slate-400 flex items-start space-x-2">
        <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
        <span>Drag nodes onto canvas or click (+) to add.</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {categories.map((cat) => {
          const catNodes = filteredNodes.filter((n) => n.category === cat);
          if (catNodes.length === 0) return null;

          const catMeta = categoryLabels[cat];

          return (
            <div key={cat} className="space-y-2">
              <div className="flex items-center space-x-2">
                <span
                  className={`text-[10px] font-mono uppercase font-semibold px-1.5 py-0.5 rounded border ${catMeta.color}`}
                >
                  {catMeta.name}
                </span>
                <div className="h-px bg-slate-800 flex-1" />
              </div>

              <div className="space-y-2">
                {catNodes.map((node) => (
                  <div
                    key={node.nodeType}
                    draggable
                    onDragStart={(e) => onDragStart(e, node.nodeType)}
                    className="group bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/50 rounded-lg p-2.5 cursor-grab active:cursor-grabbing transition-all shadow-sm hover:shadow-cyan-950/20"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0">
                        <div className="p-1 rounded bg-slate-800 border border-slate-700 shrink-0 group-hover:scale-105 transition-transform">
                          {getNodeIcon(node.nodeType)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                            {node.displayName}
                          </h4>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {node.nodeType}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => addNode(node.nodeType)}
                        title="Add node to canvas"
                        className="p-1 rounded hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 opacity-60 group-hover:opacity-100 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                      {node.description}
                    </p>

                    {/* Ports Summary */}
                    <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>In: {node.inputs.length}</span>
                      <span>•</span>
                      <span>Out: {node.outputs.length}</span>
                      <span>•</span>
                      <span>v{node.version}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {filteredNodes.length === 0 && (
          <div className="text-center py-8 text-xs text-slate-500">
            No nodes found matching &quot;{searchTerm}&quot;
          </div>
        )}
      </div>
    </aside>
  );
};
