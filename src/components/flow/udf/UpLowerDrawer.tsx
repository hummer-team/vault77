/**
 * UpLowerDrawer
 * Configuration drawer for the "大小写转换" (udf_up_lower_str) UDF operator.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Drawer, Button, Select, Space, Tag, Typography, Radio } from 'antd';
import { FontColorsOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { FlowNodeType } from '../../../services/flow/types';
import type { UpLowerConfig, TableNodeData } from '../../../services/flow/types';
import { OutputColumnsSelector } from './OutputColumnsSelector';

const { Text } = Typography;

export interface UpLowerDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: UpLowerConfig, outputColumns: string[]) => void;
  initialConfig?: UpLowerConfig;
  initialOutputColumns?: string[];
  joinedTables?: string[];
}

export const UpLowerDrawer: React.FC<UpLowerDrawerProps> = ({
  open,
  onClose,
  onConfirm,
  initialConfig,
  initialOutputColumns,
  joinedTables = [],
}) => {
  const [selectedCols, setSelectedCols] = useState<string[]>(initialConfig?.cols ?? []);
  const [action, setAction] = useState<'upper' | 'lower'>(initialConfig?.action ?? 'upper');
  const [outputColumns, setOutputColumns] = useState<string[]>(initialOutputColumns ?? []);
  const nodes = useFlowStore((state) => state.nodes);

  // String-only columns for the conversion target
  const allColumns = useMemo(() => {
    const cols: string[] = [];
    for (const node of nodes) {
      if (node.type === FlowNodeType.TABLE) {
        const data = node.data as TableNodeData;
        if (!joinedTables.includes(data.tableName)) continue;
        for (const f of data.fields ?? []) {
          const isString = !f.type || ['VARCHAR', 'TEXT', 'CHAR', 'STRING'].some((t) =>
            f.type.toUpperCase().includes(t)
          );
          if (!isString) continue;
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
      setSelectedCols(initialConfig?.cols ?? []);
      setAction(initialConfig?.action ?? 'upper');
      setOutputColumns(initialOutputColumns ?? []);
    }
  }, [open, initialConfig, initialOutputColumns]);

  const handleConfirm = () => {
    if (selectedCols.length === 0) return;
    onConfirm({ cols: selectedCols, action }, outputColumns);
  };

  return (
    <Drawer
      title={
        <Space>
          <FontColorsOutlined style={{ color: '#722ed1' }} />
          <span>大小写转换配置</span>
        </Space>
      }
      placement="right"
      width={480}
      open={open}
      onClose={onClose}
      footer={
        <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            onClick={handleConfirm}
            disabled={selectedCols.length === 0}
          >
            确认
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <Text strong>选择列</Text>
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            选择需要进行大小写转换的文本列
          </Text>
          <Select
            mode="multiple"
            style={{ width: '100%', marginTop: 8 }}
            placeholder="请选择列"
            value={selectedCols}
            onChange={setSelectedCols}
            options={allColumns.map((col) => ({ label: col, value: col }))}
            notFoundContent={
              <Text type="secondary" style={{ fontSize: 12 }}>
                未找到文本类型列
              </Text>
            }
          />
        </div>

        <div>
          <Text strong>转换方向</Text>
          <div style={{ marginTop: 8 }}>
            <Radio.Group value={action} onChange={(e) => setAction(e.target.value)}>
              <Space direction="vertical">
                <Radio value="upper">
                  <Tag color="blue">abc → ABC</Tag> 全部转为大写
                </Radio>
                <Radio value="lower">
                  <Tag color="green">ABC → abc</Tag> 全部转为小写
                </Radio>
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

export default UpLowerDrawer;
