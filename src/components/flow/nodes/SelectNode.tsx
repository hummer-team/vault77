/**
 * Select Node Component
 * Displays selected fields for output with optional aggregation.
 * When linked to a UDF data-cleaning operator, routes click to the appropriate
 * configuration drawer instead of the standard detail panel.
 */

import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Button, Tag, Space, Tooltip, List } from 'antd';
import {
  TableOutlined,
  DeleteOutlined,
  EditOutlined,
  FunctionOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { SelectNodeData, ReplaceRule } from '../../../services/flow/types';
import { OperatorType, FlowNodeType } from '../../../services/flow/types';
import { FLOW_COLORS } from '../../../services/flow/constants';
import ReplaceColumnDrawer from '../udf/ReplaceColumnDrawer';

interface SelectNodeProps {
  id: string;
  data: SelectNodeData;
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

export const SelectNode: React.FC<SelectNodeProps> = ({
  id,
  data,
  selected,
}) => {
  const removeNode = useFlowStore((state) => state.removeNode);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const updateNode = useFlowStore((state) => state.updateNode);
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);

  // UDF drawer visibility state
  const [udfDrawerOpen, setUdfDrawerOpen] = useState(false);

  // Whether this node is linked to a UDF data-cleaning operator
  const isUdfNode = !!data.udfFunctionName;

  // Handle delete
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeNode(id);
    },
    [id, removeNode]
  );

  /**
   * Click routing:
   * - UDF replace operator → open ReplaceColumnDrawer
   * - Other UDF operators (未实现) → fall through to standard detail panel
   * - Standard select → open standard detail panel
   */
  const handleClick = useCallback(() => {
    if (data.udfFunctionName === 'udf_replace_spec_column_value') {
      setUdfDrawerOpen(true);
    } else {
      setSelectedNode(id);
    }
  }, [data.udfFunctionName, id, setSelectedNode]);

  /** Called when user confirms rules in ReplaceColumnDrawer */
  const handleUdfConfirm = useCallback(
    (rules: ReplaceRule[]) => {
      updateNode(id, { replacementRules: rules } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
      // Propagate operatorType to EndNode so the correct strategy is used
      const endNode = nodes.find((n) => n.type === 'end');
      if (endNode) {
        updateNode(endNode.id, { operatorType: OperatorType.UDF_REPLACE_COLUMN } as Record<string, unknown>);
      }
    },
    [id, updateNode, nodes]
  );

  // For UDF nodes: configured when replacementRules has at least one valid entry
  const isUdfConfigured = isUdfNode &&
    (data.replacementRules?.length ?? 0) > 0 &&
    data.replacementRules?.some((r) => r.sourceTable && r.targetColumn?.length > 0);

  // Check if there's already a merge node (衔接节点) connected to this select node
  const hasConnectedMergeNode = React.useMemo(() => {
    return edges.some((e) => e.source === id && nodes.find((n) => n.id === e.target)?.type === 'merge');
  }, [edges, nodes, id]);

  // Auto-create merge node (衔接节点 "+") after select node if not exists.
  // For standard nodes: triggers when fields are selected or selectAll is true.
  // For UDF nodes: triggers when replacement rules are fully configured (isUdfConfigured).
  // This is the gateway to the "定义条件" (condition definition) flow.
  React.useEffect(() => {
    const shouldCreate = data.selectAll || data.fields.length > 0 || isUdfConfigured;
    if (!shouldCreate || hasConnectedMergeNode) return;

    const selectNode = nodes.find((n) => n.id === id);
    if (!selectNode) return;

    // Double-check store state to prevent race conditions
    const currentEdges = useFlowStore.getState().edges;
    const currentNodes = useFlowStore.getState().nodes;
    const alreadyHasMerge = currentEdges.some(
      (e) =>
        e.source === id &&
        currentNodes.find((n) => n.id === e.target)?.type === 'merge'
    );
    if (alreadyHasMerge) return;

    const { x: selectX, y: selectY } = selectNode.position;

    // Create merge node (衔接节点 "+") — entry point for defining conditions
    const mergeNodeId = `merge_${Date.now()}`;
    addNode({
      id: mergeNodeId,
      type: FlowNodeType.MERGE,
      position: { x: selectX + 280, y: selectY },
      data: { tableCount: 1 },
    } as unknown as Parameters<typeof addNode>[0]);

    // Connect select → merge
    addEdge({
      id: `e_${id}_${mergeNodeId}`,
      source: id,
      target: mergeNodeId,
      type: 'default',
      animated: false,
      style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
      markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
    } as unknown as Parameters<typeof addEdge>[0]);
  }, [data.fields.length, data.selectAll, isUdfConfigured, hasConnectedMergeNode, id, nodes, addNode, addEdge]);

  const hasFields = isUdfNode
    ? isUdfConfigured
    : (data.fields.length > 0 || data.selectAll);

  return (
    <>
    <div
      style={{
        background: FLOW_COLORS.node.select.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : hasFields ? FLOW_COLORS.node.select.border : '#ff4d4f'}`,
        borderRadius: '8px',
        minWidth: '200px',
        minHeight: '80px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
        position: 'relative',
      }}
      className="select-node"
      onClick={handleClick}
    >
      {/* Node Resizer - only show when selected */}
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={80}
        maxWidth={400}
        maxHeight={400}
        lineStyle={{ borderColor: '#52c41a', borderWidth: 2 }}
        handleStyle={{ backgroundColor: '#52c41a', borderColor: '#fff', width: 10, height: 10 }}
      />
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
        {isUdfNode
          ? <SettingOutlined style={{ color: '#722ed1', marginRight: 8 }} />
          : <TableOutlined style={{ color: FLOW_COLORS.node.select.border, marginRight: 8 }} />
        }

        <span
          style={{
            flex: 1,
            color: '#fff',
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          选择列
        </span>

        {/* UDF configured indicator */}
        {isUdfNode && isUdfConfigured && (
          <Tag color="success" style={{ margin: 0, marginRight: 8, fontSize: 10 }}>
            已配置 {data.replacementRules?.length} 条
          </Tag>
        )}

        {/* Standard field count badge */}
        {!isUdfNode && !data.selectAll && data.fields.length > 0 && (
          <Tag color="success" style={{ margin: 0, marginRight: 8 }}>
            {data.fields.length} 列
          </Tag>
        )}

        {!isUdfNode && data.selectAll && (
          <Tag color="success" style={{ margin: 0, marginRight: 8 }}>
            全部
          </Tag>
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

      {/* Selected fields list */}
      {!data.selectAll && data.fields.length > 0 && (
        <div
          style={{
            padding: '8px',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
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

      {/* Select all message */}
      {data.selectAll && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            color: '#52c41a',
            fontSize: 12,
          }}
        >
          已选择所有字段
        </div>
      )}

      {/* UDF configured: summary only — details are in the drawer */}

      {/* UDF unconfigured state */}
      {isUdfNode && !isUdfConfigured && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            background: 'rgba(255, 77, 79, 0.1)',
          }}
        >
          <span style={{ fontSize: 11, color: '#ff4d4f' }}>
            点击配置替换规则
          </span>
        </div>
      )}

      {/* Standard: Selected fields list */}
      {!isUdfNode && !data.selectAll && data.fields.length > 0 && (
        <div
          style={{
            padding: '8px',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
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

      {/* Standard: Select all message */}
      {!isUdfNode && data.selectAll && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            color: '#52c41a',
            fontSize: 12,
          }}
        >
          已选择所有字段
        </div>
      )}

      {/* Standard: Empty state */}
      {!isUdfNode && !data.selectAll && data.fields.length === 0 && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            background: 'rgba(255, 77, 79, 0.1)',
          }}
        >
          <span style={{ fontSize: 11, color: '#ff4d4f' }}>
            请至少选择一个字段
          </span>
        </div>
      )}
    </div>

    {/* ReplaceColumnDrawer — only rendered for udf_replace_spec_column_value */}
    {data.udfFunctionName === 'udf_replace_spec_column_value' && (
      <ReplaceColumnDrawer
        open={udfDrawerOpen}
        onClose={() => setUdfDrawerOpen(false)}
        onConfirm={handleUdfConfirm}
        initialRules={data.replacementRules}
      />
    )}
    </>
  );
};

export default SelectNode;
