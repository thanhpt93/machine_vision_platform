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

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>;
  getRuntimeDefaultUrl: () => string;
  savePipelineFile: (defaultName: string, content: string) => Promise<FileSaveResult>;
  openPipelineFile: () => Promise<FileOpenResult>;
}

const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getRuntimeDefaultUrl: () => 'http://127.0.0.1:8000',
  savePipelineFile: (defaultName: string, content: string) =>
    ipcRenderer.invoke('pipeline:save-file', { defaultName, content }),
  openPipelineFile: () => ipcRenderer.invoke('pipeline:open-file'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
