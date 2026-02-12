/**
 * Condition Group Node Component
 * Groups multiple conditions with AND/OR logic
 * Supports nested groups
 */

import React, { useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Button, Space, Tooltip, Badge } from 'antd';
import {
  FilterOutlined,
  DeleteOutlined,
  PlusOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { ConditionGroupNodeData, LogicType } from '../../../services/flow/types';
import { FLOW_COLORS } from '../../../services/flow/constants';

interface ConditionGroupNodeProps {
  id: string;
  data: ConditionGroupNodeData;
  selected?: boolean;
}

// Logic type colors
const LOGIC_TYPE_COLORS: Record<LogicType, { bg: string; border: string; text: string }> = {
  AND: {
    bg: 'rgba(82, 196, 26, 0.15)',
    border: '#52c41a',
    text: '#52c41a',
  },
  OR: {
    bg: 'rgba(250, 140, 22, 0.15)',
    border: '#fa8c16',
    text: '#fa8c16',
  },
};

// Logic type labels
const LOGIC_TYPE_LABELS: Record<LogicType, string> = {
  AND: '全部满足 (AND)',
  OR: '任一满足 (OR)',
};

export const ConditionGroupNode: React.FC<ConditionGroupNodeProps> = ({
  id,
  data,
  selected,
}) => {
  const removeNode = useFlowStore((state) => state.removeNode);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const nodes = useFlowStore((state) => state.nodes);
  const [expanded, setExpanded] = useState(true);

  // Get child condition nodes
  const childNodes = nodes.filter((n) =>
    data.conditionIds.includes(n.id)
  );

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

  // Toggle expand
  const handleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  const colors = LOGIC_TYPE_COLORS[data.logicType];

  return (
    <div
      style={{
        background: colors.bg,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : colors.border}`,
        borderRadius: '8px',
        minWidth: '200px',
        maxWidth: '300px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
      }}
      className="condition-group-node"
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
          background: colors.border,
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
          background: colors.border,
          border: '2px solid #fff',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          background: selected ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          borderBottom: childNodes.length > 0 && expanded ? `1px solid ${colors.border}` : 'none',
        }}
      >
        {/* Logic type icon */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '4px',
            background: colors.border,
            color: '#fff',
            fontSize: 12,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
          }}
        >
          {data.logicType}
        </div>

        <FilterOutlined style={{ color: colors.text, marginRight: 8 }} />

        <span
          style={{
            flex: 1,
            color: '#fff',
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          {LOGIC_TYPE_LABELS[data.logicType]}
        </span>

        {/* Condition count */}
        <Badge
          count={childNodes.length}
          style={{
            backgroundColor: colors.border,
            marginRight: 8,
          }}
        />

        {/* Expand button */}
        {childNodes.length > 0 && (
          <Button
            type="text"
            size="small"
            icon={expanded ? <DownOutlined /> : <RightOutlined />}
            onClick={handleExpand}
            style={{ color: '#8c8c8c', marginRight: 4 }}
          />
        )}

        {/* Actions */}
        {selected && (
          <Space size={4}>
            <Tooltip title="添加条件">
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                style={{ color: '#8c8c8c' }}
              />
            </Tooltip>
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

      {/* Child conditions list */}
      {expanded && childNodes.length > 0 && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          {childNodes.map((childNode, index) => {
            const childData = childNode.data as { field?: string; operator?: string };
            return (
              <div
                key={childNode.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 8px',
                  marginBottom: index < childNodes.length - 1 ? 4 : 0,
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '4px',
                  fontSize: 12,
                }}
              >
                <span style={{ color: '#8c8c8c', marginRight: 8 }}>
                  {index + 1}.
                </span>
                <span
                  style={{
                    flex: 1,
                    color: '#d9d9d9',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {childData.field
                    ? `${childData.field} ${childData.operator || ''}`
                    : '未配置条件'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {childNodes.length === 0 && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            color: '#8c8c8c',
            fontSize: 12,
          }}
        >
          拖拽条件到此处
        </div>
      )}
    </div>
  );
};

export default ConditionGroupNode;
