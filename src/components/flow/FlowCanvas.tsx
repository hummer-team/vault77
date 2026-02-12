/**
 * Flow Canvas Component
 * Main canvas component for the analysis flow using React Flow
 */

import React, { useCallback, useMemo } from 'react';
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
import { NodeToolbar } from './controls/NodeToolbar';
import { NodeDetailPanel } from './panels/NodeDetailPanel';
import { MergeNode } from './nodes/MergeNode';
import { OperatorNode } from './nodes/OperatorNode';
import { StartNode } from './nodes/StartNode';
import { TableNode } from './nodes/TableNode';
import { JoinNode } from './nodes/JoinNode';
import { ConditionNode } from './nodes/ConditionNode';
import { ConditionGroupNode } from './nodes/ConditionGroupNode';
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
}

const FlowCanvasInner: React.FC<FlowCanvasProps> = ({ className, onSqlValidated }) => {
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
      // Don't open detail panel for merge nodes
      if (node.type === 'merge') {
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
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#8c8c8c', strokeWidth: 2 },
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
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#8c8c8c', strokeWidth: 2 },
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

          // Connect both tables to merge
          addEdgeToStore({
            id: `e_${connection.source}_${mergeNodeId}`,
            source: connection.source,
            target: mergeNodeId,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#8c8c8c', strokeWidth: 2 },
          } as FlowEdge);

          addEdgeToStore({
            id: `e_${connection.target}_${mergeNodeId}`,
            source: connection.target,
            target: mergeNodeId,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#8c8c8c', strokeWidth: 2 },
          } as FlowEdge);
        }
        return;
      }

      // Default: regular connection
      const newEdge: FlowEdge = {
        id: `e_${connection.source}_${connection.target}`,
        source: connection.source,
        target: connection.target,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#8c8c8c', strokeWidth: 2 },
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
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#8c8c8c" gap={16} size={1} />
        <CustomControls />
        <NodeToolbar />
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
