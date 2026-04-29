/**
 * Merge Node Component (+ Node)
 * Aggregates multiple table inputs and allows creating next step nodes.
 * On hover, shows a floating overlay with two actions:
 *   - Primary: context-aware next step (定义条件 / 绑定关系 / 执行OR保存)
 *   - Secondary: 直接执行 (skips conditions, connects EndNode immediately)
 */

import React, { useCallback, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { FlowNodeType, LogicType, EndNodeTriggerSource } from '../../../services/flow/types';
import type { MergeNodeData, ConditionDefinitionNodeData } from '../../../services/flow/types';
import { generateConditionGroupRefId, generateConditionGroupDefinitionDisplayName } from '../../../services/flow/flowService';

// ---------------------------------------------------------------------------
// Style constants (outside component to avoid recreating on every render)
// ---------------------------------------------------------------------------
const OVERLAY_CARD_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 10px)',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'var(--vm-flow-node-bg)',
  border: '1px solid var(--vm-primary-border)',
  borderRadius: 8,
  minWidth: 112,
  overflow: 'hidden',
  boxShadow: 'var(--vm-flow-shadow-lg)',
  backdropFilter: 'blur(8px)',
  zIndex: 1000,
};

const OVERLAY_DIVIDER_STYLE: React.CSSProperties = {
  height: 1,
  background: 'var(--vm-primary-border)',
};

const OVERLAY_BTN_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  padding: '7px 12px',
  background: 'transparent',
  border: 'none',
  color: 'var(--vm-text-primary)',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 0.15s',
  whiteSpace: 'nowrap',
};

// ---------------------------------------------------------------------------
// MergeActionButton — extracted to keep MergeNode render lean
// ---------------------------------------------------------------------------
interface MergeActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}

const MergeActionButton: React.FC<MergeActionButtonProps> = ({ icon, label, onClick }) => {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      style={{
        ...OVERLAY_BTN_BASE,
        background: hovered ? 'var(--vm-primary-light)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

// ---------------------------------------------------------------------------
// MergeOverlay — the floating action card shown on node hover
// ---------------------------------------------------------------------------
interface MergeOverlayProps {
  primaryLabel: string;
  showDirectExecute: boolean;
  onPrimary: (e: React.MouseEvent) => void;
  onDirectExecute: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const MergeOverlay: React.FC<MergeOverlayProps> = ({
  primaryLabel,
  showDirectExecute,
  onPrimary,
  onDirectExecute,
  onMouseEnter,
  onMouseLeave,
}) => (
  <div
    className="nodrag"
    style={OVERLAY_CARD_STYLE}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
  >
    <MergeActionButton
      icon={<PlusOutlined style={{ fontSize: 11 }} />}
      label={primaryLabel}
      onClick={onPrimary}
    />
    {showDirectExecute && (
      <>
        <div style={OVERLAY_DIVIDER_STYLE} />
        <MergeActionButton
          icon={<PlayCircleOutlined style={{ fontSize: 11, color: 'var(--vm-flow-success)' }} />}
          label="直接执行"
          onClick={onDirectExecute}
        />
      </>
    )}
  </div>
);

interface MergeNodeProps {
  id: string;
  data: MergeNodeData & { label?: string };
  selected?: boolean;
}

export const MergeNode: React.FC<MergeNodeProps> = ({ id, data, selected }) => {
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const [isHovering, setIsHovering] = React.useState(false);
  // Debounced hide: moving mouse from node circle to overlay card cancels the timer.
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setIsHovering(false), 120);
  }, []);

  // Determine the upstream node type to show appropriate hint (Q17)
  const upstreamNodeType = useMemo(() => {
    const incomingEdge = edges.find((e) => e.target === id);
    if (!incomingEdge) return null;
    const upstreamNode = nodes.find((n) => n.id === incomingEdge.source);
    return upstreamNode?.type || null;
  }, [edges, nodes, id]);

  // Get hint text based on upstream node type (Q17)
  const hintText = useMemo(() => {
    switch (upstreamNodeType) {
      case FlowNodeType.SELECT:
      case FlowNodeType.SELECT_AGG:
        return '定义条件';
      case FlowNodeType.CONDITION_DEFINITION:
        return '绑定关系';
      case FlowNodeType.CONDITION_GROUP:
      case FlowNodeType.CONDITION:
        return '执行OR保存';
      default:
        return data.label || '选择算子';
    }
  }, [upstreamNodeType, data.label]);

  // Create condition definition node (CG1, CG2, etc.)
  const createConditionDefinitionNode = useCallback(
    (mergeX: number, mergeY: number) => {
      const refId = generateConditionGroupRefId(nodes);
      const groupDisplayName = generateConditionGroupDefinitionDisplayName(refId);
      const conditionDefNodeId = `cond_def_${Date.now()}`;
      const conditionDefNode = {
        id: conditionDefNodeId,
        type: FlowNodeType.CONDITION_DEFINITION,
        position: { x: mergeX + 180, y: mergeY },
        data: {
          refId,
          groupDisplayName,
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
      };
      console.log('[MergeNode] Adding condition definition node:', conditionDefNode);
      addNode(conditionDefNode as unknown as Parameters<typeof addNode>[0]);

      // Connect merge to condition definition
      const edge = {
        id: `e_${id}_${conditionDefNodeId}`,
        source: id,
        target: conditionDefNodeId,
        type: 'default',
        animated: false,
        style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
      };
      addEdge(edge as unknown as Parameters<typeof addEdge>[0]);

      // Only create next merge node if it doesn't exist yet
      // Check if there's already a merge node for "定义节点关系"
      const existingNextMerge = nodes.find((n) => {
        if (n.type !== FlowNodeType.MERGE) return false;
        // Check if this merge node is connected from any CONDITION_DEFINITION node
        return edges.some(e => {
          const sourceNode = nodes.find(node => node.id === e.source);
          return sourceNode?.type === FlowNodeType.CONDITION_DEFINITION && e.target === n.id;
        });
      });

      if (!existingNextMerge) {
        console.log('[MergeNode] Creating first "定义节点关系" merge node');
        // Auto-create next merge node for relation (only once)
        const nextMergeNodeId = `merge_${Date.now()}`;
        const nextMergeNode = {
          id: nextMergeNodeId,
          type: FlowNodeType.MERGE,
          position: { x: mergeX + 400, y: mergeY },
          data: { tableCount: 1 },
        };
        addNode(nextMergeNode as unknown as Parameters<typeof addNode>[0]);

        // Connect condition definition to next merge
        const nextEdge = {
          id: `e_${conditionDefNodeId}_${nextMergeNodeId}`,
          source: conditionDefNodeId,
          target: nextMergeNodeId,
          type: 'default',
          animated: false,
          style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
        };
        addEdge(nextEdge as unknown as Parameters<typeof addEdge>[0]);
      } else {
        console.log('[MergeNode] Reusing existing "定义节点关系" merge node:', existingNextMerge.id);
        // Connect to existing merge node
        const nextEdge = {
          id: `e_${conditionDefNodeId}_${existingNextMerge.id}`,
          source: conditionDefNodeId,
          target: existingNextMerge.id,
          type: 'default',
          animated: false,
          style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
        };
        addEdge(nextEdge as unknown as Parameters<typeof addEdge>[0]);
      }
    },
    [id, addNode, addEdge, nodes, edges]
  );

  // Create relation node with connection to end merge
  const createRelationNode = useCallback(
    (mergeX: number, mergeY: number) => {
      const timestamp = Date.now();

      // Get all available condition definition nodes (CG1, CG2, etc.)
      const availableConditionDefs = nodes.filter(
        (n) => n.type === FlowNodeType.CONDITION_DEFINITION
      );

      // Auto-select all available condition definition nodes by refId
      const conditionIds = availableConditionDefs.map(
        (n) => (n.data as ConditionDefinitionNodeData).refId
      );

      console.log('[MergeNode] Auto-selecting conditions:', conditionIds);

      const relationNodeId = `relation_${timestamp}`;
      const relationNode = {
        id: relationNodeId,
        type: FlowNodeType.CONDITION_GROUP,
        position: { x: mergeX + 180, y: mergeY },
        data: {
          logicType: LogicType.AND,
          conditionIds: conditionIds,
        },
      };
      console.log('[MergeNode] Adding relation node:', relationNode);
      addNode(relationNode as unknown as Parameters<typeof addNode>[0]);

      // Connect merge to relation
      const edge = {
        id: `e_${id}_${relationNodeId}`,
        source: id,
        target: relationNodeId,
        type: 'default',
        animated: false,
        style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
      };
      addEdge(edge as unknown as Parameters<typeof addEdge>[0]);

      // Find or create the "执行OR保存" merge node
      const existingEndMerge = nodes.find((n) => {
        if (n.type !== FlowNodeType.MERGE) return false;
        // Check if this merge node is connected from any CONDITION_GROUP node
        return edges.some(e => {
          const sourceNode = nodes.find(node => node.id === e.source);
          return sourceNode?.type === FlowNodeType.CONDITION_GROUP && e.target === n.id;
        });
      });

      let endMergeNodeId: string;
      let endMergeNode: { id: string; type: FlowNodeType.MERGE; position: { x: number; y: number }; data: { tableCount: number } };

      if (!existingEndMerge) {
        // Create new "执行OR保存" merge node
        endMergeNodeId = `merge_${timestamp}_end`;
        endMergeNode = {
          id: endMergeNodeId,
          type: FlowNodeType.MERGE,
          position: { x: mergeX + 450, y: mergeY },
          data: { tableCount: 1 },
        };
        console.log('[MergeNode] Creating new end merge node:', endMergeNodeId);
        addNode(endMergeNode as unknown as Parameters<typeof addNode>[0]);
      } else {
        endMergeNodeId = existingEndMerge.id;
        console.log('[MergeNode] Reusing existing end merge node:', endMergeNodeId);
      }

      // Connect relation to end merge
      const nextEdge = {
        id: `e_${relationNodeId}_${endMergeNodeId}`,
        source: relationNodeId,
        target: endMergeNodeId,
        type: 'default',
        animated: false,
        style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
      };
      addEdge(nextEdge as unknown as Parameters<typeof addEdge>[0]);
    },
    [id, addNode, addEdge, nodes, edges]
  );

  // Create end node (only once)
  const createEndNode = useCallback(
    (mergeX: number, mergeY: number, triggerSource: EndNodeTriggerSource = EndNodeTriggerSource.CONDITION) => {
      // Check if END node already exists in the flow
      const existingEnd = nodes.find((n) => n.type === FlowNodeType.END);
      if (existingEnd) {
        console.log('[MergeNode] End node already exists:', existingEnd.id);
        // Connect current merge to existing end node
        const edge = {
          id: `e_${id}_${existingEnd.id}`,
          source: id,
          target: existingEnd.id,
          type: 'default',
          animated: false,
          style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
        };
        addEdge(edge as unknown as Parameters<typeof addEdge>[0]);
        return;
      }

      // Create new END node (only if none exists)
      const endNodeId = `end_${Date.now()}`;
      const endNode = {
        id: endNodeId,
        type: FlowNodeType.END,
        position: { x: mergeX + 220, y: mergeY },
        data: {
          operatorType: 'association',
          executable: true,
          errors: [],
          triggerSource,
        },
      };
      console.log('[MergeNode] Adding end node:', endNode);
      addNode(endNode as unknown as Parameters<typeof addNode>[0]);

      // Connect merge to end
      const edge = {
        id: `e_${id}_${endNodeId}`,
        source: id,
        target: endNodeId,
        type: 'default',
        animated: false,
        style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
      };
      addEdge(edge as unknown as Parameters<typeof addEdge>[0]);
    },
    [id, addNode, addEdge, nodes]
  );

  // Directly connect the current merge node to an EndNode, skipping condition steps
  const handleDirectExecute = useCallback(() => {
    const mergeNode = nodes.find((n) => n.id === id);
    if (!mergeNode) return;
    console.log('[MergeNode] Direct execute: connecting to EndNode from:', id);
    createEndNode(mergeNode.position.x, mergeNode.position.y, EndNodeTriggerSource.DIRECT);
  }, [id, nodes, createEndNode]);

  const handleCreateNextNode = useCallback(
    () => {
      console.log('[MergeNode] Creating next node from merge:', id);
      const mergeNode = nodes.find((n) => n.id === id);
      if (!mergeNode) {
        console.log('[MergeNode] Merge node not found:', id);
        return;
      }

      const mergeX = mergeNode.position.x;
      const mergeY = mergeNode.position.y;

      // Route based on upstream node type (Q17)
      switch (upstreamNodeType) {
        case FlowNodeType.SELECT:
        case FlowNodeType.SELECT_AGG:
          // After select, create condition definition node
          createConditionDefinitionNode(mergeX, mergeY);
          break;

        case FlowNodeType.CONDITION_DEFINITION:
          // After condition definition, create a new relation node every time (support multiple)
          // Each relation node will be auto-connected to the "执行OR保存" merge node
          console.log('[MergeNode] Creating new relation node from condition definition');
          createRelationNode(mergeX, mergeY);
          break;

        case FlowNodeType.CONDITION_GROUP:
        case FlowNodeType.CONDITION:
          // After condition/relation, create end node
          createEndNode(mergeX, mergeY);
          break;

        default:
          // Default behavior based on label
          if (data.label === '选择列') {
            // Check if select node already exists
            const existingSelect = nodes.find((n) => n.type === FlowNodeType.SELECT);
            if (existingSelect) {
              console.log('[MergeNode] Select node already exists:', existingSelect.id);
              return;
            }

            // Create SELECT node (default select all columns)
            const selectNodeId = `select_${Date.now()}`;
            const selectNode = {
              id: selectNodeId,
              type: FlowNodeType.SELECT,
              position: { x: mergeX + 220, y: mergeY },
              data: {
                fields: [],
                selectAll: true, // Default to selecting all columns
              },
            };
            console.log('[MergeNode] Adding select node:', selectNode);
            addNode(selectNode as unknown as Parameters<typeof addNode>[0]);

            // Connect merge to select with arrow marker
            const edge = {
              id: `e_${id}_${selectNodeId}`,
              source: id,
              target: selectNodeId,
              type: 'default',
              animated: false,
              style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
              markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
            };
            console.log('[MergeNode] Adding edge:', edge);
            addEdge(edge as unknown as Parameters<typeof addEdge>[0]);
          } else {
            // Default: create OPERATOR node (only one allowed)
            const existingOperator = nodes.find((n) => n.type === FlowNodeType.OPERATOR);
            if (existingOperator) {
              console.log('[MergeNode] Operator node already exists:', existingOperator.id);
              return;
            }

            const operatorNodeId = `operator_${Date.now()}`;
            const operatorNode = {
              id: operatorNodeId,
              type: FlowNodeType.OPERATOR,
              position: { x: mergeX + 220, y: mergeY },
              data: {
                operatorType: undefined,
              },
            };
            console.log('[MergeNode] Adding operator node:', operatorNode);
            addNode(operatorNode as unknown as Parameters<typeof addNode>[0]);

            // Connect merge to operator with arrow marker
            const edge = {
              id: `e_${id}_${operatorNodeId}`,
              source: id,
              target: operatorNodeId,
              type: 'default',
              animated: false,
              style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
              markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
            };
            console.log('[MergeNode] Adding edge:', edge);
            addEdge(edge as unknown as Parameters<typeof addEdge>[0]);
          }
      }
    },
    [
      id,
      addNode,
      addEdge,
      nodes,
      data.label,
      upstreamNodeType,
      createConditionDefinitionNode,
      createRelationNode,
      createEndNode,
    ]
  );

  return (
    <div
      style={{
        background: selected
          ? 'var(--vm-primary-light)'
          : 'var(--vm-flow-node-bg)',
        border: `2px solid ${selected ? 'var(--vm-primary)' : 'var(--vm-primary-border)'}`,
        borderRadius: '50%',
        width: '48px',
        height: '48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: selected
          ? '0 0 20px var(--vm-primary-glow)'
          : 'var(--vm-flow-shadow-node-unselected)',
        cursor: 'grab',
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Input handles - multiple tables can connect */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{
          width: 10,
          height: 10,
          background: 'var(--vm-primary)',
          border: '2px solid #fff',
        }}
      />

      {/* Center content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PlusOutlined
          style={{
            fontSize: '20px',
            color: selected ? 'var(--vm-primary)' : 'var(--vm-text-primary)',
          }}
        />
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{
          width: 10,
          height: 10,
          background: 'var(--vm-primary)',
          border: '2px solid #fff',
        }}
      />

      {/* Floating action overlay — appears above the node on hover */}
      {isHovering && (
        <MergeOverlay
          primaryLabel={hintText}
          showDirectExecute={upstreamNodeType !== FlowNodeType.TABLE}
          onPrimary={(e) => {
            e.stopPropagation();
            handleCreateNextNode();
          }}
          onDirectExecute={(e) => {
            e.stopPropagation();
            handleDirectExecute();
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      )}
    </div>
  );
};

export default MergeNode;
