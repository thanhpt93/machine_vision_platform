import { describe, it, expect } from 'vitest';
import {
  validatePipeline,
  validateNewConnection,
} from '../validator/pipelineValidator';
import {
  PipelineNodeInstance,
  PipelineEdge,
  areDataTypesCompatible,
} from '@/shared/contracts';
import { nodeRegistry, NodeRegistryItem } from '../registry/nodeRegistry';
import { z } from 'zod';

describe('Pipeline Validator & Node Registry', () => {
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
    expect(report.canSave).toBe(true);
    expect(report.canExecute).toBe(false);
    expect(report.warnings.some((w) => w.message.includes('is not connected'))).toBe(true);
  });

  it('identifies nodes without Python Runtime implementation', () => {
    const nodesWithAi: PipelineNodeInstance[] = [
      {
        id: 'ai_node',
        nodeType: 'ai_segmentation',
        name: 'ONNX Defect Segmenter',
        position: { x: 100, y: 100 },
        config: {
          confidenceThreshold: 0.5,
        },
      },
    ];

    const report = validatePipeline(nodesWithAi, []);
    // Pipeline can be edited and saved, but cannot execute yet
    expect(report.canSave).toBe(true);
    expect(report.canExecute).toBe(false);
    expect(
      report.warnings.some((w) =>
        w.message.includes('has no Python Runtime implementation yet')
      )
    ).toBe(true);
  });

  it('detects cycles in graph (DAG violation)', () => {
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

  describe('Standardized Data Type Compatibility', () => {
    it('verifies compatibility across standardized types', () => {
      // ImageFrame <-> IMAGE
      expect(areDataTypesCompatible('ImageFrame', 'IMAGE')).toBe(true);
      expect(areDataTypesCompatible('IMAGE', 'ImageFrame')).toBe(true);

      // MaskFrame -> ImageFrame (Mask as grayscale image input)
      expect(areDataTypesCompatible('MaskFrame', 'ImageFrame')).toBe(true);

      // Numeric: Scalar <-> NUMBER
      expect(areDataTypesCompatible('Scalar', 'NUMBER')).toBe(true);

      // Detections: DetectionResult <-> DETECTIONS
      expect(areDataTypesCompatible('DetectionResult', 'DETECTIONS')).toBe(true);

      // Incompatible
      expect(areDataTypesCompatible('DetectionResult', 'ImageFrame')).toBe(false);
      expect(areDataTypesCompatible('ImageFrame', 'Boolean')).toBe(false);
    });
  });

  describe('Node Registry Extensibility', () => {
    it('allows registering a new node dynamically without altering core editor logic', () => {
      const customNode: NodeRegistryItem = {
        nodeType: 'custom_canny_edge',
        version: '1.0.0',
        displayName: 'Canny Edge Detector',
        category: 'PREPROCESSING',
        description: 'Multi-stage edge detection algorithm',
        icon: 'sliders',
        tags: ['edge', 'contour', 'canny'],
        inputs: [
          { id: 'img', name: 'In', dataType: 'ImageFrame', required: true },
        ],
        outputs: [
          { id: 'edges', name: 'Edges', dataType: 'MaskFrame', required: true },
        ],
        defaultConfig: { lowThresh: 50, highThresh: 150 },
        configSchema: z.object({
          lowThresh: z.number().min(0),
          highThresh: z.number().min(0),
        }),
        configFields: [
          { key: 'lowThresh', label: 'Low Threshold', type: 'number', min: 0 },
          { key: 'highThresh', label: 'High Threshold', type: 'number', min: 0 },
        ],
        runtime: { supported: true },
      };

      nodeRegistry.register(customNode);

      expect(nodeRegistry.isRegistered('custom_canny_edge')).toBe(true);
      expect(nodeRegistry.get('custom_canny_edge')?.displayName).toBe('Canny Edge Detector');
      expect(nodeRegistry.hasRuntimeSupport('custom_canny_edge')).toBe(true);

      // Search finds the new node by tag
      const results = nodeRegistry.search('canny');
      expect(results.some((n) => n.nodeType === 'custom_canny_edge')).toBe(true);
    });

    it('rejects duplicate node registration with a clear error', () => {
      expect(() => {
        nodeRegistry.register({
          nodeType: 'image_file', // already registered
          version: '1.0.0',
          displayName: 'Duplicate Node',
          category: 'ACQUISITION',
          description: '',
          icon: 'camera',
          tags: [],
          inputs: [],
          outputs: [],
          defaultConfig: {},
          configSchema: z.object({}),
          configFields: [],
          runtime: { supported: true },
        });
      }).toThrow(/Duplicate node registration error/);
    });
  });
});
