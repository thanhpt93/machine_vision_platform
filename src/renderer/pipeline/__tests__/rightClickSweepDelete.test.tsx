import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PipelineCanvas } from '../components/PipelineCanvas';
import { usePipelineStore } from '../store/pipelineStore';

describe('Right-Click Area Sweep-to-Delete Feature', () => {
  beforeEach(() => {
    act(() => {
      usePipelineStore.getState().newPipeline();
    });
  });

  it('renders the canvas with discoverability hint for right-click sweep delete', () => {
    render(<PipelineCanvas />);

    expect(
      screen.getByText(/Click chuột phải & quét để xóa nhanh một vùng node/i)
    ).toBeInTheDocument();
  });

  it('displays the sweep-delete selection box and count badge when right-click dragging', () => {
    render(<PipelineCanvas />);

    const hintEl = screen.getByText(/Click chuột phải & quét để xóa nhanh một vùng node/i);
    const canvasContainer = hintEl.closest('.flex-1') as HTMLElement;
    expect(canvasContainer).toBeInTheDocument();

    // 1. Right-click mousedown
    act(() => {
      fireEvent.mouseDown(canvasContainer, { button: 2, clientX: 100, clientY: 100 });
    });

    // 2. Drag mouse
    act(() => {
      fireEvent.mouseMove(window, { clientX: 350, clientY: 350 });
    });

    // 3. Selection box should appear with delete badge
    const sweepBox = screen.getByTestId('sweep-delete-box');
    expect(sweepBox).toBeInTheDocument();
    expect(sweepBox).toHaveTextContent(/xóa|quét/i);

    // 4. Releasing mouse dismisses the box
    act(() => {
      fireEvent.mouseUp(window, { button: 2, clientX: 350, clientY: 350 });
    });

    expect(screen.queryByTestId('sweep-delete-box')).not.toBeInTheDocument();
  });

  it('deletes swept nodes from store when right-click drag intersects nodes', () => {
    // Add two nodes to canvas store
    let n1Id = '';
    let n2Id = '';
    act(() => {
      n1Id = usePipelineStore.getState().addNode('image_file', { x: 50, y: 50 })!;
      n2Id = usePipelineStore.getState().addNode('threshold', { x: 800, y: 800 })!;
    });

    expect(usePipelineStore.getState().nodes).toHaveLength(2);

    render(<PipelineCanvas />);

    const hintEl = screen.getByText(/Click chuột phải & quét để xóa nhanh một vùng node/i);
    const canvasContainer = hintEl.closest('.flex-1') as HTMLElement;

    // Sweep around node 1: (0, 0) to (200, 200)
    act(() => {
      fireEvent.mouseDown(canvasContainer, { button: 2, clientX: 0, clientY: 0 });
    });
    act(() => {
      fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
    });
    act(() => {
      fireEvent.mouseUp(window, { button: 2, clientX: 200, clientY: 200 });
    });

    // Node 1 should be swept and deleted, Node 2 at (800, 800) remains
    const remaining = usePipelineStore.getState().nodes;
    expect(remaining.find((n) => n.id === n1Id)).toBeUndefined();
    expect(remaining.find((n) => n.id === n2Id)).toBeDefined();
  });
});
