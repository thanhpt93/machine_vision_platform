import { AppInfo } from '@/main/preload';

declare global {
  interface Window {
    electronAPI?: {
      getAppInfo: () => Promise<AppInfo>;
      getRuntimeDefaultUrl: () => string;
    };
  }
}

export {};
