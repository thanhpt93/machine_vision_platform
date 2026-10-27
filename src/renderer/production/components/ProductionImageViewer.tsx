import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Grid,
  Loader2,
  AlertCircle,
  RefreshCw,
  Layers,
  Eye,
  Move,
} from 'lucide-react';
import { InputImageMetadata, InspectionRecord } from '../../types/api';
import { runtimeApi } from '../../services/runtimeApi';
import { useProductionStore } from '../store/productionStore';

interface ProductionImageViewerProps {
  selectedImagePath: string | null;
  selectedImageMeta: InputImageMetadata | null;
  inspectionRecord: InspectionRecord | null;
}

export const ProductionImageViewer: React.FC<ProductionImageViewerProps> = ({
  selectedImagePath,
  selectedImageMeta,
  inspectionRecord,
}) => {
  const defaultViewerBg = useProductionStore((s) => s.preferences.defaultViewerBg);
  const autoSelectProcessed = useProductionStore((s) => s.preferences.autoSelectProcessedImage);

  const [viewMode, setViewMode] = useState<'original' | 'processed'>('original');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fitToScreen, setFitToScreen] = useState<boolean>(true);
  const [bgMode, setBgMode] = useState<'checkerboard' | 'dark' | 'light'>(defaultViewerBg);
  const [showOverlayBadge, setShowOverlayBadge] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState<number>(0);

  // Pan / Dragging interaction state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Sync background preference
  useEffect(() => {
    setBgMode(defaultViewerBg);
  }, [defaultViewerBg]);

  // Extract available node previews from the inspection record
  const previewNodeEntries = React.useMemo(() => {
    if (!inspectionRecord || !inspectionRecord.node_results) return [];
    return Object.values(inspectionRecord.node_results).filter((n) => n.has_preview);
  }, [inspectionRecord]);

  // When a new inspection completes with previews, automatically select the final visualization/output node
  useEffect(() => {
    if (inspectionRecord && previewNodeEntries.length > 0) {
      const preferred =
        [...previewNodeEntries]
          .reverse()
          .find((n) =>
            ['result_viewer', 'inspection_result_viewer', 'draw_measurement', 'image_overlay', 'circle_measurement'].includes(
              n.node_type
            )
          ) || previewNodeEntries[previewNodeEntries.length - 1];

      setSelectedNodeId(preferred.node_id);
      if (autoSelectProcessed) {
        setViewMode('processed');
      }
    } else {
      setViewMode('original');
      setSelectedNodeId('');
    }
  }, [inspectionRecord?.inspection_id, previewNodeEntries.length, autoSelectProcessed]);

  // Compute target image URL
  const activeImageUrl = React.useMemo(() => {
    if (viewMode === 'processed' && inspectionRecord && selectedNodeId) {
      return `${runtimeApi.getInspectionNodePreviewUrl(
        inspectionRecord.inspection_id,
        selectedNodeId
      )}?_r=${reloadCounter}`;
    }
    const rawPath = selectedImagePath || inspectionRecord?.input_image?.resolved_path;
    if (rawPath) {
      return `${runtimeApi.getInputImagePreviewUrl(rawPath)}&_r=${reloadCounter}`;
    }
    return null;
  }, [viewMode, inspectionRecord, selectedNodeId, selectedImagePath, reloadCounter]);

  useEffect(() => {
    if (activeImageUrl) {
      setLoading(true);
      setLoadError(null);
    } else {
      setLoading(false);
      setLoadError(null);
    }
  }, [activeImageUrl]);

  const activeDimensions = React.useMemo(() => {
    if (viewMode === 'processed' && inspectionRecord && selectedNodeId) {
      const nodeMeta = inspectionRecord.node_results[selectedNodeId]?.output_metadata;
      if (nodeMeta?.width && nodeMeta?.height) {
        return {
          width: nodeMeta.width,
          height: nodeMeta.height,
          channels: nodeMeta.channels,
        };
      }
    }
    const meta = selectedImageMeta || inspectionRecord?.input_image;
    if (meta) {
      return {
        width: meta.width,
        height: meta.height,
        channels: meta.channels,
      };
    }
    return null;
  }, [viewMode, inspectionRecord, selectedNodeId, selectedImageMeta]);

  // Reset zoom & pan to Fit
  const handleResetFit = useCallback(() => {
    setFitToScreen(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Reset zoom to 100% (1:1)
  const handleReset100 = useCallback(() => {
    setFitToScreen(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Zoom In button handler
  const handleZoomIn = useCallback(() => {
    setFitToScreen(false);
    setZoom((z) => Math.min(5.0, Number((z + 0.25).toFixed(2))));
  }, []);

  // Zoom Out button handler
  const handleZoomOut = useCallback(() => {
    setFitToScreen(false);
    setZoom((z) => Math.max(0.1, Number((z - 0.25).toFixed(2))));
  }, []);

  // Setup Wheel Zoom Event Listener on container with passive: false to prevent document scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      // Prevent default page scroll when interacting with the image viewer
      e.preventDefault();

      if (!activeImageUrl) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      // deltaY < 0 is scroll up (Zoom In), deltaY > 0 is scroll down (Zoom Out)
      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;

      setZoom((prevZoom) => {
        const currentZoom = fitToScreen ? 1 : prevZoom;
        const targetZoom = Math.min(5.0, Math.max(0.1, Number((currentZoom * zoomFactor).toFixed(3))));

        if (targetZoom === currentZoom) return prevZoom;

        // Adjust pan coordinates so zoom expands toward or shrinks away from mouse pointer
        setPan((prevPan) => {
          const currentPan = fitToScreen ? { x: 0, y: 0 } : prevPan;
          const scaleChange = targetZoom / currentZoom;
          const newPanX = mouseX - (mouseX - currentPan.x) * scaleChange;
          const newPanY = mouseY - (mouseY - currentPan.y) * scaleChange;
          return {
            x: Number(newPanX.toFixed(1)),
            y: Number(newPanY.toFixed(1)),
          };
        });

        if (fitToScreen) {
          setFitToScreen(false);
        }

        return targetZoom;
      });
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [activeImageUrl, fitToScreen]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return; // Left or Middle click
    if (!activeImageUrl) return;

    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
    if (fitToScreen) {
      setFitToScreen(false);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (fitToScreen) {
      setFitToScreen(false);
      setZoom(1.5);
    } else {
      handleResetFit();
    }
  };

  const getBgStyle = (): React.CSSProperties => {
    if (bgMode === 'checkerboard') {
      return {
        backgroundImage: `
          linear-gradient(45deg, #1e293b 25%, transparent 25%),
          linear-gradient(-45deg, #1e293b 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #1e293b 75%),
          linear-gradient(-45deg, transparent 75%, #1e293b 75%)
        `,
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
        backgroundColor: '#0f172a',
      };
    }
    if (bgMode === 'light') {
      return { backgroundColor: '#f1f5f9' };
    }
    return { backgroundColor: '#020617' };
  };

  const activeLabel =
    viewMode === 'processed' && inspectionRecord && selectedNodeId
      ? `Processed Output (${inspectionRecord.node_results[selectedNodeId]?.node_type || selectedNodeId})`
      : selectedImageMeta?.filename ||
        inspectionRecord?.input_image?.filename ||
        'Original Input Image';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
      {/* Top Viewer Toolbar */}
      <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Left: Mode Switcher (Original vs Processed) & Node Selector */}
        <div className="flex items-center space-x-2">
          <div className="inline-flex rounded-lg p-0.5 bg-slate-200/80 dark:bg-slate-900 border border-slate-300 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('original')}
              disabled={!selectedImagePath && !inspectionRecord?.input_image}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'original'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 disabled:opacity-40'
              }`}
            >
              Original Image
            </button>
            <button
              type="button"
              onClick={() => setViewMode('processed')}
              disabled={previewNodeEntries.length === 0}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'processed'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 disabled:opacity-40'
              }`}
            >
              Processed Result {previewNodeEntries.length > 0 ? `(${previewNodeEntries.length})` : ''}
            </button>
          </div>

          {viewMode === 'processed' && previewNodeEntries.length > 1 && (
            <select
              aria-label="Select processed node output"
              value={selectedNodeId}
              onChange={(e) => setSelectedNodeId(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {previewNodeEntries.map((n) => (
                <option key={n.node_id} value={n.node_id}>
                  {n.node_id} ({n.node_type})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Right: Zoom & Display Controls */}
        <div className="flex items-center space-x-1.5">
          {activeDimensions && (
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              {activeDimensions.width} × {activeDimensions.height} px
              {activeDimensions.channels ? ` • ${activeDimensions.channels}ch` : ''}
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowOverlayBadge((v) => !v)}
            title="Toggle inspection overlay HUD badge"
            className={`p-1.5 rounded border text-xs transition-colors ${
              showOverlayBadge
                ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800'
                : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() =>
              setBgMode((m) =>
                m === 'checkerboard' ? 'dark' : m === 'dark' ? 'light' : 'checkerboard'
              )
            }
            title="Switch canvas backdrop (Checkerboard / Dark / Light)"
            className="p-1.5 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out (Scroll Down)"
            className="p-1.5 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span
            className="text-[11px] font-mono text-slate-600 dark:text-slate-300 min-w-[48px] text-center"
            title="Current zoom level"
          >
            {fitToScreen ? 'FIT' : `${Math.round(zoom * 100)}%`}
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In (Scroll Up)"
            className="p-1.5 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleResetFit}
            title="Fit to screen / Reset zoom"
            className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors flex items-center space-x-1 ${
              fitToScreen
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Maximize2 className="w-3 h-3" />
            <span>Fit</span>
          </button>

          <button
            type="button"
            onClick={handleReset100}
            title="Reset zoom to 1:1 (100%)"
            className="p-1.5 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Image Viewport with Mouse Wheel Zoom and Pan Drag */}
      <div
        ref={containerRef}
        style={getBgStyle()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        className={`relative flex-1 min-h-[320px] overflow-hidden flex items-center justify-center p-4 select-none ${
          !activeImageUrl
            ? 'cursor-default'
            : isDragging
            ? 'cursor-grabbing'
            : !fitToScreen || zoom > 1
            ? 'cursor-grab'
            : 'cursor-default'
        }`}
      >
        {!activeImageUrl ? (
          <div className="flex flex-col items-center justify-center text-center p-8 max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 mb-3">
              <ImageIcon className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">No Inspection Image Selected</h4>
            <p className="text-xs text-slate-400 mt-1">
              Select a local image file from the workstation panel to preview the part and run an inspection.
            </p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-900/90 border border-rose-800/60 rounded-xl max-w-md space-y-2.5">
            <AlertCircle className="w-7 h-7 text-rose-400" />
            <div>
              <p className="text-xs font-semibold text-rose-200">{loadError}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Verify that the Python Vision Runtime is connected and the selected image file is readable.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReloadCounter((c) => c + 1)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white border border-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Loading Image</span>
            </button>
          </div>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex flex-col items-center justify-center z-20 space-y-2">
                <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
                <span className="text-xs font-medium text-slate-200">Loading workstation frame...</span>
              </div>
            )}

            <div
              className="flex items-center justify-center w-full h-full pointer-events-none"
              style={
                fitToScreen
                  ? {
                      transform: 'translate(0px, 0px) scale(1)',
                      transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                    }
                  : {
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: 'center center',
                      transition: isDragging ? 'none' : 'transform 0.08s ease-out',
                    }
              }
            >
              <img
                src={activeImageUrl}
                alt={activeLabel}
                draggable={false}
                onLoad={() => {
                  setLoading(false);
                  setLoadError(null);
                }}
                onError={() => {
                  setLoading(false);
                  setLoadError('Result or input image preview is unavailable from the Vision Runtime.');
                }}
                className="max-h-full max-w-full object-contain rounded shadow-xl select-none"
              />
            </div>
          </>
        )}

        {/* Active Image & Overlay HUD Indicator */}
        {activeImageUrl && showOverlayBadge && (
          <div className="absolute top-3 left-3 z-10 flex flex-col space-y-1.5 pointer-events-none">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-900/85 backdrop-blur-xs border border-slate-700/80 text-[11px] font-mono text-slate-200 shadow-md">
              <Eye className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Viewing: {viewMode === 'processed' ? 'PROCESSED RESULT' : 'ORIGINAL INPUT'}</span>
              <span className="text-slate-400">|</span>
              <span className="text-cyan-300 truncate max-w-[220px]">{activeLabel}</span>
            </div>

            {inspectionRecord && viewMode === 'processed' && (
              <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-md bg-slate-900/85 backdrop-blur-xs border border-slate-700/80 text-[11px] font-mono text-slate-200 shadow-md">
                <span>Outcome:</span>
                <span
                  className={
                    inspectionRecord.inspection_outcome === 'OK'
                      ? 'text-emerald-400 font-bold'
                      : inspectionRecord.inspection_outcome === 'NG'
                      ? 'text-rose-400 font-bold'
                      : 'text-slate-300 font-bold'
                  }
                >
                  {inspectionRecord.inspection_outcome ?? 'N/A'}
                </span>
                <span className="text-slate-500">•</span>
                <span>{inspectionRecord.duration_ms.toFixed(1)} ms</span>
              </div>
            )}
          </div>
        )}

        {/* Bottom Right Wheel Zoom & Pan Helper Badge */}
        {activeImageUrl && (
          <div className="absolute bottom-3 right-3 z-10 pointer-events-none hidden sm:flex items-center space-x-1.5 px-2 py-1 rounded-md bg-slate-900/75 backdrop-blur-xs border border-slate-700/60 text-[10px] font-mono text-slate-300 shadow-md">
            <Move className="w-3 h-3 text-blue-400" />
            <span>Scroll Wheel: Zoom • Drag: Pan • Double Click: Fit</span>
          </div>
        )}
      </div>
    </div>
  );
};
