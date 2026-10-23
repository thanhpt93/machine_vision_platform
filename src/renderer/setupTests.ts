import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: {
    getAppInfo: vi.fn().mockResolvedValue({
      appName: 'Machine Vision Platform',
      version: '0.1.0',
      electronVersion: '35.0.0',
      chromeVersion: '134.0.0',
      nodeVersion: '22.0.0',
      platform: 'win32',
      arch: 'x64',
    }),
    getRuntimeDefaultUrl: vi.fn().mockReturnValue('http://127.0.0.1:8000'),
  },
  writable: true,
});
