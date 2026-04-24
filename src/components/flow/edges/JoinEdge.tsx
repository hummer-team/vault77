/**
 * JoinEdge Component
 * Custom edge rendered between two TableNodes to represent a join relationship.
 * - Unconfigured: shows "构建关系" + "删除关系" buttons at the edge midpoint.
 * - Configured:   shows the join type label (e.g. "内连"); buttons appear on hover.
 */

import React, { useCallback, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { Button, Space, Tooltip } from 'antd';
import { DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { JOIN_TYPE_LABELS } from '../../../services/flow/constants';
import type { JoinEdgeData } from '../../../services/flow/types';
import { JoinType } from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

// Join type stroke colours
const JOIN_TYPE_COLORS: Record<JoinType, string> = {
  INNER: 'var(--vm-flow-success)',
  LEFT: 'var(--vm-flow-info)',
  RIGHT: 'var(--vm-flow-warning)',
  CROSS: 'var(--vm-flow-purple)',
};

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
  const removeEdge = useFlowStore((state) => state.removeEdge);
  const openJoinPanel = useFlowStore((state) => state.openJoinPanel);

  const [hovering, setHovering] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = data as JoinEdgeData | undefined;
  const isConfigured = edgeData?.configured === true;
  const joinType: JoinType = edgeData?.joinType ?? JoinType.INNER;
  const color = JOIN_TYPE_COLORS[joinType];

  const handleBuild = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openJoinPanel(id);
    },
    [id, openJoinPanel]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeEdge(id);
    },
    [id, removeEdge]
  );

  // Only show action buttons on hover or when edge is selected — never unconditionally.
  // This prevents canvas clutter when many edges coexist.
  const showButtons = hovering || selected;

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: selected ? 'var(--vm-flow-warning)' : isConfigured ? color : '#595959',
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: isConfigured ? undefined : '5,4',
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            cursor: 'default',
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          {!showButtons ? (
            /* ── Resting state: compact badge ── */
            <div
              style={{
                background: TOKEN.flowNodeBg,
                border: `1px solid ${isConfigured ? color : '#444'}`,
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 12,
                color: isConfigured ? color : '#666',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
              onClick={handleBuild}
            >
              {isConfigured ? JOIN_TYPE_LABELS[joinType] : '待配置'}
            </div>
          ) : (
            /* ── Hover / selected: action buttons ── */
            <Space size={4} direction="vertical" align="center">
              <div
                style={{
                  background: TOKEN.flowNodeBg,
                  border: `1px solid ${isConfigured ? color : '#444'}`,
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 12,
                  color: isConfigured ? color : '#888',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {isConfigured ? JOIN_TYPE_LABELS[joinType] : '待配置'}
              </div>
              <Space size={4}>
                <Tooltip title="构建关系" placement="bottom">
                  <Button
                    type="primary"
                    size="small"
                    icon={<SettingOutlined />}
                    onClick={handleBuild}
                    style={{ height: 22, width: 28, padding: 0, background: '#1677ff' }}
                  />
                </Tooltip>
                <Tooltip title="删除关系" placement="bottom">
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={handleDelete}
                    style={{ height: 22, width: 28, padding: 0 }}
                  />
                </Tooltip>
              </Space>
            </Space>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

