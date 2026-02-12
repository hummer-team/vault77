/**
 * Join Edge Component
 * Custom edge that displays JOIN type and conditions
 */

import React, { useCallback } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { Tag } from 'antd';
import { useFlowStore } from '../../../stores/flowStore';
import { JOIN_TYPE_LABELS } from '../../../services/flow/constants';
import type { JoinType } from '../../../services/flow/types';

// Join type colors
const JOIN_TYPE_COLORS: Record<JoinType, string> = {
  INNER: '#52c41a',
  LEFT: '#1890ff',
  RIGHT: '#fa8c16',
  CROSS: '#722ed1',
};

export interface JoinEdgeData extends Record<string, unknown> {
  joinType: JoinType;
  conditions: string;
  order: number;
}

export const JoinEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}) => {
  const { setEdges } = useReactFlow();
  const removeEdge = useFlowStore((state) => state.removeEdge);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onEdgeClick = useCallback(() => {
    // Find and select the associated join node
    const edges = useFlowStore.getState().edges;
    const edge = edges.find((e) => e.id === id);
    if (edge) {
      // The join node is either the source or target of this edge
      const joinNodeId = edge.source.startsWith('join_')
        ? edge.source
        : edge.target.startsWith('join_')
          ? edge.target
          : null;
      if (joinNodeId) {
        useFlowStore.getState().setSelectedNode(joinNodeId as string);
      }
    }
  }, [id]);

  const onDeleteClick = useCallback(
    (evt: React.MouseEvent) => {
      evt.stopPropagation();
      removeEdge(id);
      setEdges((edges) => edges.filter((e) => e.id !== id));
    },
    [id, removeEdge, setEdges]
  );

  const dataRecord = data as JoinEdgeData | undefined;
  const joinType = dataRecord?.joinType || 'INNER';
  const order = dataRecord?.order || 1;
  const color = JOIN_TYPE_COLORS[joinType];

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: selected ? '#fa8c16' : color,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: joinType === 'CROSS' ? '5,5' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            cursor: 'pointer',
          }}
          className="nodrag nopan"
          onClick={onEdgeClick}
        >
          <div
            style={{
              background: '#1f1f1f',
              border: `1px solid ${selected ? '#fa8c16' : color}`,
              borderRadius: '4px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            }}
          >
            {/* Order badge */}
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: color,
                color: '#fff',
                fontSize: 10,
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {order}
            </span>

            {/* Join type label */}
            <Tag
              color={color}
              style={{
                margin: 0,
                fontSize: 11,
                padding: '0 4px',
                border: 'none',
              }}
            >
              {JOIN_TYPE_LABELS[joinType as JoinType] as React.ReactNode}
            </Tag>

            {/* Delete button (visible when selected) */}
            {selected && (
              <span
                style={{
                  color: '#ff4d4f',
                  fontSize: 12,
                  marginLeft: 4,
                  cursor: 'pointer',
                }}
                onClick={onDeleteClick}
              >
                ×
              </span>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export default JoinEdge;
