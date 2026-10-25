import React, { useState } from 'react';
import { z } from 'zod';
import {
  X,
  Plus,
  Trash2,
  Layers,
  AlertCircle,
  HelpCircle,
  Camera,
  Crop,
  Sliders,
  Monitor,
  Wind,
  Brain,
} from 'lucide-react';
import {
  DataType,
  DataTypeSchema,
  NodeCategory,
  PortDefinition,
} from '@/shared/contracts';
import {
  nodeRegistry,
  NodeRegistryItem,
  ConfigFieldDescriptor,
  ConfigFieldType,
} from '../registry/nodeRegistry';

interface CreateNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const availableDataTypes = DataTypeSchema.options;

const availableIcons = [
  { id: 'sliders', label: 'Sliders / Filter', icon: <Sliders className="w-4 h-4 text-cyan-400" /> },
  { id: 'camera', label: 'Camera / Input', icon: <Camera className="w-4 h-4 text-emerald-400" /> },
  { id: 'crop', label: 'Crop / ROI', icon: <Crop className="w-4 h-4 text-cyan-400" /> },
  { id: 'monitor', label: 'Monitor / Output', icon: <Monitor className="w-4 h-4 text-pink-400" /> },
  { id: 'blur', label: 'Blur / Smoothing', icon: <Wind className="w-4 h-4 text-cyan-300" /> },
  { id: 'brain', label: 'AI / Neural Net', icon: <Brain className="w-4 h-4 text-purple-400" /> },
  { id: 'layers', label: 'Generic / Layers', icon: <Layers className="w-4 h-4 text-slate-400" /> },
];

export const CreateNodeModal: React.FC<CreateNodeModalProps> = ({ isOpen, onClose }) => {
  const [nodeType, setNodeType] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [category, setCategory] = useState<NodeCategory>('PREPROCESSING');
  const [icon, setIcon] = useState('sliders');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Dynamic Ports
  const [inputs, setInputs] = useState<PortDefinition[]>([
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', required: true },
  ]);
  const [outputs, setOutputs] = useState<PortDefinition[]>([
    { id: 'image_out', name: 'Image Out', dataType: 'ImageFrame', required: true },
  ]);

  // Dynamic Config Parameters
  interface ParamFormItem {
    key: string;
    label: string;
    type: ConfigFieldType;
    defaultValue: any;
    min?: number;
    max?: number;
    step?: number;
  }

  const [configFields, setConfigFields] = useState<ParamFormItem[]>([
    { key: 'param1', label: 'Parameter 1', type: 'number', defaultValue: 10, min: 0, max: 100 },
  ]);

  // Runtime info
  const [runtimeSupported, setRuntimeSupported] = useState(false);
  const [runtimeHandler, setRuntimeHandler] = useState('');

  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddInput = () => {
    const idx = inputs.length + 1;
    setInputs([
      ...inputs,
      {
        id: `input_${idx}`,
        name: `Input ${idx}`,
        dataType: 'ImageFrame',
        required: true,
      },
    ]);
  };

  const handleRemoveInput = (idx: number) => {
    setInputs(inputs.filter((_, i) => i !== idx));
  };

  const handleAddOutput = () => {
    const idx = outputs.length + 1;
    setOutputs([
      ...outputs,
      {
        id: `output_${idx}`,
        name: `Output ${idx}`,
        dataType: 'ImageFrame',
        required: true,
      },
    ]);
  };

  const handleRemoveOutput = (idx: number) => {
    setOutputs(outputs.filter((_, i) => i !== idx));
  };

  const handleAddConfigField = () => {
    const idx = configFields.length + 1;
    setConfigFields([
      ...configFields,
      {
        key: `param_${idx}`,
        label: `Param ${idx}`,
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 255,
      },
    ]);
  };

  const handleRemoveConfigField = (idx: number) => {
    setConfigFields(configFields.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanNodeType = nodeType.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanNodeType) {
      setError('Node Type identifier is required (e.g. custom_filter)');
      return;
    }

    if (nodeRegistry.isRegistered(cleanNodeType)) {
      setError(`Node type "${cleanNodeType}" is already registered in library.`);
      return;
    }

    if (!displayName.trim()) {
      setError('Display Name is required (e.g. Custom Filter)');
      return;
    }

    // Validate inputs
    for (const inp of inputs) {
      if (!inp.id.trim() || !inp.name.trim()) {
        setError('All input ports must have a valid ID and Name.');
        return;
      }
    }

    // Validate outputs
    for (const out of outputs) {
      if (!out.id.trim() || !out.name.trim()) {
        setError('All output ports must have a valid ID and Name.');
        return;
      }
    }

    // Validate and build config fields & Zod schema
    const schemaShape: Record<string, z.ZodTypeAny> = {};
    const defaultConfig: Record<string, any> = {};
    const finalConfigFields: ConfigFieldDescriptor[] = [];

    for (const field of configFields) {
      const fieldKey = field.key.trim().replace(/[^a-zA-Z0-9_]/g, '_');
      if (!fieldKey) {
        setError('Config field key cannot be blank.');
        return;
      }

      if (field.type === 'number' || field.type === 'range') {
        let numSchema = z.number();
        if (field.min !== undefined && !isNaN(field.min)) numSchema = numSchema.min(field.min);
        if (field.max !== undefined && !isNaN(field.max)) numSchema = numSchema.max(field.max);
        schemaShape[fieldKey] = numSchema;
        defaultConfig[fieldKey] = Number(field.defaultValue) || 0;
      } else if (field.type === 'checkbox') {
        schemaShape[fieldKey] = z.boolean();
        defaultConfig[fieldKey] = Boolean(field.defaultValue);
      } else {
        schemaShape[fieldKey] = z.string();
        defaultConfig[fieldKey] = String(field.defaultValue ?? '');
      }

      finalConfigFields.push({
        key: fieldKey,
        label: field.label.trim() || fieldKey,
        type: field.type,
        defaultValue: defaultConfig[fieldKey],
        min: field.min,
        max: field.max,
        step: field.step,
      });
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const newItem: NodeRegistryItem = {
      nodeType: cleanNodeType,
      displayName: displayName.trim(),
      version: version.trim() || '1.0.0',
      category,
      description: description.trim() || 'User defined custom vision processing node.',
      icon,
      tags: tags.length > 0 ? tags : ['custom', cleanNodeType],
      inputs,
      outputs,
      defaultConfig,
      configSchema: z.object(schemaShape),
      configFields: finalConfigFields,
      runtime: {
        supported: runtimeSupported,
        handler: runtimeHandler.trim() || undefined,
        notes: runtimeSupported
          ? 'Custom node with designated runtime binding.'
          : 'UI-defined custom node — Runtime Pending until Python handler is implemented.',
      },
    };

    try {
      nodeRegistry.register(newItem);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to register node.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 transition-colors">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-300 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Create Custom Node</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Register a new node definition into the Node Library dynamically
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-xs text-rose-700 dark:text-rose-200 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Basic Node Info */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5">
              <span>1. General Information</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Node Type ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nodeType}
                  onChange={(e) => setNodeType(e.target.value)}
                  placeholder="e.g. canny_edge_detector"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[10px] text-slate-500">Unique identifier, lowercase & underscores</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Canny Edge Detector"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Version</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0.0"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as NodeCategory)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="ACQUISITION">ACQUISITION</option>
                  <option value="PREPROCESSING">PREPROCESSING</option>
                  <option value="INSPECTION">INSPECTION</option>
                  <option value="AI_INFERENCE">AI_INFERENCE</option>
                  <option value="LOGIC_GATE">LOGIC_GATE</option>
                  <option value="OUTPUT">OUTPUT</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Icon</label>
                <select
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {availableIcons.map((ic) => (
                    <option key={ic.id} value={ic.id}>
                      {ic.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what visual transformation or inspection this node performs..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Search Tags</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="edge, filter, contour (comma separated)"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Section 2: Input & Output Ports */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
              2. Data Ports (Contract)
            </h3>

            {/* Inputs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Input Ports</span>
                <button
                  type="button"
                  onClick={handleAddInput}
                  className="flex items-center space-x-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Input</span>
                </button>
              </div>

              {inputs.map((inp, idx) => (
                <div
                  key={idx}
                  className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-950/60 p-2 rounded-lg border border-slate-200 dark:border-slate-800"
                >
                  <input
                    type="text"
                    value={inp.id}
                    placeholder="Port ID (image_in)"
                    onChange={(e) => {
                      const updated = [...inputs];
                      updated[idx].id = e.target.value;
                      setInputs(updated);
                    }}
                    className="w-28 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono"
                  />
                  <input
                    type="text"
                    value={inp.name}
                    placeholder="Display Name"
                    onChange={(e) => {
                      const updated = [...inputs];
                      updated[idx].name = e.target.value;
                      setInputs(updated);
                    }}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200"
                  />
                  <select
                    value={inp.dataType}
                    onChange={(e) => {
                      const updated = [...inputs];
                      updated[idx].dataType = e.target.value as DataType;
                      setInputs(updated);
                    }}
                    className="w-36 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono"
                  >
                    {availableDataTypes.map((dt) => (                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemoveInput(idx)}
                    className="text-slate-400 hover:text-rose-500 p-1"
                    title="Remove Input Port"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Outputs */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Output Ports</span>
                <button
                  type="button"
                  onClick={handleAddOutput}
                  className="flex items-center space-x-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Output</span>
                </button>
              </div>

              {outputs.map((out, idx) => (
                <div
                  key={idx}
                  className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-950/60 p-2 rounded-lg border border-slate-200 dark:border-slate-800"
                >
                  <input
                    type="text"
                    value={out.id}
                    placeholder="Port ID (image_out)"
                    onChange={(e) => {
                      const updated = [...outputs];
                      updated[idx].id = e.target.value;
                      setOutputs(updated);
                    }}
                    className="w-28 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono"
                  />
                  <input
                    type="text"
                    value={out.name}
                    placeholder="Display Name"
                    onChange={(e) => {
                      const updated = [...outputs];
                      updated[idx].name = e.target.value;
                      setOutputs(updated);
                    }}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200"
                  />
                  <select
                    value={out.dataType}
                    onChange={(e) => {
                      const updated = [...outputs];
                      updated[idx].dataType = e.target.value as DataType;
                      setOutputs(updated);
                    }}
                    className="w-36 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono"
                  >
                    {availableDataTypes.map((dt) => (                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemoveOutput(idx)}
                    className="text-slate-400 hover:text-rose-500 p-1"
                    title="Remove Output Port"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Configuration Parameters */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
                  3. Configuration Parameters
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Defines fields rendered in the Properties Panel
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddConfigField}
                className="flex items-center space-x-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Field</span>
              </button>
            </div>

            {configFields.map((field, idx) => (
              <div
                key={idx}
                className="bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={field.key}
                    placeholder="Key (e.g. threshold)"
                    onChange={(e) => {
                      const updated = [...configFields];
                      updated[idx].key = e.target.value;
                      setConfigFields(updated);
                    }}
                    className="w-32 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono"
                  />
                  <input
                    type="text"
                    value={field.label}
                    placeholder="Field Label"
                    onChange={(e) => {
                      const updated = [...configFields];
                      updated[idx].label = e.target.value;
                      setConfigFields(updated);
                    }}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200"
                  />
                  <select
                    value={field.type}
                    onChange={(e) => {
                      const updated = [...configFields];
                      const newType = e.target.value as ConfigFieldType;
                      updated[idx].type = newType;
                      if (newType === 'checkbox') updated[idx].defaultValue = false;
                      if (newType === 'text') updated[idx].defaultValue = '';
                      if (newType === 'number' || newType === 'range') updated[idx].defaultValue = 0;
                      setConfigFields(updated);
                    }}
                    className="w-28 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono"
                  >
                    <option value="number">Number</option>
                    <option value="range">Range (Slider)</option>
                    <option value="text">Text</option>
                    <option value="checkbox">Checkbox</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemoveConfigField(idx)}
                    className="text-slate-400 hover:text-rose-500 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Additional range / number options */}
                {(field.type === 'number' || field.type === 'range') && (
                  <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono pl-1">
                    <span>Default:</span>
                    <input
                      type="number"
                      value={field.defaultValue}
                      onChange={(e) => {
                        const updated = [...configFields];
                        updated[idx].defaultValue = parseFloat(e.target.value) || 0;
                        setConfigFields(updated);
                      }}
                      className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-slate-900 dark:text-slate-200"
                    />
                    <span>Min:</span>
                    <input
                      type="number"
                      value={field.min ?? 0}
                      onChange={(e) => {
                        const updated = [...configFields];
                        updated[idx].min = parseFloat(e.target.value);
                        setConfigFields(updated);
                      }}
                      className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-slate-900 dark:text-slate-200"
                    />
                    <span>Max:</span>
                    <input
                      type="number"
                      value={field.max ?? 100}
                      onChange={(e) => {
                        const updated = [...configFields];
                        updated[idx].max = parseFloat(e.target.value);
                        setConfigFields(updated);
                      }}
                      className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-slate-900 dark:text-slate-200"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Section 4: Python Runtime Binding */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5">
              <span>4. Python Runtime Binding</span>
            </h3>

            <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="runtimeSupported"
                  checked={runtimeSupported}
                  onChange={(e) => setRuntimeSupported(e.target.checked)}
                  className="rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-0 cursor-pointer"
                />
                <label
                  htmlFor="runtimeSupported"
                  className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                >
                  Python Runtime Handler Ready (Uncheck if handler is pending implementation)
                </label>
              </div>

              {runtimeSupported && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Handler Module Path
                  </label>
                  <input
                    type="text"
                    value={runtimeHandler}
                    onChange={(e) => setRuntimeHandler(e.target.value)}
                    placeholder="e.g. vision_runtime.handlers.custom_filter"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs text-slate-900 dark:text-slate-200 font-mono"
                  />
                </div>
              )}

              <div className="flex items-start space-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                <span>
                  Nodes marked with pending runtime status will display a &quot;Pending&quot; badge
                  in the library until their Python execution handler is registered in the Runtime Registry.
                </span>
              </div>
            </div>
          </div>

          {/* Footer / Submit */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Node</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
