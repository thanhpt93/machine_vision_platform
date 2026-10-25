import React, { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  Connection,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { usePipelineStore } from '../store/pipelineStore';
import { useThemeStore } from '../../store/themeStore';
import { CustomPipelineNode } from './CustomPipelineNode';
import { validateNewConnection } from '../validator/pipelineValidator';
import { PipelineNodeInstance, PipelineEdge } from '@/shared/contracts';

const nodeTypes = {
  customPipelineNode: CustomPipelineNode,
};

const PipelineCanvasInner: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const theme = useThemeStore((state) => state.theme);

  const nodes = usePipelineStore((state) => state.nodes);
  const edges = usePipelineStore((state) => state.edges);
  const onNodesChange = usePipelineStore((state) => state.onNodesChange);
  const onEdgesChange = usePipelineStore((state) => state.onEdgesChange);
  const onConnect = usePipelineStore((state) => state.onConnect);
  const onReconnect = usePipelineStore((state) => state.onReconnect);
  const selectNode = usePipelineStore((state) => state.selectNode);
  const addNode = usePipelineStore((state) => state.addNode);
  const deleteNode = usePipelineStore((state) => state.deleteNode);
  const deleteEdge = usePipelineStore((state) => state.deleteEdge);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
        return false;
      }

      const nodeInstances: PipelineNodeInstance[] = nodes.map((n) => ({
        id: n.id,
        nodeType: (n.data as any).nodeType,
        name: (n.data as any).name,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        config: (n.data as any).config || {},
      }));

      // Allow dragging a new wire into an already-occupied target port (auto-replace)
      const edgeInstances: PipelineEdge[] = edges
        .filter(
          (e) =>
            !(
              e.target === connection.target &&
              e.targetHandle === connection.targetHandle &&
              (e.source !== connection.source || e.sourceHandle !== connection.sourceHandle)
            )
        )
        .map((e) => ({
          id: e.id,
          sourceNodeId: e.source,
          sourcePortId: e.sourceHandle || '',
          targetNodeId: e.target,
          targetPortId: e.targetHandle || '',
        }));

      const check = validateNewConnection(
        connection.source,
        connection.sourceHandle,
        connection.target,
        connection.targetHandle,
        nodeInstances,
        edgeInstances
      );

      return check.allowed;
    },
    [nodes, edges]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/reactflow/nodetype');
      if (!nodeType) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(nodeType, position);
    },
    [screenToFlowPosition, addNode]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const handleEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      deleteEdge(edge.id);
    },
    [deleteEdge]
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNode = nodes.find((n) => n.selected);
        if (selectedNode) {
          deleteNode(selectedNode.id);
        }
        const selectedEdge = edges.find((e) => e.selected);
        if (selectedEdge) {
          deleteEdge(selectedEdge.id);
        }
      }
    },
    [nodes, edges, deleteNode, deleteEdge]
  );

  return (
    <div
      ref={reactFlowWrapper}
      className="flex-1 h-full w-full bg-slate-100 dark:bg-slate-950 relative outline-none transition-colors"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        edgesReconnectable
        onNodeClick={handleNodeClick}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onPaneClick={handlePaneClick}
        isValidConnection={isValidConnection}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: theme === 'dark' ? '#06b6d4' : '#0284c7', strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color={theme === 'dark' ? '#334155' : '#94a3b8'}
        />
        <Controls
          className="!bg-white dark:!bg-slate-900 !border-slate-300 dark:!border-slate-800 !shadow-lg fill-slate-700 dark:fill-slate-300 [&>button]:!bg-white dark:[&>button]:!bg-slate-900 [&>button]:!border-slate-200 dark:[&>button]:!border-slate-800 [&>button]:hover:!bg-slate-100 dark:[&>button]:hover:!bg-slate-800 [&>button]:!text-slate-700 dark:[&>button]:!text-slate-300"
          showInteractive={false}
        />
        <MiniMap
          nodeColor={theme === 'dark' ? '#0284c7' : '#0ea5e9'}
          maskColor={theme === 'dark' ? 'rgba(2, 6, 23, 0.75)' : 'rgba(241, 245, 249, 0.75)'}
          className="!bg-white/90 dark:!bg-slate-950/80 !border !border-slate-300 dark:!border-slate-800 !rounded-lg !shadow-sm"
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  );
};

export const PipelineCanvas: React.FC = () => {
  return (
    <ReactFlowProvider>
      <PipelineCanvasInner />
    </ReactFlowProvider>
  );
};
