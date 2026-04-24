/**
 * FormatDateDrawer
 * Configuration drawer for the "日期时间格式化" (udf_format_date_time) UDF operator.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Drawer, Button, Select, Space, Typography, Table, Tag } from 'antd';
import { CalendarOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { TOKEN } from '../../../theme';
import { useFlowStore } from '../../../stores/flowStore';
import { FlowNodeType } from '../../../services/flow/types';
import type { FormatDateConfig, TableNodeData } from '../../../services/flow/types';
import { OutputColumnsSelector } from './OutputColumnsSelector';

const { Text } = Typography;

export interface FormatDateDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: FormatDateConfig, outputColumns: string[]) => void;
  initialConfig?: FormatDateConfig;
  initialOutputColumns?: string[];
  joinedTables?: string[];
}

const DATE_FORMAT_PRESETS = [
  { label: 'YYYY-MM-DD（2024-01-01）', value: '%Y-%m-%d' },
  { label: 'YYYY/MM/DD（2024/01/01）', value: '%Y/%m/%d' },
  { label: 'DD/MM/YYYY（01/01/2024）', value: '%d/%m/%Y' },
  { label: 'YYYYMMDD（20240101）', value: '%Y%m%d' },
  { label: 'YYYY-MM-DD HH:mm:ss', value: '%Y-%m-%d %H:%M:%S' },
  { label: 'YYYY年MM月DD日', value: '%Y年%m月%d日' },
];

const DATE_TYPES = ['DATE', 'TIMESTAMP', 'DATETIME', 'TIMESTAMPTZ'];

type ColEntry = { col: string; dstFmt: string };

export const FormatDateDrawer: React.FC<FormatDateDrawerProps> = ({
  open,
  onClose,
  onConfirm,
  initialConfig,
  initialOutputColumns,
  joinedTables = [],
}) => {
  const [entries, setEntries] = useState<ColEntry[]>([]);
  const [outputColumns, setOutputColumns] = useState<string[]>(initialOutputColumns ?? []);
  const nodes = useFlowStore((state) => state.nodes);

  const { dateColumns, allColumns } = useMemo(() => {
    const date: string[] = [];
    const all: string[] = [];
    for (const node of nodes) {
      if (node.type === FlowNodeType.TABLE) {
        const data = node.data as TableNodeData;
        if (!joinedTables.includes(data.tableName)) continue;
        for (const f of data.fields ?? []) {
          const colName = joinedTables.length > 1 ? `${data.tableName}.${f.name}` : f.name;
          all.push(colName);
          if (DATE_TYPES.some((dt) => f.type?.toUpperCase().includes(dt))) {
            date.push(colName);
          }
        }
      }
    }
    return { dateColumns: date, allColumns: all };
  }, [nodes, joinedTables]);

  const columnOptions = dateColumns.length > 0 ? dateColumns : allColumns;

  useEffect(() => {
    if (open) {
      const initial = initialConfig?.colConfigJson ?? {};
      setEntries(
        Object.entries(initial).map(([col, cfg]) => ({ col, dstFmt: cfg.dstFmt ?? '%Y-%m-%d' }))
      );
      setOutputColumns(initialOutputColumns ?? []);
    }
  }, [open, initialConfig, initialOutputColumns]);

  const addEntry = () => setEntries((prev) => [...prev, { col: '', dstFmt: '%Y-%m-%d' }]);
  const removeEntry = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));
  const updateEntry = (idx: number, patch: Partial<ColEntry>) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const handleConfirm = () => {
    const colConfigJson: FormatDateConfig['colConfigJson'] = {};
    for (const e of entries) {
      if (!e.col || !e.dstFmt) continue;
      colConfigJson[e.col] = { dstFmt: e.dstFmt };
    }
    if (Object.keys(colConfigJson).length === 0) return;
    onConfirm({ colConfigJson }, outputColumns);
  };

  const tableColumns = [
    {
      title: '日期列',
      dataIndex: 'col',
      render: (_: unknown, record: ColEntry, idx: number) => (
        <Select
          style={{ width: '100%' }}
          placeholder="选择日期列"
          value={record.col || undefined}
          onChange={(val) => updateEntry(idx, { col: val })}
          options={columnOptions.map((c) => ({ label: c, value: c }))}
        />
      ),
    },
    {
      title: '输出格式',
      dataIndex: 'dstFmt',
      render: (_: unknown, record: ColEntry, idx: number) => (
        <Select
          style={{ width: '100%' }}
          placeholder="选择或输入格式"
          value={record.dstFmt || undefined}
          onChange={(val) => updateEntry(idx, { dstFmt: val })}
          options={DATE_FORMAT_PRESETS}
          showSearch
          allowClear={false}
          dropdownRender={(menu) => (
            <>
              {menu}
              <div style={{ padding: '8px 12px', borderTop: '1px solid #303030' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  自定义：输入 strftime 格式（%Y %m %d %H %M %S）
                </Text>
              </div>
            </>
          )}
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
          <CalendarOutlined style={{ color: 'var(--vm-flow-purple)' }} />
          <span>日期时间格式化配置</span>
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
        {dateColumns.length === 0 && allColumns.length > 0 && (
          <Tag color="warning" style={{ padding: '4px 8px', width: '100%', textAlign: 'center' }}>
            未检测到日期类型列，以下显示所有列供选择
          </Tag>
        )}

        <Table
          size="small"
          dataSource={entries}
          columns={tableColumns}
          rowKey={(_, idx) => String(idx)}
          pagination={false}
        />

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          style={{ width: '100%' }}
          onClick={addEntry}
        >
          添加格式化规则
        </Button>

        <OutputColumnsSelector
          columns={allColumns}
          value={outputColumns}
          onChange={setOutputColumns}
        />

        <div style={{ background: TOKEN.bgSection, borderRadius: 6, padding: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            💡 常用格式参考：
          </Text>
          <div style={{ marginTop: 4 }}>
            {DATE_FORMAT_PRESETS.slice(0, 4).map((p) => (
              <Tag key={p.value} style={{ marginBottom: 4, fontSize: 11 }}>
                {p.value}
              </Tag>
            ))}
          </div>
        </div>
      </Space>
    </Drawer>
  );
};

export default FormatDateDrawer;
