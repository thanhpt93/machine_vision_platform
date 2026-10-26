import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../App';
import {
  DeploymentMode,
  getEditionMetadata,
  isProductionEdition,
  resolveDeploymentMode,
} from '../../../shared/editionConfig';
import { useProductionStore } from '../store/productionStore';
import { useThemeStore } from '../../store/themeStore';
import { runtimeApi } from '../../services/runtimeApi';
import fs from 'fs';
import path from 'path';

describe('Phase 3: Production Edition Packaging & Capability Restrictions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useThemeStore.getState().setTheme('dark');

    window.electronAPI = {
      getAppInfo: vi.fn().mockResolvedValue({
        appName: 'NOVA Machine Vision Platform — Production Edition',
        version: '0.1.0',
        deploymentMode: 'production',
        editionName: 'NOVA Machine Vision Platform — Production Edition',
        appId: 'com.nova.machinevision.production',
        electronVersion: '35.0.0',
        chromeVersion: '134.0.0',
        nodeVersion: '22.0.0',
        platform: 'win32',
        arch: 'x64',
      }),
      getDeploymentMode: vi.fn<() => DeploymentMode>(() => 'developer'),
      getRuntimeDefaultUrl: vi.fn(() => 'http://127.0.0.1:8000'),
      savePipelineFile: vi.fn().mockResolvedValue({ success: false }),
      openPipelineFile: vi.fn().mockResolvedValue({ success: false }),
      selectImageFile: vi.fn().mockResolvedValue({
        success: true,
        filePath: 'C:/project/machine_vision_platform/sample_images/bottle_cap.png',
      }),
      selectLicenseFile: vi.fn().mockResolvedValue({
        success: true,
        filePath: 'license.novalic.json',
        content: '{}',
      }),
      onMenuAction: vi.fn(() => () => {}),
    };

    useProductionStore.setState({
      activePage: 'inspection',
      healthResult: {
        data: {
          status: 'healthy',
          service: 'Vision Runtime',
          version: '0.1.0',
          timestamp: '2026-10-25T14:00:00Z',
          uptime_seconds: 120,
          python_version: '3.11.9',
          platform: 'Windows 11',
        },
        error: null,
        latencyMs: 5,
        checkedAt: '2026-10-25T14:00:00Z',
      },
      isCheckingHealth: false,
      eligibleReleases: [],
      allReleases: [],
      isLoadingReleases: false,
      releasesError: null,
      selectedReleaseKey: null,
      selectedReleaseDetails: null,
      selectedImagePath: null,
      selectedImageMeta: null,
      isValidatingImage: false,
      imageValidationError: null,
      isRunningInspection: false,
      currentInspection: null,
      inspectionError: null,
      inspectionsHistory: [],
    });

    vi.spyOn(runtimeApi, 'checkHealth').mockResolvedValue({
      data: {
        status: 'healthy',
        service: 'Vision Runtime',
        version: '0.1.0',
        timestamp: '2026-10-25T14:00:00Z',
        uptime_seconds: 120,
        python_version: '3.11.9',
        platform: 'Windows 11',
      },
      error: null,
      latencyMs: 5,
      checkedAt: '2026-10-25T14:00:00Z',
    });
    vi.spyOn(runtimeApi, 'listProductionReleases').mockResolvedValue({
      releases: [],
      total: 0,
    });
    vi.spyOn(runtimeApi, 'listInspections').mockResolvedValue({
      inspections: [],
      total: 0,
    });
    vi.spyOn(runtimeApi, 'getInputImageInfo').mockResolvedValue({
      filename: 'bottle_cap.png',
      resolved_path: 'C:/project/machine_vision_platform/sample_images/bottle_cap.png',
      file_size_bytes: 24500,
      width: 640,
      height: 480,
      channels: 3,
    });
  });

  it('resolves distinct product metadata and application IDs for Developer vs Production Editions', () => {
    const devMeta = getEditionMetadata('developer');
    const prodMeta = getEditionMetadata('production');

    expect(devMeta.deploymentMode).toBe('developer');
    expect(devMeta.isDeveloperEdition).toBe(true);
    expect(devMeta.isProductionEdition).toBe(false);
    expect(devMeta.appId).toBe('com.nova.machinevision.developer');
    expect(devMeta.editionName).toContain('Developer Edition');

    expect(prodMeta.deploymentMode).toBe('production');
    expect(prodMeta.isProductionEdition).toBe(true);
    expect(prodMeta.isDeveloperEdition).toBe(false);
    expect(prodMeta.appId).toBe('com.nova.machinevision.production');
    expect(prodMeta.editionName).toContain('Production Edition');

    expect(devMeta.appId).not.toBe(prodMeta.appId);
    expect(devMeta.productName).not.toBe(prodMeta.productName);
  });

  it('launches directly into Production Mode UI when deploymentMode is production and never renders Editor or mode-switcher tabs', async () => {
    render(<App deploymentModeOverride="production" />);

    await waitFor(() => {
      expect(screen.getByTestId('production-edition-shell')).toBeInTheDocument();
      expect(screen.getByTestId('production-mode-layout')).toBeInTheDocument();
    });

    // Verify Developer Mode header tabs are NOT rendered in Production Edition
    expect(screen.queryByTestId('mode-tab-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mode-tab-production')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mode-tab-diagnostics')).not.toBeInTheDocument();

    // Verify "Switch to Developer Mode" button is NOT rendered in Production Edition sidebar
    expect(screen.queryByText(/Switch to Developer Mode/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Open Developer Mode to Release Pipeline/i)
    ).not.toBeInTheDocument();
  });

  it('toggles Light/Dark theme directly from the Production Workstation top bar and selects image file via Electron IPC', async () => {
    render(<App deploymentModeOverride="production" />);

    // 1. Verify top bar theme toggle works in Production Edition
    const themeToggleBtn = await screen.findByTestId('prod-topbar-theme-toggle');
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fireEvent.click(themeToggleBtn);
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);

    // 2. Verify Select Image File button invokes window.electronAPI.selectImageFile and updates store
    const selectImgBtn = screen.getByText('Select Image File...');
    fireEvent.click(selectImgBtn);

    await waitFor(() => {
      expect(window.electronAPI?.selectImageFile).toHaveBeenCalledTimes(1);
      expect(screen.getByText('640×480 px')).toBeInTheDocument();
    });
  });

  it('ensures preload.ts does not import relative local modules that break Electron sandboxed preload', () => {
    const preloadSource = fs.readFileSync(
      path.resolve(__dirname, '../../../main/preload.ts'),
      'utf-8'
    );
    // Only `import type` is allowed for relative paths; runtime `import { ... } from '../...'` breaks sandboxed preload
    const runtimeRelativeImports = preloadSource
      .split(/\r?\n/)
      .filter(
        (line) =>
          line.trim().startsWith('import ') &&
          !line.trim().startsWith('import type ') &&
          line.includes("'../")
      );
    expect(runtimeRelativeImports).toEqual([]);
  });

  it('preserves Developer Mode Editor and mode switching tabs when deploymentMode is developer', async () => {
    render(<App deploymentModeOverride="developer" initialTab="production" />);

    await waitFor(() => {
      expect(screen.getByTestId('mode-tab-editor')).toBeInTheDocument();
      expect(screen.getByTestId('mode-tab-production')).toBeInTheDocument();
      expect(screen.getByTestId('mode-tab-diagnostics')).toBeInTheDocument();
    });

    // In Developer Edition, the operator can switch back to Developer Mode from Production UI
    expect(screen.getByText(/Switch to Developer Mode/i)).toBeInTheDocument();
  });

  it('displays Retry / Start Runtime button when the Python FastAPI Runtime is unreachable', async () => {
    vi.spyOn(runtimeApi, 'checkHealth').mockResolvedValueOnce({
      data: null,
      error: 'Connection refused at 127.0.0.1:8000',
      latencyMs: 2,
      checkedAt: '2026-10-25T14:01:00Z',
    });

    render(<App deploymentModeOverride="production" />);

    await waitFor(() => {
      expect(screen.getByTestId('retry-runtime-connection-btn')).toBeInTheDocument();
    });

    expect(screen.getByText(/Python Vision Runtime is Unavailable/i)).toBeInTheDocument();
  });

  it('honors window.electronAPI.getDeploymentMode() when resolving deployment mode in Renderer', () => {
    const originalApi = window.electronAPI;
    try {
      window.electronAPI = {
        ...originalApi!,
        getDeploymentMode: () => 'production',
      };

      expect(resolveDeploymentMode()).toBe('production');
      expect(isProductionEdition()).toBe(true);
    } finally {
      window.electronAPI = originalApi;
    }
  });
});
