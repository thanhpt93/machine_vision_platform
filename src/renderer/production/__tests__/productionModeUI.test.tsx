import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import { useProductionStore } from '../store/productionStore';
import { runtimeApi } from '../../services/runtimeApi';
import {
  InspectionRecord,
  ProductionReleaseDetails,
  ProductionReleaseSummary,
} from '../../types/api';

const mockEligibleRelease: ProductionReleaseSummary = {
  pipeline_id: 'pipe_circle_qc',
  pipeline_name: 'Bottle Cap Circle QC',
  description: 'Validates bottle cap outer diameter within tolerance',
  release_version: '1.2.0',
  schema_version: '1.0.0',
  status: 'Released',
  is_active: true,
  eligible_for_execution: true,
  created_at: '2026-10-25T08:00:00Z',
  release_notes: 'Production release v1.2.0',
  checksum: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
  valid_integrity: true,
  node_count: 5,
  edge_count: 4,
  input_requirements: {
    requires_image_file: true,
    supported_formats: ['.png', '.jpg', '.bmp'],
  },
};

const mockArchivedRelease: ProductionReleaseSummary = {
  ...mockEligibleRelease,
  pipeline_id: 'pipe_legacy_archived',
  pipeline_name: 'Legacy Archived Pipeline',
  release_version: '0.9.0',
  status: 'Archived',
  is_active: false,
  eligible_for_execution: false,
};

const mockReleaseDetails: ProductionReleaseDetails = {
  pipeline_id: 'pipe_circle_qc',
  release_version: '1.2.0',
  schema_version: '1.0.0',
  status: 'Released',
  is_active: true,
  pipeline: {
    id: 'pipe_circle_qc',
    name: 'Bottle Cap Circle QC',
    description: 'Validates bottle cap outer diameter within tolerance',
    schemaVersion: '1.0.0',
    nodes: [
      {
        id: 'n_img',
        nodeType: 'image_file',
        name: 'Image Source',
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: 'n_decision',
        nodeType: 'decision_ok_ng',
        name: 'Final Verdict',
        position: { x: 400, y: 0 },
        config: {},
      },
    ],
    edges: [],
  },
  node_versions: { image_file: '1.0.0', decision_ok_ng: '1.0.0' },
  created_at: '2026-10-25T08:00:00Z',
  release_notes: 'Production release v1.2.0',
  checksum: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
};

function createMockInspectionRecord(overrides: Partial<InspectionRecord>): InspectionRecord {
  return {
    inspection_id: 'insp_test_001',
    execution_id: 'exec_test_001',
    pipeline_id: 'pipe_circle_qc',
    release_version: '1.2.0',
    release_checksum: mockEligibleRelease.checksum,
    input_image: {
      filename: 'bottle_cap.png',
      resolved_path: 'C:/project/machine_vision_platform/sample_images/bottle_cap.png',
      file_size_bytes: 24500,
      width: 640,
      height: 480,
      channels: 3,
    },
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    execution_status: 'COMPLETED',
    inspection_outcome: 'OK',
    duration_ms: 14.5,
    node_results: {
      n_img: {
        node_id: 'n_img',
        node_type: 'image_file',
        status: 'completed',
        duration_ms: 4.2,
        output_metadata: { width: 640, height: 480, channels: 3 },
        has_preview: true,
        preview_url: '/api/production/inspections/insp_test_001/nodes/n_img/preview',
      },
    },
    result_data: {
      has_explicit_decision: true,
      decisions: [
        {
          node_id: 'n_decision',
          node_name: 'Final Verdict',
          node_type: 'decision_ok_ng',
          outcome: 'OK',
          details: { value: 120.1, nominal: 120.0, min_limit: 115.0, max_limit: 125.0 },
        },
      ],
      measurements: {
        n_circle: {
          node_name: 'Circle Measurement',
          node_type: 'circle_measurement',
          metrics: { diameter: 120.1, radius: 60.05, unit: 'mm' },
        },
      },
    },
    preview_references: {
      n_img: '/api/production/inspections/insp_test_001/nodes/n_img/preview',
    },
    error_details: null,
    ...overrides,
  };
}

describe('NOVA Production Mode UI', () => {
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
      selectImageFile: vi.fn().mockResolvedValue({
        success: true,
        filePath: 'C:/project/machine_vision_platform/sample_images/bottle_cap.png',
      }),
      selectLicenseFile: vi.fn().mockResolvedValue({
        success: true,
        filePath: 'license.novalic.json',
        content: '{}',
      }),
      onMenuAction: vi.fn(() => () => {}),
    };

    // Reset Zustand store state before each test
    useProductionStore.setState({
      activePage: 'inspection',
      healthResult: {
        data: {
          status: 'healthy',
          service: 'Vision Runtime',
          version: '0.3.0',
          timestamp: new Date().toISOString(),
          uptime_seconds: 100,
          python_version: '3.11.9',
          platform: 'Windows 11',
        },
        latencyMs: 5,
        error: null,
        checkedAt: new Date().toISOString(),
      },
      isCheckingHealth: false,
      eligibleReleases: [mockEligibleRelease],
      allReleases: [mockEligibleRelease, mockArchivedRelease],
      isLoadingReleases: false,
      releasesError: null,
      selectedReleaseKey: 'pipe_circle_qc::1.2.0',
      selectedReleaseDetails: mockReleaseDetails,
      isLoadingReleaseDetails: false,
      selectedImagePath: null,
      selectedImageMeta: null,
      isValidatingImage: false,
      imageValidationError: null,
      isRunningInspection: false,
      activeRequestId: 0,
      currentInspection: null,
      inspectionError: null,
      inspectionsHistory: [],
      isLoadingHistory: false,
      historyError: null,
    });

    vi.spyOn(runtimeApi, 'checkHealth').mockResolvedValue(
      useProductionStore.getState().healthResult!
    );
    vi.spyOn(runtimeApi, 'listProductionReleases').mockImplementation(async (opts) => {
      if (opts?.includeArchived) {
        return { releases: [mockEligibleRelease, mockArchivedRelease], total: 2 };
      }
      return { releases: [mockEligibleRelease], total: 1 };
    });
    vi.spyOn(runtimeApi, 'getProductionReleaseDetails').mockResolvedValue(mockReleaseDetails);
    vi.spyOn(runtimeApi, 'listInspections').mockResolvedValue({
      inspections: [],
      total: 0,
    });
    vi.spyOn(runtimeApi, 'getInputImageInfo').mockResolvedValue({
      filename: 'bottle_cap.png',
      resolved_path: 'C:/project/machine_vision_platform/sample_images/bottle_cap.png',
      file_size_bytes: 24500,
      width: 640,
      height: 480,
      channels: 3,
    });
  });

  it('1. switches cleanly between Developer Mode and Production Mode without exposing graph editing in Production Mode', async () => {
    render(<App initialTab="editor" />);
    expect(screen.getByText('Node Library')).toBeInTheDocument();

    // Switch to Production Mode
    const prodTabBtn = screen.getByTestId('mode-tab-production');
    fireEvent.click(prodTabBtn);

    await waitFor(() => {
      expect(screen.getByTestId('production-mode-layout')).toBeInTheDocument();
    });

    // Graph editor Node Library must NOT be present in Production Mode
    expect(screen.queryByText('Node Library')).not.toBeInTheDocument();
    expect(screen.getByText('1. Released Pipeline Selection')).toBeInTheDocument();
  });

  it('2. lists only eligible released pipelines in Inspection selector and hides archived releases', async () => {
    render(<App initialTab="production" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Select Eligible Production Release')).toBeInTheDocument();
    });

    const selectEl = screen.getByLabelText(
      'Select Eligible Production Release'
    ) as HTMLSelectElement;
    expect(selectEl.options.length).toBe(1);
    expect(selectEl.options[0].textContent).toContain('Bottle Cap Circle QC');
    expect(selectEl.options[0].textContent).not.toContain('Legacy Archived Pipeline');
  });

  it('3. selects an input image, validates metadata, and enables Run Inspection button', async () => {
    render(<App initialTab="production" />);

    const runBtn = screen.getByTestId('run-inspection-btn') as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);

    // Click Select Image File button
    const browseBtn = screen.getByText('Select Image File...');
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(screen.getByText('640×480 px')).toBeInTheDocument();
    });

    expect(runBtn.disabled).toBe(false);
  });

  it('4. executes an inspection and renders OK outcome, NG outcome, UNKNOWN outcome, and FAILED execution with strict semantic separation', async () => {
    const startSpy = vi.spyOn(runtimeApi, 'startInspection');

    render(<App initialTab="production" />);

    // Select sample image
    fireEvent.click(screen.getByText('Bottle Cap Sample'));
    await waitFor(() => {
      expect(screen.getByTestId('run-inspection-btn')).not.toBeDisabled();
    });

    // Case A: OK outcome
    startSpy.mockResolvedValueOnce(
      createMockInspectionRecord({
        inspection_id: 'insp_ok_1',
        execution_status: 'COMPLETED',
        inspection_outcome: 'OK',
      })
    );
    fireEvent.click(screen.getByTestId('run-inspection-btn'));
    await waitFor(() => {
      expect(screen.getByText('insp_ok_1')).toBeInTheDocument();
      expect(screen.getAllByText('OK').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('COMPLETED').length).toBeGreaterThanOrEqual(1);
    });

    // Case B: NG outcome (Execution is COMPLETED, Outcome is NG)
    startSpy.mockResolvedValueOnce(
      createMockInspectionRecord({
        inspection_id: 'insp_ng_2',
        execution_status: 'COMPLETED',
        inspection_outcome: 'NG',
      })
    );
    fireEvent.click(screen.getByTestId('run-inspection-btn'));
    await waitFor(() => {
      expect(screen.getByText('insp_ng_2')).toBeInTheDocument();
      expect(screen.getAllByText('NG').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('COMPLETED').length).toBeGreaterThanOrEqual(1);
    });

    // Case C: UNKNOWN outcome (Completed without decision node — must NOT show OK)
    startSpy.mockResolvedValueOnce(
      createMockInspectionRecord({
        inspection_id: 'insp_unknown_3',
        execution_status: 'COMPLETED',
        inspection_outcome: 'UNKNOWN',
        result_data: { has_explicit_decision: false, decisions: [], measurements: {} },
      })
    );
    fireEvent.click(screen.getByTestId('run-inspection-btn'));
    await waitFor(() => {
      expect(screen.getByText('insp_unknown_3')).toBeInTheDocument();
      expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThanOrEqual(1);
    });

    // Case D: FAILED execution (Must show FAILED and N/A (EXECUTION FAILED), never OK or NG)
    startSpy.mockResolvedValueOnce(
      createMockInspectionRecord({
        inspection_id: 'insp_failed_4',
        execution_status: 'FAILED',
        inspection_outcome: null,
        error_details: {
          code: 'NODE_EXECUTION_ERROR',
          message: 'ROI crop out of image bounds',
          failed_node_id: 'n_crop',
        },
        result_data: { has_explicit_decision: false, decisions: [], measurements: {} },
      })
    );
    fireEvent.click(screen.getByTestId('run-inspection-btn'));
    await waitFor(() => {
      expect(screen.getByText('insp_failed_4')).toBeInTheDocument();
      expect(screen.getAllByText('FAILED').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('N/A (EXECUTION FAILED)')).toBeInTheDocument();
      expect(screen.getByText(/ROI crop out of image bounds/i)).toBeInTheDocument();
    });
  });

  it('5. navigates across Dashboard, Inspection History (with search & filter), Pipeline Management (read-only), System Status, and Settings', async () => {
    const recOk = createMockInspectionRecord({
      inspection_id: 'insp_hist_ok',
      execution_status: 'COMPLETED',
      inspection_outcome: 'OK',
    });
    const recNg = createMockInspectionRecord({
      inspection_id: 'insp_hist_ng',
      execution_status: 'COMPLETED',
      inspection_outcome: 'NG',
    });

    vi.spyOn(runtimeApi, 'listInspections').mockResolvedValue({
      inspections: [recOk, recNg],
      total: 2,
    });

    render(<App initialTab="production" />);

    // 1. Navigate to Production Dashboard
    fireEvent.click(screen.getByTestId('prod-nav-dashboard'));
    await waitFor(() => {
      expect(screen.getByTestId('production-dashboard-page')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-total-today')).toHaveTextContent('2');
      expect(screen.getByTestId('dashboard-ok-count')).toHaveTextContent('1');
      expect(screen.getByTestId('dashboard-ng-count')).toHaveTextContent('1');
    });

    // 2. Navigate to Inspection History and filter by NG outcome
    fireEvent.click(screen.getByTestId('prod-nav-history'));
    await waitFor(() => {
      expect(screen.getByTestId('inspection-history-page')).toBeInTheDocument();
      expect(screen.getByText('insp_hist_ok')).toBeInTheDocument();
      expect(screen.getByText('insp_hist_ng')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('history-outcome-filter'), {
      target: { value: 'NG' },
    });
    expect(screen.queryByText('insp_hist_ok')).not.toBeInTheDocument();
    expect(screen.getByText('insp_hist_ng')).toBeInTheDocument();

    // 3. Navigate to Read-Only Pipeline Management
    fireEvent.click(screen.getByTestId('prod-nav-pipelines'));
    await waitFor(() => {
      expect(screen.getByTestId('released-pipeline-page')).toBeInTheDocument();
      expect(screen.getByText('Bottle Cap Circle QC')).toBeInTheDocument();
      expect(screen.getByText('Legacy Archived Pipeline')).toBeInTheDocument();
    });

    // 4. Navigate to System Status and verify disconnected state handling
    vi.spyOn(runtimeApi, 'checkHealth').mockResolvedValueOnce({
      data: null,
      latencyMs: 0,
      error: 'Connection refused',
      checkedAt: new Date().toISOString(),
    });
    fireEvent.click(screen.getByTestId('prod-nav-system_status'));
    await waitFor(() => {
      expect(screen.getByTestId('system-status-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Run Health Probe'));
    await waitFor(() => {
      expect(screen.getByTestId('system-status-degraded-alert')).toBeInTheDocument();
    });

    // 5. Navigate to Settings
    fireEvent.click(screen.getByTestId('prod-nav-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('production-settings-page')).toBeInTheDocument();
      expect(screen.getByText('Workstation Theme')).toBeInTheDocument();
    });
  });

  it('6. supports mouse wheel zooming, reset to fit, and pan drag in ProductionImageViewer', async () => {
    render(<App initialTab="production" />);

    // Select sample image
    fireEvent.click(screen.getByText('Bottle Cap Sample'));
    await waitFor(() => {
      expect(screen.getByAltText(/bottle_cap/i)).toBeInTheDocument();
    });

    // Initially zoom indicator shows FIT
    expect(screen.getByTitle('Current zoom level')).toHaveTextContent('FIT');

    // Find image viewport container
    const imgEl = screen.getByAltText(/bottle_cap/i);
    const viewportContainer = imgEl.closest('[class*="select-none"]') as HTMLElement;
    expect(viewportContainer).toBeTruthy();

    // Scroll mouse wheel up (deltaY < 0 -> Zoom In)
    fireEvent.wheel(viewportContainer, {
      deltaY: -100,
      clientX: 200,
      clientY: 200,
    });

    // Zoom level updates to 115%
    await waitFor(() => {
      expect(screen.getByTitle('Current zoom level')).toHaveTextContent('115%');
    });

    // Double click to reset to FIT
    fireEvent.doubleClick(viewportContainer);
    await waitFor(() => {
      expect(screen.getByTitle('Current zoom level')).toHaveTextContent('FIT');
    });

    // Zoom In using toolbar button
    fireEvent.click(screen.getByTitle('Zoom In (Scroll Up)'));
    await waitFor(() => {
      expect(screen.getByTitle('Current zoom level')).toHaveTextContent('125%');
    });

    // Click Fit button
    fireEvent.click(screen.getByTitle('Fit to screen / Reset zoom'));
    expect(screen.getByTitle('Current zoom level')).toHaveTextContent('FIT');
  });
});
