/**
 * Node Toolbar Component
 * Toolbar for manually adding different types of nodes to the flow
 */

import React from 'react';
import { Button, Tooltip, Divider } from 'antd';
import {
  TableOutlined,
  NodeIndexOutlined,
  FilterOutlined,
  AppstoreOutlined,
  ColumnWidthOutlined,
  FunctionOutlined,
  FlagOutlined,
} from '@ant-design/icons';
import { useReactFlow } from '@xyflow/react';
import { useFlowStore } from '../../../stores/flowStore';
import { FlowNodeType } from '../../../services/flow/types';

export const NodeToolbar: React.FC = () => {
  const { screenToFlowPosition } = useReactFlow();
  const addNode = useFlowStore((state) => state.addNode);
  const nodes = useFlowStore((state) => state.nodes);

  // Get center position of the visible canvas
  const getCenterPosition = () => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    return screenToFlowPosition({ x: centerX, y: centerY });
  };

  // Calculate position to avoid overlapping with existing nodes
  const getNonOverlappingPosition = (baseX: number, baseY: number) => {
    const offset = 50;
    let x = baseX;
    let y = baseY;
    let attempts = 0;

    while (attempts < 20) {
      const hasOverlap = nodes.some((node) => {
        const dx = node.position.x - x;
        const dy = node.position.y - y;
        return Math.sqrt(dx * dx + dy * dy) < 150;
      });

      if (!hasOverlap) {
        return { x, y };
      }

      x += offset;
      if (attempts % 4 === 3) {
        x = baseX;
        y += offset;
      }
      attempts++;
    }

    return { x, y };
  };

  const addNodeAtCenter = (type: FlowNodeType, data: Record<string, unknown>) => {
    const centerPos = getCenterPosition();
    const position = getNonOverlappingPosition(centerPos.x, centerPos.y);

    const newNode = {
      id: `${type}_${Date.now()}`,
      type,
      position,
      data,
    };

    addNode(newNode as unknown as Parameters<typeof addNode>[0]);
  };

  const toolbarItems = [
    {
      type: FlowNodeType.TABLE,
      icon: <TableOutlined style={{ fontSize: '16px' }} />,
      label: '表节点',
      data: { tableName: '', fields: [], expanded: false, alias: '' },
    },
    {
      type: FlowNodeType.MERGE,
      icon: <span style={{ fontSize: '16px', fontWeight: 'bold' }}>+</span>,
      label: '聚合节点',
      data: { tableCount: 0 },
    },
    {
      type: FlowNodeType.JOIN,
      icon: <NodeIndexOutlined style={{ fontSize: '16px' }} />,
      label: '关联节点',
      data: { joinType: 'INNER', leftTable: '', rightTable: '', conditions: [], order: 1 },
    },
    {
      type: FlowNodeType.CONDITION,
      icon: <FilterOutlined style={{ fontSize: '16px' }} />,
      label: '条件节点',
      data: { field: '', operator: '=', value: '' },
    },
    {
      type: FlowNodeType.CONDITION_GROUP,
      icon: <AppstoreOutlined style={{ fontSize: '16px' }} />,
      label: '条件组',
      data: { logic: 'AND', conditions: [] },
    },
    {
      type: FlowNodeType.SELECT,
      icon: <ColumnWidthOutlined style={{ fontSize: '16px' }} />,
      label: '选择列',
      data: { columns: [], tableAlias: '' },
    },
    {
      type: FlowNodeType.SELECT_AGG,
      icon: <FunctionOutlined style={{ fontSize: '16px' }} />,
      label: '聚合',
      data: { aggregations: [], groupBy: [] },
    },
    {
      type: FlowNodeType.END,
      icon: <FlagOutlined style={{ fontSize: '16px' }} />,
      label: '结束',
      data: { outputName: '' },
    },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        background: 'rgba(28, 25, 23, 0.95)',
        border: '1px solid rgba(68, 64, 60, 0.6)',
        borderRadius: '10px',
        padding: '8px 12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 107, 0, 0.1)',
        zIndex: 10,
        backdropFilter: 'blur(12px)',
      }}
    >
      {toolbarItems.map((item, index) => (
        <React.Fragment key={item.type}>
          <Tooltip title={item.label} placement="bottom">
            <Button
              type="text"
              icon={item.icon}
              onClick={() => addNodeAtCenter(item.type, item.data)}
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.7)',
                borderRadius: '8px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 107, 0, 0.15)';
                e.currentTarget.style.color = '#FF6B00';
                e.currentTarget.style.boxShadow = '0 0 12px rgba(255, 107, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </Tooltip>
          {index < toolbarItems.length - 1 && (
            <Divider type="vertical" style={{ height: '20px', margin: '0 6px', background: 'rgba(68, 64, 60, 0.5)' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default NodeToolbar;
