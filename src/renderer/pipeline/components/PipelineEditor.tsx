import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { useThemeStore } from '../../store/themeStore';
import { runtimeApi } from '../../services/runtimeApi';
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
  FileCode2,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Sun,
  Moon,
  Rocket,
  X,
} from 'lucide-react';

interface PipelineEditorProps {
  onOpenDiagnostics?: () => void;
  onOpenProductionMode?: () => void;
}

export const PipelineEditor: React.FC<PipelineEditorProps> = ({
  onOpenDiagnostics,
  onOpenProductionMode,
}) => {
  const pipelineMeta = usePipelineStore((state) => state.pipelineMeta);
  const isDirty = usePipelineStore((state) => state.isDirty);
  const currentFilePath = usePipelineStore((state) => state.currentFilePath);
  const updatePipelineMeta = usePipelineStore((state) => state.updatePipelineMeta);
  const newPipeline = usePipelineStore((state) => state.newPipeline);
  const savePipelineFile = usePipelineStore((state) => state.savePipelineFile);
  const saveAsPipelineFile = usePipelineStore((state) => state.saveAsPipelineFile);
  const openPipelineFile = usePipelineStore((state) => state.openPipelineFile);
  const exportPipeline = usePipelineStore((state) => state.exportPipeline);
  const loadPipeline = usePipelineStore((state) => state.loadPipeline);
  const lastSavedAt = usePipelineStore((state) => state.lastSavedAt);

  // Phase 3 Real OpenCV Execution State
  const runPipeline = usePipelineStore((state) => state.runPipeline);
  const isExecuting = usePipelineStore((state) => state.isExecuting);
  const executionSummary = usePipelineStore((state) => state.executionSummary);

  // Theme Management
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const [isEditingName, setIsEditingName] = useState(false);
  const [pipelineName, setPipelineName] = useState(pipelineMeta.name);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Release Pipeline Modal State
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseVersionInput, setReleaseVersionInput] = useState('1.0.0');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseSuccessBanner, setReleaseSuccessBanner] = useState<string | null>(null);

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (pipelineName.trim() && pipelineName !== pipelineMeta.name) {
      updatePipelineMeta({ name: pipelineName.trim() });
    } else {
      setPipelineName(pipelineMeta.name);
    }
  };

  const handleNew = useCallback(() => {
    if (isDirtyRef.current) {
      const confirmNew = window.confirm(
        'You have unsaved changes. Creating a new pipeline will discard them. Do you want to continue?'
      );
      if (!confirmNew) return;
    }
    newPipeline();
    setPipelineName('Untitled Pipeline');
  }, [newPipeline]);

  const handleSave = useCallback(async () => {
    setErrorMessage(null);
    const res = await savePipelineFile(false);
    if (!res.success && !res.canceled && res.error) {
      setErrorMessage(res.error);
    }
  }, [savePipelineFile]);

  const handleSaveAs = useCallback(async () => {
    setErrorMessage(null);
    const res = await saveAsPipelineFile();
    if (!res.success && !res.canceled && res.error) {
      setErrorMessage(res.error);
    }
  }, [saveAsPipelineFile]);

  const handleOpen = useCallback(async () => {
    if (isDirtyRef.current) {
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
  }, [openPipelineFile]);

  const handleRun = useCallback(async () => {
    setErrorMessage(null);
    const success = await runPipeline();
    if (!success) {
      const currentExec = usePipelineStore.getState().executionSummary;
      if (currentExec?.error) {
        setErrorMessage(currentExec.error);
      }
    }
  }, [runPipeline]);

  const handleCreateRelease = async () => {
    setErrorMessage(null);
    setReleaseSuccessBanner(null);
    setIsReleasing(true);
    try {
      const serialized = exportPipeline();
      const created = await runtimeApi.createReleaseFromEditor({
        pipeline: serialized as unknown as Record<string, any>,
        releaseVersion: releaseVersionInput.trim() || '1.0.0',
        releaseNotes: releaseNotes.trim() || `Released from Pipeline Editor (${pipelineMeta.name})`,
        activate: true,
      });
      setShowReleaseModal(false);
      setReleaseNotes('');
      const displayPipeName = created.pipeline?.name || pipelineMeta.name;
      setReleaseSuccessBanner(
        `Released ${displayPipeName} v${created.release_version} (SHA-256: ${created.checksum.slice(
          0,
          10
        )}...) for Production Mode.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Release validation failed: ${msg}`);
    } finally {
      setIsReleasing(false);
    }
  };

  // Hook up Electron Native Menu actions & Global keyboard shortcuts
  useEffect(() => {
    // 1. Electron Menu IPC Listener
    const unsubscribe = window.electronAPI?.onMenuAction
      ? window.electronAPI.onMenuAction((action: string) => {
          switch (action) {
            case 'new':
              handleNew();
              break;
            case 'open':
              handleOpen();
              break;
            case 'save':
              handleSave();
              break;
            case 'save-as':
              handleSaveAs();
              break;
          }
        })
      : undefined;

    // 2. Global Keyboard Shortcuts (F5 to run, Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+Shift+S)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        handleRun();
        return;
      }

      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (!isCmdOrCtrl) return;

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAs();
        } else {
          handleSave();
        }
      } else if ((e.key === 'o' || e.key === 'O') && !e.shiftKey) {
        e.preventDefault();
        handleOpen();
      } else if ((e.key === 'n' || e.key === 'N') && !e.shiftKey) {
        e.preventDefault();
        handleNew();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleNew, handleOpen, handleSave, handleSaveAs, handleRun]);

  const handleExportMvp = () => {
    const data = exportPipeline();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pipelineMeta.name.toLowerCase().replace(/\\s+/g, '_')}.mvp`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImportMvp = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mvp,.json,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          const res = loadPipeline(parsed, file.name);
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
    <div className="flex flex-col h-full w-full bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden transition-colors">
      {/* Top Toolbar */}
      <div className="h-12 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0 select-none transition-colors">
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
                className="bg-white dark:bg-slate-950 border border-cyan-500 rounded px-2 py-0.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none"
              />
            ) : (
              <h2
                onClick={() => setIsEditingName(true)}
                title="Click to rename pipeline"
                className="text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer truncate max-w-[280px] transition-colors"
              >
                {pipelineMeta.name}
              </h2>
            )}

            {isDirty && (
              <span
                className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800"
                title="Unsaved changes in canvas"
              >
                ● Unsaved
              </span>
            )}
          </div>

          <span className="text-slate-400 dark:text-slate-700">|</span>

          <span className="text-[11px] font-mono text-cyan-700 bg-cyan-100 border border-cyan-300 dark:text-cyan-400 dark:bg-cyan-950/60 dark:border-cyan-800/80 px-1.5 py-0.5 rounded hidden lg:inline">
            .MVP Format
          </span>

          {currentFilePath && (
            <span
              className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[200px] hidden xl:inline"
              title={currentFilePath}
            >
              File: {currentFilePath.split(/[/\\\\]/).pop()}
            </span>
          )}

          {lastSavedAt && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden 2xl:inline">
              Saved {lastSavedAt}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Phase 3: Run Pipeline Execution Button & Release Pipeline Button */}
          <div className="flex items-center space-x-2 pr-2 border-r border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleRun}
              disabled={isExecuting}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold shadow-sm transition-all ${
                isExecuting
                  ? 'bg-amber-600/80 text-white cursor-wait'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'
              }`}
              title="Execute pipeline in Python Vision Runtime [F5 / Ctrl+Enter]"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Running...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Pipeline</span>
                  <span className="text-[10px] opacity-75 font-mono ml-0.5">[F5]</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowReleaseModal(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors"
              title="Validate and publish an immutable pipeline release for Production Mode"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Release for Production</span>
            </button>

            {/* Execution status indicator badge */}
            {executionSummary && (
              <div
                className={`hidden md:flex items-center space-x-1 text-[11px] font-mono px-2 py-0.5 rounded border ${
                  executionSummary.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80'
                    : executionSummary.status === 'failed'
                    ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80'
                    : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                }`}
                title={executionSummary.error || `Execution ID: ${executionSummary.executionId}`}
              >
                {executionSummary.status === 'completed' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{executionSummary.totalDurationMs.toFixed(1)}ms</span>
                  </>
                ) : executionSummary.status === 'failed' ? (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Failed</span>
                  </>
                ) : (
                  <span>{executionSummary.status}</span>
                )}
              </div>
            )}
          </div>

          {/* File Operations */}
          <div className="flex items-center space-x-1 border-r border-slate-200 dark:border-slate-800 pr-2">
            <button
              type="button"
              onClick={handleNew}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white text-xs border border-slate-300 dark:border-slate-700/60 transition-colors"
              title="Create new pipeline (discards unsaved changes) [Ctrl+N]"
            >
              <FilePlus className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>New</span>
            </button>

            <button
              type="button"
              onClick={handleOpen}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white text-xs border border-slate-300 dark:border-slate-700/60 transition-colors"
              title="Open .mvp or .json pipeline file [Ctrl+O]"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Open</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow-sm transition-colors"
              title="Save pipeline (.mvp) [Ctrl+S]"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAs}
              className="flex items-center space-x-1.5 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white text-xs border border-slate-300 dark:border-slate-700/60 transition-colors"
              title="Save Pipeline As... (specify new .mvp file path) [Ctrl+Shift+S]"
            >
              <FileCode2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Save As</span>
            </button>
          </div>

          {/* Import / Export MVP */}
          <div className="flex items-center space-x-1 border-r border-slate-200 dark:border-slate-800 pr-2 hidden sm:flex">
            <button
              type="button"
              onClick={handleImportMvp}
              className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-xs transition-colors"
              title="Import .mvp pipeline"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
            </button>

            <button
              type="button"
              onClick={handleExportMvp}
              className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-xs transition-colors"
              title="Export .mvp file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>

          {/* Quick Theme Switcher Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition-colors"
            title={theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-indigo-500" />
            )}
          </button>

          {/* Diagnostics Switcher */}
          {onOpenDiagnostics && (
            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs border border-slate-300 dark:border-slate-700 transition-colors"
              title="View Python Runtime Health Diagnostics"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span className="hidden md:inline">Diagnostics</span>
            </button>
          )}
        </div>
      </div>

      {/* Release Success Banner */}
      {releaseSuccessBanner && (
        <div className="bg-emerald-100 dark:bg-emerald-950/80 border-b border-emerald-300 dark:border-emerald-800 px-4 py-2 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{releaseSuccessBanner}</span>
          </div>
          <div className="flex items-center space-x-3">
            {onOpenProductionMode && (
              <button
                type="button"
                onClick={onOpenProductionMode}
                className="px-2.5 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold"
              >
                Open Production Mode
              </button>
            )}
            <button
              type="button"
              onClick={() => setReleaseSuccessBanner(null)}
              className="text-emerald-800 dark:text-emerald-300 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="bg-rose-100 dark:bg-rose-950/80 border-b border-rose-300 dark:border-rose-800 px-4 py-2 flex items-center justify-between text-xs text-rose-800 dark:text-rose-200">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 dark:text-rose-400 hover:text-rose-900 dark:hover:text-white text-xs underline ml-4"
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

      {/* Release Pipeline Modal */}
      {showReleaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center space-x-2">
                <Rocket className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Validate & Release Pipeline for Production
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReleaseModal(false)}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Publishing a release validates the pipeline topology and creates an immutable,
                SHA-256 checksummed snapshot in the Python Runtime for{' '}
                <strong>Production Mode</strong> execution.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Pipeline Name
                  </label>
                  <div className="px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-800 dark:text-slate-200 truncate">
                    {pipelineMeta.name}
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Release Version (SemVer)
                  </label>
                  <input
                    type="text"
                    value={releaseVersionInput}
                    onChange={(e) => setReleaseVersionInput(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Release Notes / Description
                </label>
                <textarea
                  rows={3}
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  placeholder="Describe inspection criteria, tolerance thresholds, or calibration settings..."
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReleaseModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateRelease}
                  disabled={isReleasing}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50"
                >
                  {isReleasing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Validating & Releasing...</span>
                    </>
                  ) : (
                    <>
                      <Rocket className="w-3.5 h-3.5" />
                      <span>Publish Immutable Release</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
