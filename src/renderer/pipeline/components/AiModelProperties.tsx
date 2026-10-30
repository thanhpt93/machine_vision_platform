import React, { useEffect, useState } from 'react';
import { runtimeApi } from '../../services/runtimeApi';
import { AiModelItem } from '../../types/api';
import { Brain, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface AiModelPropertiesProps {
  config: Record<string, any>;
  onChange: (partialConfig: Record<string, any>) => void;
  getFieldError: (fieldName: string) => string | undefined;
  taskType: 'IMAGE_CLASSIFICATION' | 'OBJECT_DETECTION';
}

export const AiModelProperties: React.FC<AiModelPropertiesProps> = ({
  config,
  onChange,
  getFieldError,
  taskType,
}) => {
  const [models, setModels] = useState<AiModelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModelId = config.modelId || '';
  const selectedModel = models.find((m) => m.id === selectedModelId);

  const fetchModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await runtimeApi.getModels(taskType);
      setModels(items);
      // Auto-select first model if none selected and models exist
      if (!selectedModelId && items.length > 0) {
        onChange({ modelId: items[0].id });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch AI models');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, [taskType]);

  const modelError = getFieldError('modelId');

  return (
    <div className="space-y-4 text-xs">
      {/* Model Selection Section */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
            <Brain className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>Select AI Model</span>
          </label>
          <button
            type="button"
            onClick={fetchModels}
            disabled={loading}
            className="text-[10px] text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 flex items-center space-x-1 transition-colors"
            title="Refresh model list from registry"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {error && (
          <div className="p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded text-rose-600 dark:text-rose-400 text-[11px] flex items-start space-x-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {models.length === 0 && !loading ? (
          <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 rounded text-center space-y-1.5">
            <p className="text-slate-600 dark:text-slate-400 text-[11px]">
              No {taskType === 'IMAGE_CLASSIFICATION' ? 'Classification' : 'Object Detection'} models imported.
            </p>
            <p className="text-[10px] text-slate-500">
              Go to the <strong className="text-purple-600 dark:text-purple-400">AI Models</strong> tab to import an exported package from NOVA AI Trainer.
            </p>
          </div>
        ) : (
          <select
            data-testid="ai-model-selector"
            value={selectedModelId}
            onChange={(e) => onChange({ modelId: e.target.value })}
            className={`w-full bg-white dark:bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none transition-colors ${
              modelError
                ? 'border-rose-500 focus:border-rose-400'
                : 'border-slate-300 dark:border-slate-700 focus:border-cyan-500'
            }`}
          >
            <option value="">-- Choose an imported model --</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.architecture} v{m.version})
              </option>
            ))}
          </select>
        )}

        {modelError && (
          <p className="text-[10px] text-rose-500 dark:text-rose-400">{modelError}</p>
        )}
      </div>

      {/* Selected Model Metadata Card */}
      {selectedModel && (
        <div className="p-2.5 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1.5">
            <span className="font-semibold text-slate-900 dark:text-white truncate">
              {selectedModel.name}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 flex items-center space-x-1 shrink-0">
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>{selectedModel.status}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-mono block">Arch</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 truncate block">
                {selectedModel.architecture}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-mono block">Input Size</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {selectedModel.input_size ? `${selectedModel.input_size[0]} × ${selectedModel.input_size[1]}` : 'Dynamic'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-mono block">Classes</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {selectedModel.num_classes} classes
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-mono block">Source</span>
              <span className="text-slate-800 dark:text-slate-200 truncate block">
                {selectedModel.source}
              </span>
            </div>
          </div>

          {/* Classes pill list */}
          {selectedModel.classes && selectedModel.classes.length > 0 && (
            <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-mono block mb-1">
                Labels:
              </span>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-1">
                {selectedModel.classes
                  .filter((c) => !c.is_background)
                  .map((c) => (
                    <span
                      key={c.index}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center space-x-1"
                    >
                      {c.color && (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: c.color }}
                        />
                      )}
                      <span>{c.name}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inference Parameters */}
      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
          Inference Parameters
        </div>

        {/* Confidence Threshold */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-700 dark:text-slate-300">
              Confidence Threshold
            </label>
            <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
              {Number(config.confidenceThreshold ?? (taskType === 'IMAGE_CLASSIFICATION' ? 0.0 : 0.5)).toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={config.confidenceThreshold ?? (taskType === 'IMAGE_CLASSIFICATION' ? 0.0 : 0.5)}
            onChange={(e) => onChange({ confidenceThreshold: parseFloat(e.target.value) })}
            className="w-full accent-cyan-500 cursor-pointer"
          />
        </div>

        {/* Task-specific fields */}
        {taskType === 'IMAGE_CLASSIFICATION' ? (
          <div className="space-y-1">
            <label className="text-xs text-slate-700 dark:text-slate-300">
              Top K Predictions
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={config.topK ?? 5}
              onChange={(e) => onChange({ topK: parseInt(e.target.value, 10) || 1 })}
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none"
            />
          </div>
        ) : (
          <>
            {/* Detection IoU Threshold */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-700 dark:text-slate-300">
                  NMS IoU Threshold
                </label>
                <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                  {Number(config.iouThreshold ?? 0.5).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={config.iouThreshold ?? 0.5}
                onChange={(e) => onChange({ iouThreshold: parseFloat(e.target.value) })}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Max Detections */}
            <div className="space-y-1">
              <label className="text-xs text-slate-700 dark:text-slate-300">
                Max Detections
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={config.maxDetections ?? 100}
                onChange={(e) => onChange({ maxDetections: parseInt(e.target.value, 10) || 100 })}
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none"
              />
            </div>

            {/* Draw Boxes Checkbox */}
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="field_drawBoxes"
                checked={config.drawBoxes !== false}
                onChange={(e) => onChange({ drawBoxes: e.target.checked })}
                className="rounded bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-0 cursor-pointer"
              />
              <label
                htmlFor="field_drawBoxes"
                className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none"
              >
                Draw Bounding Boxes on Preview
              </label>
            </div>
          </>
        )}

        {/* Execution Provider Override */}
        <div className="space-y-1">
          <label className="text-xs text-slate-700 dark:text-slate-300">
            Execution Provider
          </label>
          <select
            value={config.executionProvider || ''}
            onChange={(e) => onChange({ executionProvider: e.target.value || undefined })}
            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none font-mono"
          >
            <option value="">Auto (Best Available)</option>
            <option value="CPUExecutionProvider">CPU Execution Provider</option>
            <option value="CUDAExecutionProvider">CUDA GPU Provider</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export const AiClassificationProperties: React.FC<Omit<AiModelPropertiesProps, 'taskType'>> = (props) => (
  <AiModelProperties {...props} taskType="IMAGE_CLASSIFICATION" />
);

export const AiDetectionProperties: React.FC<Omit<AiModelPropertiesProps, 'taskType'>> = (props) => (
  <AiModelProperties {...props} taskType="OBJECT_DETECTION" />
);
