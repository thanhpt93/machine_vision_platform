import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  FolderOpen,
  FileImage,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Search,
  Info,
  Loader2,
  GitBranch,
  Ban,
  Wrench,
} from 'lucide-react';
import {
  useProductionStore,
  makeReleaseKey,
  parseReleaseKey,
} from '../store/productionStore';
import { ProductionImageViewer } from '../components/ProductionImageViewer';
import { InspectionResultPanel } from '../components/InspectionResultPanel';

interface InspectionPageProps {
  onSwitchToDeveloperMode?: () => void;
}

const SAMPLE_IMAGE_PRESETS = [
  { label: 'Bottle Cap Sample', path: 'sample_images/bottle_cap.png' },
  { label: 'PCB Board Sample', path: 'sample_images/pcb_board.png' },
  { label: 'Metal Bracket Sample', path: 'sample_images/metal_bracket.png' },
];

export const InspectionPage: React.FC<InspectionPageProps> = ({
  onSwitchToDeveloperMode,
}) => {
  const eligibleReleases = useProductionStore((s) => s.eligibleReleases);
  const isLoadingReleases = useProductionStore((s) => s.isLoadingReleases);
  const releasesError = useProductionStore((s) => s.releasesError);
  const fetchReleases = useProductionStore((s) => s.fetchReleases);

  const selectedReleaseKey = useProductionStore((s) => s.selectedReleaseKey);
  const selectedReleaseDetails = useProductionStore((s) => s.selectedReleaseDetails);
  const selectRelease = useProductionStore((s) => s.selectRelease);

  const selectedImagePath = useProductionStore((s) => s.selectedImagePath);
  const selectedImageMeta = useProductionStore((s) => s.selectedImageMeta);
  const isValidatingImage = useProductionStore((s) => s.isValidatingImage);
  const imageValidationError = useProductionStore((s) => s.imageValidationError);
  const selectInputImage = useProductionStore((s) => s.selectInputImage);
  const clearInputImage = useProductionStore((s) => s.clearInputImage);

  const isRunningInspection = useProductionStore((s) => s.isRunningInspection);
  const currentInspection = useProductionStore((s) => s.currentInspection);
  const inspectionError = useProductionStore((s) => s.inspectionError);
  const runInspection = useProductionStore((s) => s.runInspection);
  const cancelActiveInspection = useProductionStore((s) => s.cancelActiveInspection);

  const healthResult = useProductionStore((s) => s.healthResult);
  const refreshHealth = useProductionStore((s) => s.refreshHealth);

  const [pipelineSearch, setPipelineSearch] = useState('');
  const [showPipelineDetailsModal, setShowPipelineDetailsModal] = useState(false);
  const [isRestartingRuntime, setIsRestartingRuntime] = useState(false);

  const fallbackFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  // Listen to native menu 'select-image' shortcut (Ctrl+O in Production Edition)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.onMenuAction) {
      return;
    }
    const unsubscribe = window.electronAPI.onMenuAction((action: string) => {
      if (action === 'select-image') {
        void handleBrowseImageDialog();
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const isRuntimeConnected = !!healthResult?.data && !healthResult.error;

  const handleRetryRuntimeConnection = async () => {
    setIsRestartingRuntime(true);
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.restartRuntimeProcess) {
        await window.electronAPI.restartRuntimeProcess();
      }
      await refreshHealth();
      await fetchReleases();
    } finally {
      setIsRestartingRuntime(false);
    }
  };

  const filteredReleases = React.useMemo(() => {
    if (!pipelineSearch.trim()) return eligibleReleases;
    const q = pipelineSearch.toLowerCase();
    return eligibleReleases.filter(
      (r) =>
        r.pipeline_name.toLowerCase().includes(q) ||
        r.pipeline_id.toLowerCase().includes(q) ||
        r.release_version.toLowerCase().includes(q)
    );
  }, [eligibleReleases, pipelineSearch]);

  const selectedReleaseSummary = React.useMemo(() => {
    if (!selectedReleaseKey) return null;
    const parsed = parseReleaseKey(selectedReleaseKey);
    if (!parsed) return null;
    return (
      eligibleReleases.find(
        (r) =>
          r.pipeline_id === parsed.pipelineId && r.release_version === parsed.releaseVersion
      ) || null
    );
  }, [eligibleReleases, selectedReleaseKey]);

  const handleBrowseImageDialog = async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.selectImageFile) {
      try {
        const res = await window.electronAPI.selectImageFile();
        if (res.success && res.filePath) {
          await selectInputImage(res.filePath);
        }
        return;
      } catch (err) {
        console.warn('[InspectionPage] Native selectImageFile failed, falling back to file input:', err);
      }
    }

    // Fallback for browser/non-IPC contexts
    fallbackFileInputRef.current?.click();
  };

  const handleFallbackFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // In Electron File objects may expose .path; otherwise use file.name
    const fileWithPath = file as File & { path?: string };
    const resolved = fileWithPath.path || `sample_images/${file.name}`;
    await selectInputImage(resolved);
    e.target.value = '';
  };

  const canRunInspection =
    isRuntimeConnected &&
    !!selectedReleaseSummary &&
    selectedReleaseSummary.valid_integrity !== false &&
    !!selectedImagePath &&
    !isValidatingImage &&
    !imageValidationError &&
    !isRunningInspection;

  return (
    <div
      className="h-full flex flex-col gap-3 overflow-y-auto p-3 lg:p-4"
      data-testid="inspection-workstation-page"
    >
      {/* Hidden fallback file input */}
      <input
        ref={fallbackFileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.bmp,.tif,.tiff,.webp,image/*"
        className="hidden"
        onChange={handleFallbackFileInputChange}
      />

      {/* Top Disconnected Runtime Warning Banner */}
      {!isRuntimeConnected && (
        <div className="bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200 shrink-0">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <div>
              <span className="font-semibold">Python Vision Runtime is Unavailable: </span>
              <span>
                {healthResult?.error ||
                  'Cannot connect to http://127.0.0.1:8000. Start or restart the runtime service before running production inspections.'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRetryRuntimeConnection}
            disabled={isRestartingRuntime}
            data-testid="retry-runtime-connection-btn"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-semibold shrink-0 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRestartingRuntime ? 'animate-spin' : ''}`} />
            <span>{isRestartingRuntime ? 'Starting Runtime...' : 'Retry / Start Runtime'}</span>
          </button>
        </div>
      )}

      {/* Main 12-Column Workstation Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0">
        {/* LEFT COLUMN (4 cols): Pipeline Selection, Image Selection & Run Controls */}
        <div className="lg:col-span-3 xl:col-span-3 2xl:col-span-3 flex flex-col gap-3 overflow-y-auto pr-0.5">
          {/* A. Pipeline Selection Card */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                  1. Released Pipeline Selection
                </h3>
              </div>
              <button
                type="button"
                onClick={() => fetchReleases()}
                disabled={isLoadingReleases}
                title="Refresh released pipelines"
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReleases ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {releasesError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                Failed to load released pipelines: {releasesError}
              </div>
            )}

            {!isLoadingReleases && eligibleReleases.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  No Released Pipelines Available
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {onSwitchToDeveloperMode ? (
                    <>
                      A pipeline must first be validated and released in{' '}
                      <strong>Developer Mode</strong> before it can be executed in Production Mode.
                    </>
                  ) : (
                    <>
                      No released pipeline snapshots were found in the workstation repository. Deploy
                      a validated release package from NOVA Developer Edition and click Refresh.
                    </>
                  )}
                </p>
                {onSwitchToDeveloperMode && (
                  <button
                    type="button"
                    onClick={onSwitchToDeveloperMode}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors mt-1"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Open Developer Mode to Release Pipeline</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Search input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={pipelineSearch}
                    onChange={(e) => setPipelineSearch(e.target.value)}
                    placeholder="Search released pipeline by name or version..."
                    className="w-full pl-7 pr-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Dropdown selector */}
                <div className="space-y-1">
                  <label
                    htmlFor="prod-pipeline-select"
                    className="text-[11px] font-medium text-slate-600 dark:text-slate-400"
                  >
                    Select Eligible Production Release ({filteredReleases.length})
                  </label>
                  <select
                    id="prod-pipeline-select"
                    aria-label="Select Eligible Production Release"
                    value={selectedReleaseKey || ''}
                    onChange={(e) => {
                      const parsed = parseReleaseKey(e.target.value);
                      if (parsed) {
                        selectRelease(parsed.pipelineId, parsed.releaseVersion);
                      }
                    }}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    {filteredReleases.map((r) => {
                      const key = makeReleaseKey(r.pipeline_id, r.release_version);
                      return (
                        <option key={key} value={key}>
                          {r.pipeline_name} — v{r.release_version}{' '}
                          {r.is_active ? '(Active)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Selected Pipeline Read-Only Summary */}
                {selectedReleaseSummary && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {selectedReleaseSummary.pipeline_name}
                      </span>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          v{selectedReleaseSummary.release_version}
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Released</span>
                        </span>
                      </div>
                    </div>

                    {(selectedReleaseSummary.description ||
                      selectedReleaseDetails?.pipeline?.description) && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                        {selectedReleaseSummary.description ||
                          selectedReleaseDetails?.pipeline?.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        Input: Local Image (
                        {selectedReleaseSummary.input_requirements?.supported_formats
                          ?.slice(0, 4)
                          .join(', ') || '.png, .jpg, .bmp'}
                        )
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPipelineDetailsModal(true)}
                        className="inline-flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        <Info className="w-3 h-3" />
                        <span>Read-Only Details</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* B. Input Image Selection Card */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileImage className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                  2. Input Image Selection
                </h3>
              </div>
              {selectedImagePath && (
                <button
                  type="button"
                  onClick={clearInputImage}
                  disabled={isRunningInspection}
                  title="Remove selected image"
                  className="inline-flex items-center space-x-1 text-[11px] text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-40"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove</span>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleBrowseImageDialog}
                disabled={isRunningInspection}
                className="flex-1 inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                <span>{selectedImagePath ? 'Replace Image File...' : 'Select Image File...'}</span>
              </button>
            </div>

            {/* Quick workstation sample images for instant testing */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
                Workstation Sample Images:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_IMAGE_PRESETS.map((preset) => (
                  <button
                    key={preset.path}
                    type="button"
                    disabled={isRunningInspection}
                    onClick={() => selectInputImage(preset.path)}
                    className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors ${
                      selectedImagePath === preset.path
                        ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Image Metadata or Validation Error */}
            {isValidatingImage && (
              <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 p-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span>Validating image format and dimensions...</span>
              </div>
            )}

            {imageValidationError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{imageValidationError}</span>
              </div>
            )}

            {selectedImagePath && !imageValidationError && (
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {selectedImageMeta?.filename || selectedImagePath.split(/[/\\\\]/).pop()}
                  </span>
                  {selectedImageMeta && (
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>
                        {selectedImageMeta.width}×{selectedImageMeta.height} px
                      </span>
                    </span>
                  )}
                </div>
                <p
                  className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate"
                  title={selectedImageMeta?.resolved_path || selectedImagePath}
                >
                  {selectedImageMeta?.resolved_path || selectedImagePath}
                </p>
              </div>
            )}
          </section>

          {/* C. Inspection Execution Controls Card */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
              3. Inspection Controls
            </h3>

            {inspectionError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold block">Inspection Failed</span>
                  <span className="font-mono text-[11px]">{inspectionError}</span>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => runInspection()}
                disabled={!canRunInspection}
                data-testid="run-inspection-btn"
                className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-sm font-bold shadow-sm transition-all ${
                  isRunningInspection
                    ? 'bg-amber-600 text-white cursor-wait'
                    : canRunInspection
                    ? 'bg-blue-600 hover:bg-blue-500 text-white active:scale-[0.99]'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                }`}
              >
                {isRunningInspection ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Running Inspection...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Run Inspection</span>
                  </>
                )}
              </button>

              {isRunningInspection && (
                <button
                  type="button"
                  onClick={() => cancelActiveInspection()}
                  className="px-3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-xs"
                  title="Cancel active inspection"
                >
                  <Ban className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              )}
            </div>

            {/* Readiness checklist helper */}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <span>Selected Release:</span>
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  {selectedReleaseSummary
                    ? `${selectedReleaseSummary.pipeline_name} (v${selectedReleaseSummary.release_version})`
                    : 'None selected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Selected Input Image:</span>
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  {selectedImageMeta?.filename ||
                    (selectedImagePath ? selectedImagePath.split(/[/\\\\]/).pop() : 'None selected')}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* CENTER COLUMN (5 cols): Dedicated Workstation Image Viewer */}
        <div className="lg:col-span-6 xl:col-span-6 2xl:col-span-7 flex flex-col min-h-[400px]">
          <ProductionImageViewer
            selectedImagePath={selectedImagePath}
            selectedImageMeta={selectedImageMeta}
            inspectionRecord={currentInspection}
          />
        </div>

        {/* RIGHT COLUMN (3 cols): Inspection Result & Metrology Breakdown */}
        <div className="lg:col-span-3 xl:col-span-3 2xl:col-span-2 overflow-y-auto pr-0.5">
          <InspectionResultPanel
            record={currentInspection}
            pipelineName={selectedReleaseSummary?.pipeline_name}
          />
        </div>
      </div>

      {/* Read-Only Released Pipeline Details Modal */}
      {showPipelineDetailsModal && selectedReleaseDetails && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-xl w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedReleaseDetails.pipeline?.name || selectedReleaseDetails.pipeline_id}{' '}
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                    (v{selectedReleaseDetails.release_version})
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Immutable Production Release Snapshot (Read-Only)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPipelineDetailsModal(false)}
                className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block">Pipeline ID</span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {selectedReleaseDetails.pipeline_id}
                  </span>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block">Released At</span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {new Date(selectedReleaseDetails.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[10px]">
                <span className="text-slate-400 block">SHA-256 Checksum</span>
                <span className="text-emerald-600 dark:text-emerald-400 break-all">
                  {selectedReleaseDetails.checksum}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Pipeline Nodes ({selectedReleaseDetails.pipeline?.nodes?.length || 0} — Read-Only):
                </span>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {(selectedReleaseDetails.pipeline?.nodes || []).map(
                    (
                      n: { id: string; name: string; nodeType: string },
                      idx: number
                    ) => (
                      <div
                        key={n.id}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono"
                      >
                        <span>
                          {idx + 1}. <strong>{n.name}</strong> ({n.nodeType})
                        </span>
                        <span className="text-slate-400">
                          v{selectedReleaseDetails.node_versions?.[n.nodeType] || '1.0.0'}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
