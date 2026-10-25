import { describe, it, expect, beforeEach } from 'vitest';
import {
  migratePipelineDefinition,
  isLifecycleTransitionAllowed,
  ReleaseSnapshotSchema,
} from '@/shared/contracts';
import {
  validatePipeline,
  validatePipelineForRelease,
} from '../validator/pipelineValidator';
import { usePipelineStore } from '../store/pipelineStore';

describe('Phase 2 — Pipeline Validation, Lifecycle & .mvp Migration (Frontend)', () => {
  beforeEach(() => {
    usePipelineStore.getState().newPipeline();
  });

  it('validates a complete valid pipeline for release', () => {
    const store = usePipelineStore.getState();
    const imgId = store.addNode('image_file', { x: 0, y: 0 })!;
    const grayId = store.addNode('grayscale', { x: 200, y: 0 })!;

    store.onConnect({
      source: imgId,
      sourceHandle: 'image',
      target: grayId,
      targetHandle: 'image_in',
    });

    const exported = usePipelineStore.getState().exportPipeline();
    const releaseReport = validatePipelineForRelease(exported.nodes, exported.edges);

    expect(releaseReport.isValid).toBe(true);
    expect(releaseReport.canRelease).toBe(true);
    expect(releaseReport.errors).toHaveLength(0);
  });

  it('blocks release when a required input port is unconnected', () => {
    const store = usePipelineStore.getState();
    store.addNode('grayscale', { x: 200, y: 0 }); // required image_in is unconnected

    const exported = usePipelineStore.getState().exportPipeline();
    const draftReport = validatePipeline(exported.nodes, exported.edges);
    const releaseReport = validatePipelineForRelease(exported.nodes, exported.edges);

    // Draft report keeps warning for editor ergonomics, but canRelease is false
    expect(draftReport.canRelease).toBe(false);
    // Strict release validation promotes missing required input to blocking error
    expect(releaseReport.isValid).toBe(false);
    expect(releaseReport.canRelease).toBe(false);
    expect(releaseReport.errors.some((e) => e.code === 'MISSING_REQUIRED_INPUT')).toBe(true);
  });

  it('blocks release on dangerous/executable config payload or path traversal', () => {
    const report = validatePipelineForRelease(
      [
        {
          id: 'n1',
          nodeType: 'image_file',
          name: 'Malicious Source',
          position: { x: 0, y: 0 },
          config: { filePath: '__import__("os").system("calc")' },
        },
      ],
      []
    );

    expect(report.isValid).toBe(false);
    expect(report.canRelease).toBe(false);
    expect(report.errors.some((e) => e.code === 'DANGEROUS_CONFIG_PAYLOAD')).toBe(true);
  });

  it('enforces Draft -> Validated -> Draft lifecycle in pipelineStore', () => {
    const store = usePipelineStore.getState();
    expect(store.lifecycleStatus).toBe('Draft');

    // Empty pipeline cannot be marked Validated
    const emptyValidation = store.markPipelineValidated();
    expect(emptyValidation.success).toBe(false);
    expect(usePipelineStore.getState().lifecycleStatus).toBe('Draft');

    // Add valid connected nodes
    const imgId = store.addNode('image_file', { x: 0, y: 0 })!;
    const grayId = store.addNode('grayscale', { x: 250, y: 0 })!;
    store.onConnect({
      source: imgId,
      sourceHandle: 'image',
      target: grayId,
      targetHandle: 'image_in',
    });

    const validRes = usePipelineStore.getState().markPipelineValidated();
    expect(validRes.success).toBe(true);
    expect(usePipelineStore.getState().lifecycleStatus).toBe('Validated');

    // Editing a node config must automatically reset lifecycleStatus back to Draft
    usePipelineStore.getState().updateNodeConfig(grayId, { equalizeHist: true });
    expect(usePipelineStore.getState().lifecycleStatus).toBe('Draft');
  });

  it('validates allowed and disallowed lifecycle state transitions', () => {
    expect(isLifecycleTransitionAllowed('Draft', 'Validated')).toBe(true);
    expect(isLifecycleTransitionAllowed('Draft', 'Released')).toBe(false);
    expect(isLifecycleTransitionAllowed('Validated', 'Released')).toBe(true);
    expect(isLifecycleTransitionAllowed('Validated', 'Draft')).toBe(true);
    expect(isLifecycleTransitionAllowed('Released', 'Archived')).toBe(true);
    expect(isLifecycleTransitionAllowed('Archived', 'Released')).toBe(false);
  });

  it('migrates compatible legacy .mvp versions (0.9.0) and rejects unsupported future versions', () => {
    const legacyMvp = {
      schemaVersion: '0.9.0',
      id: 'legacy_pipe_1',
      name: 'Legacy Pipeline',
      nodes: [
        {
          id: 'n1',
          node_type: 'image_file',
          name: 'Legacy Image Node',
          position: { x: 10, y: 20 },
          config: { filePath: 'sample_images/pcb_board.png' },
        },
      ],
      edges: [],
      metadata: {
        customAuthor: 'QA Engineer',
        __transientExecutionState: 'should_be_stripped',
      },
    };

    const migrated = migratePipelineDefinition(legacyMvp);
    expect(migrated.success).toBe(true);
    expect(migrated.migratedFromVersion).toBe('0.9.0');
    expect(migrated.pipeline?.schemaVersion).toBe('1.0.0');
    expect(migrated.pipeline?.nodes[0].nodeType).toBe('image_file');
    expect(migrated.pipeline?.metadata.customAuthor).toBe('QA Engineer');
    expect(migrated.pipeline?.metadata.__transientExecutionState).toBeUndefined();

    // Unsupported future version 2.0.0 must be rejected cleanly
    const futureMvp = {
      schemaVersion: '2.0.0',
      id: 'future_pipe',
      name: 'Future Pipeline',
      nodes: [],
      edges: [],
    };
    const rejected = migratePipelineDefinition(futureMvp);
    expect(rejected.success).toBe(false);
    expect(rejected.error).toContain('Unsupported .mvp schemaVersion "2.0.0"');
  });

  it('validates ReleaseSnapshotSchema contract', () => {
    const now = new Date().toISOString();
    const validRelease = {
      pipeline_id: 'pipe_100',
      release_version: '1.0.0',
      schema_version: '1.0.0',
      status: 'Released',
      is_active: true,
      pipeline: {
        fileFormat: 'MVP_PIPELINE',
        schemaVersion: '1.0.0',
        id: 'pipe_100',
        name: 'Bottle Cap Inspection',
        description: '',
        createdAt: now,
        updatedAt: now,
        metadata: {},
        nodes: [],
        edges: [],
      },
      node_versions: { image_file: '1.0.0' },
      created_at: now,
      release_notes: 'Initial production release',
      checksum: 'a'.repeat(64),
    };

    const parsed = ReleaseSnapshotSchema.safeParse(validRelease);
    expect(parsed.success).toBe(true);
  });
});
