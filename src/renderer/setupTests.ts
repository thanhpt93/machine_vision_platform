import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock ResizeObserver for jsdom & @xyflow/react
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = ResizeObserverMock as any;
window.ResizeObserver = ResizeObserverMock as any;

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
    savePipelineFile: vi.fn().mockResolvedValue({ success: true, filePath: 'pipeline.json' }),
    openPipelineFile: vi.fn().mockResolvedValue({ success: true, content: '{}' }),
  },
  writable: true,
});
