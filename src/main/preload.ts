import { contextBridge, ipcRenderer } from 'electron';
import type { DeploymentMode } from '../shared/editionConfig';
import type { RuntimeManagerState } from './runtimeManager';

export interface AppInfo {
  appName: string;
  version: string;
  deploymentMode?: DeploymentMode;
  editionName?: string;
  appId?: string;
  isPackaged?: boolean;
  userDataDir?: string;
  runtimeDataDir?: string;
  logsDir?: string;
  electronVersion?: string;
  chromeVersion?: string;
  nodeVersion?: string;
  platform: string;
  arch: string;
}

export interface FileSaveResult {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

export interface FileOpenResult {
  success: boolean;
  filePath?: string;
  content?: string;
  canceled?: boolean;
  error?: string;
}

export interface SelectImageResult {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

export interface SelectLicenseResult {
  success: boolean;
  filePath?: string;
  content?: string;
  canceled?: boolean;
  error?: string;
}

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>;
  getDeploymentMode?: () => DeploymentMode;
  getRuntimeDefaultUrl: () => string;
  getRuntimeProcessState?: () => Promise<RuntimeManagerState>;
  restartRuntimeProcess?: () => Promise<RuntimeManagerState>;
  savePipelineFile: (
    defaultName?: string,
    content?: string,
    targetPath?: string
  ) => Promise<FileSaveResult>;
  openPipelineFile: () => Promise<FileOpenResult>;
  selectImageFile: () => Promise<SelectImageResult>;
  selectLicenseFile: () => Promise<SelectLicenseResult>;
  onMenuAction: (callback: (action: string) => void) => () => void;
}

// IMPORTANT: Electron sandboxed preload scripts cannot require relative local modules (`../shared/...`).
// Only `electron` and built-in/polyfilled globals are permitted in sandboxed preload.
function resolvePreloadDeploymentMode(): DeploymentMode {
  try {
    if (typeof process !== 'undefined' && process?.env?.NOVA_DEPLOYMENT_MODE) {
      const envMode = process.env.NOVA_DEPLOYMENT_MODE.trim().toLowerCase();
      if (envMode === 'production') return 'production';
      if (envMode === 'developer') return 'developer';
    }
  } catch {
    // ignore in restricted sandbox
  }
  return 'developer';
}

const preloadDeploymentMode = resolvePreloadDeploymentMode();

const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getDeploymentMode: () => preloadDeploymentMode,
  getRuntimeDefaultUrl: () => 'http://127.0.0.1:8000',
  getRuntimeProcessState: () => ipcRenderer.invoke('runtime:get-state'),
  restartRuntimeProcess: () => ipcRenderer.invoke('runtime:restart'),
  savePipelineFile: (defaultName?: string, content?: string, targetPath?: string) =>
    ipcRenderer.invoke('pipeline:save-file', { defaultName, content, targetPath }),
  openPipelineFile: () => ipcRenderer.invoke('pipeline:open-file'),
  selectImageFile: () => ipcRenderer.invoke('dialog:select-image'),
  selectLicenseFile: () => ipcRenderer.invoke('dialog:select-license'),
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: unknown, action: string) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => {
      ipcRenderer.removeListener('menu:action', handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
