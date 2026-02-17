/**
 * Condition Group Node Component
 * Groups multiple conditions with AND/OR/CUSTOM logic
 * Supports nested groups and custom expressions (Q14)
 */

import React, { useCallback, useState, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Button, Space, Tooltip, Badge, Radio, Input, Select, Tag, message } from 'antd';
import {
  FilterOutlined,
  DeleteOutlined,
  DownOutlined,
  RightOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { ConditionGroupNodeData, ConditionDefinitionNodeData } from '../../../services/flow/types';
import { FLOW_COLORS, CUSTOM_EXPRESSION_CONSTANTS } from '../../../services/flow/constants';

interface ConditionGroupNodeProps {
  id: string;
  data: ConditionGroupNodeData;
  selected?: boolean;
}

// Extended relation type for AND/OR/CUSTOM
 type RelationType = 'AND' | 'OR' | 'CUSTOM';

// Logic type colors
const LOGIC_TYPE_COLORS: Record<RelationType, { bg: string; border: string; text: string }> = {
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
  CUSTOM: {
    bg: 'rgba(139, 92, 246, 0.15)',
    border: '#8B5CF6',
    text: '#A78BFA',
  },
};

// Logic type labels
const LOGIC_TYPE_LABELS: Record<RelationType, string> = {
  AND: '全部满足 (AND)',
  OR: '任一满足 (OR)',
  CUSTOM: '自定义表达式',
};

export const ConditionGroupNode: React.FC<ConditionGroupNodeProps> = ({
  id,
  data,
  selected,
}) => {
  const removeNode = useFlowStore((state) => state.removeNode);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const updateNode = useFlowStore((state) => state.updateNode);
  const nodes = useFlowStore((state) => state.nodes);
  const [expanded, setExpanded] = useState(true);

  // Get current relation type (default to data.logicType for backward compatibility)
  const relationType: RelationType = data.relationType || data.logicType;

  // Get all available condition definition nodes (CG1, CG2, etc.)
  const availableConditionDefs = useMemo(() => {
    return nodes.filter((n) => n.type === 'conditionDefinition');
  }, [nodes]);

  // Get selected condition definition nodes
  const selectedConditionDefs = useMemo(() => {
    return nodes.filter((n) =>
      (data.conditionIds || []).includes(n.id)
    );
  }, [nodes, data.conditionIds]);

  // Validate custom expression (Q3: only AND/OR/并且/或者 and parentheses)
  const validateExpression = (expression: string): { valid: boolean; error?: string } => {
    // Check for invalid characters
    if (!CUSTOM_EXPRESSION_CONSTANTS.ALLOWED_PATTERNS.test(expression)) {
      return {
        valid: false,
        error: 'Expression contains invalid characters. Only alphanumeric, underscores, spaces, and parentheses are allowed.',
      };
    }

    // Extract all condition refs (CG1, CG2, etc.)
    const refPattern = /[a-zA-Z0-9_]+/g;
    const refs = expression.match(refPattern) || [];

    // Check if all refs are valid condition definition nodes
    const validRefs = availableConditionDefs.map((n) =>
      (n.data as ConditionDefinitionNodeData).refId
    );

    for (const ref of refs) {
      // Skip operators
      if (['AND', 'OR', '并且', '或者'].includes(ref.toUpperCase())) {
        continue;
      }
      if (!validRefs.includes(ref)) {
        return {
          valid: false,
          error: `Invalid reference: ${ref}. Must be one of: ${validRefs.join(', ')}`,
        };
      }
    }

    return { valid: true };
  };

  // Handle relation type change
  const handleRelationTypeChange = useCallback(
    (newType: RelationType) => {
      if (newType === 'CUSTOM') {
        // When switching to CUSTOM, show warning about AND/OR being disabled (Q14)
        message.info('Custom expression mode disables AND/OR selection');
      }
      updateNode(id, {
        relationType: newType,
        logicType: newType === 'CUSTOM' ? 'AND' : newType,
      } as Partial<ConditionGroupNodeData>);
    },
    [id, updateNode]
  );

  // Handle custom expression change
  const handleExpressionChange = useCallback(
    (expression: string) => {
      updateNode(id, { customExpression: expression } as Partial<ConditionGroupNodeData>);
    },
    [id, updateNode]
  );

  // Handle condition definition selection
  const handleConditionDefSelect = useCallback(
    (selectedIds: string[]) => {
      updateNode(id, { conditionIds: selectedIds } as Partial<ConditionGroupNodeData>);
    },
    [id, updateNode]
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

  const colors = LOGIC_TYPE_COLORS[relationType];

  // Get expression validation status
  const expressionValidation = useMemo(() => {
    if (relationType !== 'CUSTOM' || !data.customExpression) {
      return { valid: true };
    }
    return validateExpression(data.customExpression);
  }, [relationType, data.customExpression]);

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
          borderBottom: selectedConditionDefs.length > 0 && expanded ? `1px solid ${colors.border}` : 'none',
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
            fontSize: 10,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
          }}
        >
          {relationType === 'CUSTOM' ? 'C' : data.logicType}
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
          {LOGIC_TYPE_LABELS[relationType]}
        </span>

        {/* Condition count */}
        <Badge
          count={selectedConditionDefs.length}
          style={{
            backgroundColor: colors.border,
            marginRight: 8,
          }}
        />

        {/* Expand button */}
        {selectedConditionDefs.length > 0 && (
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
            <Tooltip title="Edit relation">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
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

      {/* Relation type selector (when selected) */}
      {selected && (
        <div
          style={{
            padding: '12px',
            borderBottom: '1px solid #303030',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <div style={{ marginBottom: 8, fontSize: 12, color: '#8c8c8c' }}>Relation Type</div>
          <Radio.Group
            value={relationType}
            onChange={(e) => handleRelationTypeChange(e.target.value)}
            size="small"
            buttonStyle="solid"
          >
            <Radio.Button value="AND">AND</Radio.Button>
            <Radio.Button value="OR">OR</Radio.Button>
            <Radio.Button value="CUSTOM">Custom</Radio.Button>
          </Radio.Group>

          {/* Custom expression input */}
          {relationType === 'CUSTOM' && (
            <div style={{ marginTop: 12 }}>
              <Input.TextArea
                value={data.customExpression || ''}
                onChange={(e) => handleExpressionChange(e.target.value)}
                placeholder="Enter expression: CG1 AND (CG2 OR CG3)"
                rows={2}
                status={!expressionValidation.valid ? 'error' : undefined}
              />
              {!expressionValidation.valid && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#ff4d4f' }}>
                  {expressionValidation.error}
                </div>
              )}
              <div style={{ marginTop: 4, fontSize: 11, color: '#8c8c8c' }}>
                Available: {availableConditionDefs.map((n) =>
                  (n.data as ConditionDefinitionNodeData).refId
                ).join(', ')}
              </div>
            </div>
          )}

          {/* Condition definition selector (for AND/OR mode) */}
          {relationType !== 'CUSTOM' && (
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 4, fontSize: 12, color: '#8c8c8c' }}>Select Conditions</div>
              <Select
                mode="multiple"
                value={data.conditionIds || []}
                onChange={handleConditionDefSelect}
                style={{ width: '100%' }}
                placeholder="Select condition groups"
                options={availableConditionDefs.map((n) => ({
                  value: n.id,
                  label: (n.data as ConditionDefinitionNodeData).refId,
                }))}
              />
            </div>
          )}
        </div>
      )}

      {/* Child conditions list */}
      {expanded && selectedConditionDefs.length > 0 && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          {selectedConditionDefs.map((childNode, index) => {
            const childData = childNode.data as ConditionDefinitionNodeData;
            return (
              <div
                key={childNode.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 8px',
                  marginBottom: index < selectedConditionDefs.length - 1 ? 4 : 0,
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '4px',
                  fontSize: 12,
                }}
              >
                <Tag color="purple" style={{ marginRight: 8, fontSize: 11 }}>
                  {childData.refId}
                </Tag>
                <span
                  style={{
                    flex: 1,
                    color: '#d9d9d9',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {childData.tableName
                    ? `${childData.tableName} (${childData.conditions.length} conditions)`
                    : 'Table not selected'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {selectedConditionDefs.length === 0 && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            color: '#8c8c8c',
            fontSize: 12,
          }}
        >
          Select condition groups above
        </div>
      )}
    </div>
  );
};

export default ConditionGroupNode;
