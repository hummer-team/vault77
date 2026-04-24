/**
 * DeletableEdge
 * A simple directed edge with a delete button that appears on hover or when selected.
 * Used for auto-wired connections (e.g., ConditionDefinitionNode → ConditionGroupNode)
 * that the user may want to remove individually.
 */

import React, { useCallback, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { Button, Tooltip } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';

export const DeletableEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}) => {
  const removeEdge = useFlowStore((state) => state.removeEdge);
  const [hovering, setHovering] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeEdge(id);
    },
    [id, removeEdge]
  );

  const showButton = hovering || selected;

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: selected ? 'var(--vm-flow-warning)' : 'var(--vm-flow-edge)',
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: '5,4',
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
          {showButton && (
            <Tooltip title="删除连线" placement="bottom">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={handleDelete}
                style={{ height: 22, width: 28, padding: 0 }}
              />
            </Tooltip>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
