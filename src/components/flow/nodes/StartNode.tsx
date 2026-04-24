/**
 * Start Node Component
 * Entry point for the analysis flow - allows selecting data source
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Select, Tag, Spin } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { getAvailableTables, getTableSchema } from '../../../services/flow/flowService';
import { FLOW_COLORS } from '../../../services/flow/constants';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import type { StartNodeData } from '../../../services/flow/types';
import { FlowNodeType } from '../../../services/flow/types';

interface StartNodeProps {
  id: string;
  data: StartNodeData;
  selected?: boolean;
}

export const StartNode: React.FC<StartNodeProps> = ({ id, data, selected }) => {
  const updateNode = useFlowStore((state) => state.updateNode);
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const { executeQuery, isDBReady, refreshKey } = useDuckDBContext();

  // State for table list
  const [tables, setTables] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Load available tables when DB is ready or when refreshKey changes (modal reopened)
  useEffect(() => {
    const loadTables = async () => {
      console.log('[StartNode] loadTables called, isDBReady:', isDBReady, 'refreshKey:', refreshKey);
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
  }, [isDBReady, executeQuery, refreshKey]);

  // Debug: log tables state changes
  useEffect(() => {
    console.log('[StartNode] tables state changed:', tables);
  }, [tables]);

  // Handle table selection (multi-select)
  const handleTableSelect = useCallback(
    async (selectedTableNames: string[]) => {
      // Update start node with all selected tables
      updateNode(id, { selectedTables: selectedTableNames });

      // Get start node position
      const startNode = nodes.find((n) => n.id === id);
      const startX = startNode?.position?.x || 400;
      const startY = startNode?.position?.y || 300;

      // Find existing table nodes to determine which tables are new
      const existingTableNodes = nodes.filter((n) => n.type === FlowNodeType.TABLE);
      const existingTableNames = existingTableNodes.map((n) => n.data?.tableName);

      // Only process newly added tables
      const newTableNames = selectedTableNames.filter(
        (name) => !existingTableNames.includes(name)
      );

      if (newTableNames.length === 0) return;

      // Process each new table
      for (const tableName of newTableNames) {
        // Load table schema
        let tableFields: Array<{ name: string; type: string; nullable: boolean }> = [];
        try {
          const schema = await getTableSchema(tableName, executeQuery);
          tableFields = schema.fields;
          console.log('[StartNode] Loaded table fields:', tableName, tableFields);
        } catch (error) {
          console.error('[StartNode] Failed to load table schema:', error);
        }

        // Get current table count for positioning
        const currentTableCount = nodes.filter((n) => n.type === FlowNodeType.TABLE).length;
        const tableNodeId = `table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tableNode = {
          id: tableNodeId,
          type: FlowNodeType.TABLE,
          position: { x: startX + 200, y: startY + currentTableCount * 120 },
          data: {
            tableName,
            fields: tableFields,
            expanded: false,
            label: tableName,
          },
        };
        addNode(tableNode as unknown as Parameters<typeof addNode>[0]);

        // Connect start -> table
        addEdge({
          id: `e_${id}_${tableNodeId}`,
          source: id,
          target: tableNodeId,
          type: 'default',
          animated: false,
          style: { stroke: 'var(--vm-flow-edge)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'var(--vm-flow-edge)' },
        } as unknown as Parameters<typeof addEdge>[0]);
      }
    },
    [id, updateNode, addNode, addEdge, nodes, executeQuery]
  );

  return (
    <div
      style={{
        background: FLOW_COLORS.node.table.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : FLOW_COLORS.node.table.border}`,
        borderRadius: '8px',
        padding: '12px 16px',
        minWidth: '200px',
        minHeight: '120px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : 'var(--vm-flow-shadow)',
        position: 'relative',
      }}
      className="start-node"
    >
      {/* Node Resizer - only show when selected */}
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        maxWidth={400}
        maxHeight={400}
        lineStyle={{ borderColor: 'var(--vm-flow-success)', borderWidth: 2 }}
        handleStyle={{ backgroundColor: 'var(--vm-flow-success)', borderColor: 'var(--vm-border-mid)', width: 10, height: 10 }}
      />
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
          color: 'var(--vm-text-primary)',
          fontWeight: 500,
        }}
      >
        <DatabaseOutlined style={{ marginRight: 8, color: 'var(--vm-flow-success)' }} />
        <span>选择数据源</span>
        <Tag color="success" style={{ marginLeft: 'auto', fontSize: 10 }}>
          开始
        </Tag>
      </div>

      {/* Table selector */}
      <Spin spinning={loading} size="small" className="nodrag">
        <Select
          mode="multiple"
          placeholder="请选择数据表"
          value={data.selectedTables || []}
          onChange={handleTableSelect}
          style={{ width: '100%' }}
          options={tables}
          dropdownStyle={{ background: 'var(--vm-bg-dark)', border: '1px solid #434343' }}
          popupClassName="start-node-select-dropdown nodrag"
          notFoundContent={loading ? '加载中...' : '暂无数据表'}
          getPopupContainer={() => document.body}
          className="nodrag"
          maxTagCount={1}
          maxTagPlaceholder={(omitted) => `+${omitted.length}`}
        />
      </Spin>

      {/* Selected table count hint */}
      {data.selectedTables && data.selectedTables.length > 0 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: '#8c8c8c',
          }}
        >
          <span>已选择: {data.selectedTables.length}</span>
        </div>
      )}
    </div>
  );
};

export default StartNode;
