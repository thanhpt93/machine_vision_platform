import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

describe('App Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    window.electronAPI = {
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
    };
  });

  it('renders application title and phase badge', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    render(<App />);
    expect(screen.getByText('Machine Vision Platform')).toBeInTheDocument();
    expect(screen.getByText('Phase 1 MVP')).toBeInTheDocument();
    expect(screen.getByText('Python Vision Runtime')).toBeInTheDocument();
  });

  it('displays healthy status when runtime is connected', async () => {
    const mockHealthResponse = {
      status: 'healthy',
      service: 'Vision Runtime',
      version: '0.1.0',
      timestamp: '2026-10-23T10:00:00Z',
      uptime_seconds: 42.5,
      python_version: '3.14.7',
      platform: 'Windows 11 (AMD64)',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockHealthResponse,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('CONNECTED (200 OK)')).toBeInTheDocument();
      expect(screen.getByText('Python 3.14.7')).toBeInTheDocument();
      expect(screen.getByText('Windows 11 (AMD64)')).toBeInTheDocument();
    });
  });

  it('displays offline error alert when runtime is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to connect to 127.0.0.1:8000'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('OFFLINE')).toBeInTheDocument();
      expect(screen.getByText('Cannot connect to Python Vision Runtime')).toBeInTheDocument();
    });
  });
});
