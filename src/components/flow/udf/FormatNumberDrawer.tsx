/**
 * FormatNumberDrawer
 * Configuration drawer for the "数字精度控制" (udf_format_number) UDF operator.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Drawer, Button, Select, Space, InputNumber, Typography, Radio, Table, Tag } from 'antd';
import { NumberOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { FlowNodeType } from '../../../services/flow/types';
import type { FormatNumberConfig, TableNodeData } from '../../../services/flow/types';
import { OutputColumnsSelector } from './OutputColumnsSelector';

const { Text } = Typography;

export interface FormatNumberDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: FormatNumberConfig, outputColumns: string[]) => void;
  initialConfig?: FormatNumberConfig;
  initialOutputColumns?: string[];
  joinedTables?: string[];
}

const NUMERIC_TYPES = ['INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE', 'FLOAT', 'HUGEINT', 'SMALLINT', 'TINYINT'];

type ColEntry = { col: string; decimals: number };

export const FormatNumberDrawer: React.FC<FormatNumberDrawerProps> = ({
  open,
  onClose,
  onConfirm,
  initialConfig,
  initialOutputColumns,
  joinedTables = [],
}) => {
  const [entries, setEntries] = useState<ColEntry[]>([]);
  const [roundMode, setRoundMode] = useState<FormatNumberConfig['roundMode']>(
    initialConfig?.roundMode ?? 'half_up'
  );
  const [outputColumns, setOutputColumns] = useState<string[]>(initialOutputColumns ?? []);
  const nodes = useFlowStore((state) => state.nodes);

  const numericColumns = useMemo(() => {
    const cols: string[] = [];
    for (const node of nodes) {
      if (node.type === FlowNodeType.TABLE) {
        const data = node.data as TableNodeData;
        if (!joinedTables.includes(data.tableName)) continue;
        for (const f of data.fields ?? []) {
          const isNumeric = NUMERIC_TYPES.some((t) => f.type?.toUpperCase().includes(t));
          if (!isNumeric) continue;
          cols.push(joinedTables.length > 1 ? `${data.tableName}.${f.name}` : f.name);
        }
      }
    }
    return cols;
  }, [nodes, joinedTables]);

  // All columns (for the "结果显示" output selector)
  const allColumnsForOutput = useMemo(() => {
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
      const initial = initialConfig?.colsConfig ?? {};
      setEntries(Object.entries(initial).map(([col, decimals]) => ({ col, decimals })));
      setRoundMode(initialConfig?.roundMode ?? 'half_up');
      setOutputColumns(initialOutputColumns ?? []);
    }
  }, [open, initialConfig, initialOutputColumns]);

  const addEntry = () => setEntries((prev) => [...prev, { col: '', decimals: 2 }]);
  const removeEntry = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));
  const updateEntry = (idx: number, patch: Partial<ColEntry>) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const handleConfirm = () => {
    const colsConfig: Record<string, number> = {};
    for (const e of entries) {
      if (e.col) colsConfig[e.col] = e.decimals;
    }
    if (Object.keys(colsConfig).length === 0) return;
    onConfirm({ colsConfig, roundMode }, outputColumns);
  };

  const tableColumns = [
    {
      title: '列名',
      dataIndex: 'col',
      render: (_: unknown, record: ColEntry, idx: number) => (
        <Select
          style={{ width: '100%' }}
          placeholder="选择数值列"
          value={record.col || undefined}
          onChange={(val) => updateEntry(idx, { col: val })}
          options={numericColumns.map((c) => ({ label: c, value: c }))}
          showSearch
          filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          notFoundContent={<Text type="secondary" style={{ fontSize: 12 }}>未找到数值类型列</Text>}
        />
      ),
    },
    {
      title: '小数位数',
      dataIndex: 'decimals',
      width: 110,
      render: (_: unknown, record: ColEntry, idx: number) => (
        <InputNumber
          min={0}
          max={10}
          value={record.decimals}
          onChange={(val) => updateEntry(idx, { decimals: val ?? 0 })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '',
      width: 40,
      render: (_: unknown, __: ColEntry, idx: number) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeEntry(idx)}
        />
      ),
    },
  ];

  return (
    <Drawer
      title={
        <Space>
          <NumberOutlined style={{ color: 'var(--vm-flow-purple)' }} />
          <span>数字精度控制配置</span>
        </Space>
      }
      placement="right"
      width={520}
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
        <div>
          <Text strong>列精度规则</Text>
          <Table
            size="small"
            dataSource={entries}
            columns={tableColumns}
            rowKey={(_, idx) => String(idx)}
            pagination={false}
            style={{ marginTop: 8 }}
          />
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            style={{ marginTop: 8, width: '100%' }}
            onClick={addEntry}
          >
            添加列规则
          </Button>
        </div>

        <div>
          <Text strong>舍入模式</Text>
          <div style={{ marginTop: 8 }}>
            <Radio.Group value={roundMode} onChange={(e) => setRoundMode(e.target.value)}>
              <Space direction="vertical">
                <Radio value="half_up"><Tag>四舍五入</Tag> 标准四舍五入</Radio>
                <Radio value="truncate"><Tag>截断</Tag> 直接去掉多余小数位</Radio>
                <Radio value="ceil"><Tag>向上取整</Tag> 始终向上进位</Radio>
                <Radio value="floor"><Tag>向下取整</Tag> 始终向下截断</Radio>
              </Space>
            </Radio.Group>
          </div>
        </div>

        <OutputColumnsSelector
          columns={allColumnsForOutput}
          value={outputColumns}
          onChange={setOutputColumns}
        />
      </Space>
    </Drawer>
  );
};

export default FormatNumberDrawer;
