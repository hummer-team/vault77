/**
 * DataSource Node Component
 * Second node in the analysis flow — allows selecting data sources (tables).
 *
 * Node order: OperatorNode → DataSourceNode → TableNode → SelectNode →
 *             ConditionDefinitionNode → ConditionGroupNode → EndNode
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Select, Tag, Spin } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { getAvailableTables, getTableSchema } from '../../../services/flow/flowService';
import { FLOW_COLORS } from '../../../services/flow/constants';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import type { DataSourceNodeData } from '../../../services/flow/types';
import { FlowNodeType } from '../../../services/flow/types';

interface DataSourceNodeProps {
  id: string;
  data: DataSourceNodeData;
  selected?: boolean;
  /** When provided, only these table names will appear in the dropdown.
   *  Pass `undefined` for "no filter" (show all), pass `[]` for "show none". */
  allowedTableNames?: string[];
}

export const DataSourceNode: React.FC<DataSourceNodeProps> = ({ id, data, selected, allowedTableNames }) => {
  const updateNode = useFlowStore((state) => state.updateNode);
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const { executeQuery, isDBReady, refreshKey } = useDuckDBContext();

  const [tables, setTables] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Load available tables when DB is ready or when refreshKey changes (modal reopened)
  useEffect(() => {
    const loadTables = async () => {
      console.log('[DataSourceNode] loadTables called, isDBReady:', isDBReady, 'refreshKey:', refreshKey);
      if (!isDBReady) {
        console.log('[DataSourceNode] DB not ready, skipping table load');
        return;
      }

      setLoading(true);
      try {
        console.log('[DataSourceNode] Loading tables...');
        const tableNames = await getAvailableTables(executeQuery);
        console.log('[DataSourceNode] Loaded tables:', tableNames);

        // Filter to only show tables from selected attachments.
        // undefined = no filter; [] = no attachments selected (show none).
        const visible =
          allowedTableNames === undefined
            ? tableNames
            : tableNames.filter((n) => allowedTableNames.includes(n));

        const tableOptions = visible.map((name) => ({
          value: name,
          label: name,
        }));
        console.log('[DataSourceNode] Setting table options:', tableOptions);
        setTables(tableOptions);
      } catch (error) {
        console.error('[DataSourceNode] Failed to load tables:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTables();
  }, [isDBReady, executeQuery, refreshKey, allowedTableNames]);

  // Debug: log tables state changes
  useEffect(() => {
    console.log('[DataSourceNode] tables state changed:', tables);
  }, [tables]);

  // Handle table selection (multi-select): create TableNodes for newly selected tables
  const handleTableSelect = useCallback(
    async (selectedTableNames: string[]) => {
      updateNode(id, { selectedTables: selectedTableNames });

      const dataSourceNode = nodes.find((n) => n.id === id);
      const startX = dataSourceNode?.position?.x || 400;
      const startY = dataSourceNode?.position?.y || 300;

      const existingTableNodes = nodes.filter((n) => n.type === FlowNodeType.TABLE);
      const existingTableNames = existingTableNodes.map((n) => n.data?.tableName);

      // Only process newly added tables
      const newTableNames = selectedTableNames.filter(
        (name) => !existingTableNames.includes(name)
      );

      if (newTableNames.length === 0) return;

      for (const tableName of newTableNames) {
        let tableFields: Array<{ name: string; type: string; nullable: boolean }> = [];
        try {
          const schema = await getTableSchema(tableName, executeQuery);
          tableFields = schema.fields;
          console.log('[DataSourceNode] Loaded table fields:', tableName, tableFields);
        } catch (error) {
          console.error('[DataSourceNode] Failed to load table schema:', error);
        }

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

        // Connect dataSource → table
        addEdge({
          id: `e_${id}_${tableNodeId}`,
          source: id,
          target: tableNodeId,
          type: 'default',
          animated: false,
          style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
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
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        position: 'relative',
      }}
      className="datasource-node"
    >
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        maxWidth={400}
        maxHeight={400}
        lineStyle={{ borderColor: '#52c41a', borderWidth: 2 }}
        handleStyle={{ backgroundColor: '#52c41a', borderColor: '#fff', width: 10, height: 10 }}
      />
      {/* Input handle — receives edge from OperatorNode */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{
          width: 8,
          height: 8,
          background: FLOW_COLORS.edge.selected,
          border: '2px solid #fff',
        }}
      />
      {/* Output handle — connects to TableNodes */}
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
          数据源
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
          dropdownStyle={{ background: '#1f1f1f', border: '1px solid #434343' }}
          popupClassName="datasource-node-select-dropdown nodrag"
          notFoundContent={loading ? '加载中...' : '暂无数据表'}
          getPopupContainer={() => document.body}
          className="nodrag"
          maxTagCount={1}
          maxTagPlaceholder={(omitted) => `+${omitted.length}`}
        />
      </Spin>

      {data.selectedTables && data.selectedTables.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
          <span>已选择: {data.selectedTables.length}</span>
        </div>
      )}
    </div>
  );
};

export default DataSourceNode;
