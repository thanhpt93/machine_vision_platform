import React, { useState, useEffect } from 'react';
import { nodeRegistry, NodeRegistryItem } from '../registry/nodeRegistry';
import { usePipelineStore } from '../store/pipelineStore';
import {
  Search,
  Plus,
  Layers,
  Camera,
  Crop,
  Sliders,
  HelpCircle,
  Wind,
  Brain,
  Cpu,
  PlusCircle,
  Zap,
  Scissors,
  Shapes,
  Ruler,
  CheckCircle2,
  Database,
  Eye,
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from 'lucide-react';
import { NodeCategory, CATEGORY_CATALOG } from '@/shared/contracts';
import { CreateNodeModal } from './CreateNodeModal';

const categoryLabels: Record<NodeCategory, { name: string; color: string }> = {
  // 9 Canonical Categories
  image_acquisition: { name: 'Acquisition', color: 'text-emerald-700 bg-emerald-50 border-emerald-300 dark:text-emerald-400 dark:bg-emerald-950/60 dark:border-emerald-800' },
  image_preparation: { name: 'Preparation', color: 'text-cyan-700 bg-cyan-50 border-cyan-300 dark:text-cyan-400 dark:bg-cyan-950/60 dark:border-cyan-800' },
  image_processing: { name: 'Processing', color: 'text-blue-700 bg-blue-50 border-blue-300 dark:text-blue-400 dark:bg-blue-950/60 dark:border-blue-800' },
  segmentation: { name: 'Segmentation', color: 'text-teal-700 bg-teal-50 border-teal-300 dark:text-teal-400 dark:bg-teal-950/60 dark:border-teal-800' },
  feature_extraction: { name: 'Feature Extraction', color: 'text-amber-700 bg-amber-50 border-amber-300 dark:text-amber-400 dark:bg-amber-950/60 dark:border-amber-800' },
  measurement_metrology: { name: 'Metrology', color: 'text-lime-700 bg-lime-50 border-lime-300 dark:text-lime-400 dark:bg-lime-950/60 dark:border-lime-800' },
  decision_inspection_logic: { name: 'Inspection Logic', color: 'text-indigo-700 bg-indigo-50 border-indigo-300 dark:text-indigo-400 dark:bg-indigo-950/60 dark:border-indigo-800' },
  visualization: { name: 'Visualization', color: 'text-pink-700 bg-pink-50 border-pink-300 dark:text-pink-400 dark:bg-pink-950/60 dark:border-pink-800' },
  data_logging: { name: 'Data & Logging', color: 'text-violet-700 bg-violet-50 border-violet-300 dark:text-violet-400 dark:bg-violet-950/60 dark:border-violet-800' },
  ai_inference: { name: 'AI Inference', color: 'text-purple-700 bg-purple-50 border-purple-300 dark:text-purple-400 dark:bg-purple-950/60 dark:border-purple-800' },

  // Legacy aliases
  ACQUISITION: { name: 'Acquisition', color: 'text-emerald-700 bg-emerald-50 border-emerald-300 dark:text-emerald-400 dark:bg-emerald-950/60 dark:border-emerald-800' },
  PREPROCESSING: { name: 'Preprocessing', color: 'text-cyan-700 bg-cyan-50 border-cyan-300 dark:text-cyan-400 dark:bg-cyan-950/60 dark:border-cyan-800' },
  INSPECTION: { name: 'Inspection', color: 'text-amber-700 bg-amber-50 border-amber-300 dark:text-amber-400 dark:bg-amber-950/60 dark:border-amber-800' },
  AI_INFERENCE: { name: 'AI Inference', color: 'text-purple-700 bg-purple-50 border-purple-300 dark:text-purple-400 dark:bg-purple-950/60 dark:border-purple-800' },
  LOGIC_GATE: { name: 'Logic Gate', color: 'text-indigo-700 bg-indigo-50 border-indigo-300 dark:text-indigo-400 dark:bg-indigo-950/60 dark:border-indigo-800' },
  OUTPUT: { name: 'Output View', color: 'text-pink-700 bg-pink-50 border-pink-300 dark:text-pink-400 dark:bg-pink-950/60 dark:border-pink-800' },
};

export const renderNodeIcon = (iconName: string) => {
  switch (iconName) {
    case 'camera':
      return <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    case 'crop':
      return <Crop className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />;
    case 'sliders':
      return <Sliders className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />;
    case 'zap':
      return <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'scissors':
      return <Scissors className="w-4 h-4 text-teal-600 dark:text-teal-400" />;
    case 'shapes':
      return <Shapes className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    case 'ruler':
      return <Ruler className="w-4 h-4 text-lime-600 dark:text-lime-400" />;
    case 'check-circle-2':
      return <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    case 'eye':
    case 'monitor':
      return <Eye className="w-4 h-4 text-pink-600 dark:text-pink-400" />;
    case 'database':
      return <Database className="w-4 h-4 text-violet-600 dark:text-violet-400" />;
    case 'blur':
      return <Wind className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />;
    case 'brain':
      return <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
    case 'file-text':
      return <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
    default:
      return <Layers className="w-4 h-4 text-slate-500 dark:text-slate-400" />;
  }
};

export const NodeLibrary: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isCategoryListExpanded, setIsCategoryListExpanded] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [allNodes, setAllNodes] = useState<NodeRegistryItem[]>(() => nodeRegistry.getAll());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const addNode = usePipelineStore((state) => state.addNode);

  // Subscribe to dynamic NodeRegistry additions/modifications
  useEffect(() => {
    const unsubscribe = nodeRegistry.subscribe(() => {
      setAllNodes(nodeRegistry.getAll());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow/nodetype', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const toggleCategorySection = (category: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const filteredNodes = (searchTerm.trim()
    ? nodeRegistry.search(searchTerm)
    : allNodes
  ).filter((n) => {
    if (selectedCategory === 'ALL') return true;
    return n.category === selectedCategory;
  });

  // Collect active categories based on registered nodes and catalogue order
  const activeCategories = Array.from(new Set(allNodes.map((n) => n.category)));

  return (
    <>
      <aside className="w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full select-none shrink-0 transition-colors">
        {/* Header */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Node Library
              </h3>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {allNodes.length} nodes
              </span>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 hover:bg-cyan-200 border border-cyan-300 text-cyan-800 dark:bg-cyan-950/80 dark:hover:bg-cyan-900 dark:border-cyan-800 dark:text-cyan-300 transition-colors cursor-pointer"
                title="Create and register a custom node dynamically from UI"
              >
                <PlusCircle className="w-3 h-3" />
                <span>Custom</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, type, or tags..."
              className="w-full bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/80 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Vertical Category Navigation Section */}
          <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
            <div className="flex items-center justify-between pb-1.5 mb-1">
              <div className="flex items-center space-x-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                <span>Categories</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {selectedCategory === 'ALL' ? `${CATEGORY_CATALOG.length}` : '1 Filtered'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {selectedCategory !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline font-medium cursor-pointer"
                  >
                    Show All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCategoryListExpanded(!isCategoryListExpanded)}
                  className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center space-x-0.5 px-1 py-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title={isCategoryListExpanded ? 'Collapse categories' : 'Expand categories'}
                >
                  <span>{isCategoryListExpanded ? 'Collapse' : 'Expand'}</span>
                  {isCategoryListExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {isCategoryListExpanded && (
              <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin text-xs">
                {/* All Categories Option */}
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all text-left cursor-pointer ${
                    selectedCategory === 'ALL'
                      ? 'bg-cyan-600 text-white font-medium shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate font-medium">All Categories</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      selectedCategory === 'ALL'
                        ? 'bg-cyan-700 text-white'
                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {allNodes.length}
                  </span>
                </button>

                {/* 9 Standard Categories */}
                {CATEGORY_CATALOG.map((cat) => {
                  const count = allNodes.filter((n) => n.category === cat.id).length;
                  if (count === 0) return null;
                  const isSelected = selectedCategory === cat.id;

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all text-left cursor-pointer group ${
                        isSelected
                          ? 'bg-cyan-600 text-white font-medium shadow-xs'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="shrink-0">{renderNodeIcon(cat.icon)}</span>
                        <span className="truncate">{cat.name}</span>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full shrink-0 ${
                          isSelected
                            ? 'bg-cyan-700 text-white'
                            : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:bg-slate-300 dark:group-hover:bg-slate-700'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Guide Note */}
        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-slate-950/30 border-b border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 flex items-start space-x-2">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
          <span>Drag nodes onto canvas or click (+) to add.</span>
        </div>

        {/* Node List Grouped by Category */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {activeCategories.map((cat) => {
            const catNodes = filteredNodes.filter((n) => n.category === cat);
            if (catNodes.length === 0) return null;

            const catMeta = categoryLabels[cat] || { name: cat, color: 'text-slate-600 bg-slate-100 border-slate-300' };
            const isSectionCollapsed = collapsedSections.has(cat);

            return (
              <div key={cat} className="space-y-2">
                <button
                  type="button"
                  onClick={() => toggleCategorySection(cat)}
                  className="w-full flex items-center justify-between p-1 -m-1 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded transition-colors text-left group cursor-pointer"
                  title={isSectionCollapsed ? 'Expand category group' : 'Collapse category group'}
                >
                  <div className="flex items-center space-x-1.5">
                    {isSectionCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
                    )}
                    <span
                      className={`text-[10px] font-mono uppercase font-semibold px-1.5 py-0.5 rounded border ${catMeta.color}`}
                    >
                      {catMeta.name} ({catNodes.length})
                    </span>
                  </div>
                  <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1 ml-2" />
                </button>

                {!isSectionCollapsed && (
                  <div className="space-y-2">
                    {catNodes.map((node) => {
                      const isRuntimeReady = node.runtime?.supported ?? true;

                      return (
                        <div
                          key={node.nodeType}
                          draggable
                          onDragStart={(e) => onDragStart(e, node.nodeType)}
                          className="group bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 hover:border-cyan-500/50 rounded-lg p-2.5 cursor-grab active:cursor-grabbing transition-all shadow-xs hover:shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 min-w-0">
                              <div className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                                {renderNodeIcon(node.icon)}
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-xs font-medium text-slate-800 dark:text-slate-200 group-hover:text-cyan-700 dark:group-hover:text-white truncate">
                                  {node.displayName}
                                </h4>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {node.nodeType}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => addNode(node.nodeType)}
                                title="Add node to canvas"
                                className="p-1 rounded hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-slate-500 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-400 opacity-60 group-hover:opacity-100 transition-all cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2">
                            {node.description}
                          </p>

                          {/* Tags & Runtime status */}
                          <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            <div className="flex items-center space-x-1 truncate max-w-[150px]">
                              {node.tags.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className="px-1 py-0.2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>

                            <span
                              className={`px-1.5 py-0.2 rounded border text-[9px] flex items-center space-x-0.5 ${
                                isRuntimeReady
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80'
                                  : 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/80'
                              }`}
                              title={
                                isRuntimeReady
                                  ? 'Runtime Implementation Ready'
                                  : 'Runtime Pending / Extension Required'
                              }
                            >
                              <Cpu className="w-2.5 h-2.5" />
                              <span>{isRuntimeReady ? 'Ready' : 'Pending'}</span>
                            </span>
                          </div>

                          {/* Ports Summary */}
                          <div className="mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>In: {node.inputs.length}</span>
                            <span>•</span>
                            <span>Out: {node.outputs.length}</span>
                            <span>•</span>
                            <span>v{node.version}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {filteredNodes.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">
              No nodes found matching &quot;{searchTerm}&quot;
            </div>
          )}
        </div>
      </aside>

      {/* Dynamic Node Creation Modal */}
      <CreateNodeModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </>
  );
};
