import React, { useEffect, useState, useMemo } from 'react';
import {
  Brain,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  Cpu,
  FileCheck,
  FolderOpen,
  X,
  ShieldCheck,
} from 'lucide-react';
import { runtimeApi } from '../services/runtimeApi';
import { AiModelItem, HardwareInfo, ModelValidationResult } from '../types/api';

export const AiModelRegistry: React.FC = () => {
  const [models, setModels] = useState<AiModelItem[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'IMAGE_CLASSIFICATION' | 'OBJECT_DETECTION'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'valid' | 'invalid'>('ALL');

  // Modal states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedDetailsModel, setSelectedDetailsModel] = useState<AiModelItem | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, ModelValidationResult>>({});
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Import form states
  const [importPath, setImportPath] = useState('');
  const [customName, setCustomName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchRegistryData = async () => {
    setLoading(true);
    try {
      const [modelList, hwInfo] = await Promise.all([
        runtimeApi.getModels(),
        runtimeApi.getHardwareInfo().catch(() => null),
      ]);
      setModels(modelList);
      if (hwInfo) setHardware(hwInfo);
    } catch (err: unknown) {
      console.error('Failed to load AI model registry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistryData();
  }, []);

  const handleBrowsePackage = async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.selectModelPackage) {
      try {
        const res = await window.electronAPI.selectModelPackage();
        if (res.success && res.packagePath) {
          setImportPath(res.packagePath);
        }
      } catch (err) {
        console.error('Failed to open package dialog:', err);
      }
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importPath.trim()) {
      setImportError('Please enter or browse to a valid model package directory or .zip archive.');
      return;
    }

    setImporting(true);
    setImportError(null);
    try {
      await runtimeApi.importModel({
        source_path: importPath.trim(),
        custom_name: customName.trim() || undefined,
      });
      setImportPath('');
      setCustomName('');
      setIsImportModalOpen(false);
      await fetchRegistryData();
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleValidateModel = async (modelId: string) => {
    setValidatingId(modelId);
    try {
      const res = await runtimeApi.validateModel(modelId);
      setValidationResults((prev) => ({ ...prev, [modelId]: res }));
      await fetchRegistryData();
    } catch (err: unknown) {
      alert(`Validation error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setValidatingId(null);
    }
  };

  const handleDeleteModel = async (model: AiModelItem) => {
    const confirmMsg = `Are you sure you want to delete model '${model.name}' (${model.id})?\n\nThis will remove the managed ONNX graph and metadata from storage.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingId(model.id);
    try {
      await runtimeApi.deleteModel(model.id, false);
      await fetchRegistryData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Referenced by')) {
        if (window.confirm(`${msg}\n\nDo you want to FORCE delete this model anyway?`)) {
          await runtimeApi.deleteModel(model.id, true);
          await fetchRegistryData();
        }
      } else {
        alert(`Deletion error: ${msg}`);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (taskFilter !== 'ALL' && m.task_type !== taskFilter) return false;
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = m.name.toLowerCase().includes(q);
        const matchId = m.id.toLowerCase().includes(q);
        const matchArch = m.architecture.toLowerCase().includes(q);
        return matchName || matchId || matchArch;
      }
      return true;
    });
  }, [models, taskFilter, statusFilter, searchQuery]);

  return (
    <div
      className="flex-1 flex flex-col h-full bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden"
      data-testid="ai-model-registry-shell"
    >
      {/* Top Banner & Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-600 text-white shadow-md shadow-purple-500/20">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight flex items-center space-x-2">
                <span>AI Model Registry</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  NOVA AI Trainer Integration
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Import, validate, and manage trained Image Classification and Object Detection ONNX bundles.
              </p>
            </div>
          </div>
        </div>

        {/* Right Section: Hardware Status & Actions */}
        <div className="flex items-center space-x-3">
          {hardware && (
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center space-x-2.5 text-xs">
              <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div className="text-[11px] leading-tight">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {hardware.selected_provider}
                </div>
                <div className="text-[10px] text-slate-400">
                  {hardware.device_name ? hardware.device_name : `${hardware.cpu_cores} CPU Cores`}
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            data-testid="refresh-models-btn"
            onClick={fetchRegistryData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
            title="Refresh models list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            data-testid="open-import-model-modal"
            onClick={() => {
              setImportError(null);
              setIsImportModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Import Model</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-6 py-3 bg-white/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center space-x-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              data-testid="search-models-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models by name, architecture, ID..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Task Type Filter */}
          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setTaskFilter('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                taskFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => setTaskFilter('IMAGE_CLASSIFICATION')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                taskFilter === 'IMAGE_CLASSIFICATION'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Classification
            </button>
            <button
              type="button"
              onClick={() => setTaskFilter('OBJECT_DETECTION')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                taskFilter === 'OBJECT_DETECTION'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Detection
            </button>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-100 dark:bg-slate-950 px-2.5 py-1 rounded-lg text-[11px] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium focus:outline-none"
          >
            <option value="ALL">All Status</option>
            <option value="valid">Valid Only</option>
            <option value="invalid">Invalid Only</option>
          </select>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <span>Total: <strong>{filteredModels.length}</strong> model(s)</span>
        </div>
      </div>

      {/* Main Content Area: Models Table */}
      <div className="flex-1 overflow-auto p-6">
        {filteredModels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <div className="p-3 bg-purple-50 dark:bg-purple-950/50 rounded-2xl text-purple-600 dark:text-purple-400">
              <Brain className="w-8 h-8" />
            </div>
            <div className="max-w-md">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                No AI Models Found
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {searchQuery || taskFilter !== 'ALL'
                  ? 'No models match the selected search or filter criteria.'
                  : 'No trained models imported yet. Click "Import Model" to ingest an exported model bundle from NOVA AI Trainer.'}
              </p>
            </div>
            {!searchQuery && taskFilter === 'ALL' && (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Import First Model
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Model Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Architecture</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Format</th>
                  <th className="py-3 px-4">Input Size</th>
                  <th className="py-3 px-4">Classes</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Imported</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                {filteredModels.map((m) => {
                  const valRes = validationResults[m.id];
                  const isValid = valRes ? valRes.is_valid : m.status === 'valid';

                  return (
                    <tr
                      key={m.id}
                      data-testid={`model-row-${m.id}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {m.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate max-w-[200px]" title={m.id}>
                          {m.id}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {m.task_type === 'IMAGE_CLASSIFICATION' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                            Classification
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                            Object Detection
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {m.architecture}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        v{m.version}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {m.format}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {m.input_size ? `${m.input_size[0]} × ${m.input_size[1]}` : 'Dynamic'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {m.num_classes} classes
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            isValid
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {isValid ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          <span>{isValid ? 'Valid' : 'Invalid'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {m.import_date ? new Date(m.import_date).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center space-x-1">
                          <button
                            type="button"
                            data-testid={`validate-model-${m.id}`}
                            onClick={() => handleValidateModel(m.id)}
                            disabled={validatingId === m.id}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                            title="Validate model integrity and test ONNX session"
                          >
                            <ShieldCheck className={`w-4 h-4 ${validatingId === m.id ? 'animate-spin' : ''}`} />
                          </button>

                          <button
                            type="button"
                            data-testid={`details-model-${m.id}`}
                            onClick={() => setSelectedDetailsModel(m)}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="View model metadata details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            data-testid={`delete-model-${m.id}`}
                            onClick={() => handleDeleteModel(m)}
                            disabled={deletingId === m.id}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                            title="Delete model from registry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import Model Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            data-testid="import-model-modal"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 rounded-lg bg-purple-600 text-white">
                  <Brain className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                  Import Model from NOVA AI Trainer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="p-6 space-y-4">
              {importError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-600 dark:text-rose-400 text-xs flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{importError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Export Package Path (Directory or .zip)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    data-testid="import-path-input"
                    value={importPath}
                    onChange={(e) => setImportPath(e.target.value)}
                    placeholder="e.g. C:\Project\ai_trainer\export\mobilenet_v3_small..."
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handleBrowsePackage}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 shrink-0 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Browse...</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Select an exported package folder containing <code>model.onnx</code>, <code>model_metadata.json</code>, <code>labels.json</code>, and <code>export_manifest.json</code>.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Custom Display Name (Optional)
                </label>
                <input
                  type="text"
                  data-testid="import-name-input"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Surface Defect Inspector v1.0"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-import-btn"
                  disabled={importing}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium flex items-center space-x-1.5 shadow-sm transition-all"
                >
                  {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
                  <span>{importing ? 'Validating & Importing...' : 'Import Package'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Model Details Modal Drawer */}
      {selectedDetailsModel && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            data-testid="model-details-modal"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-purple-600 text-white">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {selectedDetailsModel.name}
                  </h3>
                  <div className="text-[10px] font-mono text-slate-400">
                    ID: {selectedDetailsModel.id}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailsModel(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto text-xs">
              {/* Specs Grid */}
              <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[11px]">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-sans">Task Type</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedDetailsModel.task_type}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-sans">Architecture</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedDetailsModel.architecture}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-sans">Schema Version</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedDetailsModel.version}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-sans">Input Size</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedDetailsModel.input_size ? `${selectedDetailsModel.input_size[0]} × ${selectedDetailsModel.input_size[1]}` : 'Dynamic'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-sans">Classes</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedDetailsModel.num_classes} classes
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-sans">File Size</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {(selectedDetailsModel.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              </div>

              {/* SHA-256 Integrity */}
              <div className="space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  SHA-256 Checksum:
                </span>
                <div className="p-2 bg-slate-100 dark:bg-slate-950 font-mono text-[10px] text-slate-600 dark:text-slate-400 rounded break-all border border-slate-200 dark:border-slate-800">
                  {selectedDetailsModel.checksum_sha256}
                </div>
              </div>

              {/* Classes List */}
              <div className="space-y-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Class Mapping ({selectedDetailsModel.classes?.length || 0}):
                </span>
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase text-slate-500 font-semibold">
                      <tr>
                        <th className="py-1.5 px-3">Index</th>
                        <th className="py-1.5 px-3">Label Name</th>
                        <th className="py-1.5 px-3">Label ID</th>
                        <th className="py-1.5 px-3">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedDetailsModel.classes?.map((c) => (
                        <tr key={c.index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-1.5 px-3 font-mono">{c.index}</td>
                          <td className="py-1.5 px-3 font-medium flex items-center space-x-1.5">
                            {c.color && (
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: c.color }}
                              />
                            )}
                            <span>{c.name}</span>
                          </td>
                          <td className="py-1.5 px-3 font-mono text-[10px] text-slate-400">
                            {c.id || c.label_id || 'N/A'}
                          </td>
                          <td className="py-1.5 px-3 text-[10px]">
                            {c.is_background ? (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">Background</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Target</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Raw Metadata JSON Drawer */}
              <div className="space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Raw Export Metadata (model_metadata.json):
                </span>
                <pre className="p-3 bg-slate-900 text-slate-200 text-[10px] font-mono rounded-lg overflow-x-auto max-h-48 border border-slate-800">
                  {JSON.stringify(selectedDetailsModel.metadata, null, 2)}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedDetailsModel(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
