/**
 * Select Node Component
 * Displays selected fields for output with optional aggregation
 */

import React, { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Button, Tag, Space, Tooltip, List } from 'antd';
import {
  TableOutlined,
  DeleteOutlined,
  EditOutlined,
  FunctionOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { SelectNodeData } from '../../../services/flow/types';
import { FLOW_COLORS } from '../../../services/flow/constants';

interface SelectNodeProps {
  id: string;
  data: SelectNodeData;
  selected?: boolean;
}

// Aggregation function labels
const AGG_FUNCTION_LABELS: Record<string, string> = {
  SUM: '求和',
  COUNT: '计数',
  AVG: '平均',
  MIN: '最小',
  MAX: '最大',
};

// Aggregation function colors
const AGG_FUNCTION_COLORS: Record<string, string> = {
  SUM: '#1890ff',
  COUNT: '#52c41a',
  AVG: '#fa8c16',
  MIN: '#722ed1',
  MAX: '#eb2f96',
};

export const SelectNode: React.FC<SelectNodeProps> = ({
  id,
  data,
  selected,
}) => {
  const removeNode = useFlowStore((state) => state.removeNode);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);

  // Handle delete
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeNode(id);
    },
    [id, removeNode]
  );

  // Handle click
  const handleClick = useCallback(() => {
    setSelectedNode(id);
  }, [id, setSelectedNode]);

  // Check if there's already a condition node connected to this select node
  const hasConnectedConditionNode = React.useMemo(() => {
    return edges.some((e) => e.source === id && nodes.find((n) => n.id === e.target)?.type === 'condition');
  }, [edges, nodes, id]);

  // Auto-create condition node after select node if not exists
  React.useEffect(() => {
    // Only auto-create if:
    // 1. Fields have been selected
    // 2. No condition node is already connected
    // 3. The SelectNode itself exists in the flow
    if (data.fields.length > 0 && !hasConnectedConditionNode) {
      const selectNode = nodes.find((n) => n.id === id);
      if (!selectNode) return;

      // Check again to prevent race conditions
      const currentEdges = useFlowStore.getState().edges;
      const currentNodes = useFlowStore.getState().nodes;
      const alreadyHasCondition = currentEdges.some(
        (e) =>
          e.source === id &&
          currentNodes.find((n) => n.id === e.target)?.type === 'condition'
      );

      if (alreadyHasCondition) return;

      const selectX = selectNode.position.x;
      const selectY = selectNode.position.y;

      // Create condition node
      const conditionNodeId = `condition_${Date.now()}`;
      const conditionNode = {
        id: conditionNodeId,
        type: 'condition' as const,
        position: { x: selectX + 280, y: selectY },
        data: {
          logicType: 'AND',
          tableName: '',
          field: '',
          operator: '=',
          value: '',
        },
      };
      addNode(conditionNode as unknown as Parameters<typeof addNode>[0]);

      // Connect select -> condition
      addEdge({
        id: `e_${id}_${conditionNodeId}`,
        source: id,
        target: conditionNodeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#8c8c8c', strokeWidth: 2 },
      } as unknown as Parameters<typeof addEdge>[0]);
    }
  }, [data.fields.length, hasConnectedConditionNode, id, nodes, addNode, addEdge]);

  const hasFields = data.fields.length > 0 || data.selectAll;

  return (
    <div
      style={{
        background: FLOW_COLORS.node.select.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : hasFields ? FLOW_COLORS.node.select.border : '#ff4d4f'}`,
        borderRadius: '8px',
        minWidth: '220px',
        maxWidth: '300px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
      }}
      className="select-node"
      onClick={handleClick}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{
          width: 8,
          height: 8,
          background: FLOW_COLORS.node.select.border,
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
          background: FLOW_COLORS.node.select.border,
          border: '2px solid #fff',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          background: selected ? 'rgba(82, 196, 26, 0.1)' : 'transparent',
          borderBottom: (data.fields.length > 0 || data.selectAll) ? '1px solid #303030' : 'none',
        }}
      >
        <TableOutlined
          style={{ color: FLOW_COLORS.node.select.border, marginRight: 8 }}
        />

        <span
          style={{
            flex: 1,
            color: '#fff',
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          选择列
        </span>

        {/* Field count badge */}
        {!data.selectAll && data.fields.length > 0 && (
          <Tag color="success" style={{ margin: 0, marginRight: 8 }}>
            {data.fields.length} 列
          </Tag>
        )}

        {data.selectAll && (
          <Tag color="success" style={{ margin: 0, marginRight: 8 }}>
            全部
          </Tag>
        )}

        {/* Actions */}
        {selected && (
          <Space size={4}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              style={{ color: '#8c8c8c' }}
            />
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              danger
              style={{ color: '#ff4d4f' }}
            />
          </Space>
        )}
      </div>

      {/* Selected fields list */}
      {!data.selectAll && data.fields.length > 0 && (
        <div
          style={{
            padding: '8px',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          <List
            size="small"
            dataSource={data.fields}
            renderItem={(field) => (
              <div
                style={{
                  padding: '6px 8px',
                  marginBottom: 4,
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {/* Aggregation function */}
                {field.aggregate && (
                  <Tooltip title={AGG_FUNCTION_LABELS[field.aggregate]}>
                    <Tag
                      icon={<FunctionOutlined />}
                      color={AGG_FUNCTION_COLORS[field.aggregate]}
                      style={{ margin: 0, marginRight: 8, fontSize: 10 }}
                    >
                      {field.aggregate}
                    </Tag>
                  </Tooltip>
                )}

                {/* Table and field name */}
                <div style={{ flex: 1, fontSize: 12 }}>
                  <Tag color="default" style={{ fontSize: 10, marginRight: 4 }}>
                    {field.tableName}
                  </Tag>
                  <span style={{ color: '#d9d9d9' }}>{field.fieldName}</span>
                </div>

                {/* Alias */}
                {field.alias && (
                  <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>
                    as {field.alias}
                  </Tag>
                )}
              </div>
            )}
          />
        </div>
      )}

      {/* Select all message */}
      {data.selectAll && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            color: '#52c41a',
            fontSize: 12,
          }}
        >
          已选择所有字段
        </div>
      )}

      {/* Empty state */}
      {!data.selectAll && data.fields.length === 0 && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            background: 'rgba(255, 77, 79, 0.1)',
          }}
        >
          <span style={{ fontSize: 11, color: '#ff4d4f' }}>
            请至少选择一个字段
          </span>
        </div>
      )}
    </div>
  );
};

export default SelectNode;
