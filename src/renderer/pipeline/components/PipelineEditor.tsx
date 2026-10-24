import React, { useState } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { NodeLibrary } from './NodeLibrary';
import { PipelineCanvas } from './PipelineCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { DebugPanel } from './DebugPanel';
import {
  FilePlus,
  FolderOpen,
  Save,
  Download,
  Upload,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

interface PipelineEditorProps {
  onOpenDiagnostics?: () => void;
}

export const PipelineEditor: React.FC<PipelineEditorProps> = ({ onOpenDiagnostics }) => {
  const pipelineMeta = usePipelineStore((state) => state.pipelineMeta);
  const isDirty = usePipelineStore((state) => state.isDirty);
  const updatePipelineMeta = usePipelineStore((state) => state.updatePipelineMeta);
  const newPipeline = usePipelineStore((state) => state.newPipeline);
  const savePipelineFile = usePipelineStore((state) => state.savePipelineFile);
  const openPipelineFile = usePipelineStore((state) => state.openPipelineFile);
  const exportPipeline = usePipelineStore((state) => state.exportPipeline);
  const loadPipeline = usePipelineStore((state) => state.loadPipeline);
  const lastSavedAt = usePipelineStore((state) => state.lastSavedAt);

  const [isEditingName, setIsEditingName] = useState(false);
  const [pipelineName, setPipelineName] = useState(pipelineMeta.name);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (pipelineName.trim() && pipelineName !== pipelineMeta.name) {
      updatePipelineMeta({ name: pipelineName.trim() });
    } else {
      setPipelineName(pipelineMeta.name);
    }
  };

  const handleNew = () => {
    if (isDirty) {
      const confirmNew = window.confirm(
        'You have unsaved changes. Creating a new pipeline will discard them. Do you want to continue?'
      );
      if (!confirmNew) return;
    }
    newPipeline();
    setPipelineName('Untitled Pipeline');
  };

  const handleSave = async () => {
    setErrorMessage(null);
    const res = await savePipelineFile();
    if (!res.success && !res.canceled && res.error) {
      setErrorMessage(res.error);
    }
  };

  const handleOpen = async () => {
    if (isDirty) {
      const confirmOpen = window.confirm(
        'You have unsaved changes. Opening another pipeline will overwrite current work. Continue?'
      );
      if (!confirmOpen) return;
    }
    setErrorMessage(null);
    const res = await openPipelineFile();
    if (!res.success && !res.canceled && res.error) {
      setErrorMessage(res.error);
    } else if (res.success) {
      setPipelineName(usePipelineStore.getState().pipelineMeta.name);
    }
  };

  const handleExportJson = () => {
    const data = exportPipeline();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pipelineMeta.name.toLowerCase().replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImportJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          const res = loadPipeline(parsed);
          if (!res.success) {
            setErrorMessage(res.error || 'Failed to parse pipeline schema.');
          } else {
            setErrorMessage(null);
            setPipelineName(usePipelineStore.getState().pipelineMeta.name);
          }
        } catch {
          setErrorMessage('File contains invalid JSON syntax.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Toolbar */}
      <div className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 select-none">
        {/* Pipeline Title & Status */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="flex items-center space-x-2 min-w-0">
            {isEditingName ? (
              <input
                type="text"
                autoFocus
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleNameBlur()}
                className="bg-slate-950 border border-cyan-500 rounded px-2 py-0.5 text-sm font-semibold text-white focus:outline-none"
              />
            ) : (
              <h2
                onClick={() => setIsEditingName(true)}
                title="Click to rename pipeline"
                className="text-sm font-semibold text-slate-100 hover:text-cyan-400 cursor-pointer truncate max-w-[280px] transition-colors"
              >
                {pipelineMeta.name}
              </h2>
            )}

            {isDirty && (
              <span
                className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800"
                title="Unsaved changes in canvas"
              >
                ● Unsaved
              </span>
            )}
          </div>

          <span className="text-slate-700">|</span>

          <span className="text-[11px] font-mono text-slate-400 hidden lg:inline">
            Schema: v1.0.0
          </span>

          {lastSavedAt && (
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              Saved at {lastSavedAt}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* File Operations */}
          <div className="flex items-center space-x-1 border-r border-slate-800 pr-2">
            <button
              type="button"
              onClick={handleNew}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs border border-slate-700/60 transition-colors"
              title="Create new pipeline (discards unsaved changes)"
            >
              <FilePlus className="w-3.5 h-3.5 text-cyan-400" />
              <span>New</span>
            </button>

            <button
              type="button"
              onClick={handleOpen}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs border border-slate-700/60 transition-colors"
              title="Open pipeline file via controlled dialog"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Open</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow-sm transition-colors"
              title="Save pipeline file via controlled dialog"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          </div>

          {/* Import / Export JSON */}
          <div className="flex items-center space-x-1 border-r border-slate-800 pr-2 hidden sm:flex">
            <button
              type="button"
              onClick={handleImportJson}
              className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors"
              title="Import JSON directly"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors"
              title="Export JSON file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>

          {/* Diagnostics Switcher */}
          {onOpenDiagnostics && (
            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition-colors"
              title="View Python Runtime Health Diagnostics"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden md:inline">Diagnostics</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="bg-rose-950/80 border-b border-rose-800 px-4 py-2 flex items-center justify-between text-xs text-rose-200">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-white text-xs underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace (Area A, B, C) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Area A: Node Library */}
        <NodeLibrary />

        {/* Area B: Pipeline Canvas */}
        <PipelineCanvas />

        {/* Area C: Properties Panel */}
        <PropertiesPanel />
      </div>

      {/* Area D: Debug Panel */}
      <DebugPanel />
    </div>
  );
};
