/**
 * Start Node Component
 * Entry point for the analysis flow - allows selecting data source
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Select, Tag, Space, Spin } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { getAvailableTables } from '../../../services/flow/flowService';
import { FLOW_COLORS } from '../../../services/flow/constants';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import type { StartNodeData } from '../../../services/flow/types';

interface StartNodeProps {
  id: string;
  data: StartNodeData;
  selected?: boolean;
}

export const StartNode: React.FC<StartNodeProps> = ({ id, data, selected }) => {
  const updateNode = useFlowStore((state) => state.updateNode);
  const addNode = useFlowStore((state) => state.addNode);
  const { executeQuery, isDBReady } = useDuckDBContext();

  // State for table list
  const [tables, setTables] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Load available tables when DB is ready
  useEffect(() => {
    const loadTables = async () => {
      console.log('[StartNode] loadTables called, isDBReady:', isDBReady);
      if (!isDBReady) {
        console.log('[StartNode] DB not ready, skipping table load');
        return;
      }

      setLoading(true);
      try {
        console.log('[StartNode] Loading tables...');
        const tableNames = await getAvailableTables(executeQuery);
        console.log('[StartNode] Loaded tables:', tableNames);

        const tableOptions = tableNames.map((name) => ({
          value: name,
          label: name,
        }));
        console.log('[StartNode] Setting table options:', tableOptions);
        setTables(tableOptions);
      } catch (error) {
        console.error('[StartNode] Failed to load tables:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTables();
  }, [isDBReady, executeQuery]);

  // Debug: log tables state changes
  useEffect(() => {
    console.log('[StartNode] tables state changed:', tables);
  }, [tables]);

  // Handle table selection
  const handleTableSelect = useCallback(
    async (tableName: string) => {
      // Update start node
      updateNode(id, { selectedTable: tableName });

      // Add table node
      const tableNode = {
        id: `table_${Date.now()}`,
        type: 'table' as const,
        position: { x: 350, y: 250 },
        data: {
          tableName,
          fields: [],
          expanded: false,
          alias: `t${Date.now().toString().slice(-4)}`,
          label: tableName,
        },
      };
      addNode(tableNode as unknown as Parameters<typeof addNode>[0]);
    },
    [id, updateNode, addNode]
  );

  return (
    <div
      style={{
        background: FLOW_COLORS.node.table.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : FLOW_COLORS.node.table.border}`,
        borderRadius: '8px',
        padding: '12px 16px',
        minWidth: '200px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
      }}
      className="start-node"
    >
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{
          width: 8,
          height: 8,
          background: FLOW_COLORS.edge.selected,
          border: '2px solid #fff',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 12,
          color: '#fff',
          fontWeight: 500,
        }}
      >
        <DatabaseOutlined style={{ marginRight: 8, color: '#52c41a' }} />
        <span>选择数据源</span>
        <Tag color="success" style={{ marginLeft: 'auto', fontSize: 10 }}>
          开始
        </Tag>
      </div>

      {/* Table selector */}
      <Spin spinning={loading} size="small">
        <Select
          placeholder="请选择数据表"
          value={data.selectedTable}
          onChange={handleTableSelect}
          style={{ width: '100%' }}
          options={tables}
          dropdownStyle={{ background: '#1f1f1f', border: '1px solid #434343' }}
          notFoundContent={loading ? '加载中...' : '暂无数据表'}
          getPopupContainer={(triggerNode) => triggerNode.parentNode as HTMLElement}
        />
      </Spin>

      {/* Selected table hint */}
      {data.selectedTable && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: '#8c8c8c',
          }}
        >
          <Space>
            <span>已选择:</span>
            <Tag color="processing">{data.selectedTable}</Tag>
          </Space>
        </div>
      )}
    </div>
  );
};

export default StartNode;
