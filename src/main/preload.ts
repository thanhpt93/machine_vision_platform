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

export interface SelectImageResult {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>;
  getRuntimeDefaultUrl: () => string;
  savePipelineFile: (defaultName?: string, content?: string, targetPath?: string) => Promise<FileSaveResult>;
  openPipelineFile: () => Promise<FileOpenResult>;
  selectImageFile: () => Promise<SelectImageResult>;
  onMenuAction: (callback: (action: string) => void) => () => void;
}

const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getRuntimeDefaultUrl: () => 'http://127.0.0.1:8000',
  savePipelineFile: (defaultName?: string, content?: string, targetPath?: string) =>
    ipcRenderer.invoke('pipeline:save-file', { defaultName, content, targetPath }),
  openPipelineFile: () => ipcRenderer.invoke('pipeline:open-file'),
  selectImageFile: () => ipcRenderer.invoke('dialog:select-image'),
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: any, action: string) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => {
      ipcRenderer.removeListener('menu:action', handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
