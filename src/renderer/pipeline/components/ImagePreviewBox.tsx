import React, { useState, useEffect, useRef } from 'react';
import {
  ImageIcon,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  Loader2,
  ExternalLink,
  Grid,
  Download,
  X,
} from 'lucide-react';

interface ImagePreviewBoxProps {
  previewUrl: string;
  nodeName: string;
  metadata?: Record<string, any>;
}

export const ImagePreviewBox: React.FC<ImagePreviewBoxProps> = ({
  previewUrl,
  nodeName,
  metadata,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedSrc, setResolvedSrc] = useState<string>(previewUrl);
  const [bgMode, setBgMode] = useState<'checkerboard' | 'dark' | 'light'>('checkerboard');
  const [zoom, setZoom] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const imgRef = useRef<HTMLImageElement>(null);

  // When previewUrl or reloadKey changes, verify and load the image
  useEffect(() => {
    let isCancelled = false;
    let objectUrlToRevoke: string | null = null;

    setLoading(true);
    setError(null);

    // Try fetching the image as a Blob to verify access and bypass any CSP/header quirks
    const fetchImage = async () => {
      try {
        const timestampedUrl = previewUrl.includes('?')
          ? `${previewUrl}&_t=${Date.now()}`
          : `${previewUrl}?_t=${Date.now()}`;

        const res = await fetch(timestampedUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText || 'Failed to fetch preview'}`);
        }

        const blob = await res.blob();
        if (isCancelled) return;

        if (blob.size === 0) {
          throw new Error('Received 0 bytes preview image.');
        }

        const objUrl = URL.createObjectURL(blob);
        objectUrlToRevoke = objUrl;
        setResolvedSrc(objUrl);
        setLoading(false);
      } catch (err: unknown) {
        if (isCancelled) return;
        // If fetch fails, try using direct URL as fallback
        setResolvedSrc(previewUrl);
        // We will let img onError handle final error if direct also fails
      }
    };

    fetchImage();

    return () => {
      isCancelled = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [previewUrl, reloadKey]);

  const handleImageLoaded = () => {
    setLoading(false);
    setError(null);
  };

  const handleImageError = () => {
    setLoading(false);
    setError('Không thể nạp ảnh preview từ Python Vision Runtime.');
  };

  const handleReload = () => {
    setLoading(true);
    setError(null);
    setReloadKey((prev) => prev + 1);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = resolvedSrc;
    a.download = `${nodeName.toLowerCase().replace(/\\s+/g, '_')}_preview.jpg`;
    a.click();
  };

  const getBgStyle = () => {
    if (bgMode === 'checkerboard') {
      return {
        backgroundImage: `
          linear-gradient(45deg, #334155 25%, transparent 25%),
          linear-gradient(-45deg, #334155 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #334155 75%),
          linear-gradient(-45deg, transparent 75%, #334155 75%)
        `,
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        backgroundColor: '#0f172a',
      };
    }
    if (bgMode === 'light') {
      return { backgroundColor: '#f8fafc' };
    }
    return { backgroundColor: '#020617' };
  };

  const width = metadata?.width;
  const height = metadata?.height;
  const channels = metadata?.channels;

  return (
    <div className="space-y-2">
      {/* Header & Quick Toolbar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1.5 font-medium text-slate-700 dark:text-slate-200">
          <ImageIcon className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
          <span>Output Image Preview</span>
          {width && height && (
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 ml-1">
              ({width}x{height} {channels ? `• ${channels}ch` : ''})
            </span>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center space-x-1">
          {/* Background Toggle */}
          <button
            type="button"
            onClick={() =>
              setBgMode((m) =>
                m === 'checkerboard' ? 'dark' : m === 'dark' ? 'light' : 'checkerboard'
              )
            }
            title={`Chế độ nền hiện tại: ${bgMode}. Nhấp để đổi nền (Caro / Tối / Sáng)`}
            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>

          {/* Zoom Out */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
            disabled={zoom <= 0.5}
            title="Thu nhỏ [Zoom Out]"
            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Reset Zoom */}
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Đặt lại tỉ lệ (100%)"
            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Zoom In */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
            disabled={zoom >= 3}
            title="Phóng to [Zoom In]"
            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen Modal View */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            title="Mở rộng xem chi tiết"
            className="p-1 rounded text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-950/60 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div
        style={getBgStyle()}
        className="relative rounded-lg border border-slate-300 dark:border-slate-800 overflow-hidden flex items-center justify-center p-2 min-h-[170px] max-h-[260px] shadow-inner select-none transition-all"
      >
        {/* Loading Spinner */}
        {loading && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex flex-col items-center justify-center space-y-2 z-10 text-cyan-400">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-[11px] font-medium text-slate-200">Đang tải preview ảnh...</span>
          </div>
        )}

        {/* Error Fallback (Không để màn hình đen kịt!) */}
        {error ? (
          <div className="flex flex-col items-center justify-center p-4 text-center space-y-2.5 z-10">
            <div className="w-9 h-9 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-rose-300">{error}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 max-w-[220px]">
                Kiểm tra xem Python Vision Runtime có đang chạy tại http://127.0.0.1:8000 không.
              </p>
            </div>
            <button
              type="button"
              onClick={handleReload}
              className="flex items-center space-x-1 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white border border-slate-700 transition-colors shadow-sm"
            >
              <RefreshCw className="w-3 h-3 text-cyan-400" />
              <span>Thử lại (Reload)</span>
            </button>
          </div>
        ) : (
          /* Actual Image Display */
          <div className="relative overflow-auto max-h-[240px] w-full flex items-center justify-center">
            <img
              ref={imgRef}
              src={resolvedSrc}
              alt={`${nodeName} OpenCV Output`}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
              }}
              onLoad={handleImageLoaded}
              onError={handleImageError}
              className="max-h-[220px] max-w-full object-contain rounded shadow-lg cursor-zoom-in"
              onClick={() => setIsModalOpen(true)}
              title="Nhấp đúp hoặc bấm phóng to để xem chi tiết"
            />
          </div>
        )}

        {/* Zoom Level Indicator */}
        {zoom !== 1 && (
          <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-mono text-cyan-400 border border-slate-800">
            {Math.round(zoom * 100)}%
          </div>
        )}
      </div>

      {/* Footer Info Links */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
        <span className="italic">Nền caro giúp nhìn rõ cả vùng đen / vùng mask.</span>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center space-x-1 text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
            title="Lưu ảnh preview về máy tính"
          >
            <Download className="w-3 h-3" />
            <span>Tải về</span>
          </button>
          <a
            href={resolvedSrc}
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1 text-cyan-600 dark:text-cyan-400 hover:underline"
            title="Mở ảnh trong tab trình duyệt riêng"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Mở ngoài</span>
          </a>
        </div>
      </div>

      {/* Fullscreen / Large Inspection Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col p-4 animate-in fade-in duration-150"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-white">
            <div className="flex items-center space-x-2">
              <ImageIcon className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">
                {nodeName} — Chi tiết Output Preview
              </h3>
              {width && height && (
                <span className="text-xs font-mono text-slate-400">
                  [{width} x {height} px]
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải ảnh</span>
              </button>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="Đóng [Esc]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Image Body with Zoom & Pan */}
          <div
            style={getBgStyle()}
            className="flex-1 overflow-auto rounded-lg mt-3 flex items-center justify-center p-4 border border-slate-800 relative select-none"
          >
            <img
              src={resolvedSrc}
              alt={`${nodeName} Full Resolution Preview`}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
