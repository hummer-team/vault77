/**
 * Table Node Component
 * Displays table schema with collapsible field list
 * Supports virtual scroll for large field lists (>50 fields)
 */

import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Button, Tag, Tooltip, Space, Spin } from 'antd';
import {
  TableOutlined,
  DownOutlined,
  RightOutlined,
  DragOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { getTableSchema } from '../../../services/flow/flowService';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import type { TableNodeData, Field } from '../../../services/flow/types';
import { FlowNodeType } from '../../../services/flow/types';
import {
  FLOW_COLORS,
  FIELD_TYPE_ICONS,
  PERFORMANCE,
} from '../../../services/flow/constants';
import { NodeNextButton } from '../shared/NodeNextButton';

interface TableNodeProps {
  id: string;
  data: TableNodeData;
  selected?: boolean;
}

// Field item component
const FieldItem: React.FC<{
  field: Field;
  onDragStart: (field: Field) => void;
}> = ({ field, onDragStart }) => {
  const iconConfig = FIELD_TYPE_ICONS[field.type] || FIELD_TYPE_ICONS.UNKNOWN;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        height: PERFORMANCE.virtualScrollItemHeight,
        cursor: 'grab',
        borderBottom: '1px solid #303030',
      }}
      draggable
      onDragStart={() => onDragStart(field)}
    >
      <DragOutlined style={{ marginRight: 8, color: '#8c8c8c', fontSize: 12 }} />
      <Tooltip title={field.type}>
        <span style={{ marginRight: 8, fontSize: 14 }}>{iconConfig.icon}</span>
      </Tooltip>
      <span
        style={{
          flex: 1,
          color: '#d9d9d9',
          fontSize: 13,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {field.name}
      </span>
      {field.nullable && (
        <Tag color="default" style={{ fontSize: 10, padding: '0 4px' }}>
          可空
        </Tag>
      )}
    </div>
  );
};

export const TableNode: React.FC<TableNodeProps> = ({
  id,
  data,
  selected,
}) => {
  const updateNode = useFlowStore((state) => state.updateNode);
  const removeNode = useFlowStore((state) => state.removeNode);
  const { executeQuery } = useDuckDBContext();
  const [loading, setLoading] = useState(false);

  // Toggle expand and load fields
  const handleExpand = useCallback(async () => {
    if (!data.expanded && (data.fields?.length || 0) === 0) {
      // Load fields from DuckDB
      setLoading(true);
      try {
        const schema = await getTableSchema(data.tableName, executeQuery);
        updateNode(id, { fields: schema.fields, expanded: true });
      } catch (error) {
        console.error(`[TableNode] Failed to load schema for ${data.tableName}:`, error);
      } finally {
        setLoading(false);
      }
    } else {
      updateNode(id, { expanded: !data.expanded });
    }
  }, [data.expanded, data.fields.length, data.tableName, id, updateNode, executeQuery]);

  // Handle field drag start
  const handleFieldDragStart = useCallback((field: Field) => {
    // TODO: Implement field drag logic
    console.log('Field drag start:', field);
  }, []);

  // Handle delete
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeNode(id);
    },
    [id, removeNode]
  );



  const [isHovering, setIsHovering] = useState(false);
  const handleMouseEnter = useCallback(() => setIsHovering(true), []);
  const handleMouseLeave = useCallback(() => setIsHovering(false), []);

  // Field list height
  const fieldListHeight = Math.min(
    (data.fields?.length || 0) * PERFORMANCE.virtualScrollItemHeight,
    320
  );

  return (
    <div
      style={{
        background: FLOW_COLORS.node.table.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : FLOW_COLORS.node.table.border}`,
        borderRadius: '8px',
        minWidth: '200px',
        minHeight: '60px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        overflow: 'visible',
        position: 'relative',
      }}
      className="table-node"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Node Resizer - only show when selected */}
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={60}
        maxWidth={400}
        maxHeight={500}
        lineStyle={{ borderColor: '#FF6B00', borderWidth: 2 }}
        handleStyle={{ backgroundColor: '#FF6B00', borderColor: '#fff', width: 10, height: 10 }}
      />
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
          padding: '12px 16px',
          borderBottom: data.expanded ? '1px solid #303030' : 'none',
          background: selected ? 'rgba(250, 140, 22, 0.1)' : 'transparent',
        }}
      >
        <TableOutlined style={{ marginRight: 8, color: '#1890ff' }} />
        <span
          style={{
            flex: 1,
            color: '#fff',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.tableName}
        </span>
        <Space>
          <Spin spinning={loading} size="small">
            <Button
              type="text"
              size="small"
              icon={data.expanded ? <DownOutlined /> : <RightOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleExpand();
              }}
              style={{ color: '#8c8c8c' }}
            />
          </Spin>
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            danger
            style={{ color: '#ff4d4f' }}
          />
        </Space>
      </div>

      {/* Field list */}
      {data.expanded && (data.fields?.length || 0) > 0 && (
        <div style={{ height: fieldListHeight }}>
          {data.fields?.map((field) => (
            <FieldItem
              key={field.name}
              field={field}
              onDragStart={handleFieldDragStart}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {data.expanded && (data.fields?.length || 0) === 0 && !loading && (
        <div
          style={{
            padding: '16px',
            textAlign: 'center',
            color: '#8c8c8c',
            fontSize: 12,
          }}
        >
          暂无字段信息
        </div>
      )}

      {/* Field count hint */}
      {data.expanded && (data.fields?.length || 0) > PERFORMANCE.maxFieldsDisplay && (
        <div
          style={{
            padding: '4px 12px',
            fontSize: 11,
            color: '#8c8c8c',
            textAlign: 'center',
            borderTop: '1px solid #303030',
          }}
        >
          共 {data.fields?.length || 0} 个字段
        </div>
      )}

      <NodeNextButton nodeId={id} nodeType={FlowNodeType.TABLE} visible={isHovering} />
    </div>
  );
};

export default TableNode;
