/**
 * Join Node Component
 * Displays JOIN relationship between two tables
 * Shows JOIN type, conditions, and order number
 */

import React, { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Button, Tag, Space, Tooltip } from 'antd';
import {
  LinkOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { JoinNodeData, JoinType } from '../../../services/flow/types';
import {
  FLOW_COLORS,
  JOIN_TYPE_LABELS,
} from '../../../services/flow/constants';

interface JoinNodeProps {
  id: string;
  data: JoinNodeData;
  selected?: boolean;
}

// Join type colors
const JOIN_TYPE_COLORS: Record<JoinType, string> = {
  INNER: '#52c41a',
  LEFT: '#1890ff',
  RIGHT: '#fa8c16',
  CROSS: '#722ed1',
};

// Join type icons
const JOIN_TYPE_ICONS: Record<JoinType, string> = {
  INNER: '⨝',
  LEFT: '⟕',
  RIGHT: '⟖',
  CROSS: '⨯',
};

export const JoinNode: React.FC<JoinNodeProps> = ({
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

  // Format conditions display
  const formatConditions = useCallback(() => {
    if (data.conditions.length === 0) {
      return '未配置条件';
    }
    if (data.conditions.length === 1) {
      const cond = data.conditions[0];
      return `${cond.leftTable}.${cond.leftField} = ${cond.rightTable}.${cond.rightField}`;
    }
    return `${data.conditions.length} 个关联条件`;
  }, [data.conditions]);

  return (
    <div
      style={{
        background: FLOW_COLORS.node.join.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : FLOW_COLORS.node.join.border}`,
        borderRadius: '8px',
        minWidth: '200px',
        maxWidth: '280px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
      }}
      className="join-node"
      onClick={handleClick}
    >
      {/* Left handle (from source table) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          width: 8,
          height: 8,
          background: JOIN_TYPE_COLORS[data.joinType],
          border: '2px solid #fff',
        }}
      />

      {/* Right handle (to target table) */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          width: 8,
          height: 8,
          background: JOIN_TYPE_COLORS[data.joinType],
          border: '2px solid #fff',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          background: selected ? 'rgba(250, 140, 22, 0.1)' : 'transparent',
          borderBottom: '1px solid #303030',
        }}
      >
        {/* Order badge */}
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: JOIN_TYPE_COLORS[data.joinType],
            color: '#fff',
            fontSize: 12,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
          }}
        >
          {data.order}
        </div>

        {/* Join type icon */}
        <Tooltip title={JOIN_TYPE_LABELS[data.joinType]}>
          <span
            style={{
              fontSize: 16,
              marginRight: 8,
              color: JOIN_TYPE_COLORS[data.joinType],
            }}
          >
            {JOIN_TYPE_ICONS[data.joinType]}
          </span>
        </Tooltip>

        {/* Join type label */}
        <span
          style={{
            flex: 1,
            color: '#fff',
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          {JOIN_TYPE_LABELS[data.joinType]}
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

      {/* Tables info */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: data.conditions.length > 0 ? '1px solid #303030' : 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <Tag
            color="default"
            style={{
              fontSize: 11,
              maxWidth: 100,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {data.leftTable}
          </Tag>
          <LinkOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
          <Tag
            color="default"
            style={{
              fontSize: 11,
              maxWidth: 100,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {data.rightTable}
          </Tag>
        </div>
      </div>

      {/* Conditions summary */}
      {data.conditions.length > 0 && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: '#8c8c8c',
              marginBottom: 4,
            }}
          >
            关联条件
          </div>
          <div
            style={{
              fontSize: 12,
              color: '#d9d9d9',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={formatConditions()}
          >
            {formatConditions()}
          </div>
        </div>
      )}

      {/* Empty conditions warning */}
      {data.conditions.length === 0 && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(255, 77, 79, 0.1)',
          }}
        >
          <span style={{ fontSize: 11, color: '#ff4d4f' }}>
            请配置关联条件
          </span>
        </div>
      )}
    </div>
  );
};

export default JoinNode;
