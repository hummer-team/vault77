/**
 * Condition Group Node Component
 * Groups multiple conditions with AND/OR/CUSTOM logic
 * Supports nested groups and custom expressions (Q14)
 */

import React, { useCallback, useState, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Button, Space, Tooltip, Radio, Input, Select, Tag } from 'antd';
import {
  FilterOutlined,
  DeleteOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { ConditionGroupNodeData, ConditionDefinitionNodeData } from '../../../services/flow/types';
import { FLOW_COLORS, CUSTOM_EXPRESSION_CONSTANTS } from '../../../services/flow/constants';
import { FlowNodeType } from '../../../services/flow/types';
import { NodeNextButton } from '../shared/NodeNextButton';
import { generateConditionGroupDisplayName } from '../../../services/flow/flowService';
import { TOKEN } from '../../../theme';

interface ConditionGroupNodeProps {
  id: string;
  data: ConditionGroupNodeData;
  selected?: boolean;
}

// Extended relation type for AND/OR/CUSTOM
 type RelationType = 'AND' | 'OR' | 'CUSTOM';

// Logic type colors - use CSS variables for theme adaptation
const LOGIC_TYPE_COLORS: Record<RelationType, { bg: string; border: string; text: string }> = {
  AND: {
    bg: 'var(--vm-flow-and-bg)',
    border: 'var(--vm-flow-success)',
    text: 'var(--vm-flow-success)',
  },
  OR: {
    bg: 'var(--vm-flow-or-bg)',
    border: 'var(--vm-flow-warning)',
    text: 'var(--vm-flow-warning)',
  },
  CUSTOM: {
    bg: 'var(--vm-flow-custom-bg)',
    border: 'var(--vm-flow-purple)',
    text: 'var(--vm-flow-purple)',
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
  const updateNode = useFlowStore((state) => state.updateNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const pendingConnectionSource = useFlowStore((state) => state.pendingConnectionSource);
  const setPendingConnectionSource = useFlowStore((state) => state.setPendingConnectionSource);
  const setSelectedEdgeId = useFlowStore((state) => state.setSelectedEdgeId);
  const [configExpanded, setConfigExpanded] = useState(true); // Config section always expanded by default
  const [isHovering, setIsHovering] = useState(false);
  const handleMouseEnter = useCallback(() => setIsHovering(true), []);
  const handleMouseLeave = useCallback(() => setIsHovering(false), []);

  // Auto-generate relationDisplayName if missing (for backward compatibility with old nodes)
  React.useEffect(() => {
    if (!data.relationDisplayName) {
      const generatedRelationDisplayName = generateConditionGroupDisplayName(nodes);
      updateNode(id, { relationDisplayName: generatedRelationDisplayName } as Partial<ConditionGroupNodeData>);
    }
  }, [data.relationDisplayName, id, nodes, updateNode]);

  // Get current relation type (default to data.logicType for backward compatibility)
  const relationType: RelationType = data.relationType || data.logicType;

  // Check if ANY condition group node in the flow has CUSTOM mode enabled
  const hasCustomModeEnabled = useMemo(() => {
    return nodes.some((n) => {
      if (n.type !== 'conditionGroup' || n.id === id) return false;
      const nodeData = n.data as ConditionGroupNodeData;
      return nodeData.relationType === 'CUSTOM';
    });
  }, [nodes, id]);

  // Current node is disabled if another node is in CUSTOM mode
  const isDisabledByCustomMode = hasCustomModeEnabled && relationType !== 'CUSTOM';

  // Get all available condition definition nodes (CG1, CG2, etc.)
  const availableConditionDefs = useMemo(() => {
    return nodes.filter((n) => n.type === 'conditionDefinition');
  }, [nodes]);

  // Get selected condition definition nodes by refId
  const selectedConditionDefs = useMemo(() => {
    return nodes.filter((n) => {
      const refId = (n.data as ConditionDefinitionNodeData).refId;
      return (data.conditionIds || []).includes(refId);
    });
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
        // Save current state before switching to CUSTOM
        updateNode(id, {
          relationType: newType,
          logicType: 'AND' as const,
          savedConditionIds: data.conditionIds || [], // Backup current selection
          savedLogicType: data.logicType, // Backup current logic type
          conditionIds: [], // Clear selection in CUSTOM mode
        } as Partial<ConditionGroupNodeData>);
      } else {
        // Restore saved state when switching back from CUSTOM
        const restoredConditionIds = data.savedConditionIds || [];
        
        updateNode(id, {
          relationType: newType,
          logicType: newType,
          conditionIds: restoredConditionIds, // Restore previous selection
          savedConditionIds: undefined, // Clear backup
          savedLogicType: undefined, // Clear backup
        } as Partial<ConditionGroupNodeData>);
      }
    },
    [id, updateNode, data.conditionIds, data.logicType, data.savedConditionIds, data.savedLogicType]
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

  // Handle click - do not trigger selection to prevent detail panel.
  // If a pending "bind relation" connection is active, complete it.
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingConnectionSource && pendingConnectionSource !== id) {
      const newEdgeId = `e_${pendingConnectionSource}_${id}_${Date.now()}`;
      addEdge({
        id: newEdgeId,
        source: pendingConnectionSource,
        target: id,
        type: 'deletable',
        animated: false,
        style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as const, width: 12, height: 12, color: 'var(--vm-flow-edge)' },
      });
      setPendingConnectionSource(null);
      setSelectedEdgeId(newEdgeId); // Auto-highlight the newly created edge
    }
  }, [id, pendingConnectionSource, addEdge, setPendingConnectionSource, setSelectedEdgeId]);

  // Toggle config section expand
  const handleConfigExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfigExpanded((prev) => !prev);
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
          : 'var(--vm-flow-shadow)',
        overflow: 'visible',
        opacity: isDisabledByCustomMode ? 0.5 : 1, // Visual feedback when disabled
        pointerEvents: isDisabledByCustomMode ? 'none' : 'auto', // Disable interaction when disabled
        position: 'relative',
      }}
      className="condition-group-node"
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

      {/* Pending "bind relation" overlay — shown when another CG node is waiting to connect */}
      {pendingConnectionSource && pendingConnectionSource !== id && (
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 8,
            border: '2px dashed #7c3aed',
            background: 'var(--vm-flow-purple-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            cursor: 'pointer',
            pointerEvents: 'all',
          }}
          onClick={handleClick}
        >
          <span style={{
            fontSize: 11,
            color: 'var(--vm-flow-purple)',
            background: 'var(--vm-flow-processing-bg)',
            padding: '3px 10px',
            borderRadius: 4,
            backdropFilter: 'blur(4px)',
            userSelect: 'none',
          }}>
            点击连接
          </span>
        </div>
      )}


      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          background: selected ? TOKEN.bgRow : 'transparent',
        }}
      >
        {/* Logic type icon */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '4px',
            background: colors.border,
            color: TOKEN.textPrimary,
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

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              color: TOKEN.textPrimary,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {data.relationDisplayName || '条件组关系'}
          </span>
          <span
            style={{
              color: 'var(--vm-text-helper)',
              fontSize: 11,
            }}
          >
            {LOGIC_TYPE_LABELS[relationType]}
          </span>
        </div>

        {/* Actions - delete button always visible */}
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            danger
            style={{ color: 'var(--vm-color-error)' }}
          />
          <Tooltip title={configExpanded ? 'Collapse config' : 'Expand config'}>
            <Button
              type="text"
              size="small"
              icon={configExpanded ? <DownOutlined /> : <RightOutlined />}
              onClick={handleConfigExpand}
              style={{ color: 'var(--vm-text-helper)' }}
            />
          </Tooltip>
        </Space>
      </div>

      {/* Relation type selector - always visible when config is expanded */}
      {configExpanded && (
        <div
          style={{
            padding: '12px',
            borderBottom: '1px solid #303030',
            background: 'var(--vm-surface-lighter)',
          }}
        >
          <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--vm-text-helper)' }}>Relation Type</div>
          <div className="nodrag">
            <Radio.Group
              value={relationType}
              onChange={(e) => handleRelationTypeChange(e.target.value)}
              size="small"
              buttonStyle="solid"
              disabled={isDisabledByCustomMode}
            >
              <Radio.Button value="AND">AND</Radio.Button>
              <Radio.Button value="OR">OR</Radio.Button>
              <Tooltip title="Custom mode disables other condition group nodes. Only one node can use custom expressions at a time.">
                <Radio.Button value="CUSTOM">Custom</Radio.Button>
              </Tooltip>
            </Radio.Group>
          </div>

          {/* Warning message when disabled by CUSTOM mode */}
          {isDisabledByCustomMode && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--vm-color-error)' }}>
              Disabled: Another node is in Custom mode
            </div>
          )}

          {/* Custom expression input */}
          {relationType === 'CUSTOM' && (
            <div style={{ marginTop: 12 }}>
              <div className="nodrag">
                <Input.TextArea
                  value={data.customExpression || ''}
                  onChange={(e) => handleExpressionChange(e.target.value)}
                  placeholder="Enter expression: CG1 AND (CG2 OR CG3)"
                  rows={2}
                  status={!expressionValidation.valid ? 'error' : undefined}
                  className="nodrag"
                />
              </div>
              {!expressionValidation.valid && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--vm-color-error)' }}>
                  {expressionValidation.error}
                </div>
              )}
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--vm-text-helper)' }}>
                Available: {availableConditionDefs.map((n) =>
                  (n.data as ConditionDefinitionNodeData).refId
                ).join(', ')}
              </div>
            </div>
          )}

          {/* Condition definition selector (for AND/OR mode only, disabled in CUSTOM mode) */}
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 4, fontSize: 12, color: 'var(--vm-text-helper)' }}>
              Select Conditions {selectedConditionDefs.length}
            </div>
            <div className="nodrag nowheel">
              <Select
                mode="multiple"
                value={data.conditionIds || []}
                onChange={handleConditionDefSelect}
                style={{ width: '100%' }}
                placeholder="Select condition groups"
                disabled={relationType === 'CUSTOM' || isDisabledByCustomMode}
                maxTagCount={1}
                maxTagPlaceholder={(omitted) => `+${omitted.length}`}
                optionRender={(option) => {
                  // Find the node by refId
                  const node = availableConditionDefs.find(
                    (n) => (n.data as ConditionDefinitionNodeData).refId === option.value
                  );
                  if (!node) return option.label;
                  
                  const nodeData = node.data as ConditionDefinitionNodeData;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
                        {nodeData.refId}
                      </Tag>
                      <span style={{ color: 'var(--vm-text-light)', fontSize: 12 }}>
                        {nodeData.tableName || 'No table'} {nodeData.conditions.length} conditions
                      </span>
                    </div>
                  );
                }}
                options={availableConditionDefs.map((n) => {
                  const refId = (n.data as ConditionDefinitionNodeData).refId;
                  return {
                    value: refId,
                    label: refId,
                  };
                })}
                getPopupContainer={() => document.body}
                popupClassName="condition-group-select-dropdown nodrag"
                className="nodrag"
              />
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {selectedConditionDefs.length === 0 && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            color: 'var(--vm-text-helper)',
            fontSize: 12,
          }}
        >
          Select condition groups above
        </div>
      )}
      <NodeNextButton nodeId={id} nodeType={FlowNodeType.CONDITION_GROUP} visible={isHovering} />
    </div>
  );
};

export default ConditionGroupNode;
