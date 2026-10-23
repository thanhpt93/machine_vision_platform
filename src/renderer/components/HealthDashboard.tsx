import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Server, 
  Cpu, 
  Clock, 
  Globe, 
  Layers,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { runtimeApi } from '../services/runtimeApi';
import { HealthCheckResult } from '../types/api';

export const HealthDashboard: React.FC = () => {
  const [url, setUrl] = useState<string>(runtimeApi.getBaseUrl());
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await runtimeApi.checkHealth();
      setResult(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchHealth();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    runtimeApi.setBaseUrl(newUrl);
  };

  const isConnected = !!result?.data && !result.error;

  const formatUptime = (seconds?: number): string => {
    if (seconds === undefined) return 'N/A';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs}h ${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-6">
      {/* Top control bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg ${isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-semibold text-white">Python Vision Runtime</h2>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  isConnected 
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}>
                  {isConnected ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      CONNECTED (200 OK)
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 mr-1" />
                      OFFLINE
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Local REST API bridge communicating between Electron desktop and Python backend
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 focus-within:border-cyan-500 transition-colors">
              <Globe className="w-4 h-4 text-slate-500 mr-2" />
              <input
                type="text"
                value={url}
                onChange={handleUrlChange}
                placeholder="http://127.0.0.1:8000"
                className="bg-transparent text-sm text-slate-200 outline-none w-56 font-mono"
              />
            </div>

            <button
              onClick={() => fetchHealth()}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white text-sm font-medium rounded-lg shadow transition-colors"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Test Health
            </button>

            <label className="flex items-center cursor-pointer text-xs text-slate-400 select-none ml-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-700 text-cyan-600 focus:ring-0 mr-1.5"
              />
              Auto-poll (5s)
            </label>
          </div>
        </div>
      </div>

      {/* Connection Error Alert */}
      {result?.error && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-4 flex items-start space-x-3 text-rose-300">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">Cannot connect to Python Vision Runtime</p>
            <p className="text-xs text-rose-400 font-mono">{result.error}</p>
            <p className="text-xs text-slate-400 pt-1">
              Ensure the Python runtime is running with:{' '}
              <code className="bg-slate-900 px-1.5 py-0.5 rounded text-cyan-300 font-mono">
                python -m uvicorn vision_runtime.main:app --app-dir python_runtime --reload
              </code>
            </p>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Service Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Service Name</span>
            <Server className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-wide">
            {result?.data?.service ?? 'Unknown'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Version: <span className="font-mono text-slate-300">{result?.data?.version ?? 'N/A'}</span>
          </div>
        </div>

        {/* Python Version Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Python Environment</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-wide font-mono">
            {result?.data?.python_version ? `Python ${result.data.python_version}` : 'Unavailable'}
          </div>
          <div className="text-xs text-slate-500 mt-1 truncate" title={result?.data?.platform}>
            OS: <span className="text-slate-300">{result?.data?.platform ?? 'N/A'}</span>
          </div>
        </div>

        {/* Latency & Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>HTTP Latency</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-wide font-mono">
            {result ? `${result.latencyMs} ms` : '--'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Status: <span className={`font-semibold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>{result?.data?.status ?? 'Offline'}</span>
          </div>
        </div>

        {/* Uptime Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Runtime Uptime</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-wide font-mono">
            {formatUptime(result?.data?.uptime_seconds)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Polled at: <span className="font-mono text-slate-400">{result?.checkedAt ? new Date(result.checkedAt).toLocaleTimeString() : '--'}</span>
          </div>
        </div>
      </div>

      {/* Raw Payload & Architecture Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Architecture constraints checklist */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center space-x-2 text-white font-semibold mb-3">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <h3>Phase 1: Architecture Guardrails</h3>
          </div>
          <ul className="space-y-2 text-xs text-slate-300">
            <li className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Electron Renderer Isolated (<code>contextIsolation: true</code>, <code>nodeIntegration: false</code>)</span>
            </li>
            <li className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Independent Python Runtime Service with FastAPI & Pydantic</span>
            </li>
            <li className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Controlled Local REST API boundary via <code>/health</code></span>
            </li>
            <li className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Strict Node Contract & Versioned Pipeline Schema (Zod)</span>
            </li>
            <li className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>No arbitrary executable code embedded in pipeline data</span>
            </li>
          </ul>
        </div>

        {/* Live JSON Response */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2 text-white font-semibold">
              <Layers className="w-5 h-5 text-cyan-400" />
              <h3>Live /health JSON Payload</h3>
            </div>
            {result?.checkedAt && (
              <span className="text-[10px] font-mono text-slate-500">
                {result.checkedAt}
              </span>
            )}
          </div>
          <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-cyan-300 overflow-auto flex-1 max-h-48">
            {result?.data 
              ? JSON.stringify(result.data, null, 2) 
              : result?.error 
                ? JSON.stringify({ error: result.error, targetUrl: url }, null, 2)
                : 'Waiting for response...'}
          </pre>
        </div>
      </div>
    </div>
  );
};
