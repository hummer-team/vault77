/**
 * Select Node Forms
 * Form components for SelectNode and SelectAggNode
 */

import React, { useCallback } from 'react';
import { Form, Input, Select, Divider, Space, Tag } from 'antd';
import { useFlowStore } from '../../../stores/flowStore';
import type {
  FlowNode,
  SelectNodeData,
  SelectAggNodeData,
} from '../../../services/flow/types';

const { Option } = Select;

// Select Node Form
const SelectNodeForm: React.FC<{
  node: FlowNode;
  onUpdate: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as SelectNodeData;
  const nodes = useFlowStore((state) => state.nodes);

  // Get all table nodes
  const tableNodes = nodes.filter((n) => n.type === 'table');

  // Get available fields from all tables
  const allFields: Array<{ tableName: string; fieldName: string; type: string }> = [];
  tableNodes.forEach((tableNode) => {
    const tableData = tableNode.data as { tableName: string; fields?: { name: string; type: string; nullable?: boolean }[] };
    console.log('[SelectNodeForm] Table node data:', tableNode.id, tableData);
    if (tableData.fields && Array.isArray(tableData.fields)) {
      console.log('[SelectNodeForm] Fields found:', tableData.fields.length, tableData.fields);
      tableData.fields.forEach((field) => {
        allFields.push({
          tableName: tableData.tableName,
          fieldName: field.name,
          type: field.type,
        });
      });
    } else {
      console.log('[SelectNodeForm] No fields or not an array:', tableData.fields);
    }
  });

  console.log('[SelectNodeForm] All fields collected:', allFields.length, allFields);

  // Add new field
  const addField = useCallback(() => {
    if (allFields.length === 0) return;
    const newField = {
      tableName: allFields[0].tableName,
      fieldName: allFields[0].fieldName,
      alias: '',
    };
    onUpdate(node.id, {
      fields: [...data.fields, newField],
    });
  }, [allFields, data.fields, node.id, onUpdate]);

  // Remove field
  const removeField = useCallback((index: number) => {
    const newFields = data.fields.filter((_, i) => i !== index);
    onUpdate(node.id, { fields: newFields });
  }, [data.fields, node.id, onUpdate]);

  // Update field
  const updateField = useCallback((index: number, updates: Partial<SelectNodeData['fields'][0]>) => {
    const newFields = data.fields.map((field, i) =>
      i === index ? { ...field, ...updates } : field
    );
    onUpdate(node.id, { fields: newFields });
  }, [data.fields, node.id, onUpdate]);

  return (
    <Form layout="vertical">
      <Form.Item label="选择模式">
        <Select
          value={data.selectAll ? 'all' : 'custom'}
          onChange={(value) => onUpdate(node.id, { selectAll: value === 'all', fields: value === 'all' ? [] : data.fields })}
          style={{ width: '100%' }}
        >
          <Option value="custom">自定义选择</Option>
          <Option value="all">全部字段 (SELECT *)</Option>
        </Select>
      </Form.Item>

      {!data.selectAll && (
        <>
          <Divider style={{ borderColor: '#303030' }} />
          <Form.Item label="选择字段">
            {data.fields.length === 0 ? (
              <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
                暂无字段，请添加
              </div>
            ) : (
              data.fields.map((field, index) => (
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
                      表名.字段名
                    </div>
                    <Select
                      value={`${field.tableName}.${field.fieldName}`}
                      onChange={(value) => {
                        const [tableName, fieldName] = value.split('.');
                        updateField(index, { tableName, fieldName });
                      }}
                      style={{ width: '100%' }}
                      size="small"
                      showSearch
                    >
                      {allFields.map((f) => (
                        <Option key={`${f.tableName}.${f.fieldName}`} value={`${f.tableName}.${f.fieldName}`}>
                          {f.tableName}.{f.fieldName} ({f.type})
                        </Option>
                      ))}
                    </Select>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>
                      别名 (可选)
                    </div>
                    <Input
                      value={field.alias}
                      onChange={(e) => updateField(index, { alias: e.target.value })}
                      placeholder="输入字段别名"
                      size="small"
                    />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        color: '#ff4d4f',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                      onClick={() => removeField(index)}
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
                background: 'rgba(82, 196, 26, 0.1)',
                borderRadius: 4,
                textAlign: 'center',
                cursor: allFields.length === 0 ? 'not-allowed' : 'pointer',
                color: allFields.length === 0 ? '#8c8c8c' : '#52c41a',
                fontSize: 13,
              }}
              onClick={addField}
            >
              + 添加字段
            </div>
          </Form.Item>
        </>
      )}
    </Form>
  );
};

// Select Aggregation Node Form
const SelectAggNodeForm: React.FC<{
  node: FlowNode;
  onUpdate: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as SelectAggNodeData;
  const nodes = useFlowStore((state) => state.nodes);

  // Get all table nodes
  const tableNodes = nodes.filter((n) => n.type === 'table');

  // Get available fields from all tables
  const allFields: Array<{ tableName: string; fieldName: string; type: string }> = [];
  tableNodes.forEach((tableNode) => {
    const tableData = tableNode.data as { tableName: string; fields?: { name: string; type: string }[] };
    if (tableData.fields) {
      tableData.fields.forEach((field) => {
        allFields.push({
          tableName: tableData.tableName,
          fieldName: field.name,
          type: field.type,
        });
      });
    }
  });

  // Add new field
  const addField = useCallback(() => {
    if (allFields.length === 0) return;
    const newField = {
      tableName: allFields[0].tableName,
      fieldName: allFields[0].fieldName,
      alias: '',
      aggregate: 'COUNT' as const,
    };
    onUpdate(node.id, {
      fields: [...data.fields, newField],
    });
  }, [allFields, data.fields, node.id, onUpdate]);

  // Remove field
  const removeField = useCallback((index: number) => {
    const newFields = data.fields.filter((_, i) => i !== index);
    onUpdate(node.id, { fields: newFields });
  }, [data.fields, node.id, onUpdate]);

  // Update field
  const updateField = useCallback((index: number, updates: Partial<SelectAggNodeData['fields'][0]>) => {
    const newFields = data.fields.map((field, i) =>
      i === index ? { ...field, ...updates } : field
    );
    onUpdate(node.id, { fields: newFields });
  }, [data.fields, node.id, onUpdate]);

  // Remove GROUP BY field
  const removeGroupByField = useCallback((fieldKey: string) => {
    onUpdate(node.id, {
      groupByFields: data.groupByFields.filter((f) => f !== fieldKey),
    });
  }, [data.groupByFields, node.id, onUpdate]);

  return (
    <Form layout="vertical">
      <Form.Item label="聚合字段">
        {data.fields.length === 0 ? (
          <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
            暂无字段，请添加
          </div>
        ) : (
          data.fields.map((field, index) => (
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
                  聚合函数
                </div>
                <Select
                  value={field.aggregate}
                  onChange={(value) => updateField(index, { aggregate: value as 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' })}
                  style={{ width: '100%' }}
                  size="small"
                >
                  <Option value="COUNT">COUNT (计数)</Option>
                  <Option value="SUM">SUM (求和)</Option>
                  <Option value="AVG">AVG (平均)</Option>
                  <Option value="MIN">MIN (最小)</Option>
                  <Option value="MAX">MAX (最大)</Option>
                </Select>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>
                  表名.字段名
                </div>
                <Select
                  value={`${field.tableName}.${field.fieldName}`}
                  onChange={(value) => {
                    const [tableName, fieldName] = value.split('.');
                    updateField(index, { tableName, fieldName });
                  }}
                  style={{ width: '100%' }}
                  size="small"
                  showSearch
                >
                  {allFields.map((f) => (
                    <Option key={`${f.tableName}.${f.fieldName}`} value={`${f.tableName}.${f.fieldName}`}>
                      {f.tableName}.{f.fieldName} ({f.type})
                    </Option>
                  ))}
                </Select>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>
                  别名 (可选)
                </div>
                <Input
                  value={field.alias}
                  onChange={(e) => updateField(index, { alias: e.target.value })}
                  placeholder="输入字段别名"
                  size="small"
                />
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    color: '#ff4d4f',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  onClick={() => removeField(index)}
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
            background: 'rgba(82, 196, 26, 0.1)',
            borderRadius: 4,
            textAlign: 'center',
            cursor: allFields.length === 0 ? 'not-allowed' : 'pointer',
            color: allFields.length === 0 ? '#8c8c8c' : '#52c41a',
            fontSize: 13,
          }}
          onClick={addField}
        >
          + 添加聚合字段
        </div>
      </Form.Item>

      <Divider style={{ borderColor: '#303030' }} />

      <Form.Item label="GROUP BY 字段">
        {data.groupByFields.length === 0 ? (
          <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
            暂无分组字段，请添加
          </div>
        ) : (
          <Space wrap style={{ marginBottom: 12 }}>
            {data.groupByFields.map((fieldKey, index) => (
              <Tag
                key={index}
                closable
                onClose={() => removeGroupByField(fieldKey)}
                color="success"
              >
                {fieldKey}
              </Tag>
            ))}
          </Space>
        )}
        <Select
          placeholder="选择分组字段"
          style={{ width: '100%' }}
          onChange={(value: string) => {
            if (value && !data.groupByFields.includes(value)) {
              onUpdate(node.id, {
                groupByFields: [...data.groupByFields, value],
              });
            }
          }}
          value={null}
          size="small"
        >
          {allFields.map((f) => {
            const fieldKey = `${f.tableName}.${f.fieldName}`;
            return (
              <Option key={fieldKey} value={fieldKey} disabled={data.groupByFields.includes(fieldKey)}>
                {fieldKey} ({f.type})
              </Option>
            );
          })}
        </Select>
      </Form.Item>
    </Form>
  );
};


export { SelectNodeForm, SelectAggNodeForm };
