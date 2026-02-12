/**
 * Node Detail Panel Component
 * Right-side panel for editing node details
 */

import React, { useCallback } from 'react';
import { Drawer, Form, Input, Select, Tag, Space, Divider } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { SelectNodeForm, SelectAggNodeForm } from './SelectNodeForms';
import type {
  FlowNode,
  TableNodeData,
  JoinNodeData,
  ConditionNodeData,
  ConditionGroupNodeData,
  EndNodeData,
} from '../../../services/flow/types';
import { JOIN_TYPE_LABELS, SQL_OPERATORS } from '../../../services/flow/constants';

const { Option } = Select;

export const NodeDetailPanel: React.FC = () => {
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
        return <JoinNodeForm node={node} onUpdate={updateNode} />;
      case 'condition':
        return <ConditionNodeForm node={node} onUpdate={updateNode} />;
      case 'conditionGroup':
        return <ConditionGroupNodeForm node={node} onUpdate={updateNode} />;
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
        return <div style={{ color: '#8c8c8c' }}>暂无配置项</div>;
    }
  };

  // Get node title
  const getNodeTitle = (node: FlowNode) => {
    switch (node.type) {
      case 'start':
        return '开始节点';
      case 'table':
        return `表节点 - ${(node.data as TableNodeData).tableName}`;
      case 'join':
        return 'JOIN 节点';
      case 'condition':
        return '条件节点';
      case 'conditionGroup':
        return '条件组节点';
      case 'select':
        return '选择列节点';
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
            <InfoCircleOutlined />
            <span>{getNodeTitle(selectedNode)}</span>
          </Space>
        ) : (
          '节点详情'
        )
      }
      placement="right"
      width={360}
      open={detailPanelOpen}
      onClose={handleClose}
      mask={false}
      style={{
        background: '#141414',
      }}
      headerStyle={{
        background: '#1f1f1f',
        borderBottom: '1px solid #303030',
        color: '#fff',
      }}
      bodyStyle={{
        padding: '16px',
      }}
    >
      {selectedNode ? (
        renderNodeForm(selectedNode)
      ) : (
        <div style={{ color: '#8c8c8c', textAlign: 'center', padding: '40px 0' }}>
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

// Join Node Form
const JoinNodeForm: React.FC<{
  node: FlowNode;
  onUpdate: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as JoinNodeData;
  const nodes = useFlowStore((state) => state.nodes);

  // Get available fields from left and right tables
  const leftTableNode = nodes.find(
    (n) => n.type === 'table' && (n.data as { tableName: string }).tableName === data.leftTable
  );
  const rightTableNode = nodes.find(
    (n) => n.type === 'table' && (n.data as { tableName: string }).tableName === data.rightTable
  );

  const leftFields = (leftTableNode?.data as { fields?: { name: string; type: string }[] })?.fields || [];
  const rightFields = (rightTableNode?.data as { fields?: { name: string; type: string }[] })?.fields || [];

  // Add new condition
  const addCondition = useCallback(() => {
    const newCondition = {
      leftTable: data.leftTable,
      rightTable: data.rightTable,
      leftField: leftFields[0]?.name || '',
      rightField: rightFields[0]?.name || '',
    };
    onUpdate(node.id, {
      conditions: [...data.conditions, newCondition],
    });
  }, [data, leftFields, rightFields, node.id, onUpdate]);

  // Remove condition
  const removeCondition = useCallback((index: number) => {
    const newConditions = data.conditions.filter((_, i) => i !== index);
    onUpdate(node.id, { conditions: newConditions });
  }, [data.conditions, node.id, onUpdate]);

  // Update condition
  const updateCondition = useCallback((index: number, field: 'leftField' | 'rightField', value: string) => {
    const newConditions = data.conditions.map((cond, i) =>
      i === index ? { ...cond, [field]: value } : cond
    );
    onUpdate(node.id, { conditions: newConditions });
  }, [data.conditions, node.id, onUpdate]);

  return (
    <Form layout="vertical">
      <Form.Item label="JOIN 类型">
        <Select
          value={data.joinType}
          onChange={(value) => onUpdate(node.id, { joinType: value })}
          style={{ width: '100%' }}
        >
          {Object.entries(JOIN_TYPE_LABELS).map(([type, label]) => (
            <Option key={type} value={type}>
              {label}
            </Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item label="执行顺序">
        <Input
          type="number"
          min={1}
          value={data.order}
          onChange={(e) => onUpdate(node.id, { order: parseInt(e.target.value, 10) || 1 })}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item label="左表">
        <Input value={data.leftTable} disabled />
      </Form.Item>
      <Form.Item label="右表">
        <Input value={data.rightTable} disabled />
      </Form.Item>
      <Divider style={{ borderColor: '#303030' }} />
      <Form.Item label="关联条件">
        {data.conditions.length === 0 ? (
          <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
            暂无关联条件，请添加
          </div>
        ) : (
          data.conditions.map((cond, index) => (
            <div
              key={index}
              style={{
                marginBottom: 12,
                padding: 8,
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 4,
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>
                  左表字段
                </div>
                <Select
                  value={cond.leftField}
                  onChange={(value) => updateCondition(index, 'leftField', value)}
                  style={{ width: '100%' }}
                  size="small"
                >
                  {leftFields.map((field) => (
                    <Option key={field.name} value={field.name}>
                      {field.name} ({field.type})
                    </Option>
                  ))}
                </Select>
              </div>
              <div style={{ textAlign: 'center', color: '#8c8c8c', margin: '4px 0' }}>
                =
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>
                  右表字段
                </div>
                <Select
                  value={cond.rightField}
                  onChange={(value) => updateCondition(index, 'rightField', value)}
                  style={{ width: '100%' }}
                  size="small"
                >
                  {rightFields.map((field) => (
                    <Option key={field.name} value={field.name}>
                      {field.name} ({field.type})
                    </Option>
                  ))}
                </Select>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    color: '#ff4d4f',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  onClick={() => removeCondition(index)}
                >
                  删除
                </span>
              </div>
            </div>
          ))
        )}
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(24, 144, 255, 0.1)',
            borderRadius: 4,
            textAlign: 'center',
            cursor: 'pointer',
            color: '#1890ff',
            fontSize: 13,
          }}
          onClick={addCondition}
        >
          + 添加条件
        </div>
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
  const tableNodes = nodes.filter((n) => n.type === 'table');

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
          onChange={(value) => onUpdate(node.id, { field: value })}
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
        >
          <Select.OptGroup label="比较">
            {SQL_OPERATORS.comparison.map((op) => (
              <Option key={op.value} value={op.value}>
                {op.label}
              </Option>
            ))}
          </Select.OptGroup>
          <Select.OptGroup label="字符串">
            {SQL_OPERATORS.string.map((op) => (
              <Option key={op.value} value={op.value}>
                {op.label}
              </Option>
            ))}
          </Select.OptGroup>
          <Select.OptGroup label="空值">
            {SQL_OPERATORS.null.map((op) => (
              <Option key={op.value} value={op.value}>
                {op.label}
              </Option>
            ))}
          </Select.OptGroup>
          <Select.OptGroup label="集合">
            {SQL_OPERATORS.set.map((op) => (
              <Option key={op.value} value={op.value}>
                {op.label}
              </Option>
            ))}
          </Select.OptGroup>
        </Select>
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
const ConditionGroupNodeForm: React.FC<{
  node: FlowNode;
  onUpdate: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as ConditionGroupNodeData;
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
          <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
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
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 4,
                }}
              >
                <span style={{ flex: 1, fontSize: 12 }}>
                  {condData.tableName}.{condData.field} {condData.operator}
                </span>
                <span
                  style={{
                    color: '#ff4d4f',
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
  onUpdate: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as EndNodeData;

  return (
    <Form layout="vertical">
      <Form.Item label="业务算子">
        <Select
          value={data.operatorType}
          onChange={(value) => onUpdate(node.id, { operatorType: value })}
          style={{ width: '100%' }}
        >
          <Option value="association">关联查询</Option>
          <Option value="anomaly">异常洞察</Option>
          <Option value="clustering">用户聚类</Option>
        </Select>
      </Form.Item>
      <Form.Item label="状态">
        {data.executable ? (
          <Tag color="success">可执行</Tag>
        ) : (
          <Tag color="error">配置不完整</Tag>
        )}
      </Form.Item>
      {data.errors.length > 0 && (
        <Form.Item label="错误">
          {data.errors.map((error, index) => (
            <div key={index} style={{ color: '#ff4d4f', fontSize: 12, marginBottom: 4 }}>
              • {error.message}
            </div>
          ))}
        </Form.Item>
      )}
    </Form>
  );
};

export default NodeDetailPanel;
