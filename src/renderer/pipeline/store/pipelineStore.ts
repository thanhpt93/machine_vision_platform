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
import { getNodeContract } from '../registry/nodeRegistry';
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

export interface NodeExecutionState {
  nodeId: string;
  nodeType: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string | null;
  outputMetadata?: Record<string, any>;
  hasPreview?: boolean;
  previewUrl?: string | null;
  structuredResult?: Record<string, any> | null;
}

export interface ExecutionSummary {
  executionId: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  totalDurationMs: number;
  nodesExecuted: number;
  error?: string | null;
  executedAt?: string;
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
    metadata?: Record<string, any>;
  };
  isDirty: boolean;
  currentFilePath: string | null;

  // Validation & Logs
  validationReport: ValidationReport;
  logMessages: LogEntry[];
  activeBottomTab: 'validation' | 'logs' | 'json';
  lastSavedAt: string | null;

  // Phase 3 Real OpenCV Execution State
  executionSummary: ExecutionSummary | null;
  nodeExecutionStates: Record<string, NodeExecutionState>;
  isExecuting: boolean;
  runtimeUrl: string;

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

  // Real Execution Engine Actions
  runPipeline: () => Promise<boolean>;
  clearExecution: () => void;

  // Pipeline Lifecycle
  newPipeline: () => void;
  loadPipeline: (pipelineJson: unknown, filePath?: string) => { success: boolean; error?: string };
  exportPipeline: () => PipelineDefinition;
  savePipelineFile: (isSaveAs?: boolean) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  saveAsPipelineFile: () => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
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

  // 6-Node Starter Flow: Image -> ROI Crop -> Grayscale -> Threshold -> Contour -> Result Viewer
  const imgNodeId = 'node_image_file_1';
  const cropNodeId = 'node_roi_crop_1';
  const grayNodeId = 'node_grayscale_1';
  const threshNodeId = 'node_threshold_1';
  const contourNodeId = 'node_contour_1';
  const viewerNodeId = 'node_result_viewer_1';

  const starterNodes: Node[] = [
    {
      id: imgNodeId,
      type: 'customPipelineNode',
      position: { x: 50, y: 150 },
      data: {
        nodeType: 'image_file',
        name: 'Image Source',
        config: { filePath: 'sample_images/pcb_board.png' },
      },
    },
    {
      id: cropNodeId,
      type: 'customPipelineNode',
      position: { x: 330, y: 150 },
      data: {
        nodeType: 'roi_crop',
        name: 'ROI Crop',
        config: { x: 50, y: 50, width: 350, height: 250 },
      },
    },
    {
      id: grayNodeId,
      type: 'customPipelineNode',
      position: { x: 610, y: 150 },
      data: {
        nodeType: 'grayscale',
        name: 'Grayscale',
        config: { equalizeHist: false },
      },
    },
    {
      id: threshNodeId,
      type: 'customPipelineNode',
      position: { x: 890, y: 150 },
      data: {
        nodeType: 'threshold',
        name: 'Threshold',
        config: { threshold: 128, mode: 'BINARY', maxVal: 255 },
      },
    },
    {
      id: contourNodeId,
      type: 'customPipelineNode',
      position: { x: 1170, y: 150 },
      data: {
        nodeType: 'contour_detection',
        name: 'Contour Detection',
        config: { mode: 'RETR_EXTERNAL', method: 'CHAIN_APPROX_SIMPLE', minArea: 50, maxArea: 500000, drawBoundingBoxes: true },
      },
    },
    {
      id: viewerNodeId,
      type: 'customPipelineNode',
      position: { x: 1470, y: 150 },
      data: {
        nodeType: 'result_viewer',
        name: 'Result Viewer',
        config: { title: 'PCB Inspection Output', showOverlay: true, showHistogram: false, zoomLevel: 1.0 },
      },
    },
  ];

  const starterEdges: Edge[] = [
    {
      id: 'edge_img_crop',
      source: imgNodeId,
      sourceHandle: 'image',
      target: cropNodeId,
      targetHandle: 'image_in',
      type: 'smoothstep',
      animated: true,
    },
    {
      id: 'edge_crop_gray',
      source: cropNodeId,
      sourceHandle: 'image_out',
      target: grayNodeId,
      targetHandle: 'image_in',
      type: 'smoothstep',
      animated: true,
    },
    {
      id: 'edge_gray_thresh',
      source: grayNodeId,
      sourceHandle: 'image_out',
      target: threshNodeId,
      targetHandle: 'image_in',
      type: 'smoothstep',
      animated: true,
    },
    {
      id: 'edge_thresh_contour',
      source: threshNodeId,
      sourceHandle: 'image_out',
      target: contourNodeId,
      targetHandle: 'mask_in',
      type: 'smoothstep',
      animated: true,
    },
    {
      id: 'edge_contour_viewer_img',
      source: contourNodeId,
      sourceHandle: 'image_out',
      target: viewerNodeId,
      targetHandle: 'image_in',
      type: 'smoothstep',
      animated: true,
    },
    {
      id: 'edge_contour_viewer_det',
      source: contourNodeId,
      sourceHandle: 'detections',
      target: viewerNodeId,
      targetHandle: 'detections_in',
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
      name: 'PCB Inspection Pipeline (OpenCV)',
      description: 'End-to-end vision pipeline: Image -> Crop -> Grayscale -> Threshold -> Contour -> Viewer',
      createdAt: now,
      updatedAt: now,
      metadata: {},
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
  currentFilePath: null,
  validationReport: initial.validation,
  logMessages: [
    {
      id: generateId('log'),
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'Pipeline Editor initialized with 6-node OpenCV inspection template.',
    },
  ],
  activeBottomTab: 'validation',
  lastSavedAt: null,

  // Real Execution State
  executionSummary: null,
  nodeExecutionStates: {},
  isExecuting: false,
  runtimeUrl: 'http://127.0.0.1:8000',

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

  // Real Execution Engine Action
  runPipeline: async () => {
    const { nodes, validationReport, runtimeUrl, isExecuting } = get();
    if (isExecuting) return false;

    if (!validationReport.isValid) {
      get().addLog('error', 'Cannot run pipeline: Canvas contains critical validation errors. Fix before running.');
      return false;
    }

    const definition = get().exportPipeline();

    // Mark running state
    set({
      isExecuting: true,
      executionSummary: {
        executionId: '',
        status: 'running',
        totalDurationMs: 0,
        nodesExecuted: 0,
      },
    });

    // Reset node states to running
    const runningNodeStates: Record<string, NodeExecutionState> = {};
    nodes.forEach((n) => {
      runningNodeStates[n.id] = {
        nodeId: n.id,
        nodeType: (n.data as any).nodeType,
        status: 'running',
        durationMs: 0,
      };
    });
    set({ nodeExecutionStates: runningNodeStates });
    get().addLog('info', `Sending pipeline "${definition.name}" to Python Vision Runtime (${runtimeUrl})...`);

    try {
      const response = await fetch(`${runtimeUrl}/api/pipeline/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline: definition }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Runtime returned HTTP ${response.status}: ${errorText}`);
      }

      const resData = await response.json();
      const rawResults = resData.node_results || {};
      const updatedStates: Record<string, NodeExecutionState> = {};

      Object.entries(rawResults).forEach(([nId, item]: [string, any]) => {
        const previewUrl = item.has_preview && item.preview_url
          ? `${runtimeUrl}${item.preview_url}`
          : null;

        updatedStates[nId] = {
          nodeId: nId,
          nodeType: item.node_type,
          status: item.status,
          durationMs: item.duration_ms,
          error: item.error,
          outputMetadata: item.output_metadata,
          hasPreview: item.has_preview,
          previewUrl,
          structuredResult: item.structured_result,
        };
      });

      const isSuccess = resData.status === 'completed';

      set({
        isExecuting: false,
        nodeExecutionStates: updatedStates,
        executionSummary: {
          executionId: resData.execution_id,
          status: resData.status,
          totalDurationMs: resData.total_duration_ms,
          nodesExecuted: resData.nodes_executed,
          error: resData.error,
          executedAt: new Date().toLocaleTimeString(),
        },
      });

      if (isSuccess) {
        get().addLog(
          'info',
          `✓ Pipeline executed successfully in ${resData.total_duration_ms}ms (${resData.nodes_executed} nodes executed).`
        );
      } else {
        get().addLog('error', `Pipeline execution failed: ${resData.error || 'Unknown runtime error'}`);
      }

      return isSuccess;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const failedStates: Record<string, NodeExecutionState> = {};
      nodes.forEach((n) => {
        failedStates[n.id] = {
          nodeId: n.id,
          nodeType: (n.data as any).nodeType,
          status: 'failed',
          durationMs: 0,
          error: errMsg,
        };
      });

      set({
        isExecuting: false,
        nodeExecutionStates: failedStates,
        executionSummary: {
          executionId: '',
          status: 'failed',
          totalDurationMs: 0,
          nodesExecuted: 0,
          error: `Cannot connect to Python Vision Runtime: ${errMsg}`,
          executedAt: new Date().toLocaleTimeString(),
        },
      });

      get().addLog(
        'error',
        `Python Runtime connection failed (${runtimeUrl}). Start runtime with "npm run py:start". Error: ${errMsg}`
      );
      return false;
    }
  },

  clearExecution: () => {
    set({
      executionSummary: null,
      nodeExecutionStates: {},
      isExecuting: false,
    });
    get().addLog('info', 'Cleared execution state.');
  },

  newPipeline: () => {
    const now = new Date().toISOString();
    const newMeta = {
      id: 'pipeline_' + Math.random().toString(36).substring(2, 9),
      name: 'Untitled Pipeline',
      description: '',
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };

    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      pipelineMeta: newMeta,
      isDirty: false,
      currentFilePath: null,
      executionSummary: null,
      nodeExecutionStates: {},
      isExecuting: false,
      validationReport: validatePipeline([], []),
    });

    get().addLog('info', 'Created new empty pipeline canvas.');
  },

  loadPipeline: (pipelineJson: unknown, filePath?: string) => {
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

    // 2. Convert to React Flow nodes and edges (Preserving unsupported/unknown configs)
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
      currentFilePath: filePath || null,
      pipelineMeta: {
        id: data.id,
        name: data.name,
        description: data.description,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        metadata: data.metadata || {},
      },
      isDirty: false,
      executionSummary: null,
      nodeExecutionStates: {},
      isExecuting: false,
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
      fileFormat: 'MVP_PIPELINE',
      schemaVersion: '1.0.0',
      id: pipelineMeta.id,
      name: pipelineMeta.name,
      description: pipelineMeta.description || '',
      createdAt: pipelineMeta.createdAt,
      updatedAt: new Date().toISOString(),
      metadata: pipelineMeta.metadata || {},
      nodes: nodeInstances,
      edges: edgeInstances,
    };

    return definition;
  },

  savePipelineFile: async (isSaveAs: boolean = false) => {
    const definition = get().exportPipeline();
    const jsonStr = JSON.stringify(definition, null, 2);
    const defaultFilename = `${(definition.name || 'pipeline').toLowerCase().replace(/\s+/g, '_')}.mvp`;
    const { currentFilePath } = get();

    // If Electron native dialog is available
    if (typeof window !== 'undefined' && window.electronAPI?.savePipelineFile) {
      try {
        const targetPath = !isSaveAs && currentFilePath ? currentFilePath : undefined;
        const res = await window.electronAPI.savePipelineFile(defaultFilename, jsonStr, targetPath);
        if (res.success && res.filePath) {
          set({
            isDirty: false,
            currentFilePath: res.filePath,
            lastSavedAt: new Date().toLocaleTimeString(),
          });
          get().addLog('info', `Saved pipeline (.mvp) to file: ${res.filePath}`);
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
      // Browser fallback (download link)
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
          currentFilePath: defaultFilename,
          lastSavedAt: new Date().toLocaleTimeString(),
        });
        get().addLog('info', `Exported pipeline (.mvp): ${defaultFilename}`);
        return { success: true, filePath: defaultFilename };
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, error };
      }
    }
  },

  saveAsPipelineFile: async () => {
    return get().savePipelineFile(true);
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
          return { success: false, error: 'File is not a valid JSON/MVP string.' };
        }

        const loadRes = get().loadPipeline(parsed, res.filePath);
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
        input.accept = '.mvp,.json,application/json';
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
              const loadRes = get().loadPipeline(parsed, file.name);
              resolve(loadRes);
            } catch {
              get().addLog('error', 'Uploaded file is not valid JSON/MVP.');
              resolve({ success: false, error: 'Invalid file format' });
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
