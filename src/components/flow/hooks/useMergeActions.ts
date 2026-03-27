/**
 * useMergeActions
 * Encapsulates the "next-step" node-creation logic that used to live inside
 * MergeNode. Now each source node embeds a small "+" button that uses this
 * hook to create the appropriate downstream node directly — no intermediate
 * MergeNode is created.
 */

import { useCallback, useMemo } from 'react';
import { useFlowStore } from '../../../stores/flowStore';
import { FlowNodeType, LogicType, EndNodeTriggerSource, JoinType } from '../../../services/flow/types';
import type { ConditionDefinitionNodeData, TableNodeData, JoinEdgeData, FlowEdge } from '../../../services/flow/types';
import { generateConditionGroupRefId } from '../../../services/flow/flowService';

// ---------------------------------------------------------------------------
// Shared edge factory
// ---------------------------------------------------------------------------
const EDGE_STYLE = { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 };
const MARKER_END = {
  type: 'arrowclosed' as const,
  width: 12,
  height: 12,
  color: 'rgba(110, 110, 110, 0.65)',
};

function makeEdge(source: string, target: string) {
  return {
    id: `e_${source}_${target}_${Date.now()}`,
    source,
    target,
    type: 'default',
    animated: false,
    style: EDGE_STYLE,
    markerEnd: MARKER_END,
  };
}

/**
 * BFS traversal over join edges to find all table node IDs connected
 * (directly or transitively) to `startId` via join-type edges.
 * Returns the connected IDs excluding `startId` itself.
 */
function findJoinConnectedTableIds(startId: string, edges: FlowEdge[]): string[] {
  const joinEdges = edges.filter((e) => e.type === 'join');
  const visited = new Set<string>([startId]);
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    joinEdges
      .filter((e) => e.source === current || e.target === current)
      .forEach((e) => {
        const neighbor = e.source === current ? e.target : e.source;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
  }

  visited.delete(startId);
  return Array.from(visited);
}

/** Horizontal gap between source node and new node */
const X_OFFSET = 220;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface MergeActionsResult {
  /** Label for the primary action button */
  hintText: string;
  /** Whether to render the "直接执行" secondary button */
  showDirectExecute: boolean;
  /** Whether to render the "选择列" select button (JOIN type only) */
  showSelectAction: boolean;
  /** Whether to render the "表关联" button (TABLE type only, when other tables exist) */
  showJoinAction: boolean;
  /** Create the contextually-appropriate next node */
  handleCreateNextNode: () => void;
  /** Bypass conditions and connect straight to EndNode */
  handleDirectExecute: () => void;
  /** Create a SelectNode from this join node (JOIN type only) */
  handleCreateSelectNode: () => void;
  /** Create join edges to all unconnected table nodes */
  handleCreateJoinEdge: () => void;
}

export function useMergeActions(
  sourceNodeId: string,
  sourceNodeType: FlowNodeType
): MergeActionsResult {
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------

  const hintText = useMemo((): string => {
    switch (sourceNodeType) {
      case FlowNodeType.TABLE:
        return '选择算子';
      case FlowNodeType.JOIN:
        return '选择算子';
      case FlowNodeType.OPERATOR:
      case FlowNodeType.SELECT:
      case FlowNodeType.SELECT_AGG:
        return '定义条件';
      case FlowNodeType.CONDITION_DEFINITION:
        return '绑定关系';
      case FlowNodeType.CONDITION_GROUP:
      case FlowNodeType.CONDITION:
        return '执行OR保存';
      default:
        return '选择算子';
    }
  }, [sourceNodeType]);

  const showDirectExecute = useMemo(
    () => sourceNodeType !== FlowNodeType.TABLE && sourceNodeType !== FlowNodeType.JOIN,
    [sourceNodeType]
  );

  const showSelectAction = useMemo(
    () => sourceNodeType === FlowNodeType.JOIN,
    [sourceNodeType]
  );

  // Show "表关联" when this is a TABLE node and there are other TABLE nodes available
  const showJoinAction = useMemo(() => {
    if (sourceNodeType !== FlowNodeType.TABLE) return false;
    const otherTables = nodes.filter(
      (n) => n.type === FlowNodeType.TABLE && n.id !== sourceNodeId
    );
    return otherTables.length > 0;
  }, [sourceNodeType, nodes, sourceNodeId]);

  // -------------------------------------------------------------------------
  // Position helper
  // -------------------------------------------------------------------------

  const getSourcePosition = useCallback((): { x: number; y: number } => {
    const node = nodes.find((n) => n.id === sourceNodeId);
    return node?.position ?? { x: 0, y: 0 };
  }, [nodes, sourceNodeId]);

  // -------------------------------------------------------------------------
  // Node creators
  // -------------------------------------------------------------------------

  const createOperatorNode = useCallback(() => {
    // Collect the source table + all tables reachable via join edges
    const relatedTableIds = findJoinConnectedTableIds(sourceNodeId, edges);
    const allTableIds = [sourceNodeId, ...relatedTableIds];

    // If an operator node already exists, just wire all unconnected tables to it
    const existing = nodes.find((n) => n.type === FlowNodeType.OPERATOR);
    if (existing) {
      allTableIds.forEach((tableId) => {
        addEdge(makeEdge(tableId, existing.id) as Parameters<typeof addEdge>[0]);
      });
      return;
    }

    const { x, y } = getSourcePosition();
    const nodeId = `operator_${Date.now()}`;
    addNode({
      id: nodeId,
      type: FlowNodeType.OPERATOR,
      position: { x: x + X_OFFSET, y },
      data: { operatorType: undefined },
    } as Parameters<typeof addNode>[0]);

    // Connect every table in the join group to the new operator node
    allTableIds.forEach((tableId) => {
      addEdge(makeEdge(tableId, nodeId) as Parameters<typeof addEdge>[0]);
    });
  }, [sourceNodeId, nodes, edges, getSourcePosition, addNode, addEdge]);

  const createConditionDefinitionNode = useCallback(() => {
    const { x, y } = getSourcePosition();
    const refId = generateConditionGroupRefId(nodes);
    const nodeId = `cond_def_${Date.now()}`;
    addNode({
      id: nodeId,
      type: FlowNodeType.CONDITION_DEFINITION,
      position: { x: x + X_OFFSET, y },
      data: {
        refId,
        tableName: '',
        logicType: LogicType.AND,
        conditions: [
          {
            id: `cond_${Date.now()}`,
            field: '',
            operator: '=',
            placeholder: `${refId}_1`,
            valueType: 'VARCHAR',
          },
        ],
      },
    } as Parameters<typeof addNode>[0]);
    addEdge(makeEdge(sourceNodeId, nodeId) as Parameters<typeof addEdge>[0]);
  }, [sourceNodeId, nodes, getSourcePosition, addNode, addEdge]);

  const createRelationNode = useCallback(() => {
    const { x, y } = getSourcePosition();
    const conditionIds = nodes
      .filter((n) => n.type === FlowNodeType.CONDITION_DEFINITION)
      .map((n) => (n.data as ConditionDefinitionNodeData).refId);

    const nodeId = `relation_${Date.now()}`;
    addNode({
      id: nodeId,
      type: FlowNodeType.CONDITION_GROUP,
      position: { x: x + X_OFFSET, y },
      data: { logicType: LogicType.AND, conditionIds },
    } as Parameters<typeof addNode>[0]);
    addEdge(makeEdge(sourceNodeId, nodeId) as Parameters<typeof addEdge>[0]);
  }, [sourceNodeId, nodes, getSourcePosition, addNode, addEdge]);

  const createEndNode = useCallback(
    (triggerSource: EndNodeTriggerSource = EndNodeTriggerSource.CONDITION) => {
      const existingEnd = nodes.find((n) => n.type === FlowNodeType.END);
      if (existingEnd) {
        addEdge(makeEdge(sourceNodeId, existingEnd.id) as Parameters<typeof addEdge>[0]);
        return;
      }
      const { x, y } = getSourcePosition();
      const nodeId = `end_${Date.now()}`;
      addNode({
        id: nodeId,
        type: FlowNodeType.END,
        position: { x: x + X_OFFSET, y },
        data: { operatorType: 'association', executable: true, errors: [], triggerSource },
      } as Parameters<typeof addNode>[0]);
      addEdge(makeEdge(sourceNodeId, nodeId) as Parameters<typeof addEdge>[0]);
    },
    [sourceNodeId, nodes, getSourcePosition, addNode, addEdge]
  );

  const createSelectNodeFromJoin = useCallback(() => {
    const existing = nodes.find((n) => n.type === FlowNodeType.SELECT);
    if (existing) {
      addEdge(makeEdge(sourceNodeId, existing.id) as Parameters<typeof addEdge>[0]);
      return;
    }
    const { x, y } = getSourcePosition();
    const nodeId = `select_${Date.now()}`;
    addNode({
      id: nodeId,
      type: FlowNodeType.SELECT,
      position: { x: x + X_OFFSET, y },
      data: { fields: [], selectAll: true },
    } as Parameters<typeof addNode>[0]);
    addEdge(makeEdge(sourceNodeId, nodeId) as Parameters<typeof addEdge>[0]);
  }, [sourceNodeId, nodes, getSourcePosition, addNode, addEdge]);

  // -------------------------------------------------------------------------
  // Public handlers
  // -------------------------------------------------------------------------

  /**
   * Creates join edges from this TABLE node to all other TABLE nodes
   * that are not yet connected via a join edge.
   */
  const handleCreateJoinEdge = useCallback(() => {
    const otherTables = nodes.filter(
      (n) => n.type === FlowNodeType.TABLE && n.id !== sourceNodeId
    );
    const existingJoinEdges = edges.filter((e) => e.type === 'join');

    otherTables.forEach((targetNode) => {
      // Skip if a join edge already exists between these two nodes (in either direction)
      const alreadyConnected = existingJoinEdges.some(
        (e) =>
          (e.source === sourceNodeId && e.target === targetNode.id) ||
          (e.source === targetNode.id && e.target === sourceNodeId)
      );
      if (alreadyConnected) return;

      const sourceTable = (nodes.find((n) => n.id === sourceNodeId)?.data as TableNodeData)?.tableName ?? '';
      const targetTable = (targetNode.data as TableNodeData)?.tableName ?? '';
      const order = existingJoinEdges.length + 1;
      const joinData: JoinEdgeData = {
        joinType: JoinType.INNER,
        sourceTableName: sourceTable,
        targetTableName: targetTable,
        conditions: [],
        description: '',
        order,
        configured: false,
      };
      const joinEdge: FlowEdge = {
        id: `join_${sourceNodeId}_${targetNode.id}_${Date.now()}`,
        source: sourceNodeId,
        target: targetNode.id,
        type: 'join',
        animated: false,
        data: joinData,
      };
      addEdge(joinEdge as Parameters<typeof addEdge>[0]);
    });
  }, [sourceNodeId, nodes, edges, addEdge]);

  const handleCreateNextNode = useCallback(() => {
    switch (sourceNodeType) {
      case FlowNodeType.TABLE:
      case FlowNodeType.JOIN:
        createOperatorNode();
        break;
      case FlowNodeType.OPERATOR:
      case FlowNodeType.SELECT:
      case FlowNodeType.SELECT_AGG:
        createConditionDefinitionNode();
        break;
      case FlowNodeType.CONDITION_DEFINITION:
        createRelationNode();
        break;
      case FlowNodeType.CONDITION_GROUP:
      case FlowNodeType.CONDITION:
        createEndNode(EndNodeTriggerSource.CONDITION);
        break;
      default:
        createOperatorNode();
    }
  }, [
    sourceNodeType,
    createOperatorNode,
    createConditionDefinitionNode,
    createRelationNode,
    createEndNode,
  ]);

  const handleDirectExecute = useCallback(() => {
    createEndNode(EndNodeTriggerSource.DIRECT);
  }, [createEndNode]);

  const handleCreateSelectNode = useCallback(() => {
    createSelectNodeFromJoin();
  }, [createSelectNodeFromJoin]);

  return { hintText, showDirectExecute, showSelectAction, showJoinAction, handleCreateNextNode, handleDirectExecute, handleCreateSelectNode, handleCreateJoinEdge };
}
