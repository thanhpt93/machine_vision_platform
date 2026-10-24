import { PipelineEdge, PipelineNodeInstance } from '@/shared/contracts';
import { getNodeContract } from '../registry/nodeRegistry';

export interface ValidationError {
  type: 'NODE_ERROR' | 'EDGE_ERROR' | 'CYCLE_ERROR' | 'CONFIG_ERROR' | 'PORT_ERROR';
  nodeId?: string;
  edgeId?: string;
  portId?: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  isValid: boolean;
  canSave: boolean;
  canExecute: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  cycleNodes?: string[];
  topologicalOrder?: string[];
}

export function validatePipeline(
  nodes: PipelineNodeInstance[],
  edges: PipelineEdge[]
): ValidationReport {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Check Node ID uniqueness
  const nodeIdSet = new Set<string>();
  const duplicateNodeIds = new Set<string>();
  for (const node of nodes) {
    if (!node.id || node.id.trim() === '') {
      errors.push({
        type: 'NODE_ERROR',
        nodeId: node.id,
        message: 'Node has empty or invalid ID',
        severity: 'error',
      });
      continue;
    }
    if (nodeIdSet.has(node.id)) {
      duplicateNodeIds.add(node.id);
    } else {
      nodeIdSet.add(node.id);
    }
  }

  duplicateNodeIds.forEach((id) => {
    errors.push({
      type: 'NODE_ERROR',
      nodeId: id,
      message: `Duplicate Node ID detected: "${id}"`,
      severity: 'error',
    });
  });

  // Map of nodes for quick lookup
  const nodeMap = new Map<string, PipelineNodeInstance>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // 2. Validate Node Contracts & Configs
  for (const node of nodes) {
    const contract = getNodeContract(node.nodeType);
    if (!contract) {
      errors.push({
        type: 'NODE_ERROR',
        nodeId: node.id,
        message: `Unknown node type "${node.nodeType}" on node "${node.name}"`,
        severity: 'error',
      });
      continue;
    }

    // Validate config against Zod schema
    const configResult = contract.configSchema.safeParse(node.config || {});
    if (!configResult.success) {
      configResult.error.errors.forEach((err) => {
        const fieldName = err.path.join('.') || 'config';
        errors.push({
          type: 'CONFIG_ERROR',
          nodeId: node.id,
          field: fieldName,
          message: `[${node.name}] Invalid "${fieldName}": ${err.message}`,
          severity: 'error',
        });
      });
    }
  }

  // 3. Validate Edges
  const targetPortConnections = new Map<string, string[]>(); // key: `${nodeId}:${portId}`, value: edgeIds
  const validEdges: PipelineEdge[] = [];

  for (const edge of edges) {
    // Check self-loop
    if (edge.sourceNodeId === edge.targetNodeId) {
      errors.push({
        type: 'EDGE_ERROR',
        edgeId: edge.id,
        nodeId: edge.sourceNodeId,
        message: `Self-connection detected on node "${edge.sourceNodeId}"`,
        severity: 'error',
      });
      continue;
    }

    // Check source node exists
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    if (!sourceNode) {
      errors.push({
        type: 'EDGE_ERROR',
        edgeId: edge.id,
        message: `Edge references non-existent source node "${edge.sourceNodeId}"`,
        severity: 'error',
      });
      continue;
    }

    // Check target node exists
    const targetNode = nodeMap.get(edge.targetNodeId);
    if (!targetNode) {
      errors.push({
        type: 'EDGE_ERROR',
        edgeId: edge.id,
        message: `Edge references non-existent target node "${edge.targetNodeId}"`,
        severity: 'error',
      });
      continue;
    }

    const sourceContract = getNodeContract(sourceNode.nodeType);
    const targetContract = getNodeContract(targetNode.nodeType);

    if (!sourceContract || !targetContract) {
      continue;
    }

    const sourcePort = sourceContract.outputs.find((p) => p.id === edge.sourcePortId);
    if (!sourcePort) {
      errors.push({
        type: 'PORT_ERROR',
        edgeId: edge.id,
        nodeId: sourceNode.id,
        portId: edge.sourcePortId,
        message: `Source node "${sourceNode.name}" does not have output port "${edge.sourcePortId}"`,
        severity: 'error',
      });
      continue;
    }

    const targetPort = targetContract.inputs.find((p) => p.id === edge.targetPortId);
    if (!targetPort) {
      errors.push({
        type: 'PORT_ERROR',
        edgeId: edge.id,
        nodeId: targetNode.id,
        portId: edge.targetPortId,
        message: `Target node "${targetNode.name}" does not have input port "${edge.targetPortId}"`,
        severity: 'error',
      });
      continue;
    }

    // Check data type compatibility
    if (sourcePort.dataType !== targetPort.dataType) {
      errors.push({
        type: 'EDGE_ERROR',
        edgeId: edge.id,
        message: `Type mismatch on edge from "${sourceNode.name}.${sourcePort.name}" (${sourcePort.dataType}) to "${targetNode.name}.${targetPort.name}" (${targetPort.dataType})`,
        severity: 'error',
      });
      continue;
    }

    // Check multiple connections to single input port
    const targetKey = `${edge.targetNodeId}:${edge.targetPortId}`;
    const existing = targetPortConnections.get(targetKey) || [];
    existing.push(edge.id);
    targetPortConnections.set(targetKey, existing);

    if (existing.length > 1) {
      errors.push({
        type: 'PORT_ERROR',
        edgeId: edge.id,
        nodeId: targetNode.id,
        portId: edge.targetPortId,
        message: `Input port "${targetPort.name}" on node "${targetNode.name}" cannot accept multiple inputs`,
        severity: 'error',
      });
    }

    validEdges.push(edge);
  }

  // 4. Check Required Inputs
  for (const node of nodes) {
    const contract = getNodeContract(node.nodeType);
    if (!contract) continue;

    for (const inputPort of contract.inputs) {
      const isConnected = edges.some(
        (e) => e.targetNodeId === node.id && e.targetPortId === inputPort.id
      );

      if (!isConnected) {
        if (inputPort.required) {
          warnings.push({
            type: 'PORT_ERROR',
            nodeId: node.id,
            portId: inputPort.id,
            message: `Required input "${inputPort.name}" on node "${node.name}" is not connected`,
            severity: 'warning',
          });
        }
      }
    }
  }

  // 5. Cycle Detection & Topological Sort (Kahn's / DFS DAG verification)
  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => adjacency.set(n.id, []));

  validEdges.forEach((e) => {
    if (adjacency.has(e.sourceNodeId)) {
      adjacency.get(e.sourceNodeId)!.push(e.targetNodeId);
    }
  });

  const state = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
  nodes.forEach((n) => state.set(n.id, 0));

  let hasCycle = false;
  const cycleNodes = new Set<string>();
  const postOrder: string[] = [];

  function dfs(u: string, path: string[]) {
    state.set(u, 1);
    const neighbors = adjacency.get(u) || [];

    for (const v of neighbors) {
      const st = state.get(v) || 0;
      if (st === 1) {
        // Cycle detected
        hasCycle = true;
        const cycleStartIndex = path.indexOf(v);
        const subPath = cycleStartIndex >= 0 ? path.slice(cycleStartIndex) : path;
        subPath.forEach((id) => cycleNodes.add(id));
        cycleNodes.add(v);
        errors.push({
          type: 'CYCLE_ERROR',
          nodeId: v,
          message: `Cycle detected involving node "${nodeMap.get(v)?.name || v}"`,
          severity: 'error',
        });
      } else if (st === 0) {
        dfs(v, [...path, v]);
      }
    }

    state.set(u, 2);
    postOrder.push(u);
  }

  for (const node of nodes) {
    if ((state.get(node.id) || 0) === 0) {
      dfs(node.id, [node.id]);
    }
  }

  const topologicalOrder = hasCycle ? undefined : [...postOrder].reverse();

  // Determine canSave vs canExecute
  const hasFatalErrors = errors.some(
    (e) => e.type === 'NODE_ERROR' && e.message.includes('Duplicate')
  );
  const canSave = !hasFatalErrors;

  const hasMissingRequiredInputs = warnings.some(
    (w) => w.type === 'PORT_ERROR' && w.severity === 'warning'
  );

  const canExecute =
    nodes.length > 0 &&
    errors.length === 0 &&
    !hasMissingRequiredInputs &&
    !hasCycle &&
    topologicalOrder !== undefined;

  return {
    isValid: errors.length === 0,
    canSave,
    canExecute,
    errors,
    warnings,
    cycleNodes: hasCycle ? Array.from(cycleNodes) : undefined,
    topologicalOrder,
  };
}

export function validateNewConnection(
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
  nodes: PipelineNodeInstance[],
  existingEdges: PipelineEdge[]
): { allowed: boolean; reason?: string } {
  if (sourceNodeId === targetNodeId) {
    return { allowed: false, reason: 'Cannot connect a node to itself.' };
  }

  const sourceNode = nodes.find((n) => n.id === sourceNodeId);
  const targetNode = nodes.find((n) => n.id === targetNodeId);

  if (!sourceNode || !targetNode) {
    return { allowed: false, reason: 'Source or target node not found.' };
  }

  const sourceContract = getNodeContract(sourceNode.nodeType);
  const targetContract = getNodeContract(targetNode.nodeType);

  if (!sourceContract || !targetContract) {
    return { allowed: false, reason: 'Node definition contract not found.' };
  }

  const sourcePort = sourceContract.outputs.find((p) => p.id === sourcePortId);
  const targetPort = targetContract.inputs.find((p) => p.id === targetPortId);

  if (!sourcePort || !targetPort) {
    return { allowed: false, reason: 'Invalid port reference.' };
  }

  if (sourcePort.dataType !== targetPort.dataType) {
    return {
      allowed: false,
      reason: `Type mismatch: cannot connect ${sourcePort.dataType} output to ${targetPort.dataType} input.`,
    };
  }

  // Check if target input port already has an incoming edge
  const alreadyConnected = existingEdges.some(
    (e) => e.targetNodeId === targetNodeId && e.targetPortId === targetPortId
  );
  if (alreadyConnected) {
    return {
      allowed: false,
      reason: `Target port "${targetPort.name}" already has an incoming connection.`,
    };
  }

  // Tentative cycle check
  const simulatedEdges: PipelineEdge[] = [
    ...existingEdges,
    {
      id: 'tentative',
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
    },
  ];

  const report = validatePipeline(nodes, simulatedEdges);
  if (report.cycleNodes && report.cycleNodes.length > 0) {
    return {
      allowed: false,
      reason: 'Connection rejected: creating this link would introduce a directed cycle (DAG violation).',
    };
  }

  return { allowed: true };
}
