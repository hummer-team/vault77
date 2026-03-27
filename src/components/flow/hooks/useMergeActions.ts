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
import type { ConditionDefinitionNodeData, TableNodeData } from '../../../services/flow/types';
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
  /** Whether to render the "表关联" join button (TABLE type only) */
  showJoinAction: boolean;
  /** Whether to render the "选择列" select button (JOIN type only) */
  showSelectAction: boolean;
  /** Create the contextually-appropriate next node */
  handleCreateNextNode: () => void;
  /** Bypass conditions and connect straight to EndNode */
  handleDirectExecute: () => void;
  /** Create a JoinNode from this table node (TABLE type only) */
  handleCreateJoinNode: () => void;
  /** Create a SelectNode from this join node (JOIN type only) */
  handleCreateSelectNode: () => void;
}

export function useMergeActions(
  sourceNodeId: string,
  sourceNodeType: FlowNodeType
): MergeActionsResult {
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const nodes = useFlowStore((state) => state.nodes);

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

  const showJoinAction = useMemo(
    () => sourceNodeType === FlowNodeType.TABLE,
    [sourceNodeType]
  );

  const showSelectAction = useMemo(
    () => sourceNodeType === FlowNodeType.JOIN,
    [sourceNodeType]
  );

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
    // Prevent duplicate operator nodes
    const existing = nodes.find((n) => n.type === FlowNodeType.OPERATOR);
    if (existing) {
      addEdge(makeEdge(sourceNodeId, existing.id) as Parameters<typeof addEdge>[0]);
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
    addEdge(makeEdge(sourceNodeId, nodeId) as Parameters<typeof addEdge>[0]);
  }, [sourceNodeId, nodes, getSourcePosition, addNode, addEdge]);

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

  const createJoinNode = useCallback(() => {
    // Only one JoinNode allowed — reuse if it already exists
    const existing = nodes.find((n) => n.type === FlowNodeType.JOIN);
    if (existing) {
      addEdge(makeEdge(sourceNodeId, existing.id) as Parameters<typeof addEdge>[0]);
      return;
    }
    const { x, y } = getSourcePosition();
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    const leftTable = (sourceNode?.data as TableNodeData | undefined)?.tableName ?? '';
    const nodeId = `join_${Date.now()}`;
    addNode({
      id: nodeId,
      type: FlowNodeType.JOIN,
      position: { x: x + X_OFFSET, y: y - 60 },
      data: {
        joinType: JoinType.INNER,
        leftTable,
        rightTable: '',
        conditions: [],
        order: 1,
      },
    } as Parameters<typeof addNode>[0]);
    addEdge(makeEdge(sourceNodeId, nodeId) as Parameters<typeof addEdge>[0]);
  }, [sourceNodeId, nodes, getSourcePosition, addNode, addEdge]);

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

  const handleCreateJoinNode = useCallback(() => {
    createJoinNode();
  }, [createJoinNode]);

  const handleCreateSelectNode = useCallback(() => {
    createSelectNodeFromJoin();
  }, [createSelectNodeFromJoin]);

  return { hintText, showDirectExecute, showJoinAction, showSelectAction, handleCreateNextNode, handleDirectExecute, handleCreateJoinNode, handleCreateSelectNode };
}
