import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePipelineStore } from '../store/pipelineStore';

describe('Pipeline Zustand Store', () => {
  beforeEach(() => {
    // Reset store to a clean new pipeline
    usePipelineStore.getState().newPipeline();
  });

  it('initializes with empty canvas on newPipeline', () => {
    const state = usePipelineStore.getState();
    expect(state.nodes).toHaveLength(0);
    expect(state.edges).toHaveLength(0);
    expect(state.isDirty).toBe(false);
    expect(state.currentFilePath).toBeNull();
    expect(state.pipelineMeta.name).toBe('Untitled Pipeline');
  });

  it('adds a node with defaults from contract and marks dirty', () => {
    const store = usePipelineStore.getState();
    const nodeId = store.addNode('image_file', { x: 50, y: 80 });

    expect(nodeId).toBeTruthy();
    const updated = usePipelineStore.getState();
    expect(updated.nodes).toHaveLength(1);
    expect(updated.nodes[0].id).toBe(nodeId);
    expect(updated.nodes[0].position).toEqual({ x: 50, y: 80 });
    expect((updated.nodes[0].data as any).nodeType).toBe('image_file');
    expect(updated.isDirty).toBe(true);
  });

  it('updates node display name and configuration', () => {
    const store = usePipelineStore.getState();
    const nodeId = store.addNode('roi_crop')!;

    store.updateNodeName(nodeId, 'High-Res Crop Zone');
    store.updateNodeConfig(nodeId, { width: 500, height: 400 });

    const updated = usePipelineStore.getState();
    const node = updated.nodes.find((n) => n.id === nodeId);
    expect((node?.data as any).name).toBe('High-Res Crop Zone');
    expect((node?.data as any).config.width).toBe(500);
    expect((node?.data as any).config.height).toBe(400);
  });

  it('connects valid nodes and updates edges', () => {
    const store = usePipelineStore.getState();
    const imgId = store.addNode('image_file')!;
    const threshId = store.addNode('threshold')!;

    const result = store.onConnect({
      source: imgId,
      sourceHandle: 'image',
      target: threshId,
      targetHandle: 'image_in',
    });

    expect(result.success).toBe(true);
    const updated = usePipelineStore.getState();
    expect(updated.edges).toHaveLength(1);
    expect(updated.edges[0].source).toBe(imgId);
    expect(updated.edges[0].target).toBe(threshId);
  });

  it('deletes a node and cleans up connected edges', () => {
    const store = usePipelineStore.getState();
    const imgId = store.addNode('image_file')!;
    const threshId = store.addNode('threshold')!;

    store.onConnect({
      source: imgId,
      sourceHandle: 'image',
      target: threshId,
      targetHandle: 'image_in',
    });

    expect(usePipelineStore.getState().edges).toHaveLength(1);

    store.deleteNode(imgId);

    const updated = usePipelineStore.getState();
    expect(updated.nodes).toHaveLength(1);
    expect(updated.nodes[0].id).toBe(threshId);
    expect(updated.edges).toHaveLength(0); // Cascade deleted
  });

  it('exports pipeline conforming to MVP format and preserves all properties upon reload', () => {
    const store = usePipelineStore.getState();
    const imgId = store.addNode('image_file', { x: 100, y: 200 })!;
    const threshId = store.addNode('threshold', { x: 400, y: 200 })!;

    store.updateNodeConfig(imgId, { filePath: 'custom/pcb.png' });
    store.updateNodeConfig(threshId, { threshold: 200, mode: 'OTSU', maxVal: 255 });

    store.onConnect({
      source: imgId,
      sourceHandle: 'image',
      target: threshId,
      targetHandle: 'image_in',
    });

    const exported = store.exportPipeline();
    expect(exported.fileFormat).toBe('MVP_PIPELINE');
    expect(exported.schemaVersion).toBe('1.0.0');
    expect(exported.nodes).toHaveLength(2);
    expect(exported.edges).toHaveLength(1);

    // Reset store and reload exported pipeline
    store.newPipeline();
    expect(usePipelineStore.getState().nodes).toHaveLength(0);

    const loadResult = store.loadPipeline(exported, 'test_export.mvp');
    expect(loadResult.success).toBe(true);

    const reloaded = usePipelineStore.getState();
    expect(reloaded.nodes).toHaveLength(2);
    expect(reloaded.edges).toHaveLength(1);
    expect(reloaded.currentFilePath).toBe('test_export.mvp');

    const reloadedImg = reloaded.nodes.find((n) => n.id === imgId);
    expect(reloadedImg).toBeDefined();
    expect(reloadedImg?.position).toEqual({ x: 100, y: 200 });
    expect((reloadedImg?.data as any).config.filePath).toBe('custom/pcb.png');

    const reloadedThresh = reloaded.nodes.find((n) => n.id === threshId);
    expect((reloadedThresh?.data as any).config.threshold).toBe(200);
    expect((reloadedThresh?.data as any).config.mode).toBe('OTSU');
  });

  it('loads legacy JSON pipeline without fileFormat field maintaining backwards compatibility', () => {
    const store = usePipelineStore.getState();

    const legacyPipeline = {
      schemaVersion: '1.0.0',
      id: 'legacy_pipeline_123',
      name: 'Legacy Flow',
      description: 'Created before .mvp was introduced',
      createdAt: '2026-10-23T12:00:00Z',
      updatedAt: '2026-10-23T12:00:00Z',
      metadata: { customField: 'retained_value' },
      nodes: [
        {
          id: 'node_1',
          nodeType: 'image_file',
          name: 'Old Image Source',
          position: { x: 50, y: 50 },
          config: { filePath: 'legacy.png' },
        },
      ],
      edges: [],
    };

    const res = store.loadPipeline(legacyPipeline, 'legacy.json');
    expect(res.success).toBe(true);

    const state = usePipelineStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].data.name).toBe('Old Image Source');
    expect(state.pipelineMeta.metadata).toEqual({ customField: 'retained_value' });
  });

  it('preserves unsupported node definitions and configs without data loss', () => {
    const store = usePipelineStore.getState();

    // Node from future stage or unknown plugin
    const futurePipeline = {
      fileFormat: 'MVP_PIPELINE',
      schemaVersion: '1.0.0',
      id: 'future_pipe',
      name: 'Future AI Pipeline',
      description: '',
      createdAt: '2026-10-25T00:00:00Z',
      updatedAt: '2026-10-25T00:00:00Z',
      metadata: {},
      nodes: [
        {
          id: 'custom_node_99',
          nodeType: 'custom_laser_scanner',
          name: 'Laser Scanner 3D',
          position: { x: 120, y: 180 },
          config: { baudRate: 115200, calibrationFile: 'calib.dat' },
        },
      ],
      edges: [],
    };

    const res = store.loadPipeline(futurePipeline);
    expect(res.success).toBe(true);

    const loadedNode = usePipelineStore.getState().nodes.find((n) => n.id === 'custom_node_99');
    expect(loadedNode).toBeDefined();
    expect(loadedNode?.position).toEqual({ x: 120, y: 180 });
    expect((loadedNode?.data as any).config.baudRate).toBe(115200);
    expect((loadedNode?.data as any).config.calibrationFile).toBe('calib.dat');
  });

  it('rejects invalid pipeline JSON/MVP on load without destroying current state', () => {
    const store = usePipelineStore.getState();
    store.addNode('image_file', { x: 10, y: 10 });
    expect(usePipelineStore.getState().nodes).toHaveLength(1);

    // Malformed JSON (missing schemaVersion & invalid types)
    const malformedJson = {
      name: 'Broken Pipeline',
      nodes: 'not-an-array',
    };

    const loadResult = store.loadPipeline(malformedJson);
    expect(loadResult.success).toBe(false);
    expect(loadResult.error).toBeDefined();

    // Current state preserved!
    expect(usePipelineStore.getState().nodes).toHaveLength(1);
  });

  it('triggers Electron safe file dialog on savePipelineFile and saveAsPipelineFile', async () => {
    const store = usePipelineStore.getState();
    store.addNode('image_file');

    const saveSpy = vi.spyOn(window.electronAPI!, 'savePipelineFile').mockResolvedValue({
      success: true,
      filePath: 'C:/pipelines/inspection.mvp',
    });

    const res1 = await store.savePipelineFile();
    expect(res1.success).toBe(true);
    expect(saveSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\.mvp$/),
      expect.any(String),
      undefined
    );
    expect(usePipelineStore.getState().currentFilePath).toBe('C:/pipelines/inspection.mvp');
    expect(usePipelineStore.getState().isDirty).toBe(false);

    // Subsequent normal save uses currentFilePath
    await store.savePipelineFile(false);
    expect(saveSpy).toHaveBeenLastCalledWith(
      expect.stringMatching(/\.mvp$/),
      expect.any(String),
      'C:/pipelines/inspection.mvp'
    );

    // Save As prompts for a new path without targetPath
    await store.saveAsPipelineFile();
    expect(saveSpy).toHaveBeenLastCalledWith(
      expect.stringMatching(/\.mvp$/),
      expect.any(String),
      undefined
    );
  });
});
