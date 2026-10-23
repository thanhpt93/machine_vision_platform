import { contextBridge, ipcRenderer } from 'electron';

export interface AppInfo {
  appName: string;
  version: string;
  electronVersion?: string;
  chromeVersion?: string;
  nodeVersion?: string;
  platform: string;
  arch: string;
}

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>;
  getRuntimeDefaultUrl: () => string;
}

const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getRuntimeDefaultUrl: () => 'http://127.0.0.1:8000',
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
