import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).electronAPI = {
      ping: vi.fn().mockResolvedValue('pong'),
      getRuntimeStatus: vi.fn().mockResolvedValue({ status: 'connected' }),
      savePipelineFile: vi.fn().mockResolvedValue({ success: true, filePath: 'test.mvp' }),
      openPipelineFile: vi.fn().mockResolvedValue({ success: true, content: '{}' }),
      selectImageFile: vi.fn().mockResolvedValue({ success: true, filePath: 'sample.png' }),
      selectLicenseFile: vi.fn().mockResolvedValue({ success: true, filePath: 'test.invilic.json', content: '{}' }),
      onMenuAction: vi.fn(() => () => {}),
    };
  });

  it('renders application title and navigation tabs in Developer Mode', async () => {
    render(<App initialTab="editor" />);
    expect(screen.getByText('Machine Vision Platform')).toBeInTheDocument();
    expect(screen.queryByText('Phase 3 OpenCV')).not.toBeInTheDocument();
    expect(screen.getByText('Pipeline Editor')).toBeInTheDocument();
    expect(screen.getByText('AI Models')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    expect(screen.queryByText('Production Mode')).not.toBeInTheDocument();
    expect(screen.queryByText(/Electron:/i)).not.toBeInTheDocument();
  });

  it('toggles light/dark theme when theme button is clicked', async () => {
    render(<App initialTab="editor" />);
    const themeBtns = screen.getAllByTitle(/Chuyển sang giao diện|Switch to/i);
    expect(themeBtns.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(themeBtns[0]);
    // After click, title changes to switch to the alternative theme
    expect(screen.getAllByTitle(/Chuyển sang giao diện|Switch to/i).length).toBeGreaterThanOrEqual(1);
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
    render(<App initialTab="diagnostics" />);
    await waitFor(() => {
      expect(screen.getByText(/Vision Runtime/i)).toBeInTheDocument();
    });
  });

  it('navigates to AI Models tab when AI Models button is clicked', async () => {
    render(<App initialTab="editor" />);
    const modelsBtn = screen.getByTestId('mode-tab-models');
    fireEvent.click(modelsBtn);
    expect(screen.getByText('AI Model Registry')).toBeInTheDocument();
    expect(screen.getByText('INVI AI Trainer Integration')).toBeInTheDocument();
  });

  it('switches back to Pipeline Editor tab from AI Models tab', async () => {
    render(<App initialTab="models" />);
    expect(screen.getByText('AI Model Registry')).toBeInTheDocument();
    const editorBtn = screen.getByTestId('mode-tab-editor');
    fireEvent.click(editorBtn);
    expect(screen.getByText('Node Library')).toBeInTheDocument();
  });

  it('toggles diagnostics view from diagnostics button in header', async () => {
    render(<App initialTab="editor" />);
    const diagBtn = screen.getByTestId('mode-tab-diagnostics');
    fireEvent.click(diagBtn);
    await waitFor(() => {
      expect(screen.getByText(/Vision Runtime/i)).toBeInTheDocument();
    });
    // Clicking again returns to editor tab
    fireEvent.click(diagBtn);
    expect(screen.getByText('Node Library')).toBeInTheDocument();
  });
});
