/**
 * Select Node Forms
 * Form components for SelectNode and SelectAggNode
 */

import React, { useCallback } from 'react';
import { Input, Select, Divider, Space, Tag, Radio, Tooltip, Empty } from 'antd';
import {
  CheckCircleOutlined,
  TableOutlined,
  PlusOutlined,
  DeleteOutlined,
  AppstoreOutlined,
  FunctionOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type {
  FlowNode,
  SelectNodeData,
  SelectAggNodeData,
} from '../../../services/flow/types';

const { Option } = Select;

// ── Design tokens aligned with system theme ──────────────────────────────────
const T = {
  accent: '#10B981',          // Emerald — select node brand color
  accentDim: 'var(--vm-flow-success-light)',
  accentBorder: 'var(--vm-flow-success-light)',
  surface: 'var(--vm-surface-lighter)',
  surfaceHover: 'var(--vm-surface-light)',
  border: 'var(--vm-surface-inset)',
  textPrimary: '#e5e7eb',
  textMuted: '#6b7280',
  danger: '#ef4444',
  dangerDim: 'var(--vm-flow-error-light)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────

// Select Node Form
const SelectNodeForm: React.FC<{
  node: FlowNode;
  onUpdate: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as SelectNodeData;
  const nodes = useFlowStore((state) => state.nodes);

  // Collect fields from all TABLE nodes
  const tableNodes = nodes.filter((n) => n.type === 'table');
  const allFields: Array<{ tableName: string; fieldName: string; type: string }> = [];
  tableNodes.forEach((tableNode) => {
    const tableData = tableNode.data as { tableName: string; fields?: { name: string; type: string }[] };
    if (tableData.fields && Array.isArray(tableData.fields)) {
      tableData.fields.forEach((field) => {
        allFields.push({ tableName: tableData.tableName, fieldName: field.name, type: field.type });
      });
    }
  });

  const addField = useCallback(() => {
    if (allFields.length === 0) return;
    onUpdate(node.id, {
      fields: [...data.fields, { tableName: allFields[0].tableName, fieldName: allFields[0].fieldName, alias: '' }],
    });
  }, [allFields, data.fields, node.id, onUpdate]);

  const removeField = useCallback((index: number) => {
    onUpdate(node.id, { fields: data.fields.filter((_, i) => i !== index) });
  }, [data.fields, node.id, onUpdate]);

  const updateField = useCallback((index: number, updates: Partial<SelectNodeData['fields'][0]>) => {
    onUpdate(node.id, { fields: data.fields.map((f, i) => (i === index ? { ...f, ...updates } : f)) });
  }, [data.fields, node.id, onUpdate]);

  return (
    <div>
      {/* Mode Selector */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          查询模式
        </div>
        <Radio.Group
          value={data.selectAll ? 'all' : 'custom'}
          onChange={(e) => onUpdate(node.id, { selectAll: e.target.value === 'all', fields: e.target.value === 'all' ? [] : data.fields })}
          style={{ width: '100%' }}
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="custom" style={{ width: '50%', textAlign: 'center', fontSize: 12 }}>
            <AppstoreOutlined style={{ marginRight: 4 }} />
            自定义字段
          </Radio.Button>
          <Radio.Button value="all" style={{ width: '50%', textAlign: 'center', fontSize: 12 }}>
            <TableOutlined style={{ marginRight: 4 }} />
            全部字段 (*)
          </Radio.Button>
        </Radio.Group>
      </div>

      {/* All-fields indicator */}
      {data.selectAll && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: T.accentDim,
          border: `1px solid ${T.accentBorder}`,
          borderRadius: 8,
          marginTop: 8,
        }}>
          <CheckCircleOutlined style={{ color: T.accent, fontSize: 14 }} />
          <span style={{ color: T.accent, fontSize: 12 }}>将输出所有可用字段</span>
        </div>
      )}

      {/* Custom field list */}
      {!data.selectAll && (
        <>
          <Divider style={{ borderColor: T.border, margin: '16px 0 12px' }} />

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              已选字段 {data.fields.length > 0 && <span style={{ color: T.accent }}>({data.fields.length})</span>}
            </span>
            <Tooltip title={allFields.length === 0 ? '暂无可选字段，请先加载数据表' : '添加字段'}>
              <div
                onClick={addField}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 10px',
                  background: allFields.length === 0 ? T.surface : T.accentDim,
                  border: `1px solid ${allFields.length === 0 ? T.border : T.accentBorder}`,
                  borderRadius: 6,
                  cursor: allFields.length === 0 ? 'not-allowed' : 'pointer',
                  color: allFields.length === 0 ? T.textMuted : T.accent,
                  fontSize: 12,
                  transition: 'all 200ms ease',
                  userSelect: 'none',
                }}
              >
                <PlusOutlined style={{ fontSize: 10 }} />
                添加字段
              </div>
            </Tooltip>
          </div>

          {/* Empty state */}
          {data.fields.length === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: T.textMuted, fontSize: 12 }}>点击「添加字段」开始选择</span>}
              style={{ margin: '20px 0' }}
            />
          )}

          {/* Field cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.fields.map((field, index) => {
              return (
                <div
                  key={index}
                  style={{
                    padding: '10px 12px',
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    transition: 'border-color 200ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.accentBorder)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border)}
                >
                  {/* Field selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <TableOutlined style={{ color: T.textMuted, fontSize: 12, flexShrink: 0 }} />
                    <Select
                      value={`${field.tableName}.${field.fieldName}`}
                      onChange={(value) => {
                        const dotIdx = value.indexOf('.');
                        updateField(index, { tableName: value.slice(0, dotIdx), fieldName: value.slice(dotIdx + 1) });
                      }}
                      style={{ flex: 1 }}
                      size="small"
                      showSearch
                      optionLabelProp="label"
                      placeholder="选择字段"
                    >
                      {allFields.map((f) => (
                        <Option
                          key={`${f.tableName}.${f.fieldName}`}
                          value={`${f.tableName}.${f.fieldName}`}
                          label={`${f.tableName}.${f.fieldName}`}
                        >
                          <span style={{ fontSize: 12 }}>{f.tableName}.<b>{f.fieldName}</b></span>
                        </Option>
                      ))}
                    </Select>
                  </div>

                  {/* Footer row: alias + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>别名</span>
                    <Input
                      value={field.alias}
                      onChange={(e) => updateField(index, { alias: e.target.value })}
                      style={{ flex: 1 }}
                      size="small"
                      placeholder="可选别名"
                      allowClear
                    />
                    <Tooltip title="移除字段">
                      <div
                        onClick={() => removeField(index)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          cursor: 'pointer',
                          color: T.textMuted,
                          background: T.surface,
                          border: `1px solid ${T.border}`,
                          flexShrink: 0,
                          transition: 'all 180ms ease',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLDivElement).style.background = T.dangerDim;
                          (e.currentTarget as HTMLDivElement).style.color = T.danger;
                          (e.currentTarget as HTMLDivElement).style.borderColor = T.danger;
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLDivElement).style.background = T.surface;
                          (e.currentTarget as HTMLDivElement).style.color = T.textMuted;
                          (e.currentTarget as HTMLDivElement).style.borderColor = T.border;
                        }}
                      >
                        <DeleteOutlined style={{ fontSize: 11 }} />
                      </div>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// Select Aggregation Node Form
const SelectAggNodeForm: React.FC<{
  node: FlowNode;
  onUpdate: (id: string, data: Partial<Record<string, unknown>>) => void;
}> = ({ node, onUpdate }) => {
  const data = node.data as SelectAggNodeData;
  const nodes = useFlowStore((state) => state.nodes);

  const tableNodes = nodes.filter((n) => n.type === 'table');
  const allFields: Array<{ tableName: string; fieldName: string; type: string }> = [];
  tableNodes.forEach((tableNode) => {
    const tableData = tableNode.data as { tableName: string; fields?: { name: string; type: string }[] };
    if (tableData.fields) {
      tableData.fields.forEach((field) => {
        allFields.push({ tableName: tableData.tableName, fieldName: field.name, type: field.type });
      });
    }
  });

  const addField = useCallback(() => {
    if (allFields.length === 0) return;
    onUpdate(node.id, {
      fields: [...data.fields, { tableName: allFields[0].tableName, fieldName: allFields[0].fieldName, alias: '', aggregate: 'COUNT' as const }],
    });
  }, [allFields, data.fields, node.id, onUpdate]);

  const removeField = useCallback((index: number) => {
    onUpdate(node.id, { fields: data.fields.filter((_, i) => i !== index) });
  }, [data.fields, node.id, onUpdate]);

  const updateField = useCallback((index: number, updates: Partial<SelectAggNodeData['fields'][0]>) => {
    onUpdate(node.id, { fields: data.fields.map((f, i) => (i === index ? { ...f, ...updates } : f)) });
  }, [data.fields, node.id, onUpdate]);

  const removeGroupByField = useCallback((fieldKey: string) => {
    onUpdate(node.id, { groupByFields: data.groupByFields.filter((f) => f !== fieldKey) });
  }, [data.groupByFields, node.id, onUpdate]);

  return (
    <div>
      {/* Agg Fields Section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          聚合字段 {data.fields.length > 0 && <span style={{ color: T.accent }}>({data.fields.length})</span>}
        </span>
        <Tooltip title={allFields.length === 0 ? '暂无可选字段' : '添加聚合字段'}>
          <div
            onClick={addField}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 10px',
              background: allFields.length === 0 ? T.surface : T.accentDim,
              border: `1px solid ${allFields.length === 0 ? T.border : T.accentBorder}`,
              borderRadius: 6,
              cursor: allFields.length === 0 ? 'not-allowed' : 'pointer',
              color: allFields.length === 0 ? T.textMuted : T.accent,
              fontSize: 12, transition: 'all 200ms ease', userSelect: 'none',
            }}
          >
            <PlusOutlined style={{ fontSize: 10 }} />
            添加聚合
          </div>
        </Tooltip>
      </div>

      {data.fields.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span style={{ color: T.textMuted, fontSize: 12 }}>点击「添加聚合」配置聚合函数</span>}
          style={{ margin: '16px 0' }}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
        {data.fields.map((field, index) => {
          return (
            <div
              key={index}
              style={{
                padding: '10px 12px', background: T.surface,
                border: `1px solid ${T.border}`, borderRadius: 8, transition: 'border-color 200ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.accentBorder)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border)}
            >
              {/* Agg function + field in one row */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <Select
                  value={field.aggregate}
                  onChange={(value) => updateField(index, { aggregate: value as 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' })}
                  style={{ width: 110 }}
                  size="small"
                >
                  {[
                    { v: 'COUNT', label: 'COUNT 计数' },
                    { v: 'SUM',   label: 'SUM 求和' },
                    { v: 'AVG',   label: 'AVG 平均' },
                    { v: 'MIN',   label: 'MIN 最小' },
                    { v: 'MAX',   label: 'MAX 最大' },
                  ].map(({ v, label }) => (
                    <Option key={v} value={v}>
                      <Tag color="processing" style={{ margin: 0, fontSize: 10 }}>{v}</Tag>
                      <span style={{ fontSize: 11, marginLeft: 4, color: T.textMuted }}>{label.split(' ')[1]}</span>
                    </Option>
                  ))}
                </Select>
                <Select
                  value={`${field.tableName}.${field.fieldName}`}
                  onChange={(value) => {
                    const dotIdx = value.indexOf('.');
                    updateField(index, { tableName: value.slice(0, dotIdx), fieldName: value.slice(dotIdx + 1) });
                  }}
                  style={{ flex: 1 }}
                  size="small"
                  showSearch
                  optionLabelProp="label"
                >
                  {allFields.map((f) => (
                    <Option
                      key={`${f.tableName}.${f.fieldName}`}
                      value={`${f.tableName}.${f.fieldName}`}
                      label={`${f.tableName}.${f.fieldName}`}
                    >
                      <span style={{ fontSize: 12 }}>{f.tableName}.<b>{f.fieldName}</b></span>
                    </Option>
                  ))}
                </Select>
              </div>
              {/* Alias + delete */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>别名</span>
                <Input
                  value={field.alias}
                  onChange={(e) => updateField(index, { alias: e.target.value })}
                  style={{ flex: 1 }}
                  size="small"
                  placeholder="可选别名"
                  allowClear
                />
                <Tooltip title="移除">
                  <div
                    onClick={() => removeField(index)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
                      color: T.textMuted, background: T.surface, border: `1px solid ${T.border}`,
                      flexShrink: 0, transition: 'all 180ms ease',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = T.dangerDim;
                      (e.currentTarget as HTMLDivElement).style.color = T.danger;
                      (e.currentTarget as HTMLDivElement).style.borderColor = T.danger;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = T.surface;
                      (e.currentTarget as HTMLDivElement).style.color = T.textMuted;
                      (e.currentTarget as HTMLDivElement).style.borderColor = T.border;
                    }}
                  >
                    <DeleteOutlined style={{ fontSize: 11 }} />
                  </div>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>

      <Divider style={{ borderColor: T.border, margin: '16px 0 12px' }} />

      {/* GROUP BY Section */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <FunctionOutlined style={{ marginRight: 5, color: 'var(--vm-flow-purple)' }} />
          分组字段 (GROUP BY)
        </div>

        {data.groupByFields.length > 0 && (
          <Space wrap style={{ marginBottom: 10 }}>
            {data.groupByFields.map((fieldKey, index) => (
              <Tag
                key={index}
                closable
                onClose={() => removeGroupByField(fieldKey)}
                style={{
                  background: 'var(--vm-flow-purple-bg)',
                  borderColor: 'var(--vm-flow-purple-border)',
                  color: 'var(--vm-flow-purple)',
                  cursor: 'default',
                }}
              >
                {fieldKey}
              </Tag>
            ))}
          </Space>
        )}

        <Select
          placeholder="点击添加分组字段…"
          style={{ width: '100%' }}
          onChange={(value: string) => {
            if (value && !data.groupByFields.includes(value)) {
              onUpdate(node.id, { groupByFields: [...data.groupByFields, value] });
            }
          }}
          value={null}
          size="small"
          showSearch
        >
          {allFields.map((f) => {
            const fieldKey = `${f.tableName}.${f.fieldName}`;
            return (
              <Option key={fieldKey} value={fieldKey} disabled={data.groupByFields.includes(fieldKey)}>
                <span style={{ fontSize: 12 }}>{f.tableName}.<b>{f.fieldName}</b></span>
              </Option>
            );
          })}
        </Select>
      </div>
    </div>
  );
};


export { SelectNodeForm, SelectAggNodeForm };
