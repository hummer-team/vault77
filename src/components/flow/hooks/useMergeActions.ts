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
  /**
   * Whether to render the "绑定关系" manual-connect hint button
   * (CONDITION_DEFINITION type only)
   */
  showBindAction: boolean;
  /**
   * Whether the "绑定关系" button should be disabled —
   * true when no ConditionGroupNode exists on the canvas yet.
   */
  bindActionDisabled: boolean;
  /**
   * Whether to render the "执行OR保存" shortcut on ConditionDefinitionNode.
   * Only true when exactly 1 ConditionDefinitionNode exists and no
   * ConditionGroupNode has been created yet — a fast-path to EndNode.
   */
  showExecuteSave: boolean;
  /** Create the contextually-appropriate next node */
  handleCreateNextNode: () => void;
  /** Bypass conditions and connect straight to EndNode */
  handleDirectExecute: () => void;
  /** Fast-path: connect the sole ConditionDefinitionNode directly to EndNode */
  handleExecuteSave: () => void;
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
  const updateNode = useFlowStore((state) => state.updateNode);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------

  const hintText = useMemo((): string => {
    switch (sourceNodeType) {
      case FlowNodeType.TABLE:
      case FlowNodeType.JOIN:
        return '选择列';
      case FlowNodeType.OPERATOR:
        return '选择数据源';
      case FlowNodeType.SELECT:
      case FlowNodeType.SELECT_AGG:
        return '定义条件';
      case FlowNodeType.CONDITION_DEFINITION:
        return '新建关系';
      case FlowNodeType.CONDITION_GROUP:
      case FlowNodeType.CONDITION:
        return '执行OR保存';
      default:
        return '选择列';
    }
  }, [sourceNodeType]);

  const showDirectExecute = useMemo((): boolean => {
    if (
      sourceNodeType === FlowNodeType.TABLE ||
      sourceNodeType === FlowNodeType.JOIN ||
      sourceNodeType === FlowNodeType.OPERATOR ||
      sourceNodeType === FlowNodeType.CONDITION_GROUP ||
      sourceNodeType === FlowNodeType.CONDITION_DEFINITION // must build full condition flow first
    ) return false;
    // Disable "直接执行" on SELECT when any ConditionDefinitionNode exists on the canvas
    if (sourceNodeType === FlowNodeType.SELECT) {
      return !nodes.some((n) => n.type === FlowNodeType.CONDITION_DEFINITION);
    }
    return true;
  }, [sourceNodeType, nodes]);

  // "执行OR保存" fast-path: only for ConditionDefinitionNode when it is the sole CD node
  // and no ConditionGroupNode has been created yet.
  const showExecuteSave = useMemo((): boolean => {
    if (sourceNodeType !== FlowNodeType.CONDITION_DEFINITION) return false;
    const cdCount = nodes.filter((n) => n.type === FlowNodeType.CONDITION_DEFINITION).length;
    const hasCG = nodes.some((n) => n.type === FlowNodeType.CONDITION_GROUP);
    return cdCount === 1 && !hasCG;
  }, [sourceNodeType, nodes]);

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

  // Show "绑定关系" hint for CONDITION_DEFINITION nodes so the user can
  // manually drag a connection to an existing ConditionGroupNode.
  const showBindAction = useMemo(
    () => sourceNodeType === FlowNodeType.CONDITION_DEFINITION,
    [sourceNodeType]
  );

  // Disable "绑定关系" when no ConditionGroupNode exists on the canvas yet.
  const bindActionDisabled = useMemo(
    () => !nodes.some((n) => n.type === FlowNodeType.CONDITION_GROUP),
    [nodes]
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

    // If EndNode already exists, switch it to CONDITION mode so button shows "填充值并执行"
    const existingEnd = nodes.find((n) => n.type === FlowNodeType.END);
    if (existingEnd) {
      updateNode(existingEnd.id, { triggerSource: EndNodeTriggerSource.CONDITION } as Parameters<typeof updateNode>[1]);
    }
  }, [sourceNodeId, nodes, getSourcePosition, addNode, addEdge, updateNode]);

  const createRelationNode = useCallback(() => {
    const { x, y } = getSourcePosition();
    // Always create a brand-new ConditionGroupNode — never reuse an existing one.
    // Only the triggering CG node is wired here; other CG nodes connect manually.
    const groupNodeId = `relation_${Date.now()}`;
    addNode({
      id: groupNodeId,
      type: FlowNodeType.CONDITION_GROUP,
      position: { x: x + X_OFFSET, y },
      data: { logicType: LogicType.AND, conditionIds: [(nodes.find((n) => n.id === sourceNodeId)?.data as ConditionDefinitionNodeData)?.refId ?? ''] },
    } as Parameters<typeof addNode>[0]);
    addEdge(makeEdge(sourceNodeId, groupNodeId) as Parameters<typeof addEdge>[0]);
  }, [sourceNodeId, nodes, getSourcePosition, addNode, addEdge]);

  const createEndNode = useCallback(
    (triggerSource: EndNodeTriggerSource = EndNodeTriggerSource.CONDITION) => {
      // Collect all ConditionGroupNodes on the canvas — all should connect to EndNode
      const allCGNodes = nodes.filter((n) => n.type === FlowNodeType.CONDITION_GROUP);

      const existingEnd = nodes.find((n) => n.type === FlowNodeType.END);
      if (existingEnd) {
        // Update triggerSource so EndNode reflects the latest invocation intent
        // (e.g., CONDITION overrides a prior DIRECT when CG nodes are present)
        updateNode(existingEnd.id, { triggerSource } as Parameters<typeof updateNode>[1]);
        // Wire any CG node not yet connected to the existing EndNode
        allCGNodes.forEach((cgNode) => {
          const alreadyConnected = edges.some(
            (e) => e.source === cgNode.id && e.target === existingEnd.id
          );
          if (!alreadyConnected) {
            addEdge(makeEdge(cgNode.id, existingEnd.id) as Parameters<typeof addEdge>[0]);
          }
        });
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

      // Connect every CG node (including the triggering one) to the new EndNode
      allCGNodes.forEach((cgNode) => {
        addEdge(makeEdge(cgNode.id, nodeId) as Parameters<typeof addEdge>[0]);
      });

      // Fallback: if no CG nodes exist (e.g. triggered from a non-CG node), wire sourceNodeId
      if (allCGNodes.length === 0) {
        addEdge(makeEdge(sourceNodeId, nodeId) as Parameters<typeof addEdge>[0]);
      }
    },
    [sourceNodeId, nodes, edges, getSourcePosition, addNode, addEdge, updateNode]
  );

  const createSelectNodeFromJoin = useCallback(() => {
    const allTableIds = nodes
      .filter((n) => n.type === FlowNodeType.TABLE)
      .map((n) => n.id);
    // Ensure the triggering node is included even if it's not TABLE type (e.g. JOIN)
    if (!allTableIds.includes(sourceNodeId)) allTableIds.push(sourceNodeId);

    const existing = nodes.find((n) => n.type === FlowNodeType.SELECT);
    if (existing) {
      allTableIds.forEach((tableId) => {
        addEdge(makeEdge(tableId, existing.id) as Parameters<typeof addEdge>[0]);
      });
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
    allTableIds.forEach((tableId) => {
      addEdge(makeEdge(tableId, nodeId) as Parameters<typeof addEdge>[0]);
    });
  }, [sourceNodeId, nodes, getSourcePosition, addNode, addEdge]);

  /** Creates a DataSourceNode downstream of OperatorNode. Skips if one already exists. */
  const createDataSourceNode = useCallback(() => {
    const existing = nodes.find((n) => n.type === FlowNodeType.DATA_SOURCE);
    if (existing) return;
    const { x, y } = getSourcePosition();
    const nodeId = `datasource_${Date.now()}`;
    addNode({
      id: nodeId,
      type: FlowNodeType.DATA_SOURCE,
      position: { x: x + X_OFFSET, y },
      data: { selectedTables: [] },
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
      case FlowNodeType.OPERATOR:
        createDataSourceNode();
        break;
      case FlowNodeType.TABLE:
      case FlowNodeType.JOIN:
        createSelectNodeFromJoin();
        break;
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
        createDataSourceNode();
    }
  }, [
    sourceNodeType,
    createDataSourceNode,
    createSelectNodeFromJoin,
    createConditionDefinitionNode,
    createRelationNode,
    createEndNode,
  ]);

  const handleDirectExecute = useCallback(() => {
    createEndNode(EndNodeTriggerSource.DIRECT);
  }, [createEndNode]);

  const handleExecuteSave = useCallback(() => {
    createEndNode(EndNodeTriggerSource.CONDITION);
  }, [createEndNode]);

  const handleCreateSelectNode = useCallback(() => {
    createSelectNodeFromJoin();
  }, [createSelectNodeFromJoin]);

  return { hintText, showDirectExecute, showExecuteSave, showSelectAction, showJoinAction, showBindAction, bindActionDisabled, handleCreateNextNode, handleDirectExecute, handleExecuteSave, handleCreateSelectNode, handleCreateJoinEdge };
}
