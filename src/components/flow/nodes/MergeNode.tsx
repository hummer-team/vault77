/**
 * Merge Node Component (+ Node)
 * Aggregates multiple table inputs and allows creating next step nodes
 */

import React, { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { PlusOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { FlowNodeType } from '../../../services/flow/types';
import type { MergeNodeData } from '../../../services/flow/types';

interface MergeNodeProps {
  id: string;
  data: MergeNodeData;
  selected?: boolean;
}

export const MergeNode: React.FC<MergeNodeProps> = ({ id, selected }) => {
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const [isHovering, setIsHovering] = React.useState(false);

  const handleCreateNextNode = useCallback(
    () => {
      console.log('[MergeNode] Creating operator node from merge:', id);
      const mergeNode = nodes.find((n) => n.id === id);
      if (!mergeNode) {
        console.log('[MergeNode] Merge node not found:', id);
        return;
      }

      const mergeX = mergeNode.position.x;
      const mergeY = mergeNode.position.y;

      // Always create OPERATOR node first
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

      // Connect merge to operator
      const edge = {
        id: `e_${id}_${operatorNodeId}`,
        source: id,
        target: operatorNodeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#8c8c8c', strokeWidth: 2 },
      };
      console.log('[MergeNode] Adding edge:', edge);
      addEdge(edge as unknown as Parameters<typeof addEdge>[0]);
    },
    [id, addNode, addEdge, nodes]
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
          <span style={{ fontSize: '10px', color: '#fff', fontWeight: 'bold' }}>选择算子</span>
        </div>
      )}
    </div>
  );
};

export default MergeNode;
