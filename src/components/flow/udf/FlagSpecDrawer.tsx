/**
 * FlagSpecDrawer
 * Configuration drawer for the "数据标记" (udf_flag_spec_column) UDF operator.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Drawer, Button, Select, Space, Input, Typography, Tag, Divider } from 'antd';
import { TagsOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { FlowNodeType } from '../../../services/flow/types';
import type { FlagSpecConfig, TableNodeData } from '../../../services/flow/types';
import { OutputColumnsSelector } from './OutputColumnsSelector';

const { Text } = Typography;

export interface FlagSpecDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: FlagSpecConfig, outputColumns: string[]) => void;
  initialConfig?: FlagSpecConfig;
  initialOutputColumns?: string[];
  joinedTables?: string[];
}

type ColFlagEntry = { col: string; cases: [string, string][]; elseValue?: string; errors?: Record<number, string> };

export const FlagSpecDrawer: React.FC<FlagSpecDrawerProps> = ({
  open,
  onClose,
  onConfirm,
  initialConfig,
  initialOutputColumns,
  joinedTables = [],
}) => {
  const [entries, setEntries] = useState<ColFlagEntry[]>([]);
  const [outputColumns, setOutputColumns] = useState<string[]>(initialOutputColumns ?? []);
  const nodes = useFlowStore((state) => state.nodes);

  const allColumns = useMemo(() => {
    const cols: string[] = [];
    for (const node of nodes) {
      if (node.type === FlowNodeType.TABLE) {
        const data = node.data as TableNodeData;
        if (!joinedTables.includes(data.tableName)) continue;
        for (const f of data.fields ?? []) {
          cols.push(joinedTables.length > 1 ? `${data.tableName}.${f.name}` : f.name);
        }
      }
    }
    return cols;
  }, [nodes, joinedTables]);

  useEffect(() => {
    if (open) {
      const initial = initialConfig?.flagsConfig ?? {};
      setEntries(
        Object.entries(initial).map(([col, cfg]) => ({
          col,
          cases: cfg.cases ?? [],
          elseValue: cfg.else,
        }))
      );
      setOutputColumns(initialOutputColumns ?? []);
    }
  }, [open, initialConfig, initialOutputColumns]);

  const addEntry = () =>
    setEntries((prev) => [...prev, { col: '', cases: [['', '']] as [string, string][] }]);

  const removeEntry = (idx: number) =>
    setEntries((prev) => prev.filter((_, i) => i !== idx));

  const updateEntry = (idx: number, patch: Partial<ColFlagEntry>) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const addCase = (idx: number) =>
    updateEntry(idx, { cases: [...entries[idx].cases, ['', '']] as [string, string][] });

  const removeCase = (entryIdx: number, caseIdx: number) =>
    updateEntry(entryIdx, {
      cases: entries[entryIdx].cases.filter((_, i) => i !== caseIdx),
    });

  const updateCaseField = (entryIdx: number, caseIdx: number, field: 0 | 1, value: string) => {
    const updated: [string, string][] = entries[entryIdx].cases.map((c, i) => {
      if (i !== caseIdx) return c;
      const next: [string, string] = [c[0], c[1]];
      next[field] = value;
      return next;
    });
    updateEntry(entryIdx, { cases: updated });
  };

  // Validate condition expression on blur
  const validateCondition = (expr: string): string | null => {
    if (!expr || !expr.trim()) return '条件值必须填写（如：金卡 或 >= 100）';
    // Check for basic SQL injection patterns
    if (expr.includes(';') || expr.includes('--') || expr.includes('/*')) {
      return '条件包含非法字符';
    }
    // Check for unmatched parentheses
    if ((expr.match(/\(/g) || []).length !== (expr.match(/\)/g) || []).length) {
      return '括号不匹配';
    }
    return null;
  };

  const handleConditionBlur = (entryIdx: number, caseIdx: number, value: string) => {
    const error = validateCondition(value);
    if (error) {
      const errors = entries[entryIdx].errors ?? {};
      errors[caseIdx] = error;
      updateEntry(entryIdx, { errors });
    } else {
      const errors = { ...entries[entryIdx].errors };
      delete errors[caseIdx];
      updateEntry(entryIdx, { errors });
    }
  };

  const handleConfirm = () => {
    const flagsConfig: FlagSpecConfig['flagsConfig'] = {};
    for (const e of entries) {
      if (!e.col) continue;
      flagsConfig[e.col] = {
        cases: e.cases,
        ...(e.elseValue ? { else: e.elseValue } : {}),
      };
    }
    if (Object.keys(flagsConfig).length === 0) return;
    onConfirm({ flagsConfig }, outputColumns);
  };

  return (
    <Drawer
      title={
        <Space>
          <TagsOutlined style={{ color: 'var(--vm-flow-purple)' }} />
          <span>数据标记配置</span>
        </Space>
      }
      placement="right"
      width={560}
      open={open}
      onClose={onClose}
      footer={
        <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            onClick={handleConfirm}
            disabled={entries.every((e) => !e.col)}
          >
            确认
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        {entries.map((entry, entryIdx) => (
          <div
            key={entryIdx}
            style={{ border: '2px solid var(--vm-primary)', borderRadius: 6, padding: 12 }}
          >
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text strong>标记规则 #{entryIdx + 1}</Text>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
                onClick={() => removeEntry(entryIdx)}
              />
            </Space>

            <div style={{ marginTop: 8 }}>
              <Text type="secondary">目标列</Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                placeholder="选择列"
                value={entry.col || undefined}
                onChange={(val) => updateEntry(entryIdx, { col: val })}
                options={allColumns.map((c) => ({ label: c, value: c }))}
              />
            </div>

            <Divider style={{ margin: '10px 0' }}>条件规则</Divider>
            {entry.cases.map((c, caseIdx) => {
              const conditionError = entry.errors?.[caseIdx];
              const markError = !c[1] ? '标记值必须填写' : null;
              const hasError = conditionError || markError;
              return (
                <div key={caseIdx}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: hasError ? 2 : 8, alignItems: 'center' }}>
                    <Tag style={{ minWidth: 40 }}>当</Tag>
                    <Input
                      placeholder="满足条件（如：金卡 或 >= 100）"
                      value={c[0]}
                      onChange={(e) => updateCaseField(entryIdx, caseIdx, 0, e.target.value)}
                      onBlur={(e) => handleConditionBlur(entryIdx, caseIdx, e.target.value)}
                      status={conditionError ? 'error' : ''}
                      style={{ flex: 1 }}
                    />
                    <Tag style={{ minWidth: 40 }}>标为</Tag>
                    <Input
                      placeholder="标记值（如：高级会员）"
                      value={c[1]}
                      onChange={(e) => updateCaseField(entryIdx, caseIdx, 1, e.target.value)}
                      status={markError ? 'error' : ''}
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      size="small"
                      onClick={() => removeCase(entryIdx, caseIdx)}
                    />
                  </div>
                  {hasError && (
                    <div style={{ color: 'var(--vm-color-error)', fontSize: 12, marginLeft: 48, marginBottom: 8 }}>
                      {conditionError || markError}
                    </div>
                  )}
                </div>
              );
            })}
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              style={{ width: '100%', marginBottom: 8 }}
              onClick={() => addCase(entryIdx)}
            >
              添加条件
            </Button>

            <div>
              <Text type="secondary">默认标记（其他情况）</Text>
              <Input
                placeholder="不满足以上条件时的默认标记值"
                value={entry.elseValue ?? ''}
                onChange={(e) => updateEntry(entryIdx, { elseValue: e.target.value })}
                style={{ marginTop: 4 }}
              />
            </div>
          </div>
        ))}

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          style={{ width: '100%' }}
          onClick={addEntry}
        >
          添加标记规则
        </Button>

        <OutputColumnsSelector
          columns={allColumns}
          value={outputColumns}
          onChange={setOutputColumns}
        />
      </Space>
    </Drawer>
  );
};

export default FlagSpecDrawer;
