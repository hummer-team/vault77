/**
 * Custom Controls Component
 * Collapsible controls panel: zoom, delete, format, lock
 * Left-bottom corner with toggle expand/collapse
 */

import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import {
  PlusOutlined,
  MinusOutlined,
  ExpandOutlined,
  LockOutlined,
  UnlockOutlined,
  DeleteOutlined,
  LayoutOutlined,
  CaretLeftOutlined,
  CaretRightOutlined,
} from '@ant-design/icons';
import { useReactFlow, useViewport, Position } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { useFlowStore } from '../../../stores/flowStore';
import type { FlowNode, FlowEdge } from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

interface CustomControlsProps {
  className?: string;
}

// Node dimensions for layout calculation
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const LAYER_SPACING = 200;
const NODE_SPACING = 80;

const getLayoutedElements = (
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: 'LR' | 'TB' = 'LR'
) => {
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  const isHorizontal = direction === 'LR';

  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: LAYER_SPACING,
    nodesep: NODE_SPACING,
    edgesep: 30,
    marginx: 30,
    marginy: 30,
    align: 'DL',
    acyclicer: 'greedy',
    ranker: 'network-simplex',
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes: FlowNode[] = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newX = nodeWithPosition.x - NODE_WIDTH / 2;
    const newY = nodeWithPosition.y - NODE_HEIGHT / 2;

    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: newX,
        y: newY,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export const CustomControls: React.FC<CustomControlsProps> = ({ className }) => {
  const { zoomIn, zoomOut, fitView, zoomTo, setNodes: setReactFlowNodes, getNodes, getEdges } = useReactFlow();
  const { zoom } = useViewport();
  const [isLocked, setIsLocked] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const storeNodes = useFlowStore((state) => state.nodes);
  const removeNode = useFlowStore((state) => state.removeNode);
  const setStoreNodes = useFlowStore((state) => state.setNodes);

  const toggleLock = () => {
    setIsLocked(!isLocked);
  };

  const handleDeleteAll = () => {
    storeNodes.forEach((node) => {
      if (node.type !== 'operator') {
        removeNode(node.id);
      }
    });
  };

  const handleFormatLayout = () => {
    const currentNodes = getNodes() as FlowNode[];
    const currentEdges = getEdges() as FlowEdge[];

    if (currentNodes.length <= 1) return;

    const { nodes: layoutedNodes } = getLayoutedElements(currentNodes, currentEdges, 'LR');

    const updatedNodes = layoutedNodes.map(node => ({
      ...node,
      position: { ...node.position },
    }));

    setReactFlowNodes(updatedNodes);
    setStoreNodes([...updatedNodes]);

    setTimeout(() => {
      fitView({
        padding: 0.05,
        minZoom: 0.5,
        maxZoom: 1.5,
        duration: 400,
        includeHiddenNodes: false,
      });
    }, 100);
  };

  const hasDeletableNodes = storeNodes.some((node) => node.type !== 'operator');

  return (
    <div
      className={`custom-controls ${className || ''}`}
      style={{
        position: 'absolute',
        left: '20px',
        bottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        background: 'var(--vm-flow-node-bg)',
        border: '1px solid var(--vm-border-mid)',
        borderRadius: '10px',
        padding: isExpanded ? '8px' : '4px',
        boxShadow: 'var(--vm-flow-shadow-control)',
        zIndex: 10,
        backdropFilter: 'blur(12px)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Collapse/Expand Toggle Button - Arrow points DOWN when collapsed, UP when expanded */}
      <Tooltip title={isExpanded ? '收缩' : '展开'} placement="right">
        <Button
          type="text"
          icon={isExpanded ? <CaretLeftOutlined style={{ fontSize: '14px' }} /> : <CaretRightOutlined style={{ fontSize: '14px' }} />}
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            width: '32px',
            height: '32px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: TOKEN.textSecondary,
            borderRadius: '8px',
            transition: 'all 0.2s ease',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(-90deg)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--vm-primary-light)';
            e.currentTarget.style.color = 'var(--vm-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = TOKEN.textSecondary;
          }}
        />
      </Tooltip>

      {isExpanded && (
        <>
          {/* Zoom group */}
          <div style={{ height: '1px', background: 'var(--vm-border-subtle)', margin: '2px 4px' }} />

          <Tooltip title="放大" placement="right">
            <Button
              type="text"
              icon={<PlusOutlined style={{ fontSize: '16px' }} />}
              onClick={() => zoomIn()}
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: TOKEN.textSecondary,
                borderRadius: '8px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--vm-primary-light)';
                e.currentTarget.style.color = 'var(--vm-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = TOKEN.textSecondary;
              }}
            />
          </Tooltip>

          <Tooltip title="重置缩放" placement="right">
            <div
              onClick={() => zoomTo(1)}
              style={{
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: TOKEN.textSecondary,
                fontSize: '11px',
                fontVariantNumeric: 'tabular-nums',
                userSelect: 'none',
                borderRadius: '6px',
                transition: 'all 0.2s ease',
                padding: '0 4px',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'var(--vm-primary-light)';
                (e.currentTarget as HTMLDivElement).style.color = 'var(--vm-primary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                (e.currentTarget as HTMLDivElement).style.color = TOKEN.textSecondary;
              }}
            >
              {Math.round(zoom * 100)}%
            </div>
          </Tooltip>

          <Tooltip title="缩小" placement="right">
            <Button
              type="text"
              icon={<MinusOutlined style={{ fontSize: '16px' }} />}
              onClick={() => zoomOut()}
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: TOKEN.textSecondary,
                borderRadius: '8px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--vm-primary-light)';
                e.currentTarget.style.color = 'var(--vm-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = TOKEN.textSecondary;
              }}
            />
          </Tooltip>

          <Tooltip title="适应屏幕" placement="right">
            <Button
              type="text"
              icon={<ExpandOutlined style={{ fontSize: '16px' }} />}
              onClick={() => fitView({ padding: 0.2 })}
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: TOKEN.textSecondary,
                borderRadius: '8px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--vm-primary-light)';
                e.currentTarget.style.color = 'var(--vm-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = TOKEN.textSecondary;
              }}
            />
          </Tooltip>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--vm-border-subtle)', margin: '2px 4px' }} />

          {/* Delete & Format group */}
          <Tooltip title="删除所有节点" placement="right">
            <Button
              type="text"
              icon={<DeleteOutlined style={{ fontSize: '16px' }} />}
              onClick={handleDeleteAll}
              disabled={!hasDeletableNodes}
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: hasDeletableNodes ? TOKEN.textSecondary : TOKEN.textMuted,
                borderRadius: '8px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (hasDeletableNodes) {
                  e.currentTarget.style.background = 'var(--vm-flow-error-light)';
                  e.currentTarget.style.color = '#ff4d4f';
                  e.currentTarget.style.boxShadow = '0 0 12px var(--vm-flow-error-light)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = hasDeletableNodes
                  ? TOKEN.textSecondary
                  : TOKEN.textMuted;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </Tooltip>

          <Tooltip title="自动格式化布局" placement="right">
            <Button
              type="text"
              icon={<LayoutOutlined style={{ fontSize: '16px' }} />}
              onClick={handleFormatLayout}
              disabled={storeNodes.length <= 1}
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: storeNodes.length > 1 ? TOKEN.textSecondary : TOKEN.textMuted,
                borderRadius: '8px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (storeNodes.length > 1) {
                  e.currentTarget.style.background = 'var(--vm-primary-light)';
                  e.currentTarget.style.color = 'var(--vm-primary)';
                  e.currentTarget.style.boxShadow = '0 0 12px var(--vm-primary-glow)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color =
                  storeNodes.length > 1 ? TOKEN.textSecondary : TOKEN.textMuted;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </Tooltip>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--vm-border-subtle)', margin: '2px 4px' }} />

          <Tooltip title={isLocked ? '解锁画布' : '锁定画布'} placement="right">
            <Button
              type="text"
              icon={
                isLocked ? (
                  <LockOutlined style={{ fontSize: '16px', color: 'var(--vm-primary)' }} />
                ) : (
                  <UnlockOutlined style={{ fontSize: '16px' }} />
                )
              }
              onClick={toggleLock}
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: isLocked ? TOKEN.primary : TOKEN.textSecondary,
                borderRadius: '8px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isLocked) {
                  e.currentTarget.style.background = 'var(--vm-primary-light)';
                  e.currentTarget.style.color = 'var(--vm-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLocked) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = TOKEN.textSecondary;
                }
              }}
            />
          </Tooltip>
        </>
      )}
    </div>
  );
};

export default CustomControls;
