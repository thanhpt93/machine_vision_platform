import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
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
import { Trash2 } from 'lucide-react';

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
  const deleteNodes = usePipelineStore((state) => state.deleteNodes);
  const deleteEdge = usePipelineStore((state) => state.deleteEdge);

  // Right-click Area Sweep-to-Delete state
  const [sweepBox, setSweepBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
  }>({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    active: false,
  });

  const isRightDraggingRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Calculate nodes currently inside the sweep box in real-time
  const intersectingNodeIds = useMemo(() => {
    if (!sweepBox.active) return new Set<string>();
    const dx = Math.abs(sweepBox.currentX - sweepBox.startX);
    const dy = Math.abs(sweepBox.currentY - sweepBox.startY);
    if (dx <= 10 || dy <= 10) return new Set<string>();

    const x1 = Math.min(sweepBox.startX, sweepBox.currentX);
    const y1 = Math.min(sweepBox.startY, sweepBox.currentY);
    const x2 = Math.max(sweepBox.startX, sweepBox.currentX);
    const y2 = Math.max(sweepBox.startY, sweepBox.currentY);

    const selStartFlow = screenToFlowPosition({ x: x1, y: y1 });
    const selEndFlow = screenToFlowPosition({ x: x2, y: y2 });

    const selX1 = selStartFlow.x;
    const selY1 = selStartFlow.y;
    const selX2 = selEndFlow.x;
    const selY2 = selEndFlow.y;

    const ids = new Set<string>();
    for (const node of nodes) {
      const nodeX1 = node.position.x;
      const nodeY1 = node.position.y;
      const nodeW = (node.measured?.width ?? (node as any).width) || 220;
      const nodeH = (node.measured?.height ?? (node as any).height) || 120;
      const nodeX2 = nodeX1 + nodeW;
      const nodeY2 = nodeY1 + nodeH;

      // Check for AABB intersection
      const overlaps = !(nodeX2 < selX1 || nodeX1 > selX2 || nodeY2 < selY1 || nodeY1 > selY2);
      if (overlaps) {
        ids.add(node.id);
      }
    }
    return ids;
  }, [sweepBox, nodes, screenToFlowPosition]);

  // Visually highlight swept nodes in real-time via DOM outline without triggering component re-renders
  useEffect(() => {
    if (!reactFlowWrapper.current) return;
    const nodeEls = reactFlowWrapper.current.querySelectorAll<HTMLElement>('.react-flow__node');
    nodeEls.forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id && intersectingNodeIds.has(id)) {
        el.style.outline = '3px dashed #f43f5e';
        el.style.outlineOffset = '3px';
        el.style.borderRadius = '8px';
        el.style.transition = 'outline 0.1s ease';
      } else {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.transition = '';
      }
    });

    return () => {
      if (!reactFlowWrapper.current) return;
      const nodeEls = reactFlowWrapper.current.querySelectorAll<HTMLElement>('.react-flow__node');
      nodeEls.forEach((el) => {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.transition = '';
      });
    };
  }, [intersectingNodeIds]);

  // Window listeners for smooth right-click drag & release even when cursor leaves canvas
  useEffect(() => {
    if (!sweepBox.active) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isRightDraggingRef.current) return;
      setSweepBox((prev) => ({
        ...prev,
        currentX: e.clientX,
        currentY: e.clientY,
      }));
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2 || isRightDraggingRef.current) {
        if (!isRightDraggingRef.current) return;
        isRightDraggingRef.current = false;

        const dx = Math.abs(e.clientX - startPosRef.current.x);
        const dy = Math.abs(e.clientY - startPosRef.current.y);

        // Swept area threshold (at least 10px by 10px)
        if (dx > 10 && dy > 10) {
          const x1 = Math.min(startPosRef.current.x, e.clientX);
          const y1 = Math.min(startPosRef.current.y, e.clientY);
          const x2 = Math.max(startPosRef.current.x, e.clientX);
          const y2 = Math.max(startPosRef.current.y, e.clientY);

          const selStartFlow = screenToFlowPosition({ x: x1, y: y1 });
          const selEndFlow = screenToFlowPosition({ x: x2, y: y2 });

          const selX1 = selStartFlow.x;
          const selY1 = selStartFlow.y;
          const selX2 = selEndFlow.x;
          const selY2 = selEndFlow.y;

          const currentNodes = usePipelineStore.getState().nodes;
          const toDeleteIds: string[] = [];

          for (const node of currentNodes) {
            const nodeX1 = node.position.x;
            const nodeY1 = node.position.y;
            const nodeW = (node.measured?.width ?? (node as any).width) || 220;
            const nodeH = (node.measured?.height ?? (node as any).height) || 120;
            const nodeX2 = nodeX1 + nodeW;
            const nodeY2 = nodeY1 + nodeH;

            const overlaps = !(nodeX2 < selX1 || nodeX1 > selX2 || nodeY2 < selY1 || nodeY1 > selY2);
            if (overlaps) {
              toDeleteIds.push(node.id);
            }
          }

          if (toDeleteIds.length > 0) {
            deleteNodes(toDeleteIds);
          }
        }

        setSweepBox((prev) => ({ ...prev, active: false }));
      }
    };

    const handleContextMenuWindow = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenuWindow);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenuWindow);
    };
  }, [sweepBox.active, screenToFlowPosition, deleteNodes]);

  const handleMouseDownCapture = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      isRightDraggingRef.current = true;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      setSweepBox({
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        active: true,
      });
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

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
      onMouseDownCapture={handleMouseDownCapture}
      onContextMenu={handleContextMenu}
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
          className="!bg-white/90 dark:!bg-slate-950/80 !border !border-slate-300 dark:border-slate-800 !rounded-lg !shadow-sm"
          zoomable
          pannable
        />
      </ReactFlow>

      {/* Right-click Drag Selection / Sweep-to-Delete Overlay Box */}
      {sweepBox.active && (Math.abs(sweepBox.currentX - sweepBox.startX) > 8 || Math.abs(sweepBox.currentY - sweepBox.startY) > 8) && reactFlowWrapper.current && (() => {
        const rect = reactFlowWrapper.current.getBoundingClientRect();
        const left = Math.min(sweepBox.startX, sweepBox.currentX) - rect.left;
        const top = Math.min(sweepBox.startY, sweepBox.currentY) - rect.top;
        const width = Math.abs(sweepBox.currentX - sweepBox.startX);
        const height = Math.abs(sweepBox.currentY - sweepBox.startY);

        return (
          <div
            data-testid="sweep-delete-box"
            className="absolute pointer-events-none z-50 rounded-lg border-2 border-dashed border-rose-500 bg-rose-500/15 backdrop-blur-[0.5px] transition-none flex flex-col justify-between p-2 shadow-lg shadow-rose-950/20"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
            }}
          >
            <div className="flex items-center space-x-1.5 bg-rose-600 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md shadow-md w-max self-start animate-in fade-in duration-100">
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                {intersectingNodeIds.size > 0
                  ? `Thả chuột phải để xóa ${intersectingNodeIds.size} node`
                  : 'Quét để chọn vùng node cần xóa'}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Discoverability Helper Hint */}
      <div className="absolute bottom-3 left-3 pointer-events-none z-10 hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 select-none shadow-xs">
        <Trash2 className="w-3 h-3 text-rose-500 shrink-0" />
        <span>Click chuột phải & quét để xóa nhanh một vùng node</span>
      </div>
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
