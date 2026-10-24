import React, { useEffect, useState } from 'react';
import { Eye, Shield, Terminal, Cpu, Workflow, Activity } from 'lucide-react';
import { HealthDashboard } from './components/HealthDashboard';
import { PipelineEditor } from './pipeline/components/PipelineEditor';
import { AppInfo } from '../main/preload';

interface AppProps {
  initialTab?: 'editor' | 'diagnostics';
}

export const App: React.FC<AppProps> = ({ initialTab = 'editor' }) => {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'diagnostics'>(initialTab);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.getAppInfo) {
      const infoPromise = window.electronAPI.getAppInfo();
      if (infoPromise && typeof infoPromise.then === 'function') {
        infoPromise.then(setAppInfo).catch(() => {});
      }
    }
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Universal Desktop Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between shrink-0 z-50 select-none">
        {/* Brand & Tabs */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg text-white shadow-md shadow-cyan-500/20">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xs font-bold tracking-tight text-white uppercase">
                  Machine Vision Platform
                </h1>
                <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Phase 2 Editor
                </span>
                <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 hidden sm:inline">
                  Phase 1 MVP
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'editor'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>Pipeline Editor</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('diagnostics')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'diagnostics'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Python Vision Runtime</span>
            </button>
          </nav>
        </div>

        {/* Runtime info badges */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300 text-[11px]">
            <Terminal className="w-3 h-3 text-cyan-400" />
            <span>Electron: {appInfo?.electronVersion ?? '35.0.0 (Desktop)'}</span>
          </div>
          <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300 text-[11px]">
            <Cpu className="w-3 h-3 text-emerald-400" />
            <span>Arch: {appInfo?.arch ?? 'x64'}</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300 text-[11px]">
            <Shield className="w-3 h-3 text-purple-400" />
            <span>Sandbox: Active</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 w-full h-full overflow-hidden">
        {activeTab === 'editor' ? (
          <PipelineEditor onOpenDiagnostics={() => setActiveTab('diagnostics')} />
        ) : (
          <div className="h-full overflow-y-auto max-w-7xl w-full mx-auto p-6 md:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  System Diagnostics & Runtime Health
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Foundation verification: Local communication bridge, REST isolation, and process health.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
              >
                <Workflow className="w-3.5 h-3.5" />
                <span>Return to Pipeline Editor</span>
              </button>
            </div>

            <HealthDashboard />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
