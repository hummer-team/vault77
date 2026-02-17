/**
 * Merge Node Component (+ Node)
 * Aggregates multiple table inputs and allows creating next step nodes
 * Supports dynamic hint text based on upstream node type (Q17)
 */

import React, { useCallback, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { PlusOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { FlowNodeType, LogicType } from '../../../services/flow/types';
import type { MergeNodeData } from '../../../services/flow/types';
import { generateConditionGroupRefId } from '../../../services/flow/flowService';

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
        return '定义条件关系';
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
      const conditionDefNodeId = `cond_def_${Date.now()}`;
      const conditionDefNode = {
        id: conditionDefNodeId,
        type: FlowNodeType.CONDITION_DEFINITION,
        position: { x: mergeX + 180, y: mergeY },
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
      };
      console.log('[MergeNode] Adding condition definition node:', conditionDefNode);
      addNode(conditionDefNode as unknown as Parameters<typeof addNode>[0]);

      // Connect merge to condition definition
      const edge = {
        id: `e_${id}_${conditionDefNodeId}`,
        source: id,
        target: conditionDefNodeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#8c8c8c', strokeWidth: 2 },
        markerEnd: { type: 'arrowclosed', color: '#8c8c8c' },
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
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#8c8c8c', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: '#8c8c8c' },
        };
        addEdge(nextEdge as unknown as Parameters<typeof addEdge>[0]);
      } else {
        console.log('[MergeNode] Reusing existing "定义节点关系" merge node:', existingNextMerge.id);
        // Connect to existing merge node
        const nextEdge = {
          id: `e_${conditionDefNodeId}_${existingNextMerge.id}`,
          source: conditionDefNodeId,
          target: existingNextMerge.id,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#8c8c8c', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: '#8c8c8c' },
        };
        addEdge(nextEdge as unknown as Parameters<typeof addEdge>[0]);
      }
    },
    [id, addNode, addEdge, nodes, edges]
  );

  // Create relation node
  const createRelationNode = useCallback(
    (mergeX: number, mergeY: number) => {
      const relationNodeId = `relation_${Date.now()}`;
      const relationNode = {
        id: relationNodeId,
        type: FlowNodeType.CONDITION_GROUP,
        position: { x: mergeX + 180, y: mergeY },
        data: {
          logicType: LogicType.AND,
          conditionIds: [],
        },
      };
      console.log('[MergeNode] Adding relation node:', relationNode);
      addNode(relationNode as unknown as Parameters<typeof addNode>[0]);

      // Connect merge to relation
      const edge = {
        id: `e_${id}_${relationNodeId}`,
        source: id,
        target: relationNodeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#8c8c8c', strokeWidth: 2 },
        markerEnd: { type: 'arrowclosed', color: '#8c8c8c' },
      };
      addEdge(edge as unknown as Parameters<typeof addEdge>[0]);

      // Auto-create next merge node for end
      const nextMergeNodeId = `merge_${Date.now()}_2`;
      const nextMergeNode = {
        id: nextMergeNodeId,
        type: FlowNodeType.MERGE,
        position: { x: mergeX + 500, y: mergeY },
        data: { tableCount: 1 },
      };
      addNode(nextMergeNode as unknown as Parameters<typeof addNode>[0]);

      // Connect relation to next merge
      const nextEdge = {
        id: `e_${relationNodeId}_${nextMergeNodeId}`,
        source: relationNodeId,
        target: nextMergeNodeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#8c8c8c', strokeWidth: 2 },
        markerEnd: { type: 'arrowclosed', color: '#8c8c8c' },
      };
      addEdge(nextEdge as unknown as Parameters<typeof addEdge>[0]);
    },
    [id, addNode, addEdge]
  );

  // Create end node
  const createEndNode = useCallback(
    (mergeX: number, mergeY: number) => {
      const endNodeId = `end_${Date.now()}`;
      const endNode = {
        id: endNodeId,
        type: FlowNodeType.END,
        position: { x: mergeX + 250, y: mergeY },
        data: {
          operatorType: 'association',
          executable: true,
          errors: [],
        },
      };
      console.log('[MergeNode] Adding end node:', endNode);
      addNode(endNode as unknown as Parameters<typeof addNode>[0]);

      // Connect merge to end
      const edge = {
        id: `e_${id}_${endNodeId}`,
        source: id,
        target: endNodeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#8c8c8c', strokeWidth: 2 },
        markerEnd: { type: 'arrowclosed', color: '#8c8c8c' },
      };
      addEdge(edge as unknown as Parameters<typeof addEdge>[0]);
    },
    [id, addNode, addEdge]
  );

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
          // After condition definition, check if relation node already exists
          const existingRelation = nodes.find((n) => n.type === FlowNodeType.CONDITION_GROUP);
          if (existingRelation) {
            console.log('[MergeNode] Relation node already exists, will NOT connect automatically');
            // Don't auto-connect - user needs to manually connect from condition definition to relation
            // Just create the next merge node if it doesn't exist
            const existingNextMerge = nodes.find((n) => 
              n.type === FlowNodeType.MERGE && 
              edges.some(e => e.source === existingRelation.id && e.target === n.id)
            );
            if (!existingNextMerge) {
              // Create merge node after relation if not exists
              const nextMergeNodeId = `merge_${Date.now()}`;
              const nextMergeNode = {
                id: nextMergeNodeId,
                type: FlowNodeType.MERGE,
                position: { x: existingRelation.position.x + 220, y: existingRelation.position.y },
                data: { tableCount: 1 },
              };
              addNode(nextMergeNode as unknown as Parameters<typeof addNode>[0]);
              
              // Connect relation to new merge
              const nextEdge = {
                id: `e_${existingRelation.id}_${nextMergeNodeId}`,
                source: existingRelation.id,
                target: nextMergeNodeId,
                type: 'smoothstep',
                animated: false,
                style: { stroke: '#8c8c8c', strokeWidth: 2 },
                markerEnd: { type: 'arrowclosed', color: '#8c8c8c' },
              };
              addEdge(nextEdge as unknown as Parameters<typeof addEdge>[0]);
            }
          } else {
            // Create new relation node (only first time)
            createRelationNode(mergeX, mergeY);
          }
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
              position: { x: mergeX + 250, y: mergeY },
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
              type: 'smoothstep',
              animated: false,
              style: { stroke: '#8c8c8c', strokeWidth: 2 },
              markerEnd: { type: 'arrowclosed', color: '#8c8c8c' },
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
              position: { x: mergeX + 250, y: mergeY },
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
              type: 'smoothstep',
              animated: false,
              style: { stroke: '#8c8c8c', strokeWidth: 2 },
              markerEnd: { type: 'arrowclosed', color: '#8c8c8c' },
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
          ? 'rgba(255, 107, 0, 0.25)'
          : 'rgba(28, 25, 23, 0.98)',
        border: `2px solid ${selected ? '#FF6B00' : 'rgba(255, 107, 0, 0.6)'}`,
        borderRadius: '50%',
        width: '64px',
        height: '64px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: selected
          ? '0 0 20px rgba(255, 107, 0, 0.5)'
          : '0 4px 15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 107, 0, 0.2)',
        cursor: 'grab',
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Input handles - multiple tables can connect */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{
          width: 10,
          height: 10,
          background: '#FF6B00',
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
            fontSize: '28px',
            color: selected ? '#FF6B00' : 'rgba(255, 255, 255, 0.9)',
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
          background: '#FF6B00',
          border: '2px solid #fff',
        }}
      />

      {/* Click overlay for creating next nodes */}
      {isHovering && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 107, 0, 0.9)',
            cursor: 'pointer',
          }}
          className="nodrag"
          onClick={(e) => {
            e.stopPropagation();
            console.log('[MergeNode] Overlay clicked, calling handleCreateNextNode');
            handleCreateNextNode();
          }}
        >
          <span style={{ fontSize: '11px', color: '#fff', fontWeight: 'bold' }}>
            {hintText}
          </span>
        </div>
      )}
    </div>
  );
};

export default MergeNode;
