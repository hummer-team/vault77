/**
 * Condition Node Component
 * Displays a single WHERE condition with field, operator, and value
 */

import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Button, Tag, Space, Tooltip } from 'antd';
import {
  FilterOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { ConditionNodeData, LogicType } from '../../../services/flow/types';
import { FlowNodeType } from '../../../services/flow/types';
import { FLOW_COLORS, SQL_OPERATORS } from '../../../services/flow/constants';
import { NodeNextButton } from '../shared/NodeNextButton';
import { TOKEN } from '../../../theme';

interface ConditionNodeProps {
  id: string;
  data: ConditionNodeData;
  selected?: boolean;
}

// Logic type colors
const LOGIC_TYPE_COLORS: Record<LogicType, string> = {
  AND: 'var(--vm-flow-success)',
  OR: 'var(--vm-flow-warning)',
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
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);

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

  const isComplete = data.field && data.operator && (data.value !== undefined || data.operator.includes('NULL'));

  // Check if there's already an end node connected to this condition node
  const hasConnectedEndNode = React.useMemo(() => {
    return edges.some((e) => e.source === id && nodes.find((n) => n.id === e.target)?.type === FlowNodeType.END);
  }, [edges, nodes, id]);

  // Auto-create end node after condition node is complete
  React.useEffect(() => {
    // Only auto-create if:
    // 1. Condition is complete
    // 2. No end node is already connected
    // 3. The ConditionNode itself exists in the flow
    if (isComplete && !hasConnectedEndNode) {
      const conditionNode = nodes.find((n) => n.id === id);
      if (!conditionNode) return;

      // Check again to prevent race conditions
      const currentEdges = useFlowStore.getState().edges;
      const currentNodes = useFlowStore.getState().nodes;
      const alreadyHasEnd = currentEdges.some(
        (e) =>
          e.source === id &&
          currentNodes.find((n) => n.id === e.target)?.type === FlowNodeType.END
      );

      if (alreadyHasEnd) return;

      const conditionX = conditionNode.position.x;
      const conditionY = conditionNode.position.y;

      // Create end node
      const endNodeId = `end_${Date.now()}`;
      const endNode = {
        id: endNodeId,
        type: FlowNodeType.END,
        position: { x: conditionX + 280, y: conditionY },
        data: {
          operatorType: 'association',
          executable: true,
          errors: [],
        },
      };
      addNode(endNode as unknown as Parameters<typeof addNode>[0]);

      // Connect condition -> end with arrow marker
      addEdge({
        id: `e_${id}_${endNodeId}`,
        source: id,
        target: endNodeId,
        type: 'default',
        animated: false,
        style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
      } as unknown as Parameters<typeof addEdge>[0]);
    }
  }, [isComplete, hasConnectedEndNode, id, nodes, addNode, addEdge]);

  return (
    <div
      style={{
        background: FLOW_COLORS.node.condition.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : isComplete ? FLOW_COLORS.node.condition.border : '#ff4d4f'}`,
        borderRadius: '8px',
        minWidth: '180px',
        minHeight: '120px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : 'var(--vm-flow-shadow)',
        overflow: 'visible',
        position: 'relative',
      }}
      className="condition-node"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Node Resizer - only show when selected */}
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={120}
        maxWidth={320}
        maxHeight={350}
        lineStyle={{ borderColor: '#3B82F6', borderWidth: 2 }}
        handleStyle={{ backgroundColor: '#3B82F6', borderColor: 'var(--vm-border-mid)', width: 10, height: 10 }}
      />
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
          background: selected ? 'var(--vm-flow-info-light)' : 'transparent',
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
            color: TOKEN.textPrimary,
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
              background: TOKEN.bgSection,
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
              background: 'var(--vm-flow-error-light)',
              borderRadius: '4px',
              fontSize: 11,
              color: '#ff4d4f',
            }}
          >
            配置不完整
          </div>
        )}
      </div>
      <NodeNextButton nodeId={id} nodeType={FlowNodeType.CONDITION} visible={isHovering} />
    </div>
  );
};

export default ConditionNode;
