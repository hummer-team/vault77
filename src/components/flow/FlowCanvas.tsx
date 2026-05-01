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
import { NodePropertiesDrawer } from './udf/NodePropertiesDrawer';
import { JoinRelationDrawer } from './udf/JoinRelationDrawer';
import { MergeNode } from './nodes/MergeNode';
import { OperatorNode } from './nodes/OperatorNode';
import { DataSourceNode } from './nodes/DataSourceNode';
import { TableNode } from './nodes/TableNode';
// import { JoinNode } from './nodes/JoinNode'; // JoinNode removed from canvas — join config is on edges
import { ConditionNode } from './nodes/ConditionNode';
import { ConditionGroupRelationNode } from './nodes/ConditionGroupRelationNode';
import { ConditionGroupDefinitionNode } from './nodes/ConditionGroupDefinitionNode';
import { SelectNode } from './nodes/SelectNode';
import { SelectAggNode } from './nodes/SelectAggNode';
import { EndNode } from './nodes/EndNode';
import UdfConfigNode from './nodes/UdfConfigNode';
import { JoinEdge } from './edges/JoinEdge';
import { DeletableEdge } from './edges/DeletableEdge';
import { StepNavigationBar } from './shared/StepNavigationBar';
import { FLOW_LAYOUT } from '../../services/flow/constants';
import { FlowNodeType } from '../../services/flow/types';
import type { FlowEdge, JoinEdgeData, TableNodeData } from '../../services/flow/types';
import { JoinType } from '../../services/flow/types';
import {
  resolveSelectNodePanelType,
  SelectNodePanelType,
} from '../../services/flow/bizKernelsBuilderStrategies';
import { TOKEN } from '../../theme';
import { FlowAttachmentsProvider } from './contexts/FlowAttachmentsContext';

// Register edge types
const edgeTypes = {
  join: JoinEdge as unknown as EdgeTypes[string],
  deletable: DeletableEdge as unknown as EdgeTypes[string],
};

import type { FlowSummary } from '../../services/flow/flowSummary';
import type { Attachment } from '../../types/workbench.types';

interface FlowCanvasProps {
  className?: string;
  onSqlValidated?: (sql: string, flowSummary?: FlowSummary) => void;
  /** Pre-selected kernel name from ChatPanel "/" trigger */
  defaultKernelName?: string;
  /** Called when user changes the kernel selection inside canvas */
  onKernelChange?: (kernelName: string) => void;
  /** Tables to show in DataSourceNode dropdown (filtered by selected attachments) */
  allowedTableNames?: string[];
  /** File attachments for friendly name mapping */
  attachments?: Attachment[];
}

const FlowCanvasInner: React.FC<FlowCanvasProps> = ({
  className,
  onSqlValidated,
  defaultKernelName,
  allowedTableNames,
  attachments = [],
}) => {
  const setDefaultKernelName = useFlowStore((state) => state.setDefaultKernelName);
  const resetFlow = useFlowStore((state) => state.resetFlow);
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const updateNode = useFlowStore((state) => state.updateNode);
  const setPendingConnectionSource = useFlowStore((state) => state.setPendingConnectionSource);
  const selectedEdgeId = useFlowStore((state) => state.selectedEdgeId);
  const setSelectedEdgeId = useFlowStore((state) => state.setSelectedEdgeId);

  // Sync defaultKernelName into flowStore so OperatorNode can read it
  useEffect(() => {
    setDefaultKernelName(defaultKernelName ?? null);
    return () => setDefaultKernelName(null);
  }, [defaultKernelName, setDefaultKernelName]);

  // Auto-initialize canvas: always reset and ensure OperatorNode exists as first node.
  // If defaultKernelName is provided (via "/" trigger), also pre-create DataSourceNode.
  useEffect(() => {
    resetFlow(); // Creates operator_start node (from createInitialState)

    if (!defaultKernelName) return;

    // Kernel pre-selected via "/" — update OperatorNode with kernel and create DataSourceNode
    updateNode('operator_start', { kernelName: defaultKernelName });

    const startX = 50;
    const startY = 300;

    const edgeStyle = { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 };
    const markerEnd = { type: 'arrowclosed' as const, width: 12, height: 12, color: 'var(--vm-flow-edge)' };

    // DataSourceNode — second node in the chain
    const dataSourceNodeId = 'datasource_init';
    addNode({
      id: dataSourceNodeId,
      type: FlowNodeType.DATA_SOURCE,
      position: { x: startX + 280, y: startY },
      data: { selectedTables: [] },
    } as Parameters<typeof addNode>[0]);

    // operator_start → datasource_init
    addEdge({
      id: `e_operator_start_${dataSourceNodeId}`,
      source: 'operator_start',
      target: dataSourceNodeId,
      type: 'default',
      animated: false,
      style: edgeStyle,
      markerEnd,
    } as Parameters<typeof addEdge>[0]);

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

  const nodeTypesWithCallback = useMemo(
    () => ({
      dataSource: ((props: any) => (
        <DataSourceNode {...props} allowedTableNames={allowedTableNames} attachments={attachments} />
      )) as unknown as NodeTypes[string],
      table: TableNode as unknown as NodeTypes[string],
      merge: MergeNode as unknown as NodeTypes[string],
      operator: OperatorNode as unknown as NodeTypes[string],
      // join: JoinNode — removed; join config is now stored on edges (JoinEdge)
      condition: ConditionNode as unknown as NodeTypes[string],
      conditionGroupRelation: ConditionGroupRelationNode as unknown as NodeTypes[string],
      conditionGroupDefinition: ((props: any) => (
        <ConditionGroupDefinitionNode {...props} allowedTableNames={allowedTableNames} />
      )) as unknown as NodeTypes[string],
      select: SelectNode as unknown as NodeTypes[string],
      selectAgg: SelectAggNode as unknown as NodeTypes[string],
      end: ((props: any) => <EndNode {...props} onSqlValidated={onSqlValidated} />) as unknown as NodeTypes[string],
      udfConfig: UdfConfigNode as unknown as NodeTypes[string],
    }),
    [onSqlValidated, allowedTableNames, attachments]
  );

  // Local state for React Flow
  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  // Compute display edges — apply highlight style to the selected edge (stroke + arrowhead)
  const displayEdges = useMemo(
    () =>
      edges.map((edge) =>
        edge.id === selectedEdgeId
          ? {
              ...edge,
              style: { ...edge.style, stroke: '#7c3aed', strokeWidth: 2.5 },
              markerEnd: edge.markerEnd && typeof edge.markerEnd === 'object'
                ? { ...(edge.markerEnd as Record<string, unknown>), color: '#7c3aed' }
                : edge.markerEnd,
              selected: true,
            }
          : edge
      ) as FlowEdge[],
    [edges, selectedEdgeId]
  );

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
      // These node types manage their own UI — do not open NodePropertiesDrawer
      if (
        node.type === 'dataSource' ||
        node.type === 'table' ||
        node.type === 'merge' ||
        node.type === 'operator' ||
        node.type === 'end' ||
        node.type === 'conditionGroupDefinition' ||
        node.type === 'conditionGroupRelation' ||
        node.type === 'udfConfig'
      ) {
        return;
      }
      // Select nodes linked to a UDF operator manage their own drawer — skip NodePropertiesDrawer.
      // Use resolveSelectNodePanelType (with OperatorNode fallback) to stay consistent
      // with SelectNode's own handleClick routing.
      if (
        node.type === 'select' &&
        resolveSelectNodePanelType(
          (node.data as { udfFunctionName?: string }).udfFunctionName
        ) !== SelectNodePanelType.STANDARD_DETAIL_PANEL
      ) {
        return;
      }
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setPendingConnectionSource(null); // Cancel any pending "bind relation" connection
    setSelectedEdgeId(null); // Deselect any highlighted edge
  }, [setSelectedNode, setPendingConnectionSource, setSelectedEdgeId]);

  // Handle connection - smart connection logic
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const { nodes, edges } = useFlowStore.getState();
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      // Table → Table: create a join edge
      if (sourceNode?.type === 'table' && targetNode?.type === 'table') {
        const joinEdgeCount = edges.filter((e) => e.type === 'join').length;
        const sourceTable = (sourceNode.data as TableNodeData).tableName ?? '';
        const targetTable = (targetNode.data as TableNodeData).tableName ?? '';
        const joinData: JoinEdgeData = {
          joinType: JoinType.INNER,
          sourceTableName: sourceTable,
          targetTableName: targetTable,
          conditions: [],
          description: '',
          order: joinEdgeCount + 1,
          configured: false,
        };
        const joinEdge: FlowEdge = {
          id: `join_${connection.source}_${connection.target}_${Date.now()}`,
          source: connection.source,
          target: connection.target,
          type: 'join',
          animated: false,
          data: joinData,
        };
        addEdgeToStore(joinEdge);
        return;
      }

      // Default: regular connection with arrow marker
      const newEdge: FlowEdge = {
        id: `e_${connection.source}_${connection.target}`,
        source: connection.source,
        target: connection.target,
        type: 'default',
        animated: false,
        style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
      };
      addEdgeToStore(newEdge);
    },
    [addEdgeToStore]
  );

  // Handle edge click — highlight the clicked edge
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdgeId(edge.id);
    },
    [setSelectedEdgeId]
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
        edges={displayEdges}
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
        <StepNavigationBar />
        <CustomControls />
        <NodePropertiesDrawer />
        <JoinRelationDrawer />
        <MiniMap
          nodeStrokeColor={(n) => {
            if (n.type === 'dataSource') return 'var(--vm-flow-success)';
            if (n.type === 'operator') return 'var(--vm-flow-warning)';
            if (n.type === 'end') return '#ff4d4f';
            return '#434343';
          }}
          nodeColor={(n) => {
            if (n.type === 'dataSource') return 'var(--vm-flow-success)';
            if (n.type === 'operator') return 'var(--vm-flow-warning)';
            if (n.type === 'end') return '#ff4d4f';
            return TOKEN.flowNodeBg;
          }}
          maskColor="var(--vm-flow-shadow-lg)"
          style={{
            backgroundColor: TOKEN.flowCanvasBg,
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
      <FlowAttachmentsProvider attachments={props.attachments || []}>
        <FlowCanvasInner {...props} />
      </FlowAttachmentsProvider>
    </ReactFlowProvider>
  );
};

export default FlowCanvas;
