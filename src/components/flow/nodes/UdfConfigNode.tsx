/**
 * UdfConfigNode
 * Flow canvas node representing a data-cleaning UDF operator configuration step.
 * Clicking the node opens the appropriate configuration drawer (e.g., ReplaceColumnDrawer).
 */

import React, { useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Tag, Space, Button, Tooltip } from 'antd';
import { SettingOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import { FLOW_COLORS } from '../../../services/flow/constants';
import { OperatorType } from '../../../services/flow/types';
import type { UdfConfigNodeData, ReplaceRule } from '../../../services/flow/types';
import ReplaceColumnDrawer from '../udf/ReplaceColumnDrawer';
import { useUpstreamJoinedTables } from '../hooks/useUpstreamJoinedTables';

interface UdfConfigNodeProps {
  id: string;
  data: UdfConfigNodeData;
  selected?: boolean;
}

/**
 * UDF function name → OperatorType mapping.
 * Used to resolve which drawer to display.
 */
const UDF_OPERATOR_TYPE_MAP: Record<string, OperatorType> = {
  udf_replace_spec_column_value: OperatorType.UDF_REPLACE_COLUMN,
};

const UdfConfigNode: React.FC<UdfConfigNodeProps> = ({ id, data, selected }) => {
  const updateNode = useFlowStore((state) => state.updateNode);
  const removeNode = useFlowStore((state) => state.removeNode);
  const nodes = useFlowStore((state) => state.nodes);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Compute upstream configured joined tables via shared hook
  const joinedTables = useUpstreamJoinedTables(id);

  // Determine configured rule count
  const ruleCount = data.replacementRules?.length ?? 0;
  const isConfigured = ruleCount > 0 && data.replacementRules?.some((r) => r.sourceTable && r.targetColumn?.length > 0);

  const operatorType = UDF_OPERATOR_TYPE_MAP[data.udfFunctionName];

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenDrawer = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setDrawerOpen(true);
    },
    []
  );

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const handleConfirm = useCallback(
    (rules: ReplaceRule[], outputColumns: string[]) => {
      updateNode(id, { replacementRules: rules, outputColumns } as Partial<UdfConfigNodeData>);
      setDrawerOpen(false);

      // Propagate operatorType to EndNode so it uses the correct strategy
      const endNode = nodes.find((n) => n.type === 'end');
      if (endNode && operatorType) {
        updateNode(endNode.id, { operatorType } as Record<string, unknown>);
      }
    },
    [id, updateNode, nodes, operatorType]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeNode(id);
    },
    [id, removeNode]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
      <div
        onClick={handleOpenDrawer}
        style={{
          background: '#1a1a2e',
          border: `2px solid ${selected ? 'var(--vm-flow-purple)' : isConfigured ? 'var(--vm-flow-purple)' : '#ff4d4f'}`,
          borderRadius: '8px',
          padding: '12px 16px',
          minWidth: '220px',
          minHeight: '100px',
          boxShadow: selected
            ? '0 0 0 2px var(--vm-flow-purple-border)'
            : 'var(--vm-flow-shadow)',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
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
            marginBottom: 10,
            color: 'var(--vm-text-primary)',
            fontWeight: 500,
          }}
        >
          <SettingOutlined style={{ marginRight: 8, color: 'var(--vm-flow-purple)' }} />
          <span>选择列</span>
          <Space size={4} style={{ marginLeft: 'auto' }}>
            {selected && (
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={handleDelete}
                danger
                style={{ color: 'var(--vm-color-error)' }}
              />
            )}
          </Space>
        </div>

        {/* Kernel name */}
        <div style={{ fontSize: 11, color: 'var(--vm-text-helper)', marginBottom: 8 }}>
          {data.kernelName || '未关联算子'}
        </div>

        {/* Configuration status */}
        {isConfigured ? (
          <Tooltip title="点击修改配置">
            <Tag
              icon={<CheckCircleOutlined />}
              color="purple"
              style={{ fontSize: 11 }}
            >
              已配置 {ruleCount} 条规则
            </Tag>
          </Tooltip>
        ) : (
          <Tag color="error" style={{ fontSize: 11 }}>
            点击配置替换规则
          </Tag>
        )}
      </div>

      {/* Configuration Drawer — rendered based on UDF type */}
      {operatorType === OperatorType.UDF_REPLACE_COLUMN && (
        <ReplaceColumnDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          onConfirm={handleConfirm}
          initialRules={data.replacementRules}
          initialOutputColumns={data.outputColumns}
          joinedTables={joinedTables}
        />
      )}
    </>
  );
};

export default UdfConfigNode;
