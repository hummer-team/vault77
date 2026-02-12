/**
 * Operator Node Component
 * Allows user to select business operator (association, anomaly, clustering)
 */

import React, { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Select, Tag, Space, Button } from 'antd';
import { ThunderboltOutlined, DeleteOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { FLOW_COLORS, OPERATOR_CONFIG } from '../../../services/flow/constants';
import { FlowNodeType, OperatorType } from '../../../services/flow/types';
import type { OperatorNodeData } from '../../../services/flow/types';

interface OperatorNodeProps {
  id: string;
  data: OperatorNodeData;
  selected?: boolean;
}

const operatorOptions = Object.entries(OPERATOR_CONFIG).map(([key, config]) => ({
  value: key as OperatorType,
  label: config.name,
  description: config.description,
  icon: config.icon,
}));

export const OperatorNode: React.FC<OperatorNodeProps> = ({ id, data, selected }) => {
  const updateNode = useFlowStore((state) => state.updateNode);
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const removeNode = useFlowStore((state) => state.removeNode);
  const nodes = useFlowStore((state) => state.nodes);

  // Handle delete
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeNode(id);
    },
    [id, removeNode]
  );

  const handleOperatorChange = useCallback(
    (operatorType: OperatorType) => {
      // Update operator node
      updateNode(id, { operatorType });

      // Check if there's already a SELECT node connected to this operator node
      const edges = useFlowStore.getState().edges;
      const hasConnectedSelectNode = edges.some(
        (e) =>
          e.source === id &&
          nodes.find((n) => n.id === e.target)?.type === FlowNodeType.SELECT
      );

      // Don't create if already exists
      if (hasConnectedSelectNode) return;

      // Get operator node position
      const operatorNode = nodes.find((n) => n.id === id);
      if (!operatorNode) return;

      const operatorX = operatorNode.position.x;
      const operatorY = operatorNode.position.y;

      // Create SELECT node after operator selection
      const selectNodeId = `select_${Date.now()}`;
      const selectNode = {
        id: selectNodeId,
        type: FlowNodeType.SELECT,
        position: { x: operatorX + 280, y: operatorY },
        data: {
          fields: [],
          selectAll: false,
        },
      };
      addNode(selectNode as unknown as Parameters<typeof addNode>[0]);

      // Connect operator -> select
      addEdge({
        id: `e_${id}_${selectNodeId}`,
        source: id,
        target: selectNodeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#8c8c8c', strokeWidth: 2 },
      } as unknown as Parameters<typeof addEdge>[0]);
    },
    [id, updateNode, addNode, addEdge, nodes]
  );

  const selectedOperator = data.operatorType
    ? OPERATOR_CONFIG[data.operatorType]
    : null;

  return (
    <div
      style={{
        background: FLOW_COLORS.node.select.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : data.operatorType ? FLOW_COLORS.node.select.border : '#ff4d4f'}`,
        borderRadius: '8px',
        padding: '12px 16px',
        minWidth: '220px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
      }}
      className="operator-node"
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{
          width: 8,
          height: 8,
          background: FLOW_COLORS.edge.selected,
          border: '2px solid #fff',
        }}
      />

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{
          width: 8,
          height: 8,
          background: FLOW_COLORS.edge.selected,
          border: '2px solid #fff',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 12,
          color: '#fff',
          fontWeight: 500,
        }}
      >
        <ThunderboltOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
        <span>业务算子</span>
        <Space size={4} style={{ marginLeft: 'auto' }}>
          {data.operatorType && (
            <Tag color="processing" style={{ fontSize: 10 }}>
              已选择
            </Tag>
          )}
          {selected && (
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              danger
              style={{ color: '#ff4d4f' }}
            />
          )}
        </Space>
      </div>

      {/* Operator selector */}
      <Select
        placeholder="请选择业务算子"
        value={data.operatorType}
        onChange={handleOperatorChange}
        style={{ width: '100%' }}
        className="nodrag"
        dropdownStyle={{ background: '#1f1f1f', border: '1px solid #434343' }}
        popupClassName="operator-select-dropdown nodrag"
        getPopupContainer={() => document.body}
      >
        {operatorOptions.map((opt) => (
          <Select.Option key={opt.value} value={opt.value}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>{opt.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{opt.label}</div>
                <div style={{ fontSize: '11px', color: '#8c8c8c' }}>
                  {opt.description}
                </div>
              </div>
            </div>
          </Select.Option>
        ))}
      </Select>

      {/* Selected operator display */}
      {selectedOperator && (
        <div
          style={{
            marginTop: 12,
            padding: '8px',
            background: 'rgba(255, 107, 0, 0.1)',
            borderRadius: '4px',
            border: '1px solid rgba(255, 107, 0, 0.3)',
          }}
        >
          <div style={{ fontSize: '12px', color: '#fff', marginBottom: 4 }}>
            <span style={{ marginRight: '6px' }}>{selectedOperator.icon}</span>
            <span style={{ fontWeight: 500 }}>{selectedOperator.name}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>
            {selectedOperator.description}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data.operatorType && (
        <div
          style={{
            marginTop: 8,
            padding: '8px',
            textAlign: 'center',
            background: 'rgba(255, 77, 79, 0.1)',
            borderRadius: '4px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#ff4d4f' }}>
            请选择业务算子
          </span>
        </div>
      )}
    </div>
  );
};

export default OperatorNode;
