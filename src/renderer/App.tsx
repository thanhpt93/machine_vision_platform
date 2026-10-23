import React, { useEffect, useState } from 'react';
import { Eye, Shield, Terminal, Cpu } from 'lucide-react';
import { HealthDashboard } from './components/HealthDashboard';
import { AppInfo } from '../main/preload';

export const App: React.FC = () => {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.getAppInfo) {
      const infoPromise = window.electronAPI.getAppInfo();
      if (infoPromise && typeof infoPromise.then === 'function') {
        infoPromise.then(setAppInfo).catch(() => {});
      }
    }
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg text-white shadow-md shadow-cyan-500/20">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight text-white">Machine Vision Platform</h1>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                Phase 1 MVP
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Industrial Visual Inspection Desktop System</p>
          </div>
        </div>

        {/* Runtime info badges */}
        <div className="flex items-center space-x-4 text-xs">
          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Electron: {appInfo?.electronVersion ?? 'Web Mode'}</span>
          </div>
          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Arch: {appInfo?.arch ?? 'x64'}</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Shield className="w-3.5 h-3.5 text-purple-400" />
            <span>Sandbox: Active</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-white">System Diagnostics & Runtime Health</h2>
          <p className="text-sm text-slate-400 mt-1">
            Foundation stage: Verifying isolation, local communication bridge, and runtime health status.
          </p>
        </div>

        <HealthDashboard />
      </main>

      {/* Footer */}
      <footer className="bg-slate-900/60 border-t border-slate-800/80 px-6 py-3 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          <span>Machine Vision Platform v0.1.0 • Windows Industrial Edition</span>
        </div>
        <div className="flex items-center space-x-4 font-mono text-[11px]">
          <span>REST API: 127.0.0.1:8000</span>
          <span>•</span>
          <span>Engine: OpenCV + ONNX Ready</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
