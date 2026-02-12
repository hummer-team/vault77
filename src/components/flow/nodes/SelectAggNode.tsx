/**
 * Select Aggregation Node Component
 * Displays selected fields with aggregation functions and GROUP BY
 */

import React, { useCallback } from 'react';
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
import { FLOW_COLORS } from '../../../services/flow/constants';

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
  SUM: '#1890ff',
  COUNT: '#52c41a',
  AVG: '#fa8c16',
  MIN: '#722ed1',
  MAX: '#eb2f96',
};

export const SelectAggNode: React.FC<SelectAggNodeProps> = ({
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

  const hasFields = data.fields.length > 0;
  const hasGroupBy = data.groupByFields.length > 0;

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
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
      }}
      className="select-agg-node"
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
          borderBottom: hasFields ? '1px solid #303030' : 'none',
        }}
      >
        <FunctionOutlined
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
          聚合查询
        </span>

        {/* Field count badge */}
        {hasFields && (
          <Badge
            count={data.fields.length}
            style={{ backgroundColor: FLOW_COLORS.node.select.border, marginRight: 8 }}
          />
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
              color: '#8c8c8c',
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

      {/* GROUP BY fields */}
      {hasGroupBy && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(82, 196, 26, 0.1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <GroupOutlined style={{ marginRight: 6, color: '#52c41a', fontSize: 12 }} />
            <span style={{ fontSize: 11, color: '#52c41a', fontWeight: 500 }}>
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
            background: 'rgba(255, 77, 79, 0.1)',
          }}
        >
          <span style={{ fontSize: 11, color: '#ff4d4f' }}>
            请添加聚合字段
          </span>
        </div>
      )}

      {/* Warning if aggregation without GROUP BY */}
      {hasFields && !hasGroupBy && data.fields.some((f) => f.aggregate) && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(250, 140, 22, 0.1)',
            borderTop: '1px solid #303030',
          }}
        >
          <span style={{ fontSize: 11, color: '#fa8c16' }}>
            ⚠️ 使用聚合函数建议配置 GROUP BY
          </span>
        </div>
      )}
    </div>
  );
};

export default SelectAggNode;
