/**
 * Operator Node Component
 * Allows user to select business operator (association, anomaly, clustering)
 */

import React, { useCallback } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Select, Tag, Space, Button } from 'antd';
import { ThunderboltOutlined, DeleteOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { FLOW_COLORS, OPERATOR_CONFIG } from '../../../services/flow/constants';
import { FlowNodeType, OperatorType } from '../../../services/flow/types';
import type { OperatorNodeData } from '../../../services/flow/types';

interface OperatorNodeProps {
  id: string;
  data: OperatorNodeData;
  selected?: boolean;
}

const operatorOptions = Object.entries(OPERATOR_CONFIG).map(([key, config]) => ({
  value: key as OperatorType,
  label: config.name,
  description: config.description,
  icon: config.icon,
}));

export const OperatorNode: React.FC<OperatorNodeProps> = ({ id, data, selected }) => {
  const updateNode = useFlowStore((state) => state.updateNode);
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const removeNode = useFlowStore((state) => state.removeNode);
  const nodes = useFlowStore((state) => state.nodes);

  // Handle delete
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeNode(id);
    },
    [id, removeNode]
  );

  const handleOperatorChange = useCallback(
    (operatorType: OperatorType) => {
      // Update operator node
      updateNode(id, { operatorType });

      // Check if there's already a next node connected to this operator node
      const edges = useFlowStore.getState().edges;
      const hasConnectedNextNode = edges.some(
        (e) =>
          e.source === id &&
          (nodes.find((n) => n.id === e.target)?.type === FlowNodeType.SELECT ||
           nodes.find((n) => n.id === e.target)?.type === FlowNodeType.JOIN)
      );

      // Don't create if already exists
      if (hasConnectedNextNode) return;

      // Get operator node position
      const operatorNode = nodes.find((n) => n.id === id);
      if (!operatorNode) return;

      const operatorX = operatorNode.position.x;
      const operatorY = operatorNode.position.y;

      // Check if merge node has multiple table inputs
      const inputEdges = edges?.filter((e) => e.target === id) || [];
      const mergeNode = inputEdges
        .map((e) => nodes.find((n) => n.id === e.source))
        .find((n) => n?.type === 'merge');
      
      // Get all connected table nodes from merge node
      const connectedTableEdges = mergeNode?.id
        ? (edges || []).filter((e) => e.target === mergeNode.id)
        : [];
      const connectedTableNodes = connectedTableEdges
        .map((e) => nodes.find((n) => n.id === e.source))
        .filter((n): n is NonNullable<typeof n> => n?.type === 'table');
      
      const tableNames = connectedTableNodes.map((n) => (n.data as { tableName: string }).tableName);
      const connectedTableCount = tableNames.length;

      // If multiple tables, create JOIN nodes for each pair
      if (connectedTableCount > 1) {
        let previousNodeId = id;
        const createdJoinNodes: Array<{ id: string; conditions: any[] }> = [];
        
        // Create a JOIN node for each table pair
        // For N tables, we need (N-1) JOIN operations
        for (let i = 1; i < connectedTableCount; i++) {
          const joinNodeId = `join_${Date.now()}_${i}`;
          const leftTable = tableNames[0]; // First table is always the left table
          const rightTable = tableNames[i]; // Current table is the right table
          
          const joinNode = {
            id: joinNodeId,
            type: FlowNodeType.JOIN,
            position: { x: operatorX + 280 + (i - 1) * 50, y: operatorY + (i - 1) * 30 },
            data: {
              joinType: 'INNER',
              leftTable: leftTable,
              rightTable: rightTable,
              conditions: [],
              order: i,
            },
          };
          addNode(joinNode as unknown as Parameters<typeof addNode>[0]);
          createdJoinNodes.push({ id: joinNodeId, conditions: [] });

          // Connect previous node -> join with arrow marker
          addEdge({
            id: `e_${previousNodeId}_${joinNodeId}`,
            source: previousNodeId,
            target: joinNodeId,
            type: 'default',
            animated: false,
            style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
            markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
          } as unknown as Parameters<typeof addEdge>[0]);
          
          previousNodeId = joinNodeId;
        }
        
        // Validate all created JOIN nodes have conditions configured
        // If any JOIN node lacks conditions, don't create downstream nodes
        // and keep the detail panel open for the first incomplete JOIN node
        const state = useFlowStore.getState();
        const incompleteJoinNode = createdJoinNodes.find(joinInfo => {
          const joinNode = state.nodes.find(n => n.id === joinInfo.id);
          return !joinNode?.data?.conditions || (joinNode.data.conditions as any[]).length === 0;
        });
        
        if (incompleteJoinNode) {
          // Select the first incomplete JOIN node to show its detail panel
          setTimeout(() => {
            const { setSelectedNode } = useFlowStore.getState();
            setSelectedNode(incompleteJoinNode.id);
          }, 100);
          return; // Don't create downstream nodes until all JOINs are configured
        }
        
        // After all JOIN nodes, create a merge node (+ node) and select node
        const lastJoinNodeId = previousNodeId;
        const lastJoinNode = nodes.find((n) => n.id === lastJoinNodeId);
        const lastJoinX = lastJoinNode?.position?.x || operatorX + 280;
        const lastJoinY = lastJoinNode?.position?.y || operatorY;
        
        // Create merge node (+ node) with "选择列" label
        const mergeNodeId = `merge_after_join_${Date.now()}`;
        const mergeNode = {
          id: mergeNodeId,
          type: FlowNodeType.MERGE,
          position: { x: lastJoinX + 200, y: lastJoinY },
          data: {
            tableCount: 1,
            label: '选择列',
          },
        };
        addNode(mergeNode as unknown as Parameters<typeof addNode>[0]);
        
        // Connect last JOIN -> merge node with arrow marker
        addEdge({
          id: `e_${lastJoinNodeId}_${mergeNodeId}`,
          source: lastJoinNodeId,
          target: mergeNodeId,
          type: 'default',
          animated: false,
          style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
        } as unknown as Parameters<typeof addEdge>[0]);
        
        // Create select node (default select all columns)
        const selectNodeId = `select_${Date.now()}`;
        const selectNode = {
          id: selectNodeId,
          type: FlowNodeType.SELECT,
          position: { x: lastJoinX + 450, y: lastJoinY },
          data: {
            fields: [],
            selectAll: true, // Default to selecting all columns
          },
        };
        addNode(selectNode as unknown as Parameters<typeof addNode>[0]);
        
        // Connect merge node -> select node with arrow marker
        addEdge({
          id: `e_${mergeNodeId}_${selectNodeId}`,
          source: mergeNodeId,
          target: selectNodeId,
          type: 'default',
          animated: false,
          style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
        } as unknown as Parameters<typeof addEdge>[0]);
      } else {
        // Single table - create SELECT node directly with selectAll enabled by default
        const selectNodeId = `select_${Date.now()}`;
        const selectNode = {
          id: selectNodeId,
          type: FlowNodeType.SELECT,
          position: { x: operatorX + 280, y: operatorY },
          data: {
            fields: [],
            selectAll: true, // Default to selecting all columns
          },
        };
        addNode(selectNode as unknown as Parameters<typeof addNode>[0]);

        // Connect operator -> select with arrow marker
        addEdge({
          id: `e_${id}_${selectNodeId}`,
          source: id,
          target: selectNodeId,
          type: 'default',
          animated: false,
          style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
        } as unknown as Parameters<typeof addEdge>[0]);
      }
    },
    [id, updateNode, addNode, addEdge, nodes]
  );

  const selectedOperator = data.operatorType
    ? OPERATOR_CONFIG[data.operatorType]
    : null;

  return (
    <div
      style={{
        background: FLOW_COLORS.node.select.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : data.operatorType ? FLOW_COLORS.node.select.border : '#ff4d4f'}`,
        borderRadius: '8px',
        padding: '12px 16px',
        minWidth: '220px',
        minHeight: '120px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        position: 'relative',
      }}
      className="operator-node"
    >
      {/* Node Resizer - only show when selected */}
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        maxWidth={350}
        maxHeight={300}
        lineStyle={{ borderColor: '#fa8c16', borderWidth: 2 }}
        handleStyle={{ backgroundColor: '#fa8c16', borderColor: '#fff', width: 10, height: 10 }}
      />
      {/* Input handle */}
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
        <ThunderboltOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
        <span>业务算子</span>
        <Space size={4} style={{ marginLeft: 'auto' }}>
          {data.operatorType && (
            <Tag color="processing" style={{ fontSize: 10 }}>
              已选择
            </Tag>
          )}
          {selected && (
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              danger
              style={{ color: '#ff4d4f' }}
            />
          )}
        </Space>
      </div>

      {/* Operator selector */}
      <Select
        placeholder="请选择业务算子"
        value={data.operatorType}
        onChange={handleOperatorChange}
        style={{ width: '100%' }}
        className="nodrag"
        dropdownStyle={{ background: '#1f1f1f', border: '1px solid #434343' }}
        popupClassName="operator-select-dropdown nodrag"
        getPopupContainer={() => document.body}
      >
        {operatorOptions.map((opt) => (
          <Select.Option key={opt.value} value={opt.value}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>{opt.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{opt.label}</div>
                <div style={{ fontSize: '11px', color: '#8c8c8c' }}>
                  {opt.description}
                </div>
              </div>
            </div>
          </Select.Option>
        ))}
      </Select>

      {/* Selected operator display */}
      {selectedOperator && (
        <div
          style={{
            marginTop: 12,
            padding: '8px',
            background: 'rgba(255, 107, 0, 0.1)',
            borderRadius: '4px',
            border: '1px solid rgba(255, 107, 0, 0.3)',
          }}
        >
          <div style={{ fontSize: '12px', color: '#fff', marginBottom: 4 }}>
            <span style={{ marginRight: '6px' }}>{selectedOperator.icon}</span>
            <span style={{ fontWeight: 500 }}>{selectedOperator.name}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>
            {selectedOperator.description}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data.operatorType && (
        <div
          style={{
            marginTop: 8,
            padding: '8px',
            textAlign: 'center',
            background: 'rgba(255, 77, 79, 0.1)',
            borderRadius: '4px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#ff4d4f' }}>
            请选择业务算子
          </span>
        </div>
      )}
    </div>
  );
};

export default OperatorNode;
