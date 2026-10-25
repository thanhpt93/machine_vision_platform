import { AppInfo, FileOpenResult, FileSaveResult, SelectImageResult } from '@/main/preload';

declare global {
  interface Window {
    electronAPI?: {
      getAppInfo: () => Promise<AppInfo>;
      getRuntimeDefaultUrl: () => string;
      savePipelineFile: (defaultName?: string, content?: string, targetPath?: string) => Promise<FileSaveResult>;
      openPipelineFile: () => Promise<FileOpenResult>;
      selectImageFile: () => Promise<SelectImageResult>;
      onMenuAction: (callback: (action: string) => void) => () => void;
    };
  }
}

export {};
