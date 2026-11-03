import React, { useEffect, useState } from 'react';
import {
  Eye,
  Workflow,
  Sun,
  Moon,
  Brain,
  ShieldCheck,
} from 'lucide-react';
import { HealthDashboard } from './components/HealthDashboard';
import { PipelineEditor } from './pipeline/components/PipelineEditor';
import { ProductionLayout } from './production/components/ProductionLayout';
import { AiModelRegistry } from './components/AiModelRegistry';
import { useThemeStore } from './store/themeStore';
import { useLicenseStore } from './store/licenseStore';
import { DeploymentMode, isProductionEdition } from '../shared/editionConfig';
import { LicenseStatusBadge } from './license/LicenseStatusBadge';
import { LicenseActivationModal } from './license/LicenseActivationModal';
import { LicenseDetailsModal } from './license/LicenseDetailsModal';

interface AppProps {
  initialTab?: 'editor' | 'diagnostics' | 'production' | 'models';
  deploymentModeOverride?: DeploymentMode;
}

export const App: React.FC<AppProps> = ({
  initialTab = 'editor',
  deploymentModeOverride,
}) => {
  const isProdEdition = isProductionEdition(deploymentModeOverride);

  const [activeTab, setActiveTab] = useState<'editor' | 'diagnostics' | 'production' | 'models'>(
    isProdEdition ? 'production' : initialTab
  );

  // Theme Management
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  // License Management
  const refreshLicenseStatus = useLicenseStore((state) => state.refreshLicenseStatus);
  const openActivationModal = useLicenseStore((state) => state.openActivationModal);

  useEffect(() => {
    refreshLicenseStatus();

    let unsubscribeMenu: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.electronAPI?.onMenuAction) {
      unsubscribeMenu = window.electronAPI.onMenuAction((action: string) => {
        if (action === 'import-license') {
          openActivationModal();
        }
      });
    }

    return () => {
      if (unsubscribeMenu) unsubscribeMenu();
    };
  }, [refreshLicenseStatus, openActivationModal]);

  // ==========================================================================
  // PRODUCTION EDITION SHELL
  // Opens directly into Production UI; never exposes Developer Editor routes,
  // Developer mode switcher, or Developer diagnostics tabs.
  // ==========================================================================
  if (isProdEdition) {
    return (
      <div
        className="flex flex-col h-screen w-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-150"
        data-testid="production-edition-shell"
      >
        <ProductionLayout />
      </div>
    );
  }

  // ==========================================================================
  // DEVELOPER EDITION SHELL
  // ==========================================================================
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
              <h1 className="text-xs font-bold tracking-tight text-slate-900 dark:text-white uppercase">
                Machine Vision Platform
              </h1>
            </div>
          </div>

          {/* Navigation Tabs (Developer Mode) */}
          <nav className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-950/80 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              data-testid="mode-tab-editor"
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
              onClick={() => setActiveTab('models')}
              data-testid="mode-tab-models"
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'models'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>AI Models</span>
            </button>
          </nav>
        </div>

        {/* Right Section: License, Diagnostics & Theme Toggle */}
        <div className="flex items-center space-x-2.5 text-xs">
          {/* License Status Badge */}
          <LicenseStatusBadge />

          {/* Diagnostics Button */}
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'diagnostics' ? 'editor' : 'diagnostics')}
            data-testid="mode-tab-diagnostics"
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors shadow-xs ${
              activeTab === 'diagnostics'
                ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
            }`}
            title="View Python Runtime Health Diagnostics"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span className="text-[11px] font-medium hidden md:inline">Diagnostics</span>
          </button>

          {/* Theme Toggle Button (Light/Dark Mode) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-colors shadow-xs"
            title={
              theme === 'dark'
                ? 'Chuyển sang giao diện Sáng [Light Mode]'
                : 'Chuyển sang giao diện Tối [Dark Mode]'
            }
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
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 w-full h-full overflow-hidden">
        {activeTab === 'editor' ? (
          <PipelineEditor
            onOpenDiagnostics={() => setActiveTab('diagnostics')}
            onOpenProductionMode={() => setActiveTab('production')}
          />
        ) : activeTab === 'production' ? (
          <ProductionLayout onSwitchToDeveloperMode={() => setActiveTab('editor')} />
        ) : activeTab === 'models' ? (
          <AiModelRegistry />
        ) : (
          <div className="h-full overflow-y-auto max-w-7xl w-full mx-auto p-6 md:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  System Diagnostics & Runtime Health
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Foundation verification: Local communication bridge, REST isolation, and process
                  health.
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

      {/* Global Modals for License Management */}
      <LicenseActivationModal />
      <LicenseDetailsModal />
    </div>
  );
};

export default App;
