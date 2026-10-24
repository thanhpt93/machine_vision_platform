import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NodeLibrary } from '../components/NodeLibrary';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { DebugPanel } from '../components/DebugPanel';
import { usePipelineStore } from '../store/pipelineStore';

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
      expect(screen.getByText('Acquisition')).toBeInTheDocument();
      expect(screen.getByText('Preprocessing')).toBeInTheDocument();
      expect(screen.getByText('Output View')).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText('Search nodes...');
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
  });

  describe('PropertiesPanel Component', () => {
    it('shows placeholder when no node is selected', () => {
      render(<PropertiesPanel />);
      expect(screen.getByText('No Node Selected')).toBeInTheDocument();
      expect(screen.getByText(/Click on any node in the canvas/i)).toBeInTheDocument();
    });

    it('displays form fields for selected node and updates configuration', () => {
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
});
