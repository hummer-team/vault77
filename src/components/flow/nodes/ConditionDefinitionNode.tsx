/**
 * Condition Definition Node Component
 * Displays a condition group with multiple condition lines (CG1, CG2, etc.)
 * Each condition has a placeholder for deferred value filling
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Button, Tag, Space, Tooltip, Select, Input, Radio } from 'antd';
import {
  FilterOutlined,
  DeleteOutlined,
  PlusOutlined,
  MinusOutlined,
  EditOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import { getAvailableTables, getTableSchema, generatePlaceholderName, validateRefId, isRefIdUnique } from '../../../services/flow/flowService';
import type { ConditionDefinitionNodeData, ConditionItem, Field, FieldType } from '../../../services/flow/types';
import { FLOW_COLORS, SQL_OPERATORS, PLACEHOLDER_CONSTANTS } from '../../../services/flow/constants';
import { LogicType, FlowNodeType } from '../../../services/flow/types';
import { NodeNextButton } from '../shared/NodeNextButton';
import { useCanvasJoinedTables } from '../hooks/useUpstreamJoinedTables';

interface ConditionDefinitionNodeProps {
  id: string;
  data: ConditionDefinitionNodeData;
  selected?: boolean;
}

// Get operator options for select
const getOperatorOptions = () => {
  const allOperators = [
    ...SQL_OPERATORS.comparison,
    ...SQL_OPERATORS.string,
    ...SQL_OPERATORS.null,
    ...SQL_OPERATORS.set,
  ];
  return allOperators.map((op) => ({
    value: op.value,
    label: op.label,
  }));
};

// Generate unique condition ID
const generateConditionId = () => `cond_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const ConditionDefinitionNode: React.FC<ConditionDefinitionNodeProps> = ({
  id,
  data,
  selected,
}) => {
  const { executeQuery, isDBReady } = useDuckDBContext();
  const removeNode = useFlowStore((state) => state.removeNode);
  const updateNode = useFlowStore((state) => state.updateNode);
  const nodes = useFlowStore((state) => state.nodes);

  // Canvas-wide joined tables — recalculates whenever join topology changes
  const canvasJoinedTables = useCanvasJoinedTables();

  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [tableFields, setTableFields] = useState<Field[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const handleMouseEnter = useCallback(() => setIsHovering(true), []);
  const handleMouseLeave = useCallback(() => setIsHovering(false), []);
  const [contentExpanded, setContentExpanded] = useState(true); // Content section expanded by default

  // Load available tables: prefer canvas-wide joined tables; fallback to DuckDB query
  React.useEffect(() => {
    if (canvasJoinedTables.length > 0) {
      // Use only actually-joined tables from canvas topology (no DB query needed)
      setAvailableTables(canvasJoinedTables);
      return;
    }

    // Fallback: no joins configured — load all DuckDB tables
    const loadTables = async () => {
      if (!isDBReady) return;
      setIsLoadingTables(true);
      try {
        const tables = await getAvailableTables(executeQuery);
        setAvailableTables(tables);
      } catch (error) {
        console.error('[ConditionDefinitionNode] Failed to load tables:', error);
      } finally {
        setIsLoadingTables(false);
      }
    };
    loadTables();
  }, [canvasJoinedTables, executeQuery, isDBReady]);

  // Load table fields when table changes
  React.useEffect(() => {
    if (!data.tableName) {
      setTableFields([]);
      return;
    }

    const loadFields = async () => {
      if (!isDBReady) {
        console.log('[ConditionDefinitionNode] DB not ready, skipping field load');
        return;
      }

      setIsLoadingFields(true);
      try {
        console.log('[ConditionDefinitionNode] Loading fields for table:', data.tableName);
        const schema = await getTableSchema(data.tableName, executeQuery);
        console.log('[ConditionDefinitionNode] Loaded fields:', schema.fields);
        setTableFields(schema.fields);
      } catch (error) {
        console.error('[ConditionDefinitionNode] Failed to load fields:', error);
      } finally {
        setIsLoadingFields(false);
      }
    };
    loadFields();
  }, [data.tableName, executeQuery, isDBReady]);

  // Handle delete
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeNode(id);
    },
    [id, removeNode]
  );

  // Handle logic type change
  const handleLogicTypeChange = useCallback(
    (newLogicType: LogicType) => {
      updateNode(id, { logicType: newLogicType } as Partial<ConditionDefinitionNodeData>);
    },
    [id, updateNode]
  );

  // Handle click - do not trigger selection to prevent detail panel
  const handleHeaderClick = useCallback((e: React.MouseEvent) => {
    // Completely prevent node selection - no detail panel should open
    e.stopPropagation();
  }, []);

  // Handle table change
  const handleTableChange = useCallback(
    (tableName: string) => {
      console.log('[ConditionDefinitionNode] handleTableChange:', tableName);
      updateNode(id, { tableName, conditions: [] } as Partial<ConditionDefinitionNodeData>);
    },
    [id, updateNode]
  );

  // Handle refId (node name) change
  const handleNameChange = useCallback(
    (newName: string) => {
      // Validate format
      const validation = validateRefId(newName);
      if (!validation.valid) {
        setNameError(validation.error || 'Invalid name');
        return;
      }

      // Validate uniqueness
      if (!isRefIdUnique(newName, nodes, id)) {
        setNameError('Name must be unique within flow');
        return;
      }

      setNameError(null);
      updateNode(id, { refId: newName } as Partial<ConditionDefinitionNodeData>);
      setIsEditingName(false);
    },
    [id, updateNode, nodes]
  );

  // Add new condition line
  const handleAddCondition = useCallback(() => {
    const newCondition: ConditionItem = {
      id: generateConditionId(),
      field: '',
      operator: '=',
      placeholder: generatePlaceholderName(data.refId, data.conditions.length),
      valueType: 'VARCHAR' as FieldType,
    };
    updateNode(id, {
      conditions: [...data.conditions, newCondition],
    } as Partial<ConditionDefinitionNodeData>);
  }, [id, data.refId, data.conditions, updateNode]);

  // Remove condition line
  const handleRemoveCondition = useCallback(
    (conditionId: string) => {
      if (data.conditions.length <= 1) {
        return; // Keep at least one condition
      }
      const updatedConditions = data.conditions
        .filter((c) => c.id !== conditionId)
        .map((c, index) => ({
          ...c,
          placeholder: generatePlaceholderName(data.refId, index),
        }));
      updateNode(id, { conditions: updatedConditions } as Partial<ConditionDefinitionNodeData>);
    },
    [id, data.conditions, data.refId, updateNode]
  );

  // Update condition field
  const handleConditionFieldChange = useCallback(
    (conditionId: string, field: string) => {
      const fieldInfo = tableFields.find((f) => f.name === field);
      const updatedConditions = data.conditions.map((c) =>
        c.id === conditionId
          ? { ...c, field, valueType: fieldInfo?.type || 'VARCHAR' }
          : c
      );
      updateNode(id, { conditions: updatedConditions } as Partial<ConditionDefinitionNodeData>);
    },
    [id, data.conditions, tableFields, updateNode]
  );

  // Update condition operator
  const handleConditionOperatorChange = useCallback(
    (conditionId: string, operator: string) => {
      const updatedConditions = data.conditions.map((c) =>
        c.id === conditionId ? { ...c, operator } : c
      );
      updateNode(id, { conditions: updatedConditions } as Partial<ConditionDefinitionNodeData>);
    },
    [id, data.conditions, updateNode]
  );

  // Check if all conditions are complete
  const isComplete = useMemo(() => {
    return (
      data.tableName &&
      data.conditions.length > 0 &&
      data.conditions.every((c) => c.field && c.operator)
    );
  }, [data.tableName, data.conditions]);

  const colors = FLOW_COLORS.node.conditionDefinition;

  return (
    <div
      style={{
        background: colors.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : isComplete ? colors.border : '#ff4d4f'}`,
        borderRadius: '8px',
        minWidth: '320px',
        maxWidth: '400px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        overflow: 'visible',
        position: 'relative',
        pointerEvents: 'all',
      }}
      className="condition-definition-node"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Node Resizer */}
      <NodeResizer
        isVisible={selected}
        minWidth={320}
        minHeight={180}
        maxWidth={450}
        maxHeight={500}
        lineStyle={{ borderColor: colors.border, borderWidth: 2 }}
        handleStyle={{ backgroundColor: colors.border, borderColor: '#fff', width: 10, height: 10 }}
      />

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

      {/* Header - click to select node */}
      <div
        onClick={handleHeaderClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          background: selected ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
          borderBottom: '1px solid #303030',
          cursor: 'pointer',
        }}
      >
        <FilterOutlined style={{ color: colors.title, marginRight: 8 }} />

        {/* Editable node name */}
        {isEditingName ? (
          <Input
            autoFocus
            defaultValue={data.refId}
            maxLength={PLACEHOLDER_CONSTANTS.MAX_REF_ID_LENGTH}
            style={{ width: 80, fontSize: 13 }}
            onBlur={(e) => handleNameChange(e.target.value)}
            onPressEnter={(e) => handleNameChange(e.currentTarget.value)}
            status={nameError ? 'error' : undefined}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <Tooltip title="Click to edit (max 5 chars, alphanumeric)">
            <span
              style={{
                flex: 1,
                color: colors.title,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
            >
              {data.refId}
            </span>
          </Tooltip>
        )}

        {nameError && (
          <Tooltip title={nameError}>
            <Tag color="error" style={{ marginLeft: 8, fontSize: 10 }}>
              Error
            </Tag>
          </Tooltip>
        )}

        {/* Logic type radio - AND/OR switch */}
        <div className="nodrag" style={{ marginLeft: 8, marginRight: 8 }}>
          <Radio.Group
            value={data.logicType}
            onChange={(e) => handleLogicTypeChange(e.target.value)}
            size="small"
            buttonStyle="solid"
          >
            <Radio.Button value={LogicType.AND}>AND</Radio.Button>
            <Radio.Button value={LogicType.OR}>OR</Radio.Button>
          </Radio.Group>
        </div>

        {/* Actions - always visible */}
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingName(true);
            }}
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
          <Tooltip title={contentExpanded ? 'Collapse' : 'Expand'}>
            <Button
              type="text"
              size="small"
              icon={contentExpanded ? <DownOutlined /> : <RightOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setContentExpanded((prev) => !prev);
              }}
              style={{ color: '#8c8c8c' }}
            />
          </Tooltip>
        </Space>
      </div>

      {/* Content - collapsible */}
      {contentExpanded && (
        <div style={{ padding: '12px' }}>
        {/* Table selection */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
            Table ({availableTables.length} available)
          </div>
          <div className="nodrag nowheel">
            <Select
              value={data.tableName || undefined}
              placeholder="Select table"
              loading={isLoadingTables}
              style={{ width: '100%' }}
              onChange={(value) => {
                console.log('[ConditionDefinitionNode] Select onChange called with:', value);
                handleTableChange(value);
              }}
              onDropdownVisibleChange={(open) => {
                console.log('[ConditionDefinitionNode] Dropdown visible:', open);
                console.log('[ConditionDefinitionNode] Current options:', availableTables);
              }}
              getPopupContainer={() => document.body}
              popupClassName="condition-definition-select-dropdown nodrag"
              className="nodrag"
            >
              {availableTables.map((tableName) => (
                <Select.Option key={tableName} value={tableName}>
                  {tableName}
                </Select.Option>
              ))}
            </Select>
          </div>
        </div>

        {/* Conditions */}
        {data.conditions.map((condition) => (
          <div
            key={condition.id}
            className="nodrag nowheel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              padding: '8px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '4px',
            }}
          >
            {/* Field selection */}
            <Select
              value={condition.field || undefined}
              placeholder="Field"
              loading={isLoadingFields}
              disabled={!data.tableName}
              style={{ flex: 1, minWidth: 100 }}
              onChange={(value) => handleConditionFieldChange(condition.id, value)}
              options={tableFields.map((f) => ({ value: f.name, label: f.name }))}
              showSearch
              getPopupContainer={() => document.body}
              popupClassName="condition-definition-select-dropdown nodrag"
              className="nodrag"
            />

            {/* Operator selection */}
            <Select
              value={condition.operator}
              style={{ width: 100 }}
              onChange={(value) => handleConditionOperatorChange(condition.id, value)}
              options={getOperatorOptions()}
              getPopupContainer={() => document.body}
              popupClassName="condition-definition-select-dropdown nodrag"
              className="nodrag"
            />

            {/* Placeholder display */}
            <Tag
              color="purple"
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                minWidth: 60,
                textAlign: 'center',
              }}
            >
              {condition.placeholder}
            </Tag>

            {/* Remove button */}
            <Button
              type="text"
              size="small"
              icon={<MinusOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveCondition(condition.id);
              }}
              disabled={data.conditions.length <= 1}
              danger
              style={{ padding: '0 4px' }}
            />
          </div>
        ))}

        {/* Add condition button */}
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            handleAddCondition();
          }}
          disabled={!data.tableName}
          style={{ width: '100%', marginTop: 4 }}
        >
          Add Condition
        </Button>

        {/* Incomplete warning */}
        {!isComplete && (
          <div
            style={{
              marginTop: 12,
              padding: '6px 10px',
              background: 'rgba(255, 77, 79, 0.1)',
              borderRadius: '4px',
              fontSize: 11,
              color: '#ff4d4f',
            }}
          >
            Please select table and configure all conditions
          </div>
        )}
        </div>
      )}
      <NodeNextButton nodeId={id} nodeType={FlowNodeType.CONDITION_DEFINITION} visible={isHovering} />
    </div>
  );
};

export default ConditionDefinitionNode;
