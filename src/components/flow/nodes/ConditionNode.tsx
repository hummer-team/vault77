/**
 * Condition Node Component
 * Displays a single WHERE condition with field, operator, and value
 */

import React, { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Button, Tag, Space, Tooltip } from 'antd';
import {
  FilterOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { ConditionNodeData, LogicType } from '../../../services/flow/types';
import { FLOW_COLORS, SQL_OPERATORS } from '../../../services/flow/constants';

interface ConditionNodeProps {
  id: string;
  data: ConditionNodeData;
  selected?: boolean;
}

// Logic type colors
const LOGIC_TYPE_COLORS: Record<LogicType, string> = {
  AND: '#52c41a',
  OR: '#fa8c16',
};

// Logic type labels
const LOGIC_TYPE_LABELS: Record<LogicType, string> = {
  AND: '且',
  OR: '或',
};

// Get operator label from value
const getOperatorLabel = (operatorValue: string): string => {
  const allOperators = [
    ...SQL_OPERATORS.comparison,
    ...SQL_OPERATORS.string,
    ...SQL_OPERATORS.null,
    ...SQL_OPERATORS.set,
  ];
  const operator = allOperators.find((op) => op.value === operatorValue);
  return operator?.label || operatorValue;
};

// Format value for display
const formatValue = (value: string | number | null | string[]): string => {
  if (value === null) return 'NULL';
  if (Array.isArray(value)) {
    return value.length > 2 ? `${value.slice(0, 2).join(', ')}...` : value.join(', ');
  }
  return String(value);
};

export const ConditionNode: React.FC<ConditionNodeProps> = ({
  id,
  data,
  selected,
}) => {
  const removeNode = useFlowStore((state) => state.removeNode);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);

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

  const isComplete = data.field && data.operator && (data.value !== undefined || data.operator.includes('NULL'));

  return (
    <div
      style={{
        background: FLOW_COLORS.node.condition.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : isComplete ? FLOW_COLORS.node.condition.border : '#ff4d4f'}`,
        borderRadius: '8px',
        minWidth: '180px',
        maxWidth: '260px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
      }}
      className="condition-node"
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
          background: FLOW_COLORS.node.condition.border,
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
          background: FLOW_COLORS.node.condition.border,
          border: '2px solid #fff',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          background: selected ? 'rgba(24, 144, 255, 0.1)' : 'transparent',
          borderBottom: '1px solid #303030',
        }}
      >
        {/* Logic type badge */}
        <Tooltip title={`逻辑关系: ${LOGIC_TYPE_LABELS[data.logicType]}`}>
          <Tag
            color={LOGIC_TYPE_COLORS[data.logicType]}
            style={{ margin: 0, marginRight: 8, fontSize: 11 }}
          >
            {LOGIC_TYPE_LABELS[data.logicType]}
          </Tag>
        </Tooltip>

        <FilterOutlined
          style={{ color: FLOW_COLORS.node.condition.border, marginRight: 8 }}
        />

        <span
          style={{
            flex: 1,
            color: '#fff',
            fontWeight: 500,
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          条件
        </span>

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

      {/* Condition details */}
      <div style={{ padding: '12px' }}>
        {/* Table and field */}
        <div
          style={{
            marginBottom: 8,
            fontSize: 12,
            color: '#d9d9d9',
          }}
        >
          <Tag color="default" style={{ fontSize: 11 }}>
            {data.tableName}
          </Tag>
          <span style={{ margin: '0 4px' }}>.</span>
          <Tag color="blue" style={{ fontSize: 11 }}>
            {data.field || '未选择字段'}
          </Tag>
        </div>

        {/* Operator */}
        {data.operator && (
          <div
            style={{
              marginBottom: 8,
              fontSize: 12,
            }}
          >
            <Tag
              color="processing"
              style={{ fontSize: 11 }}
            >
              {getOperatorLabel(data.operator)}
            </Tag>
          </div>
        )}

        {/* Value */}
        {data.value !== undefined && !data.operator.includes('NULL') && (
          <div
            style={{
              padding: '6px 10px',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '4px',
              fontSize: 12,
              color: '#d9d9d9',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={formatValue(data.value)}
          >
            {formatValue(data.value)}
          </div>
        )}

        {/* Incomplete warning */}
        {!isComplete && (
          <div
            style={{
              padding: '6px 10px',
              background: 'rgba(255, 77, 79, 0.1)',
              borderRadius: '4px',
              fontSize: 11,
              color: '#ff4d4f',
            }}
          >
            配置不完整
          </div>
        )}
      </div>
    </div>
  );
};

export default ConditionNode;
