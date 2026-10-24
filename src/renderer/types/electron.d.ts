import { AppInfo, FileOpenResult, FileSaveResult } from '@/main/preload';

declare global {
  interface Window {
    electronAPI?: {
      getAppInfo: () => Promise<AppInfo>;
      getRuntimeDefaultUrl: () => string;
      savePipelineFile: (defaultName: string, content: string) => Promise<FileSaveResult>;
      openPipelineFile: () => Promise<FileOpenResult>;
    };
  }
}

export {};
