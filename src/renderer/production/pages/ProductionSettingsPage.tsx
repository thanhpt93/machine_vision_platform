import React, { useEffect, useState } from 'react';
import {
  Eye,
  Info,
  Moon,
  Palette,
  Settings,
  Sun,
} from 'lucide-react';
import { useProductionStore } from '../store/productionStore';
import { useThemeStore } from '../../store/themeStore';
import { AppInfo } from '../../../main/preload';
import { runtimeApi } from '../../services/runtimeApi';
import { LicenseSettingsCard } from '../../license/LicenseSettingsCard';

export const ProductionSettingsPage: React.FC = () => {
  const preferences = useProductionStore((s) => s.preferences);
  const updatePreferences = useProductionStore((s) => s.updatePreferences);
  const healthResult = useProductionStore((s) => s.healthResult);

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.getAppInfo) {
      const p = window.electronAPI.getAppInfo();
      if (p && typeof p.then === 'function') {
        p.then(setAppInfo).catch(() => {});
      }
    }
  }, []);

  return (
    <div
      className="h-full w-full overflow-y-auto bg-slate-100 dark:bg-slate-950 p-5 space-y-5"
      data-testid="production-settings-page"
    >
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2">
          <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span>Workstation Settings</span>
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Configure workstation display theme, image inspection viewer defaults, and licensing.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
        {/* Card 1: Theme & Appearance */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Palette className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Workstation Theme
            </h3>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Select the visual contrast theme for the inspection operator workstation.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center justify-center space-x-2 p-3 rounded-lg border text-xs font-semibold transition-all ${
                theme === 'light'
                  ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Industrial Light Mode</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center justify-center space-x-2 p-3 rounded-lg border text-xs font-semibold transition-all ${
                theme === 'dark'
                  ? 'bg-blue-950/70 border-blue-500 text-blue-300 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Moon className="w-4 h-4 text-indigo-400" />
              <span>Dark Workstation Mode</span>
            </button>
          </div>
        </div>

        {/* Card 2: Inspection Image Viewer Preferences */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Image Viewer & History Preferences
            </h3>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Default Canvas Backdrop
              </label>
              <select
                value={preferences.defaultViewerBg}
                onChange={(e) =>
                  updatePreferences({
                    defaultViewerBg: e.target.value as 'checkerboard' | 'dark' | 'light',
                  })
                }
                className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="checkerboard">Neutral Checkerboard</option>
                <option value="dark">High-Contrast Dark Slate</option>
                <option value="light">Clean Light Surface</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  Auto-Switch to Processed Result Image
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Automatically display the terminal processed node output when an inspection finishes
                </div>
              </div>
              <input
                type="checkbox"
                checked={preferences.autoSelectProcessedImage}
                onChange={(e) =>
                  updatePreferences({ autoSelectProcessedImage: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </div>

            <div className="pt-1">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Inspection History Table Page Size
              </label>
              <select
                value={preferences.historyPageSize}
                onChange={(e) =>
                  updatePreferences({ historyPageSize: Number(e.target.value) || 25 })
                }
                className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value={10}>10 records per page</option>
                <option value={25}>25 records per page</option>
                <option value={50}>50 records per page</option>
                <option value={100}>100 records per page</option>
              </select>
            </div>
          </div>
        </div>

        {/* Card 3: Software License & Entitlements */}
        <div className="lg:col-span-2">
          <LicenseSettingsCard />
        </div>

        {/* Card 4: Application & Runtime Version Info */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Application & Runtime Version Information
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">
                Desktop Application
              </div>
              <div className="font-semibold text-slate-900 dark:text-white mt-1">
                NOVA Machine Vision Platform
              </div>
              <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                Version: v{appInfo?.version || '0.1.0'} ({appInfo?.platform || 'win32'}-
                {appInfo?.arch || 'x64'})
              </div>
            </div>

            <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">
                Python Vision Runtime
              </div>
              <div className="font-semibold text-slate-900 dark:text-white mt-1">
                {healthResult?.data?.service || 'machine-vision-python-runtime'}
              </div>
              <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                Runtime v{healthResult?.data?.version || '0.3.0'} • Python{' '}
                {healthResult?.data?.python_version || '3.x'}
              </div>
            </div>

            <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">
                Local IPC / REST Endpoint
              </div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white mt-1">
                {runtimeApi.getBaseUrl()}
              </div>
              <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                Pipeline Schema: .mvp v1.0.0
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
