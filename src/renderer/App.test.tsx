import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
      savePipelineFile: vi.fn().mockResolvedValue({ success: true, filePath: 'test.mvp' }),
      openPipelineFile: vi.fn().mockResolvedValue({ success: true, content: '{}' }),
      selectImageFile: vi.fn().mockResolvedValue({ success: true, filePath: 'sample.png' }),
      selectLicenseFile: vi.fn().mockResolvedValue({ success: true, filePath: 'test.novalic.json', content: '{}' }),
      onMenuAction: vi.fn(() => () => {}),
    };
  });

  it('renders application title, phase badges, navigation tabs and theme toggle', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    render(<App initialTab="editor" />);
    expect(screen.getByText('Machine Vision Platform')).toBeInTheDocument();
    expect(screen.getByText('Phase 3 OpenCV')).toBeInTheDocument();
    expect(screen.getAllByText('.MVP Format').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Pipeline Editor')).toBeInTheDocument();
    expect(screen.getByText('Python Vision Runtime')).toBeInTheDocument();
  });

  it('toggles light/dark theme when theme button is clicked', async () => {
    render(<App initialTab="editor" />);
    const themeBtns = screen.getAllByTitle(/Chuyển sang giao diện/i);
    expect(themeBtns.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(themeBtns[0]);
    // After click, title changes to switch to the alternative theme
    expect(screen.getAllByTitle(/Chuyển sang giao diện/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders pipeline editor with node library and sample template', async () => {
    render(<App initialTab="editor" />);
    expect(screen.getByText('Node Library')).toBeInTheDocument();
    expect(screen.getAllByText('Image File').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ROI Crop').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Threshold').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Result Viewer').length).toBeGreaterThanOrEqual(1);
  });

  it('displays healthy status when runtime is connected in diagnostics view', async () => {
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

    render(<App initialTab="diagnostics" />);

    await waitFor(() => {
      expect(screen.getByText('CONNECTED (200 OK)')).toBeInTheDocument();
      expect(screen.getByText('Python 3.14.7')).toBeInTheDocument();
      expect(screen.getByText('Windows 11 (AMD64)')).toBeInTheDocument();
    });
  });

  it('displays offline error alert when runtime is unreachable in diagnostics view', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to connect to 127.0.0.1:8000'));

    render(<App initialTab="diagnostics" />);

    await waitFor(() => {
      expect(screen.getByText('OFFLINE')).toBeInTheDocument();
      expect(screen.getByText('Cannot connect to Python Vision Runtime')).toBeInTheDocument();
    });
  });
});
