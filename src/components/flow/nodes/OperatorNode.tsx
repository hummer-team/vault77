/**
 * Operator Node Component
 * Allows user to select business operator from applied kernels
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Select, Tag, Space, Button } from 'antd';
import { ThunderboltOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { FLOW_COLORS } from '../../../services/flow/constants';
import { FlowNodeType, OperatorType } from '../../../services/flow/types';
import type { OperatorNodeData } from '../../../services/flow/types';
import { bizKernelService } from '../../../services/biz-kernels/bizKernelService';
import type { BizKernelMetadata } from '../../../services/biz-kernels/types';
import { duckDBUdfService } from '../../../services/duckDBUdfService';
import { NodeNextButton } from '../shared/NodeNextButton';

interface OperatorNodeProps {
  id: string;
  data: OperatorNodeData;
  selected?: boolean;
}

export const OperatorNode: React.FC<OperatorNodeProps> = ({ id, data, selected }) => {
  const updateNode = useFlowStore((state) => state.updateNode);
  const addNode = useFlowStore((state) => state.addNode);
  const addEdge = useFlowStore((state) => state.addEdge);
  const removeNode = useFlowStore((state) => state.removeNode);
  const nodes = useFlowStore((state) => state.nodes);
  const defaultKernelName = useFlowStore((state) => state.defaultKernelName);

  const [appliedKernels, setAppliedKernels] = useState<BizKernelMetadata[]>([]);
  const [isHovering, setIsHovering] = useState(false);
  const handleMouseEnter = useCallback(() => setIsHovering(true), []);
  const handleMouseLeave = useCallback(() => setIsHovering(false), []);

  // Load applied kernels
  useEffect(() => {
    const load = async () => {
      await bizKernelService.initialize();
      setAppliedKernels(bizKernelService.getAppliedKernels());
    };
    load();
  }, []);

  // Auto-select default kernel when node has no selection yet
  useEffect(() => {
    if (!data.kernelName && defaultKernelName) {
      updateNode(id, { kernelName: defaultKernelName });
    }
  }, [id, data.kernelName, defaultKernelName, updateNode]);

  // Handle delete
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeNode(id);
    },
    [id, removeNode]
  );

  const handleKernelChange = useCallback(
    (kernelName: string) => {
      updateNode(id, { kernelName });

      // Always sync the EndNode's operatorType when a UDF kernel is selected,
      // regardless of whether downstream nodes already exist. This must run
      // before the hasConnectedNextNode early-return guard below.
      if (duckDBUdfService.isDataCleanKernel(kernelName)) {
        const existingEnd = useFlowStore.getState().nodes.find((n) => n.type === FlowNodeType.END);
        if (existingEnd) {
          updateNode(existingEnd.id, { operatorType: OperatorType.UDF_REPLACE_COLUMN });
        }
      }

      // Check if there's already a next node connected to this operator node
      const edges = useFlowStore.getState().edges;
      const hasConnectedNextNode = edges.some((e) => e.source === id);
      if (hasConnectedNextNode) return;

      // Get operator node position
      const operatorNode = nodes.find((n) => n.id === id);
      if (!operatorNode) return;

      const operatorX = operatorNode.position.x;
      const operatorY = operatorNode.position.y;

      // ── Data-cleaning UDF kernel: create SelectNode with UDF routing + End node
      if (duckDBUdfService.isDataCleanKernel(kernelName)) {
        const udfFunctionName = duckDBUdfService.getUdfFunctionName(kernelName) ?? '';

        // 1. Create SelectNode ("选择列") with UDF metadata for routing
        const selectNodeId = `select_${Date.now()}`;
        addNode({
          id: selectNodeId,
          type: FlowNodeType.SELECT,
          position: { x: operatorX + 280, y: operatorY },
          data: {
            fields: [],
            selectAll: false,
            udfFunctionName,
            udfKernelName: kernelName,
            replacementRules: [],
          },
        } as Parameters<typeof addNode>[0]);
        addEdge({
          id: `e_${id}_${selectNodeId}`,
          source: id,
          target: selectNodeId,
          type: 'default',
          animated: false,
          style: { stroke: 'rgba(114, 46, 209, 0.65)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(114, 46, 209, 0.65)' },
        } as Parameters<typeof addEdge>[0]);

        // 2. Create End node (if not already exists) with UDF operator type
        const existingEnd = useFlowStore.getState().nodes.find((n) => n.type === FlowNodeType.END);
        if (!existingEnd) {
          const endNodeId = `end_${Date.now()}`;
          addNode({
            id: endNodeId,
            type: FlowNodeType.END,
            position: { x: operatorX + 560, y: operatorY },
            data: {
              operatorType: OperatorType.UDF_REPLACE_COLUMN,
              executable: true,
              errors: [],
            },
          } as Parameters<typeof addNode>[0]);
          addEdge({
            id: `e_${selectNodeId}_${endNodeId}`,
            source: selectNodeId,
            target: endNodeId,
            type: 'default',
            animated: false,
            style: { stroke: 'rgba(114, 46, 209, 0.65)', strokeWidth: 1.5 },
            markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(114, 46, 209, 0.65)' },
          } as Parameters<typeof addEdge>[0]);
        } else {
          // Update existing EndNode operatorType to UDF
          updateNode(existingEnd.id, { operatorType: OperatorType.UDF_REPLACE_COLUMN });
        }

        return;
      }

      // ── Non-UDF kernel: original flow (JOIN or SELECT) ─────────────────────
      const inputEdges = edges?.filter((e) => e.target === id) || [];
      const mergeNode = inputEdges
        .map((e) => nodes.find((n) => n.id === e.source))
        .find((n) => n?.type === 'merge');

      const connectedTableEdges = mergeNode?.id
        ? (edges || []).filter((e) => e.target === mergeNode.id)
        : [];
      const connectedTableNodes = connectedTableEdges
        .map((e) => nodes.find((n) => n.id === e.source))
        .filter((n): n is NonNullable<typeof n> => n?.type === 'table');

      const tableNames = connectedTableNodes.map((n) => (n.data as { tableName: string }).tableName);
      const connectedTableCount = tableNames.length;

      if (connectedTableCount > 1) {
        let previousNodeId = id;
        for (let i = 1; i < connectedTableCount; i++) {
          const joinNodeId = `join_${Date.now()}_${i}`;
          addNode({
            id: joinNodeId,
            type: FlowNodeType.JOIN,
            position: { x: operatorX + 280 + (i - 1) * 50, y: operatorY + (i - 1) * 30 },
            data: { joinType: 'INNER', leftTable: tableNames[0], rightTable: tableNames[i], conditions: [], order: i },
          } as Parameters<typeof addNode>[0]);
          addEdge({
            id: `e_${previousNodeId}_${joinNodeId}`,
            source: previousNodeId,
            target: joinNodeId,
            type: 'default',
            animated: false,
            style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
            markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
          } as Parameters<typeof addEdge>[0]);
          previousNodeId = joinNodeId;
        }
      } else {
        const selectNodeId = `select_${Date.now()}`;
        addNode({
          id: selectNodeId,
          type: FlowNodeType.SELECT,
          position: { x: operatorX + 280, y: operatorY },
          data: { fields: [], selectAll: true },
        } as Parameters<typeof addNode>[0]);
        addEdge({
          id: `e_${id}_${selectNodeId}`,
          source: id,
          target: selectNodeId,
          type: 'default',
          animated: false,
          style: { stroke: 'rgba(110, 110, 110, 0.65)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: 'rgba(110, 110, 110, 0.65)' },
        } as Parameters<typeof addEdge>[0]);
      }
    },
    [id, updateNode, addNode, addEdge, nodes]
  );


  return (
    <div
      style={{
        background: FLOW_COLORS.node.select.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : data.kernelName ? FLOW_COLORS.node.select.border : '#ff4d4f'}`,
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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
        style={{ width: 8, height: 8, background: FLOW_COLORS.edge.selected, border: '2px solid #fff' }}
      />
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{ width: 8, height: 8, background: FLOW_COLORS.edge.selected, border: '2px solid #fff' }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, color: '#fff', fontWeight: 500 }}>
        <ThunderboltOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
        <span>业务算子</span>
        <Space size={4} style={{ marginLeft: 'auto' }}>
          {data.kernelName && (
            <Space size={4} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <Tag color="processing" style={{ fontSize: 10 }}>已选择</Tag>
              <EyeOutlined style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }} />
            </Space>
          )}
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            danger
            style={{ color: '#ff4d4f' }}
          />
        </Space>
      </div>

      {/* Kernel selector — shows applied kernels, defaults to ChatPanel selection */}
      <Select
        placeholder="请选择业务算子"
        value={data.kernelName}
        onChange={handleKernelChange}
        style={{ width: '100%' }}
        className="nodrag"
        dropdownStyle={{ background: '#1f1f1f', border: '1px solid #434343' }}
        popupClassName="operator-select-dropdown nodrag"
        getPopupContainer={() => document.body}
      >
        {appliedKernels.map((k) => (
          <Select.Option key={k.name} value={k.name}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 500 }}>{k.displayName}</span>
              <span style={{ fontSize: '11px', color: '#8c8c8c' }}>
                {k.category}
              </span>
            </div>
          </Select.Option>
        ))}
      </Select>

      {/* Selected kernel display */}

      {/* Empty state */}
      {!data.kernelName && (
        <div
          style={{
            marginTop: 8,
            padding: '8px',
            textAlign: 'center',
            background: 'rgba(255, 77, 79, 0.1)',
            borderRadius: '4px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#ff4d4f' }}>请选择业务算子</span>
        </div>
      )}

      <NodeNextButton nodeId={id} nodeType={FlowNodeType.OPERATOR} visible={isHovering} />
    </div>
  );
};

export default OperatorNode;
