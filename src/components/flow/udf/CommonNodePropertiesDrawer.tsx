/**
 * CommonNodePropertiesDrawer
 * Right-side drawer for editing node properties.
 * Handles Table, Condition, ConditionGroupRelation, End and Select node types.
 */

import React, { useCallback } from 'react';
import { Drawer, Form, Input, Select, Tag, Space, Divider } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { SelectNodeForm, SelectAggNodeForm } from '../udf/JoinSelectColumnsDrawer';
import type {
  FlowNode,
  TableNodeData,
  ConditionNodeData,
  ConditionGroupRelationNodeData,
  EndNodeData,
} from '../../../services/flow/types';
import { getOperatorsByFieldType } from '../../../services/flow/constants';
import { FlowNodeType, FieldType } from '../../../services/flow/types';

const { Option } = Select;

export const CommonNodePropertiesDrawer: React.FC = () => {
  const detailPanelOpen = useFlowStore((state) => state.detailPanelOpen);
  const setDetailPanelOpen = useFlowStore((state) => state.setDetailPanelOpen);
  const selectedNode = useFlowStore((state) =>
    state.nodes.find((n) => n.id === state.selectedNodeId)
  );
  const updateNode = useFlowStore((state) => state.updateNode);

  // Handle close
  const handleClose = useCallback(() => {
    setDetailPanelOpen(false);
  }, [setDetailPanelOpen]);

  // Render node-specific form
  const renderNodeForm = (node: FlowNode) => {
    switch (node.type) {
      case 'table':
        return <TableNodeForm node={node} onUpdate={updateNode} />;
      case 'join':
        // Join node configuration is now handled by TableJoinBuildPanel (edge-based)
        return null;
      case 'condition':
        return <ConditionNodeForm node={node} onUpdate={updateNode} />;
      case 'conditionGroupRelation':
        return <ConditionGroupRelationNodeForm node={node} onUpdate={updateNode} />;
      case 'select':
        return <SelectNodeForm node={node} onUpdate={updateNode} />;
      case 'selectAgg':
        return <SelectAggNodeForm node={node} onUpdate={updateNode} />;
      case 'end':
        return <EndNodeForm node={node} onUpdate={updateNode} />;
      case 'merge':
        // Merge node should not show detail panel
        return null;
      default:
        return <div style={{ color: 'var(--vm-text-helper)' }}>暂无配置项</div>;
    }
  };

  // Get node title
  const getNodeTitle = (node: FlowNode) => {
    switch (node.type) {
      case 'dataSource':
        return '数据源节点';
      case 'table':
        return `表节点 - ${(node.data as TableNodeData).tableName}`;
      case 'join':
        return 'JOIN 节点';
      case 'condition':
        return '条件节点';
      case 'conditionGroupRelation':
        return '条件组节点';
      case 'select':
        return '选择查询字段';
      case 'selectAgg':
        return '聚合查询节点';
      case 'end':
        return '结束节点';
      default:
        return '节点详情';
    }
  };

  return (
    <Drawer
      title={
        selectedNode ? (
          <Space>
            <InfoCircleOutlined style={{ color: 'var(--vm-primary)' }} />
            <span style={{ color: 'var(--vm-text-primary)', fontWeight: 500 }}>{getNodeTitle(selectedNode)}</span>
          </Space>
        ) : (
          '节点详情'
        )
      }
      placement="right"
      width={380}
      open={detailPanelOpen}
      onClose={handleClose}
      mask={true}
      maskStyle={{
        background: 'rgba(0, 0, 0, 0.15)',
        backdropFilter: 'blur(2px)',
      }}
      style={{
        background: 'transparent',
      }}
      headerStyle={{
        background: 'var(--vm-bg-card)',
        borderBottom: '1px solid var(--vm-border-mid)',
        color: 'var(--vm-text-primary)',
        padding: '16px 20px',
      }}
      bodyStyle={{
        padding: '20px',
        background: 'var(--vm-bg-card)',
      }}
      drawerStyle={{
        background: 'var(--vm-bg-card)',
        borderLeft: '1px solid var(--vm-border-mid)',
        boxShadow: 'var(--vm-flow-shadow-panel)',
      }}
      closeIcon={
        <span style={{ color: 'var(--vm-text-secondary)', fontSize: '16px' }}>✕</span>
      }
    >
      {selectedNode ? (
        renderNodeForm(selectedNode)
      ) : (
        <div style={{ color: 'var(--vm-text-helper)', textAlign: 'center', padding: '40px 0' }}>
          请选择一个节点查看详情
        </div>
      )}
    </Drawer>
  );
};

// Table Node Form
const TableNodeForm: React.FC<{
  node: FlowNode;
  onUpdate: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as TableNodeData;

  return (
    <Form layout="vertical">
      <Form.Item label="表名">
        <Input value={data.tableName} disabled />
      </Form.Item>
      <Form.Item label="别名">
        <Input
          value={data.alias}
          onChange={(e) => onUpdate(node.id, { alias: e.target.value })}
          placeholder="输入表别名"
        />
      </Form.Item>
      <Form.Item label="字段数">
        <Tag>{data.fields.length} 个字段</Tag>
      </Form.Item>
    </Form>
  );
};

// Condition Node Form
const ConditionNodeForm: React.FC<{
  node: FlowNode;
  onUpdate: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as ConditionNodeData;
  const nodes = useFlowStore((state) => state.nodes);

  // Get all table nodes for selection
  const tableNodes = nodes.filter((n) => n.type === FlowNodeType.TABLE);

  // Get fields for selected table
  const selectedTableNode = tableNodes.find(
    (n) => (n.data as { tableName: string }).tableName === data.tableName
  );
  const tableFields = (selectedTableNode?.data as { fields?: { name: string; type: string }[] })?.fields || [];

  // Check if operator is null-related
  const isNullOperator = data.operator?.includes('NULL');

  return (
    <Form layout="vertical">
      <Form.Item label="逻辑关系">
        <Select
          value={data.logicType}
          onChange={(value) => onUpdate(node.id, { logicType: value })}
          style={{ width: '100%' }}
        >
          <Option value="AND">AND (且)</Option>
          <Option value="OR">OR (或)</Option>
        </Select>
      </Form.Item>

      <Divider style={{ borderColor: '#303030' }} />

      <Form.Item label="选择表">
        <Select
          value={data.tableName}
          onChange={(value) => onUpdate(node.id, { tableName: value, field: '' })}
          style={{ width: '100%' }}
          placeholder="选择数据表"
        >
          {tableNodes.map((tableNode) => {
            const tableData = tableNode.data as { tableName: string };
            return (
              <Option key={tableData.tableName} value={tableData.tableName}>
                {tableData.tableName}
              </Option>
            );
          })}
        </Select>
      </Form.Item>

      <Form.Item label="选择字段">
        <Select
          value={data.field}
          onChange={(value) => {
            const fieldInfo = tableFields.find((f) => f.name === value);
            const newType = (fieldInfo?.type ?? 'VARCHAR') as FieldType;
            const validOps = getOperatorsByFieldType(newType);
            const isOpStillValid = validOps.some((op) => op.value === data.operator);
            const newOperator = isOpStillValid ? data.operator : (validOps[0]?.value ?? '=');
            onUpdate(node.id, {
              field: value,
              ...(isOpStillValid ? {} : { operator: newOperator }),
            });
          }}
          style={{ width: '100%' }}
          placeholder="选择字段"
          disabled={!data.tableName}
        >
          {tableFields.map((field) => (
            <Option key={field.name} value={field.name}>
              {field.name} ({field.type})
            </Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item label="操作符">
        <Select
          value={data.operator}
          onChange={(value) => onUpdate(node.id, { operator: value, value: value.includes('NULL') ? null : data.value })}
          style={{ width: '100%' }}
          placeholder="选择操作符"
          options={getOperatorsByFieldType(
            (tableFields.find((f) => f.name === data.field)?.type ?? undefined) as FieldType | undefined
          )}
        />
      </Form.Item>

      {!isNullOperator && (
        <Form.Item label="值">
          <Input
            value={data.value as string}
            onChange={(e) => onUpdate(node.id, { value: e.target.value })}
            placeholder="输入条件值"
          />
        </Form.Item>
      )}
    </Form>
  );
};

// Condition Group Node Form
const ConditionGroupRelationNodeForm: React.FC<{
  node: FlowNode;
  onUpdate: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as ConditionGroupRelationNodeData;
  const nodes = useFlowStore((state) => state.nodes);

  // Get available condition nodes not in any group
  const availableConditions = nodes.filter(
    (n) =>
      n.type === 'condition' &&
      !data.conditionIds.includes(n.id)
  );

  // Get child conditions
  const childConditions = nodes.filter(
    (n) => n.type === 'condition' && data.conditionIds.includes(n.id)
  );

  // Add condition to group
  const addCondition = useCallback((conditionId: string) => {
    onUpdate(node.id, {
      conditionIds: [...data.conditionIds, conditionId],
    });
  }, [data.conditionIds, node.id, onUpdate]);

  // Remove condition from group
  const removeCondition = useCallback((conditionId: string) => {
    onUpdate(node.id, {
      conditionIds: data.conditionIds.filter((id) => id !== conditionId),
    });
  }, [data.conditionIds, node.id, onUpdate]);

  return (
    <Form layout="vertical">
      <Form.Item label="逻辑关系">
        <Select
          value={data.logicType}
          onChange={(value) => onUpdate(node.id, { logicType: value })}
          style={{ width: '100%' }}
        >
          <Option value="AND">全部满足 (AND)</Option>
          <Option value="OR">任一满足 (OR)</Option>
        </Select>
      </Form.Item>

      <Divider style={{ borderColor: '#303030' }} />

      <Form.Item label="组内条件">
        {childConditions.length === 0 ? (
          <div style={{ color: 'var(--vm-text-helper)', fontSize: 12, marginBottom: 12 }}>
            暂无条件，请添加
          </div>
        ) : (
          childConditions.map((condition) => {
            const condData = condition.data as ConditionNodeData;
            return (
              <div
                key={condition.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  marginBottom: 8,
                  background: 'var(--vm-surface-hover)',
                  borderRadius: 4,
                }}
              >
                <span style={{ flex: 1, fontSize: 12 }}>
                  {condData.tableName}.{condData.field} {condData.operator}
                </span>
                <span
                  style={{
                    color: 'var(--vm-color-error)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  onClick={() => removeCondition(condition.id)}
                >
                  移除
                </span>
              </div>
            );
          })
        )}
      </Form.Item>

      {availableConditions.length > 0 && (
        <Form.Item label="添加条件">
          <Select
            placeholder="选择要添加的条件"
            style={{ width: '100%' }}
            onChange={(value) => addCondition(value)}
          >
            {availableConditions.map((condition) => {
              const condData = condition.data as ConditionNodeData;
              return (
                <Option key={condition.id} value={condition.id}>
                  {condData.tableName}.{condData.field} {condData.operator}
                </Option>
              );
            })}
          </Select>
        </Form.Item>
      )}
    </Form>
  );
};

// End Node Form
const EndNodeForm: React.FC<{
  node: FlowNode;
  onUpdate?: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node }) => {
  const data = node.data as EndNodeData;

  return (
    <Form layout="vertical">
      <Form.Item label="状态">
        {data.errors.length === 0 ? (
          <Tag color="success">配置完整</Tag>
        ) : (
          <Tag color="error">配置异常</Tag>
        )}
      </Form.Item>
      {data.errors.length > 0 && (
        <Form.Item label="错误列表">
          {data.errors.map((error, index) => (
            <div key={index} style={{ color: 'var(--vm-color-error)', fontSize: 12, marginBottom: 4 }}>
              • {error.message}
            </div>
          ))}
        </Form.Item>
      )}
    </Form>
  );
};

export default CommonNodePropertiesDrawer;
