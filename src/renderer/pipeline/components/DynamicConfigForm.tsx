import React from 'react';
import { NodeRegistryItem, ConfigFieldDescriptor } from '../registry/nodeRegistry';

interface DynamicConfigFormProps {
  contract: NodeRegistryItem;
  config: Record<string, any>;
  onConfigChange: (partialConfig: Record<string, any>) => void;
  getFieldError: (fieldName: string) => string | undefined;
}

export const DynamicConfigForm: React.FC<DynamicConfigFormProps> = ({
  contract,
  config,
  onConfigChange,
  getFieldError,
}) => {
  if (contract.customPropertiesComponent) {
    const CustomComp = contract.customPropertiesComponent;
    return (
      <CustomComp
        config={config}
        onChange={onConfigChange}
        getFieldError={getFieldError}
      />
    );
  }

  const fields: ConfigFieldDescriptor[] = contract.configFields || [];

  if (fields.length === 0) {
    return (
      <div className="text-xs text-slate-500 py-2 italic">
        This node does not require additional configuration parameters.
      </div>
    );
  }

  const handleBrowseImage = async (fieldKey: string) => {
    if (typeof window !== 'undefined' && window.electronAPI?.selectImageFile) {
      try {
        const res = await window.electronAPI.selectImageFile();
        if (res.success && res.filePath) {
          onConfigChange({ [fieldKey]: res.filePath });
        }
      } catch (err) {
        console.error('Error selecting image file:', err);
      }
    }
  };

  return (
    <div className="space-y-3.5">
      {fields.map((field) => {
        const value = config[field.key] ?? field.defaultValue ?? '';
        const error = getFieldError(field.key);

        switch (field.type) {
          case 'text':
            return (
              <div key={field.key} className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {field.label}
                </label>
                <div className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    value={value}
                    placeholder={field.placeholder}
                    onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
                    className={`flex-1 bg-white dark:bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none transition-colors ${
                      error
                        ? 'border-rose-500 focus:border-rose-400'
                        : 'border-slate-300 dark:border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {field.key === 'filePath' && (
                    <button
                      type="button"
                      onClick={() => handleBrowseImage(field.key)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors shrink-0 font-medium"
                      title="Browse image file from local disk"
                    >
                      Browse...
                    </button>
                  )}
                </div>
                {field.description && !error && (
                  <p className="text-[10px] text-slate-500">{field.description}</p>
                )}
                {error && <p className="text-[10px] text-rose-500 dark:text-rose-400">{error}</p>}

                {/* Presets if provided */}
                {field.presets && field.presets.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] text-slate-500 uppercase font-mono">
                      Presets:
                    </span>
                    <div className="grid grid-cols-1 gap-1">
                      {field.presets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => onConfigChange({ [field.key]: preset.value })}
                          className="text-left text-[11px] font-mono px-2 py-1 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded text-slate-700 dark:text-slate-300 truncate transition-colors"
                        >
                          {preset.label}: <span className="text-cyan-600 dark:text-cyan-400">{preset.value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );

          case 'number':
            return (
              <div key={field.key} className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {field.label}
                </label>
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  value={value}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value);
                    onConfigChange({ [field.key]: isNaN(parsed) ? 0 : parsed });
                  }}
                  className={`w-full bg-white dark:bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none transition-colors ${
                    error
                      ? 'border-rose-500 focus:border-rose-400'
                      : 'border-slate-300 dark:border-slate-700 focus:border-cyan-500'
                  }`}
                />
                {field.description && !error && (
                  <p className="text-[10px] text-slate-500">{field.description}</p>
                )}
                {error && <p className="text-[10px] text-rose-500 dark:text-rose-400">{error}</p>}
              </div>
            );

          case 'range':
            return (
              <div key={field.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {field.label}
                  </label>
                  <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                    {value}
                  </span>
                </div>
                <input
                  type="range"
                  min={field.min ?? 0}
                  max={field.max ?? 100}
                  step={field.step ?? 1}
                  value={value}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value);
                    onConfigChange({ [field.key]: parsed });
                  }}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                {field.description && !error && (
                  <p className="text-[10px] text-slate-500">{field.description}</p>
                )}
                {error && <p className="text-[10px] text-rose-500 dark:text-rose-400">{error}</p>}
              </div>
            );

          case 'select':
            return (
              <div key={field.key} className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {field.label}
                </label>
                <select
                  value={value}
                  onChange={(e) => {
                    // Try parsing as number if options values are numbers
                    const raw = e.target.value;
                    const isNum = field.options?.some((o) => typeof o.value === 'number');
                    const parsed = isNum ? parseFloat(raw) : raw;
                    onConfigChange({ [field.key]: parsed });
                  }}
                  className={`w-full bg-white dark:bg-slate-950 border rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none font-mono ${
                    error
                      ? 'border-rose-500 focus:border-rose-400'
                      : 'border-slate-300 dark:border-slate-700 focus:border-cyan-500'
                  }`}
                >
                  {field.options?.map((opt) => (
                    <option key={String(opt.value)} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {field.description && !error && (
                  <p className="text-[10px] text-slate-500">{field.description}</p>
                )}
                {error && <p className="text-[10px] text-rose-500 dark:text-rose-400">{error}</p>}
              </div>
            );

          case 'checkbox':
            return (
              <div key={field.key} className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id={`field_${field.key}`}
                  checked={Boolean(value)}
                  onChange={(e) => onConfigChange({ [field.key]: e.target.checked })}
                  className="rounded bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <label
                  htmlFor={`field_${field.key}`}
                  className="text-xs text-slate-700 dark:text-slate-300 select-none cursor-pointer"
                >
                  {field.label}
                </label>
                {error && <p className="text-[10px] text-rose-500 dark:text-rose-400">{error}</p>}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
};
