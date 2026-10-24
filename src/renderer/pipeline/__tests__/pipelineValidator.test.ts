import { describe, it, expect } from 'vitest';
import {
  validatePipeline,
  validateNewConnection,
} from '../validator/pipelineValidator';
import { PipelineNodeInstance, PipelineEdge } from '@/shared/contracts';

describe('Pipeline Validator', () => {
  const sampleNodes: PipelineNodeInstance[] = [
    {
      id: 'img1',
      nodeType: 'image_file',
      name: 'Image Source',
      position: { x: 0, y: 0 },
      config: { filePath: 'test.png' },
    },
    {
      id: 'crop1',
      nodeType: 'roi_crop',
      name: 'Crop Area',
      position: { x: 200, y: 0 },
      config: { x: 10, y: 10, width: 100, height: 100 },
    },
    {
      id: 'thresh1',
      nodeType: 'threshold',
      name: 'Binarize',
      position: { x: 400, y: 0 },
      config: { threshold: 128, mode: 'BINARY', maxVal: 255 },
    },
    {
      id: 'view1',
      nodeType: 'result_viewer',
      name: 'Viewer',
      position: { x: 600, y: 0 },
      config: { showHistogram: true, zoomLevel: 1.0, title: 'Output' },
    },
  ];

  const validEdges: PipelineEdge[] = [
    {
      id: 'e1',
      sourceNodeId: 'img1',
      sourcePortId: 'image',
      targetNodeId: 'crop1',
      targetPortId: 'image_in',
    },
    {
      id: 'e2',
      sourceNodeId: 'crop1',
      sourcePortId: 'image_out',
      targetNodeId: 'thresh1',
      targetPortId: 'image_in',
    },
    {
      id: 'e3',
      sourceNodeId: 'thresh1',
      sourcePortId: 'image_out',
      targetNodeId: 'view1',
      targetPortId: 'image_in',
    },
  ];

  it('validates a complete valid linear pipeline as Execution Ready', () => {
    const report = validatePipeline(sampleNodes, validEdges);
    expect(report.isValid).toBe(true);
    expect(report.canSave).toBe(true);
    expect(report.canExecute).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(report.topologicalOrder).toEqual(['img1', 'crop1', 'thresh1', 'view1']);
  });

  it('detects duplicate node IDs', () => {
    const nodesWithDuplicate: PipelineNodeInstance[] = [
      ...sampleNodes,
      {
        id: 'img1', // duplicate
        nodeType: 'image_file',
        name: 'Another Image',
        position: { x: 0, y: 100 },
        config: { filePath: 'test2.png' },
      },
    ];

    const report = validatePipeline(nodesWithDuplicate, validEdges);
    expect(report.isValid).toBe(false);
    expect(report.canSave).toBe(false);
    expect(report.errors.some((e) => e.message.includes('Duplicate Node ID'))).toBe(true);
  });

  it('detects invalid node configurations', () => {
    const nodesWithBadConfig: PipelineNodeInstance[] = [
      {
        id: 'crop_bad',
        nodeType: 'roi_crop',
        name: 'Bad Crop',
        position: { x: 0, y: 0 },
        config: { x: -10, y: 10, width: 0, height: 100 }, // negative x and 0 width
      },
    ];

    const report = validatePipeline(nodesWithBadConfig, []);
    expect(report.isValid).toBe(false);
    expect(report.errors.some((e) => e.field === 'x')).toBe(true);
    expect(report.errors.some((e) => e.field === 'width')).toBe(true);
  });

  it('warns when required input ports are not connected', () => {
    // Only viewer node without incoming connection
    const standaloneViewer: PipelineNodeInstance[] = [
      {
        id: 'view_alone',
        nodeType: 'result_viewer',
        name: 'Alone Viewer',
        position: { x: 0, y: 0 },
        config: { showHistogram: false, zoomLevel: 1.0, title: 'Output' },
      },
    ];

    const report = validatePipeline(standaloneViewer, []);
    // Draft pipeline can be saved, but cannot execute
    expect(report.canSave).toBe(true);
    expect(report.canExecute).toBe(false);
    expect(report.warnings.some((w) => w.message.includes('is not connected'))).toBe(true);
  });

  it('detects cycles in graph (DAG violation)', () => {
    // Introduce cycle: thresh1 -> crop1
    const cycleEdges: PipelineEdge[] = [
      ...validEdges,
      {
        id: 'e_cycle',
        sourceNodeId: 'thresh1',
        sourcePortId: 'image_out',
        targetNodeId: 'crop1',
        targetPortId: 'image_in',
      },
    ];

    const report = validatePipeline(sampleNodes, cycleEdges);
    expect(report.isValid).toBe(false);
    expect(report.canExecute).toBe(false);
    expect(report.cycleNodes).toBeDefined();
    expect(report.cycleNodes?.length).toBeGreaterThan(0);
    expect(report.errors.some((e) => e.type === 'CYCLE_ERROR')).toBe(true);
  });

  it('blocks self-connections and multiple connections to single input port', () => {
    const selfConn = validateNewConnection(
      'crop1',
      'image_out',
      'crop1',
      'image_in',
      sampleNodes,
      validEdges
    );
    expect(selfConn.allowed).toBe(false);
    expect(selfConn.reason).toContain('Cannot connect a node to itself');

    // Attempting to connect a second input to crop1.image_in
    const multiConn = validateNewConnection(
      'thresh1',
      'image_out',
      'crop1',
      'image_in',
      sampleNodes,
      validEdges
    );
    expect(multiConn.allowed).toBe(false);
    expect(multiConn.reason).toContain('already has an incoming connection');
  });

  it('allows valid connection creation', () => {
    const unconnectedNodes: PipelineNodeInstance[] = [
      sampleNodes[0], // img1
      sampleNodes[1], // crop1
    ];

    const res = validateNewConnection(
      'img1',
      'image',
      'crop1',
      'image_in',
      unconnectedNodes,
      []
    );
    expect(res.allowed).toBe(true);
  });
});
