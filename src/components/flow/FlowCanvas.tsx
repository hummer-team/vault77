/**
 * Flow Canvas Component
 * Main canvas component for the analysis flow using React Flow
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  ReactFlowProvider,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useFlowStore } from '../../stores/flowStore';
import { CustomControls } from './controls/CustomControls';
import { CanvasToolbar } from './controls/CanvasToolbar';
import { NodeDetailPanel } from './panels/NodeDetailPanel';
import { MergeNode } from './nodes/MergeNode';
import { OperatorNode } from './nodes/OperatorNode';
import { StartNode } from './nodes/StartNode';
import { TableNode } from './nodes/TableNode';
import { JoinNode } from './nodes/JoinNode';
import { ConditionNode } from './nodes/ConditionNode';
import { ConditionGroupNode } from './nodes/ConditionGroupNode';
import { ConditionDefinitionNode } from './nodes/ConditionDefinitionNode';
import { SelectNode } from './nodes/SelectNode';
import { SelectAggNode } from './nodes/SelectAggNode';
import { EndNode } from './nodes/EndNode';
import { JoinEdge } from './edges/JoinEdge';
import { FLOW_LAYOUT } from '../../services/flow/constants';
import type { FlowEdge } from '../../services/flow/types';

// Register edge types
const edgeTypes = {
  join: JoinEdge as unknown as EdgeTypes[string],
};

interface FlowCanvasProps {
  className?: string;
  onSqlValidated?: (sql: string) => void;
  /** Pre-selected kernel name from ChatPanel "/" trigger */
  defaultKernelName?: string;
  /** Called when user changes the kernel selection inside canvas */
  onKernelChange?: (kernelName: string) => void;
}

const FlowCanvasInner: React.FC<FlowCanvasProps> = ({
  className,
  onSqlValidated,
  defaultKernelName,
}) => {
  const setDefaultKernelName = useFlowStore((state) => state.setDefaultKernelName);
  const resetFlow = useFlowStore((state) => state.resetFlow);
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const updateNode = useFlowStore((state) => state.updateNode);

  // Sync defaultKernelName into flowStore so OperatorNode can read it
  useEffect(() => {
    setDefaultKernelName(defaultKernelName ?? null);
    return () => setDefaultKernelName(null);
  }, [defaultKernelName, setDefaultKernelName]);

  // Auto-initialize nodes based on whether a kernel was selected
  useEffect(() => {
    // No kernel selected — reset to clean state with only the start node
    if (!defaultKernelName) {
      resetFlow();
      return;
    }

    // Kernel selected — reset and create the full node chain
    resetFlow();

    const startX = 50;
    const startY = 300;

    // Update start node to pre-select main_table_1
    updateNode('start', { selectedTables: ['main_table_1'] });

    // Table node for main_table_1
    const tableNodeId = 'table_init_1';
    addNode({
      id: tableNodeId,
      type: 'table',
      position: { x: startX + 260, y: startY },
      data: { tableName: 'main_table_1', fields: [], expanded: false, label: 'main_table_1' },
    } as Parameters<typeof addNode>[0]);

    // Merge node
    const mergeNodeId = 'merge_init_1';
    addNode({
      id: mergeNodeId,
      type: 'merge',
      position: { x: startX + 480, y: startY },
      data: { tableCount: 1 },
    } as Parameters<typeof addNode>[0]);

    // Operator node with pre-selected kernel
    const operatorNodeId = 'operator_init_1';
    addNode({
      id: operatorNodeId,
      type: 'operator',
      position: { x: startX + 700, y: startY },
      data: { kernelName: defaultKernelName },
    } as Parameters<typeof addNode>[0]);

    // Select node (选择列) — mirrors the single-table branch in OperatorNode.handleKernelChange
    const selectNodeId = 'select_init_1';
    addNode({
      id: selectNodeId,
      type: 'select',
      position: { x: startX + 700 + 280, y: startY },
      data: { fields: [], selectAll: true },
    } as Parameters<typeof addNode>[0]);

    const edgeStyle = { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 };
    const markerEnd = { type: 'arrowclosed' as const, width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' };

    // start → table
    addEdge({ id: `e_start_${tableNodeId}`, source: 'start', target: tableNodeId, type: 'default', animated: false, style: edgeStyle, markerEnd } as Parameters<typeof addEdge>[0]);
    // table → merge
    addEdge({ id: `e_${tableNodeId}_${mergeNodeId}`, source: tableNodeId, target: mergeNodeId, type: 'default', animated: false, style: edgeStyle, markerEnd } as Parameters<typeof addEdge>[0]);
    // merge → operator
    addEdge({ id: `e_${mergeNodeId}_${operatorNodeId}`, source: mergeNodeId, target: operatorNodeId, type: 'default', animated: false, style: edgeStyle, markerEnd } as Parameters<typeof addEdge>[0]);
    // operator → select (选择列)
    addEdge({ id: `e_${operatorNodeId}_${selectNodeId}`, source: operatorNodeId, target: selectNodeId, type: 'default', animated: false, style: edgeStyle, markerEnd } as Parameters<typeof addEdge>[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultKernelName]);

  // Expose onKernelChange via a ref in store-accessible callback is not possible cleanly;
  // OperatorNode calls onKernelChange through a store action we expose via context instead.
  // We pass it via FlowCanvas's own prop drilling is not needed — Workbench reads pendingKernelTemplate
  // from its own state which is already updated via onKernelChange callback.
  // OperatorNode will call store.setDefaultKernelName on selection change (no-op for parent).

  // Get state from store
  const storeNodes = useFlowStore((state) => state.nodes);
  const storeEdges = useFlowStore((state) => state.edges);
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const addEdgeToStore = useFlowStore((state) => state.addEdge);
  const addNodeToStore = useFlowStore((state) => state.addNode);

  // Create custom nodeTypes with onSqlValidated callback
  const nodeTypesWithCallback = useMemo(
    () => ({
      start: StartNode as unknown as NodeTypes[string],
      table: TableNode as unknown as NodeTypes[string],
      merge: MergeNode as unknown as NodeTypes[string],
      operator: OperatorNode as unknown as NodeTypes[string],
      join: JoinNode as unknown as NodeTypes[string],
      condition: ConditionNode as unknown as NodeTypes[string],
      conditionGroup: ConditionGroupNode as unknown as NodeTypes[string],
      conditionDefinition: ConditionDefinitionNode as unknown as NodeTypes[string],
      select: SelectNode as unknown as NodeTypes[string],
      selectAgg: SelectAggNode as unknown as NodeTypes[string],
      end: ((props: any) => <EndNode {...props} onSqlValidated={onSqlValidated} />) as unknown as NodeTypes[string],
    }),
    [onSqlValidated]
  );

  // Local state for React Flow
  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  // Sync store state with React Flow state (preserve positions)
  React.useEffect(() => {
    setNodes((currentNodes) => {
      // Create a map of current positions
      const positionMap = new Map(
        currentNodes.map((n) => [n.id, n.position])
      );

      // Update nodes while preserving user-adjusted positions
      return storeNodes.map((storeNode) => ({
        ...storeNode,
        position: positionMap.get(storeNode.id) || storeNode.position,
      }));
    });
  }, [storeNodes, setNodes]);

  React.useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  // Handle node click
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Don't open detail panel for start, table, merge, operator, end, conditionDefinition, and conditionGroup nodes
      if (node.type === 'start' || node.type === 'table' || node.type === 'merge' || node.type === 'operator' || node.type === 'end' || node.type === 'conditionDefinition' || node.type === 'conditionGroup') {
        return;
      }
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  // Handle connection - smart connection logic
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceNode = storeNodes.find((n) => n.id === connection.source);
      const targetNode = storeNodes.find((n) => n.id === connection.target);

      // If dragging from table to merge node, allow direct connection
      if (sourceNode?.type === 'table' && targetNode?.type === 'merge') {
        const newEdge: FlowEdge = {
          id: `e_${connection.source}_${connection.target}`,
          source: connection.source,
          target: connection.target,
          type: 'default',
          animated: false,
          style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
        };
        addEdgeToStore(newEdge);
        return;
      }

      // If dragging from table to another table, create merge node in between
      if (sourceNode?.type === 'table' && targetNode?.type === 'table') {
        // Check if merge node already exists
        const existingMerge = storeNodes.find((n) => n.type === 'merge');

        if (existingMerge) {
          // Connect source table to existing merge
          const newEdge: FlowEdge = {
            id: `e_${connection.source}_${existingMerge.id}`,
            source: connection.source,
            target: existingMerge.id,
            type: 'default',
            animated: false,
            style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
            markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
          };
          addEdgeToStore(newEdge);
        } else {
          // Create new merge node between tables
          const mergeX = ((sourceNode.position?.x || 0) + (targetNode.position?.x || 0)) / 2 + 100;
          const mergeY = ((sourceNode.position?.y || 0) + (targetNode.position?.y || 0)) / 2;

          const mergeNodeId = `merge_${Date.now()}`;
          const mergeNode = {
            id: mergeNodeId,
            type: 'merge' as const,
            position: { x: mergeX, y: mergeY },
            data: {
              tableCount: 2,
            },
          };
          addNodeToStore(mergeNode as unknown as Parameters<typeof addNodeToStore>[0]);

          // Connect both tables to merge with arrow markers
          addEdgeToStore({
            id: `e_${connection.source}_${mergeNodeId}`,
            source: connection.source,
            target: mergeNodeId,
            type: 'default',
            animated: false,
            style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
            markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
          } as FlowEdge);

          addEdgeToStore({
            id: `e_${connection.target}_${mergeNodeId}`,
            source: connection.target,
            target: mergeNodeId,
            type: 'default',
            animated: false,
            style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
            markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
          } as FlowEdge);
        }
        return;
      }

      // Default: regular connection with arrow marker
      const newEdge: FlowEdge = {
        id: `e_${connection.source}_${connection.target}`,
        source: connection.source,
        target: connection.target,
        type: 'default',
        animated: false,
        style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
      };
      addEdgeToStore(newEdge);
    },
    [addEdgeToStore, addNodeToStore, storeNodes]
  );

  // Handle edge click
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      // TODO: Open edge detail panel
      console.log('Edge clicked:', edge);
    },
    []
  );

  // Handle key press (Delete to remove selected node)
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' && selectedNodeId) {
        const removeNode = useFlowStore.getState().removeNode;
        removeNode(selectedNodeId);
      }
    },
    [selectedNodeId]
  );

  // Memoize default viewport
  const defaultViewport = useMemo(
    () => ({
      x: 0,
      y: 0,
      zoom: FLOW_LAYOUT.defaultZoom,
    }),
    []
  );

  return (
    <div
      className={`flow-canvas ${className || ''}`}
      style={{ width: '100%', height: '100%' }}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypesWithCallback}
        edgeTypes={edgeTypes}
        defaultViewport={defaultViewport}
        minZoom={FLOW_LAYOUT.minZoom}
        maxZoom={FLOW_LAYOUT.maxZoom}
        snapGrid={FLOW_LAYOUT.snapGrid}
        snapToGrid={true}
        fitView={false}
        deleteKeyCode={null} // Handle delete manually
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        selectNodesOnDrag={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#8c8c8c" gap={16} size={1} />
        <CustomControls />
        <CanvasToolbar />
        <NodeDetailPanel />
        <MiniMap
          nodeStrokeColor={(n) => {
            if (n.type === 'start') return '#52c41a';
            if (n.type === 'end') return '#fa8c16';
            return '#434343';
          }}
          nodeColor={(n) => {
            if (n.type === 'start') return '#52c41a';
            if (n.type === 'end') return '#fa8c16';
            return '#1f1f1f';
          }}
          maskColor="rgba(0, 0, 0, 0.5)"
          style={{
            backgroundColor: '#141414',
            border: '1px solid #434343',
          }}
        />
      </ReactFlow>
    </div>
  );
};

export const FlowCanvas: React.FC<FlowCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
};

export default FlowCanvas;
