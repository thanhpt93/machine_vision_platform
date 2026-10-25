import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { NodeLibrary } from '../components/NodeLibrary';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { DebugPanel } from '../components/DebugPanel';
import { PipelineEditor } from '../components/PipelineEditor';
import { usePipelineStore } from '../store/pipelineStore';
import { nodeRegistry } from '../registry/nodeRegistry';

describe('Pipeline Editor UI Panels', () => {
  beforeEach(() => {
    act(() => {
      usePipelineStore.getState().newPipeline();
    });
  });

  describe('NodeLibrary Component', () => {
    it('renders node library with category groups and filters search', () => {
      render(<NodeLibrary />);
      expect(screen.getByText('Node Library')).toBeInTheDocument();
      expect(screen.getAllByText(/Acquisition/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Preparation|Preprocessing/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Visualization|Output View/i).length).toBeGreaterThan(0);

      const searchInput = screen.getByPlaceholderText(/search/i);
      act(() => {
        fireEvent.change(searchInput, { target: { value: 'Crop' } });
      });

      expect(screen.getByText('ROI Crop')).toBeInTheDocument();
      expect(screen.queryByText('Image File')).not.toBeInTheDocument();
    });

    it('adds node to store when plus button is clicked', () => {
      render(<NodeLibrary />);
      const addButtons = screen.getAllByTitle('Add node to canvas');
      expect(addButtons.length).toBeGreaterThan(0);

      act(() => {
        fireEvent.click(addButtons[0]);
      });

      expect(usePipelineStore.getState().nodes.length).toBe(1);
    });

    it('displays runtime badges and tags for nodes', () => {
      render(<NodeLibrary />);
      expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
      expect(screen.getByText('#ai')).toBeInTheDocument();
    });

    it('allows vertical category selection and toggles category list', () => {
      render(<NodeLibrary />);

      expect(screen.getByText('All Categories')).toBeInTheDocument();
      const acqBtn = screen.getByRole('button', { name: /image acquisition/i });
      expect(acqBtn).toBeInTheDocument();

      act(() => {
        fireEvent.click(acqBtn);
      });

      expect(screen.getByText('1 Filtered')).toBeInTheDocument();
      expect(screen.getByText('Image File')).toBeInTheDocument();

      const showAllBtn = screen.getByRole('button', { name: /show all/i });
      act(() => {
        fireEvent.click(showAllBtn);
      });
      expect(screen.queryByText('1 Filtered')).not.toBeInTheDocument();
    });

    it('allows creating a custom node dynamically through CreateNodeModal UI', () => {
      render(<NodeLibrary />);

      const customBtn = screen.getByRole('button', { name: /custom/i });
      act(() => {
        fireEvent.click(customBtn);
      });

      // Modal is visible
      expect(screen.getByText('Create Custom Node')).toBeInTheDocument();

      // Fill in Node Type ID and Display Name
      const typeInput = screen.getByPlaceholderText('e.g. canny_edge_detector');
      const nameInput = screen.getByPlaceholderText('e.g. Canny Edge Detector');

      act(() => {
        fireEvent.change(typeInput, { target: { value: 'custom_canny_test' } });
        fireEvent.change(nameInput, { target: { value: 'Custom Canny Test' } });
      });

      // Click Register Node
      const registerBtn = screen.getByRole('button', { name: /register node/i });
      act(() => {
        fireEvent.click(registerBtn);
      });

      // Check node is registered in nodeRegistry
      expect(nodeRegistry.isRegistered('custom_canny_test')).toBe(true);

      // Check node appears in the library UI
      expect(screen.getByText('Custom Canny Test')).toBeInTheDocument();
    });
  });

  describe('PropertiesPanel Component', () => {
    it('shows placeholder when no node is selected', () => {
      render(<PropertiesPanel />);
      expect(screen.getByText('No Node Selected')).toBeInTheDocument();
      expect(screen.getByText(/Click on any node in the canvas/i)).toBeInTheDocument();
    });

    it('displays dynamic form fields for selected node and updates configuration', () => {
      let nodeId = '';
      act(() => {
        nodeId = usePipelineStore.getState().addNode('roi_crop')!;
        usePipelineStore.getState().selectNode(nodeId);
      });

      render(<PropertiesPanel />);
      expect(screen.getByText('ROI Crop')).toBeInTheDocument();
      expect(screen.getByText('Node Display Name')).toBeInTheDocument();
      expect(screen.getByText('X Position (px)')).toBeInTheDocument();
      expect(screen.getByText('Width (px)')).toBeInTheDocument();

      // Change width
      const widthInput = screen.getByDisplayValue('300'); // default width in registry
      act(() => {
        fireEvent.change(widthInput, { target: { value: '450' } });
      });

      const updatedNode = usePipelineStore.getState().nodes.find((n) => n.id === nodeId);
      expect((updatedNode?.data as any).config.width).toBe(450);
    });

    it('renders dynamic schema-driven fields for newly registered nodes (Gaussian Blur)', () => {
      let blurId = '';
      act(() => {
        blurId = usePipelineStore.getState().addNode('gaussian_blur')!;
        usePipelineStore.getState().selectNode(blurId);
      });

      render(<PropertiesPanel />);
      expect(screen.getByText('Gaussian Blur')).toBeInTheDocument();
      expect(screen.getByText(/Kernel Size/i)).toBeInTheDocument();
      expect(screen.getByText(/Sigma X/i)).toBeInTheDocument();
      expect(screen.getByText('Runtime Ready')).toBeInTheDocument();
    });

    it('displays Runtime Pending notice for nodes without runtime implementation', () => {
      let aiId = '';
      act(() => {
        aiId = usePipelineStore.getState().addNode('ai_detection')!;
        usePipelineStore.getState().selectNode(aiId);
      });

      render(<PropertiesPanel />);
      expect(screen.getByText('AI Object Detection')).toBeInTheDocument();
      expect(screen.getByText('Runtime Pending')).toBeInTheDocument();
      expect(screen.getByText('Runtime Not Implemented')).toBeInTheDocument();
    });

    it('renders OpenCV execution results, preview image, and structured detections', () => {
      let contourId = '';
      act(() => {
        contourId = usePipelineStore.getState().addNode('contour_detection')!;
        usePipelineStore.getState().selectNode(contourId);

        // Inject simulated execution state
        usePipelineStore.setState({
          nodeExecutionStates: {
            [contourId]: {
              nodeId: contourId,
              nodeType: 'contour_detection',
              status: 'completed',
              durationMs: 8.4,
              hasPreview: true,
              previewUrl: 'http://127.0.0.1:8000/api/pipeline/executions/test/nodes/contour/preview',
              outputMetadata: {
                width: 640,
                height: 480,
                channels: 3,
                color_space: 'BGR',
              },
              structuredResult: {
                count: 3,
                items: [
                  { index: 1, bbox: [10, 15, 50, 40], area: 1250 },
                  { index: 2, bbox: [80, 90, 30, 35], area: 850 },
                  { index: 3, bbox: [150, 200, 25, 25], area: 400 },
                ],
              },
            },
          },
        });
      });

      render(<PropertiesPanel />);

      expect(screen.getByText('OpenCV Execution')).toBeInTheDocument();
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
      expect(screen.getByText('8.4ms')).toBeInTheDocument();
      expect(screen.getByText('Output Image Preview')).toBeInTheDocument();
      expect(screen.getByText('Frame Metadata')).toBeInTheDocument();
      expect(screen.getByText('Detected Features (Count: 3)')).toBeInTheDocument();
      expect(screen.getByText('1250 px²')).toBeInTheDocument();
    });
  });

  describe('DebugPanel Component', () => {
    it('renders validation status badges and switches between tabs', () => {
      render(<DebugPanel />);
      expect(screen.getByText('Validation')).toBeInTheDocument();
      expect(screen.getByText('Logs')).toBeInTheDocument();
      expect(screen.getByText('Pipeline JSON')).toBeInTheDocument();
      expect(screen.getByText('✓ SAVEABLE')).toBeInTheDocument();

      // Switch to Logs tab
      const logsTab = screen.getByRole('button', { name: /Logs/i });
      act(() => {
        fireEvent.click(logsTab);
      });

      expect(screen.getByText('Clear Logs')).toBeInTheDocument();

      // Switch to Pipeline JSON tab
      const jsonTab = screen.getByRole('button', { name: /Pipeline JSON/i });
      act(() => {
        fireEvent.click(jsonTab);
      });

      expect(screen.getByText(/Versioned Pipeline JSON/i)).toBeInTheDocument();
      expect(screen.getByText('Copy JSON')).toBeInTheDocument();
    });
  });

  describe('PipelineEditor Native Menu & Keyboard Integration', () => {
    it('subscribes to Electron onMenuAction and handles save action', () => {
      let actionHandler: ((action: string) => void) | null = null;
      window.electronAPI = {
        getAppInfo: vi.fn(),
        getRuntimeDefaultUrl: vi.fn(),
        savePipelineFile: vi.fn().mockResolvedValue({ success: true, filePath: 'test.mvp' }),
        openPipelineFile: vi.fn().mockResolvedValue({ success: true, content: '{}' }),
        selectImageFile: vi.fn().mockResolvedValue({ canceled: true }),
        onMenuAction: vi.fn((cb) => {
          actionHandler = cb;
          return () => {};
        }),
      };

      render(<PipelineEditor />);
      expect(window.electronAPI?.onMenuAction).toHaveBeenCalled();

      // Trigger save menu action
      act(() => {
        actionHandler?.('save');
      });

      expect(window.electronAPI?.savePipelineFile).toHaveBeenCalled();
    });

    it('renders Run Pipeline button and invokes execution API', async () => {
      window.electronAPI = {
        getAppInfo: vi.fn(),
        getRuntimeDefaultUrl: vi.fn(),
        savePipelineFile: vi.fn(),
        openPipelineFile: vi.fn(),
        selectImageFile: vi.fn(),
        onMenuAction: vi.fn(() => () => {}),
      };

      // Mock successful fetch for pipeline execution
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_id: 'exec_test_123',
          status: 'completed',
          total_duration_ms: 15.6,
          nodes_executed: 6,
          node_results: {},
        }),
      });

      render(<PipelineEditor />);

      const runBtn = screen.getByRole('button', { name: /run pipeline/i });
      expect(runBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(runBtn);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://127.0.0.1:8000/api/pipeline/execute',
          expect.objectContaining({ method: 'POST' })
        );
      });
    });
  });
});
