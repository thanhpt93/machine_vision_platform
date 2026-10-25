import React, { useEffect, useState } from 'react';
import { Eye, Shield, Terminal, Cpu, Workflow, Activity, Sun, Moon } from 'lucide-react';
import { HealthDashboard } from './components/HealthDashboard';
import { PipelineEditor } from './pipeline/components/PipelineEditor';
import { AppInfo } from '../main/preload';
import { useThemeStore } from './store/themeStore';

interface AppProps {
  initialTab?: 'editor' | 'diagnostics';
}

export const App: React.FC<AppProps> = ({ initialTab = 'editor' }) => {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'diagnostics'>(initialTab);

  // Theme Management
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.getAppInfo) {
      const infoPromise = window.electronAPI.getAppInfo();
      if (infoPromise && typeof infoPromise.then === 'function') {
        infoPromise.then(setAppInfo).catch(() => {});
      }
    }
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-150">
      {/* Universal Desktop Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between shrink-0 z-50 select-none transition-colors">
        {/* Brand & Tabs */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg text-white shadow-md shadow-cyan-500/20">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xs font-bold tracking-tight text-slate-900 dark:text-white uppercase">
                  Machine Vision Platform
                </h1>
                <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-cyan-100 text-cyan-800 border border-cyan-300 dark:bg-cyan-950 dark:text-cyan-400 dark:border-cyan-800">
                  Phase 3 OpenCV
                </span>
                <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hidden sm:inline">
                  .MVP Format
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-950/80 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'editor'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
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
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Python Vision Runtime</span>
            </button>
          </nav>
        </div>

        {/* Right Section: Badges & Theme Toggle */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Theme Toggle Button (Light/Dark Mode) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-colors shadow-xs"
            title={theme === 'dark' ? 'Chuyển sang giao diện Sáng [Light Mode]' : 'Chuyển sang giao diện Tối [Dark Mode]'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] font-medium hidden md:inline">Giao diện Sáng</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-medium hidden md:inline">Giao diện Tối</span>
              </>
            )}
          </button>

          <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-[11px]">
            <Terminal className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
            <span>Electron: {appInfo?.electronVersion ?? '35.0.0'}</span>
          </div>
          <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-[11px]">
            <Cpu className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Arch: {appInfo?.arch ?? 'x64'}</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-[11px]">
            <Shield className="w-3 h-3 text-purple-600 dark:text-purple-400" />
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
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  System Diagnostics & Runtime Health
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
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
