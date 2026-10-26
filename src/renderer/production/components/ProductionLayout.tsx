import React, { useEffect } from 'react';
import {
  Activity,
  Code2,
  Eye,
  History,
  Layers,
  LayoutDashboard,
  Moon,
  ScanEye,
  Server,
  Settings,
  Sun,
} from 'lucide-react';
import { ProductionNavPage, useProductionStore } from '../store/productionStore';
import { useThemeStore } from '../../store/themeStore';
import { useLicenseStore } from '../../store/licenseStore';
import { ProductionDashboard } from '../pages/ProductionDashboard';
import { InspectionPage } from '../pages/InspectionPage';
import { InspectionHistoryPage } from '../pages/InspectionHistoryPage';
import { ReleasedPipelinePage } from '../pages/ReleasedPipelinePage';
import { SystemStatusPage } from '../pages/SystemStatusPage';
import { ProductionSettingsPage } from '../pages/ProductionSettingsPage';
import { LicenseStatusBadge } from '../../license/LicenseStatusBadge';
import { LicenseActivationModal } from '../../license/LicenseActivationModal';
import { LicenseDetailsModal } from '../../license/LicenseDetailsModal';

interface ProductionLayoutProps {
  onSwitchToDeveloperMode?: () => void;
}

interface NavItemConfig {
  id: ProductionNavPage;
  label: string;
  shortDesc: string;
  icon: React.FC<{ className?: string }>;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Production Dashboard',
    shortDesc: 'Summary & recent runs',
    icon: LayoutDashboard,
  },
  {
    id: 'inspection',
    label: 'Inspection',
    shortDesc: 'Primary workstation',
    icon: ScanEye,
  },
  {
    id: 'history',
    label: 'Inspection History',
    shortDesc: 'Audit & filter records',
    icon: History,
  },
  {
    id: 'pipelines',
    label: 'Pipeline Management',
    shortDesc: 'Read-only releases',
    icon: Layers,
  },
  {
    id: 'system_status',
    label: 'System Status',
    shortDesc: 'Runtime & API health',
    icon: Activity,
  },
  {
    id: 'settings',
    label: 'Settings',
    shortDesc: 'Display & preferences',
    icon: Settings,
  },
];

export const ProductionLayout: React.FC<ProductionLayoutProps> = ({
  onSwitchToDeveloperMode,
}) => {
  const activePage = useProductionStore((s) => s.activePage);
  const setActivePage = useProductionStore((s) => s.setActivePage);

  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const healthResult = useProductionStore((s) => s.healthResult);
  const refreshHealth = useProductionStore((s) => s.refreshHealth);
  const fetchReleases = useProductionStore((s) => s.fetchReleases);
  const fetchInspectionsHistory = useProductionStore((s) => s.fetchInspectionsHistory);

  const eligibleReleases = useProductionStore((s) => s.eligibleReleases);
  const selectedReleaseKey = useProductionStore((s) => s.selectedReleaseKey);
  const isRunningInspection = useProductionStore((s) => s.isRunningInspection);

  const refreshLicenseStatus = useLicenseStore((s) => s.refreshLicenseStatus);
  const openActivationModal = useLicenseStore((s) => s.openActivationModal);

  // Initial data load and periodic health & license heartbeat when Production Mode is mounted
  useEffect(() => {
    refreshHealth();
    fetchReleases();
    fetchInspectionsHistory();
    refreshLicenseStatus();

    const timer = window.setInterval(() => {
      refreshHealth();
      refreshLicenseStatus();
    }, 10000);

    let unsubscribeMenu: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.electronAPI?.onMenuAction) {
      unsubscribeMenu = window.electronAPI.onMenuAction((action: string) => {
        if (action === 'import-license') {
          openActivationModal();
        }
      });
    }

    return () => {
      window.clearInterval(timer);
      if (unsubscribeMenu) unsubscribeMenu();
    };
  }, [refreshHealth, fetchReleases, fetchInspectionsHistory, refreshLicenseStatus, openActivationModal]);

  const isRuntimeConnected = Boolean(healthResult?.data && !healthResult?.error);
  const selectedSummary = eligibleReleases.find(
    (r) => `${r.pipeline_id}::${r.release_version}` === selectedReleaseKey
  );

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none"
      data-testid="production-mode-layout"
    >
      {/* Fixed Left Sidebar */}
      <aside className="w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 z-20">
        <div>
          {/* Workstation Brand Header */}
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-2.5 bg-slate-50/70 dark:bg-slate-900/90">
            <div className="p-2 rounded-lg bg-blue-600 text-white shadow-xs">
              <Eye className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold tracking-tight text-slate-900 dark:text-white uppercase truncate">
                NOVA Machine Vision
              </div>
              <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-semibold uppercase">
                Production Workstation
              </div>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="p-2.5 space-y-1" aria-label="Production Mode Navigation">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Operator Navigation
            </div>

            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePage(item.id)}
                  data-testid={`prod-nav-${item.id}`}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-left transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">{item.label}</div>
                    <div
                      className={`text-[10px] truncate ${
                        isActive ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {item.shortDesc}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Runtime Status Indicator & Mode Switch */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5 bg-slate-50/50 dark:bg-slate-950/40">
          {/* Runtime Pill */}
          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Server className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                  Vision Runtime
                </span>
              </div>
              <span
                className={`inline-flex items-center space-x-1 text-[10px] font-mono font-bold ${
                  isRuntimeConnected
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRuntimeConnected ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'
                  }`}
                />
                <span>{isRuntimeConnected ? 'ONLINE' : 'OFFLINE'}</span>
              </span>
            </div>

            <div className="mt-1 text-[10px] font-mono text-slate-500 truncate">
              {selectedSummary
                ? `Active: ${selectedSummary.pipeline_name} v${selectedSummary.release_version}`
                : `${eligibleReleases.length} Released Pipeline(s)`}
            </div>
          </div>

          {onSwitchToDeveloperMode && (
            <button
              type="button"
              onClick={onSwitchToDeveloperMode}
              className="w-full flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Code2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Switch to Developer Mode</span>
            </button>
          )}
        </div>
      </aside>

      {/* Right Main Area: Horizontal Workstation Status Sub-Bar + Page Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Horizontal Workstation Top Bar */}
        <div className="h-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <span className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
              {NAV_ITEMS.find((i) => i.id === activePage)?.label || 'Inspection'}
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {selectedSummary
                ? `Selected Pipeline: ${selectedSummary.pipeline_name} (v${selectedSummary.release_version})`
                : 'No Pipeline Selected'}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {isRunningInspection && (
              <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[11px] font-mono font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span>EXECUTING INSPECTION</span>
              </span>
            )}

            {/* License Status Badge */}
            <LicenseStatusBadge />

            {/* Quick Light / Dark Theme Toggle in Production Workstation Top Bar */}
            <button
              type="button"
              onClick={toggleTheme}
              data-testid="prod-topbar-theme-toggle"
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
                  <span className="text-[11px] font-medium hidden sm:inline">Giao diện Sáng</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-[11px] font-medium hidden sm:inline">Giao diện Tối</span>
                </>
              )}
            </button>

            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 hidden md:inline">
              Mode: <strong className="text-blue-600 dark:text-blue-400">PRODUCTION (READ-ONLY)</strong>
            </span>
          </div>
        </div>

        {/* Main Scrollable Content Area */}
        <div className="flex-1 min-h-0 w-full overflow-hidden">
          {activePage === 'dashboard' && <ProductionDashboard />}
          {activePage === 'inspection' && (
            <InspectionPage onSwitchToDeveloperMode={onSwitchToDeveloperMode} />
          )}
          {activePage === 'history' && <InspectionHistoryPage />}
          {activePage === 'pipelines' && <ReleasedPipelinePage />}
          {activePage === 'system_status' && <SystemStatusPage />}
          {activePage === 'settings' && <ProductionSettingsPage />}
        </div>
      </div>

      {/* Global Modals for License Management */}
      <LicenseActivationModal />
      <LicenseDetailsModal />
    </div>
  );
};
