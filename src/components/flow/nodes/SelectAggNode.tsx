/**
 * Select Aggregation Node Component
 * Displays selected fields with aggregation functions and GROUP BY
 */

import React, { useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Button, Tag, Space, Tooltip, List, Badge } from 'antd';
import {
  FunctionOutlined,
  DeleteOutlined,
  EditOutlined,
  GroupOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { SelectAggNodeData } from '../../../services/flow/types';
import { FlowNodeType } from '../../../services/flow/types';
import { FLOW_COLORS } from '../../../services/flow/constants';
import { NodeNextButton } from '../shared/NodeNextButton';

interface SelectAggNodeProps {
  id: string;
  data: SelectAggNodeData;
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
  SUM: 'var(--vm-flow-info)',
  COUNT: 'var(--vm-flow-success)',
  AVG: 'var(--vm-flow-warning)',
  MIN: 'var(--vm-flow-purple)',
  MAX: 'var(--vm-flow-pink)',
};

export const SelectAggNode: React.FC<SelectAggNodeProps> = ({
  id,
  data,
  selected,
}) => {
  const removeNode = useFlowStore((state) => state.removeNode);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);

  const [isHovering, setIsHovering] = useState(false);
  const handleMouseEnter = useCallback(() => setIsHovering(true), []);
  const handleMouseLeave = useCallback(() => setIsHovering(false), []);

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

  const hasFields = (data.fields?.length || 0) > 0;
  const hasGroupBy = (data.groupByFields?.length || 0) > 0;

  return (
    <div
      style={{
        background: FLOW_COLORS.node.select.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : hasFields ? FLOW_COLORS.node.select.border : '#ff4d4f'}`,
        borderRadius: '8px',
        minWidth: '240px',
        maxWidth: '320px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : 'var(--vm-flow-shadow)',
        overflow: 'visible',
        position: 'relative',
      }}
      className="select-agg-node"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
          background: selected ? 'var(--vm-flow-success-light)' : 'transparent',
          borderBottom: hasFields ? '1px solid #303030' : 'none',
        }}
      >
        <FunctionOutlined
          style={{ color: FLOW_COLORS.node.select.border, marginRight: 8 }}
        />

        <span
          style={{
            flex: 1,
            color: 'var(--vm-text-primary)',
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          聚合查询
        </span>

        {/* Field count badge */}
        {hasFields && (
          <Badge
            count={data.fields?.length || 0}
            style={{ backgroundColor: FLOW_COLORS.node.select.border, marginRight: 8 }}
          />
        )}

        {/* Actions */}
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            style={{ color: 'var(--vm-text-helper)' }}
          />
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            danger
            style={{ color: 'var(--vm-color-error)' }}
          />
        </Space>
      </div>

      {/* Aggregated fields list */}
      {hasFields && (
        <div
          style={{
            padding: '8px',
            borderBottom: hasGroupBy ? '1px solid #303030' : 'none',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--vm-text-helper)',
              marginBottom: 4,
              paddingLeft: 8,
            }}
          >
            聚合字段
          </div>
          <List
            size="small"
            dataSource={data.fields}
            renderItem={(field) => (
              <div
                style={{
                  padding: '6px 8px',
                  marginBottom: 4,
                  background: 'var(--vm-surface-hover)',
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
                  <span style={{ color: 'var(--vm-text-light)' }}>{field.fieldName}</span>
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

      {/* GROUP BY fields */}
      {hasGroupBy && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--vm-flow-success-light)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <GroupOutlined style={{ marginRight: 6, color: 'var(--vm-flow-success)', fontSize: 12 }} />
            <span style={{ fontSize: 11, color: 'var(--vm-flow-success)', fontWeight: 500 }}>
              GROUP BY
            </span>
          </div>
          <Space wrap size={4}>
            {data.groupByFields.map((field, index) => (
              <Tag key={index} color="success" style={{ fontSize: 10, margin: 0 }}>
                {field}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      {/* Empty state */}
      {!hasFields && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            background: 'var(--vm-flow-error-light)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--vm-color-error)' }}>
            请添加聚合字段
          </span>
        </div>
      )}

      {/* Warning if aggregation without GROUP BY */}
      {hasFields && !hasGroupBy && data.fields.some((f) => f.aggregate) && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--vm-flow-warning-light)',
            borderTop: '1px solid #303030',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--vm-flow-warning)' }}>
            ⚠️ 使用聚合函数建议配置 GROUP BY
          </span>
        </div>
      )}

      <NodeNextButton nodeId={id} nodeType={FlowNodeType.SELECT_AGG} visible={isHovering} />
    </div>
  );
};

export default SelectAggNode;
