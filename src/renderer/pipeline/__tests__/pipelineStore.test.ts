import { describe, it, expect, beforeEach } from 'vitest';
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

  it('exports pipeline conforming to PipelineDefinitionSchema and preserves all properties upon reload', () => {
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
    expect(exported.schemaVersion).toBe('1.0.0');
    expect(exported.nodes).toHaveLength(2);
    expect(exported.edges).toHaveLength(1);

    // Reset store and reload exported pipeline
    store.newPipeline();
    expect(usePipelineStore.getState().nodes).toHaveLength(0);

    const loadResult = store.loadPipeline(exported);
    expect(loadResult.success).toBe(true);

    const reloaded = usePipelineStore.getState();
    expect(reloaded.nodes).toHaveLength(2);
    expect(reloaded.edges).toHaveLength(1);

    const reloadedImg = reloaded.nodes.find((n) => n.id === imgId);
    expect(reloadedImg).toBeDefined();
    expect(reloadedImg?.position).toEqual({ x: 100, y: 200 });
    expect((reloadedImg?.data as any).config.filePath).toBe('custom/pcb.png');

    const reloadedThresh = reloaded.nodes.find((n) => n.id === threshId);
    expect((reloadedThresh?.data as any).config.threshold).toBe(200);
    expect((reloadedThresh?.data as any).config.mode).toBe('OTSU');
  });

  it('rejects invalid pipeline JSON on load without destroying current state', () => {
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
});
