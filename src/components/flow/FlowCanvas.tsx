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
import { FlowNodeType, JoinType, type FlowEdge, type JoinNodeData } from '../../services/flow/types';

// Register node types
const nodeTypes = {
  start: StartNode as unknown as NodeTypes[string],
  table: TableNode as unknown as NodeTypes[string],
  join: JoinNode as unknown as NodeTypes[string],
  condition: ConditionNode as unknown as NodeTypes[string],
  conditionGroup: ConditionGroupNode as unknown as NodeTypes[string],
  select: SelectNode as unknown as NodeTypes[string],
  selectAgg: SelectAggNode as unknown as NodeTypes[string],
  end: EndNode as unknown as NodeTypes[string],
};

// Register edge types
const edgeTypes = {
  join: JoinEdge as unknown as EdgeTypes[string],
};

interface FlowCanvasProps {
  className?: string;
}

const FlowCanvasInner: React.FC<FlowCanvasProps> = ({ className }) => {
  // Get state from store
  const storeNodes = useFlowStore((state) => state.nodes);
  const storeEdges = useFlowStore((state) => state.edges);
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const addEdgeToStore = useFlowStore((state) => state.addEdge);
  const addNodeToStore = useFlowStore((state) => state.addNode);

  // Local state for React Flow
  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  // Sync store state with React Flow state
  React.useEffect(() => {
    setNodes(storeNodes);
  }, [storeNodes, setNodes]);

  React.useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  // Handle node click
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  // Handle connection - create JOIN node when connecting two tables
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceNode = storeNodes.find((n) => n.id === connection.source);
      const targetNode = storeNodes.find((n) => n.id === connection.target);

      // Check if connecting two table nodes - create JOIN node
      if (sourceNode?.type === 'table' && targetNode?.type === 'table') {
        const sourceData = sourceNode.data as { tableName: string };
        const targetData = targetNode.data as { tableName: string };

        // Calculate position between the two tables
        const joinX = ((sourceNode.position?.x || 0) + (targetNode.position?.x || 0)) / 2;
        const joinY = ((sourceNode.position?.y || 0) + (targetNode.position?.y || 0)) / 2;

        // Create JOIN node
        const joinNodeId = `join_${Date.now()}`;
        const joinNodeData: JoinNodeData = {
          joinType: JoinType.INNER,
          leftTable: sourceData.tableName,
          rightTable: targetData.tableName,
          conditions: [],
          order: 1, // Will be calculated based on existing joins
        };

        const joinNode = {
          id: joinNodeId,
          type: FlowNodeType.JOIN,
          position: { x: joinX, y: joinY },
          data: joinNodeData,
        };

        addNodeToStore(joinNode as unknown as Parameters<typeof addNodeToStore>[0]);

        // Create edges: source -> join -> target with custom join edge type
        const edgeToJoin: FlowEdge = {
          id: `e_${connection.source}_${joinNodeId}`,
          source: connection.source,
          target: joinNodeId,
          type: 'smoothstep',
          animated: false,
          data: {
            joinType: 'INNER',
            conditions: '',
            order: 1,
          },
        };

        const edgeFromJoin: FlowEdge = {
          id: `e_${joinNodeId}_${connection.target}`,
          source: joinNodeId,
          target: connection.target,
          type: 'smoothstep',
          animated: false,
          data: {
            joinType: 'INNER',
            conditions: '',
            order: 1,
          },
        };

        addEdgeToStore(edgeToJoin);
        addEdgeToStore(edgeFromJoin);
      } else {
        // Regular connection
        const newEdge: FlowEdge = {
          id: `e_${connection.source}_${connection.target}`,
          source: connection.source,
          target: connection.target,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#8c8c8c', strokeWidth: 2 },
        };
        addEdgeToStore(newEdge);
      }
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
        nodeTypes={nodeTypes}
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
