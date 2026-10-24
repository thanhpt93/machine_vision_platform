import { create } from 'zustand';
import {
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import {
  PipelineDefinition,
  PipelineDefinitionSchema,
  PipelineEdge,
  PipelineNodeInstance,
} from '@/shared/contracts';
import { getNodeContract, NODE_REGISTRY } from '../registry/nodeRegistry';
import {
  validatePipeline,
  validateNewConnection,
  ValidationReport,
} from '../validator/pipelineValidator';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface PipelineStoreState {
  // Graph State
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;

  // Metadata
  pipelineMeta: {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
  };
  isDirty: boolean;

  // Validation & Logs
  validationReport: ValidationReport;
  logMessages: LogEntry[];
  activeBottomTab: 'validation' | 'logs' | 'json';
  lastSavedAt: string | null;

  // Actions
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => { success: boolean; reason?: string };
  selectNode: (nodeId: string | null) => void;
  addNode: (nodeType: string, position?: { x: number; y: number }) => string | null;
  updateNodeName: (nodeId: string, name: string) => void;
  updateNodeConfig: (nodeId: string, partialConfig: Record<string, any>) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  updatePipelineMeta: (meta: Partial<{ name: string; description: string }>) => void;
  setActiveBottomTab: (tab: 'validation' | 'logs' | 'json') => void;
  addLog: (level: 'info' | 'warn' | 'error', message: string) => void;
  clearLogs: () => void;

  // Pipeline Lifecycle
  newPipeline: () => void;
  loadPipeline: (pipelineJson: unknown) => { success: boolean; error?: string };
  exportPipeline: () => PipelineDefinition;
  savePipelineFile: () => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  openPipelineFile: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
}

function generateId(prefix: string = 'node'): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
}

function extractPipelineInstances(nodes: Node[], edges: Edge[]): {
  nodeInstances: PipelineNodeInstance[];
  edgeInstances: PipelineEdge[];
} {
  const nodeInstances: PipelineNodeInstance[] = nodes.map((n) => ({
    id: n.id,
    nodeType: (n.data as any).nodeType,
    name: (n.data as any).name || n.id,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    config: (n.data as any).config || {},
  }));

  const edgeInstances: PipelineEdge[] = edges.map((e) => ({
    id: e.id,
    sourceNodeId: e.source,
    sourcePortId: e.sourceHandle || '',
    targetNodeId: e.target,
    targetPortId: e.targetHandle || '',
  }));

  return { nodeInstances, edgeInstances };
}

function createInitialPipeline() {
  const now = new Date().toISOString();
  // Starter flow: Image File -> Threshold -> Result Viewer
  const imgNodeId = 'node_image_file_1';
  const threshNodeId = 'node_threshold_1';
  const viewerNodeId = 'node_result_viewer_1';

  const starterNodes: Node[] = [
    {
      id: imgNodeId,
      type: 'customPipelineNode',
      position: { x: 100, y: 150 },
      data: {
        nodeType: 'image_file',
        name: 'Image File',
        config: { ...NODE_REGISTRY.image_file.defaultConfig },
      },
    },
    {
      id: threshNodeId,
      type: 'customPipelineNode',
      position: { x: 450, y: 150 },
      data: {
        nodeType: 'threshold',
        name: 'Threshold',
        config: { ...NODE_REGISTRY.threshold.defaultConfig },
      },
    },
    {
      id: viewerNodeId,
      type: 'customPipelineNode',
      position: { x: 800, y: 150 },
      data: {
        nodeType: 'result_viewer',
        name: 'Result Viewer',
        config: { ...NODE_REGISTRY.result_viewer.defaultConfig },
      },
    },
  ];

  const starterEdges: Edge[] = [
    {
      id: 'edge_img_thresh',
      source: imgNodeId,
      sourceHandle: 'image',
      target: threshNodeId,
      targetHandle: 'image_in',
      type: 'smoothstep',
      animated: true,
    },
    {
      id: 'edge_thresh_viewer',
      source: threshNodeId,
      sourceHandle: 'image_out',
      target: viewerNodeId,
      targetHandle: 'image_in',
      type: 'smoothstep',
      animated: true,
    },
  ];

  const { nodeInstances, edgeInstances } = extractPipelineInstances(starterNodes, starterEdges);
  const initialValidation = validatePipeline(nodeInstances, edgeInstances);

  return {
    nodes: starterNodes,
    edges: starterEdges,
    meta: {
      id: 'pipeline_' + Math.random().toString(36).substring(2, 9),
      name: 'Inspection Pipeline Sample',
      description: 'Starter optical inspection template (Acquisition -> Threshold -> Viewer)',
      createdAt: now,
      updatedAt: now,
    },
    validation: initialValidation,
  };
}

const initial = createInitialPipeline();

export const usePipelineStore = create<PipelineStoreState>((set, get) => ({
  nodes: initial.nodes,
  edges: initial.edges,
  selectedNodeId: null,
  pipelineMeta: initial.meta,
  isDirty: false,
  validationReport: initial.validation,
  logMessages: [
    {
      id: generateId('log'),
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'Pipeline Editor initialized with starter template.',
    },
  ],
  activeBottomTab: 'validation',
  lastSavedAt: null,

  onNodesChange: (changes: NodeChange[]) => {
    const updatedNodes = applyNodeChanges(changes, get().nodes);
    const { nodeInstances, edgeInstances } = extractPipelineInstances(updatedNodes, get().edges);
    const report = validatePipeline(nodeInstances, edgeInstances);

    set({
      nodes: updatedNodes,
      isDirty: true,
      validationReport: report,
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    const updatedEdges = applyEdgeChanges(changes, get().edges);
    const { nodeInstances, edgeInstances } = extractPipelineInstances(get().nodes, updatedEdges);
    const report = validatePipeline(nodeInstances, edgeInstances);

    set({
      edges: updatedEdges,
      isDirty: true,
      validationReport: report,
    });
  },

  onConnect: (connection: Connection) => {
    const { nodes, edges } = get();
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
      return { success: false, reason: 'Invalid handle coordinates.' };
    }

    const { nodeInstances, edgeInstances } = extractPipelineInstances(nodes, edges);
    const check = validateNewConnection(
      connection.source,
      connection.sourceHandle,
      connection.target,
      connection.targetHandle,
      nodeInstances,
      edgeInstances
    );

    if (!check.allowed) {
      get().addLog('warn', `Connection blocked: ${check.reason}`);
      return { success: false, reason: check.reason };
    }

    const newEdge: Edge = {
      id: `edge_${connection.source}_${connection.sourceHandle}_to_${connection.target}_${connection.targetHandle}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      type: 'smoothstep',
      animated: true,
    };

    const newEdges = [...edges, newEdge];
    const { nodeInstances: updatedNodes, edgeInstances: updatedEdges } = extractPipelineInstances(
      nodes,
      newEdges
    );
    const report = validatePipeline(updatedNodes, updatedEdges);

    set({
      edges: newEdges,
      isDirty: true,
      validationReport: report,
    });

    get().addLog(
      'info',
      `Connected ${connection.source}:${connection.sourceHandle} -> ${connection.target}:${connection.targetHandle}`
    );

    return { success: true };
  },

  selectNode: (nodeId: string | null) => {
    set({ selectedNodeId: nodeId });
  },

  addNode: (nodeType: string, position?: { x: number; y: number }) => {
    const contract = getNodeContract(nodeType);
    if (!contract) {
      get().addLog('error', `Cannot add node: unknown type "${nodeType}"`);
      return null;
    }

    const id = generateId(`node_${nodeType}`);
    const defaultPos = position || {
      x: 200 + Math.random() * 200,
      y: 150 + Math.random() * 150,
    };

    const newNode: Node = {
      id,
      type: 'customPipelineNode',
      position: defaultPos,
      data: {
        nodeType,
        name: contract.displayName,
        config: { ...contract.defaultConfig },
      },
    };

    const updatedNodes = [...get().nodes, newNode];
    const { nodeInstances, edgeInstances } = extractPipelineInstances(updatedNodes, get().edges);
    const report = validatePipeline(nodeInstances, edgeInstances);

    set({
      nodes: updatedNodes,
      selectedNodeId: id,
      isDirty: true,
      validationReport: report,
    });

    get().addLog('info', `Added node "${contract.displayName}" (ID: ${id})`);
    return id;
  },

  updateNodeName: (nodeId: string, name: string) => {
    const updatedNodes = get().nodes.map((node) => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            name,
          },
        };
      }
      return node;
    });

    const { nodeInstances, edgeInstances } = extractPipelineInstances(updatedNodes, get().edges);
    const report = validatePipeline(nodeInstances, edgeInstances);

    set({
      nodes: updatedNodes,
      isDirty: true,
      validationReport: report,
    });
  },

  updateNodeConfig: (nodeId: string, partialConfig: Record<string, any>) => {
    const updatedNodes = get().nodes.map((node) => {
      if (node.id === nodeId) {
        const currentConfig = (node.data as any).config || {};
        return {
          ...node,
          data: {
            ...node.data,
            config: {
              ...currentConfig,
              ...partialConfig,
            },
          },
        };
      }
      return node;
    });

    const { nodeInstances, edgeInstances } = extractPipelineInstances(updatedNodes, get().edges);
    const report = validatePipeline(nodeInstances, edgeInstances);

    set({
      nodes: updatedNodes,
      isDirty: true,
      validationReport: report,
    });
  },

  deleteNode: (nodeId: string) => {
    const updatedNodes = get().nodes.filter((n) => n.id !== nodeId);
    const updatedEdges = get().edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId
    );

    const { nodeInstances, edgeInstances } = extractPipelineInstances(updatedNodes, updatedEdges);
    const report = validatePipeline(nodeInstances, edgeInstances);

    set({
      nodes: updatedNodes,
      edges: updatedEdges,
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
      isDirty: true,
      validationReport: report,
    });

    get().addLog('info', `Deleted node ID "${nodeId}"`);
  },

  deleteEdge: (edgeId: string) => {
    const updatedEdges = get().edges.filter((e) => e.id !== edgeId);
    const { nodeInstances, edgeInstances } = extractPipelineInstances(get().nodes, updatedEdges);
    const report = validatePipeline(nodeInstances, edgeInstances);

    set({
      edges: updatedEdges,
      isDirty: true,
      validationReport: report,
    });

    get().addLog('info', `Deleted edge ID "${edgeId}"`);
  },

  updatePipelineMeta: (meta: Partial<{ name: string; description: string }>) => {
    set((state) => ({
      pipelineMeta: {
        ...state.pipelineMeta,
        ...meta,
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    }));
  },

  setActiveBottomTab: (tab: 'validation' | 'logs' | 'json') => {
    set({ activeBottomTab: tab });
  },

  addLog: (level: 'info' | 'warn' | 'error', message: string) => {
    const entry: LogEntry = {
      id: generateId('log'),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    set((state) => ({
      logMessages: [entry, ...state.logMessages.slice(0, 99)],
    }));
  },

  clearLogs: () => {
    set({ logMessages: [] });
  },

  newPipeline: () => {
    const now = new Date().toISOString();
    const newMeta = {
      id: 'pipeline_' + Math.random().toString(36).substring(2, 9),
      name: 'Untitled Pipeline',
      description: '',
      createdAt: now,
      updatedAt: now,
    };

    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      pipelineMeta: newMeta,
      isDirty: false,
      validationReport: validatePipeline([], []),
    });

    get().addLog('info', 'Created new empty pipeline canvas.');
  },

  loadPipeline: (pipelineJson: unknown) => {
    // 1. Validate structure through Zod PipelineDefinitionSchema
    const parseResult = PipelineDefinitionSchema.safeParse(pipelineJson);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors
        .map((e) => `${e.path.join('.') || 'root'}: ${e.message}`)
        .join('; ');
      get().addLog('error', `Failed to load pipeline: ${errorMsg}`);
      return {
        success: false,
        error: `Pipeline format mismatch: ${errorMsg}`,
      };
    }

    const data = parseResult.data;

    // 2. Convert to React Flow nodes and edges
    const rfNodes: Node[] = data.nodes.map((node: PipelineNodeInstance) => {
      const contract = getNodeContract(node.nodeType);
      return {
        id: node.id,
        type: 'customPipelineNode',
        position: { x: node.position.x, y: node.position.y },
        data: {
          nodeType: node.nodeType,
          name: node.name,
          config: { ...(contract?.defaultConfig || {}), ...(node.config || {}) },
        },
      };
    });

    const rfEdges: Edge[] = data.edges.map((edge: PipelineEdge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      sourceHandle: edge.sourcePortId,
      targetHandle: edge.targetPortId,
      type: 'smoothstep',
      animated: true,
    }));

    // 3. Validate logical graph
    const { nodeInstances, edgeInstances } = extractPipelineInstances(rfNodes, rfEdges);
    const report = validatePipeline(nodeInstances, edgeInstances);

    set({
      nodes: rfNodes,
      edges: rfEdges,
      selectedNodeId: null,
      pipelineMeta: {
        id: data.id,
        name: data.name,
        description: data.description,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
      isDirty: false,
      validationReport: report,
    });

    get().addLog(
      'info',
      `Loaded pipeline "${data.name}" (${rfNodes.length} nodes, ${rfEdges.length} connections).`
    );

    return { success: true };
  },

  exportPipeline: (): PipelineDefinition => {
    const { nodes, edges, pipelineMeta } = get();
    const { nodeInstances, edgeInstances } = extractPipelineInstances(nodes, edges);

    const definition: PipelineDefinition = {
      schemaVersion: '1.0.0',
      id: pipelineMeta.id,
      name: pipelineMeta.name,
      description: pipelineMeta.description || '',
      createdAt: pipelineMeta.createdAt,
      updatedAt: new Date().toISOString(),
      metadata: {},
      nodes: nodeInstances,
      edges: edgeInstances,
    };

    return definition;
  },

  savePipelineFile: async () => {
    const definition = get().exportPipeline();
    const jsonStr = JSON.stringify(definition, null, 2);
    const defaultFilename = `${(definition.name || 'pipeline').toLowerCase().replace(/\s+/g, '_')}.json`;

    if (typeof window !== 'undefined' && window.electronAPI?.savePipelineFile) {
      try {
        const res = await window.electronAPI.savePipelineFile(defaultFilename, jsonStr);
        if (res.success) {
          set({
            isDirty: false,
            lastSavedAt: new Date().toLocaleTimeString(),
          });
          get().addLog('info', `Saved pipeline to file: ${res.filePath}`);
        } else if (!res.canceled && res.error) {
          get().addLog('error', `Failed to save file: ${res.error}`);
        }
        return res;
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        get().addLog('error', `Error saving file: ${error}`);
        return { success: false, error };
      }
    } else {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        set({
          isDirty: false,
          lastSavedAt: new Date().toLocaleTimeString(),
        });
        get().addLog('info', `Exported pipeline JSON: ${defaultFilename}`);
        return { success: true, filePath: defaultFilename };
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, error };
      }
    }
  },

  openPipelineFile: async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.openPipelineFile) {
      try {
        const res = await window.electronAPI.openPipelineFile();
        if (res.canceled) {
          return { success: false, canceled: true };
        }
        if (!res.success || !res.content) {
          get().addLog('error', res.error || 'Failed to read pipeline file');
          return { success: false, error: res.error || 'Could not read file' };
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(res.content);
        } catch {
          get().addLog('error', 'File does not contain valid JSON syntax.');
          return { success: false, error: 'File is not a valid JSON string.' };
        }

        const loadRes = get().loadPipeline(parsed);
        return loadRes;
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        get().addLog('error', `Error opening file: ${error}`);
        return { success: false, error };
      }
    } else {
      return new Promise<{ success: boolean; canceled?: boolean; error?: string }>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = (e: Event) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) {
            resolve({ success: false, canceled: true });
            return;
          }

          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const text = event.target?.result as string;
              const parsed = JSON.parse(text);
              const loadRes = get().loadPipeline(parsed);
              resolve(loadRes);
            } catch {
              get().addLog('error', 'Uploaded file is not valid JSON.');
              resolve({ success: false, error: 'Invalid JSON file format' });
            }
          };
          reader.onerror = () => {
            resolve({ success: false, error: 'Failed to read file' });
          };
          reader.readAsText(file);
        };
        input.click();
      });
    }
  },
}));
