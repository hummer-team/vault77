/**
 * End Node Component
 * Final node for the analysis flow - shows execute button and flow status
 */

import React, { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Button, Tag, Space, Badge, Tooltip, Spin } from 'antd';
import {
  PlayCircleOutlined,
  SaveOutlined,
  FlagOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { EndNodeData } from '../../../services/flow/types';
import { FLOW_COLORS, OPERATOR_CONFIG } from '../../../services/flow/constants';
import { StrategyFactory } from '../../../services/flow/strategyFactory';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import { ValidationSeverity, FlowNodeType } from '../../../services/flow/types';

interface EndNodeProps {
  id: string;
  data: EndNodeData;
  selected?: boolean;
  onSqlValidated?: (sql: string) => void;
}

export const EndNode: React.FC<EndNodeProps> = ({ id, data, selected, onSqlValidated }) => {
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const setErrorPanelOpen = useFlowStore((state) => state.setErrorPanelOpen);
  const updateNode = useFlowStore((state) => state.updateNode);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const { executeQuery, isDBReady } = useDuckDBContext();

  // Handle click
  const handleClick = useCallback(() => {
    setSelectedNode(id);
  }, [id, setSelectedNode]);

  // Handle execute
  const handleExecute = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      if (data.errors.length > 0) {
        // Show error panel
        setErrorPanelOpen(true);
        return;
      }

      // Set executing state
      updateNode(id, {
        ...data,
        executing: true,
        errors: [],
      });

      try {
        // Get strategy based on operator type
        const strategy = StrategyFactory.getStrategy(data.operatorType);

        // Validate flow configuration
        const validationErrors = strategy.validate(nodes, edges);
        if (validationErrors.length > 0) {
          updateNode(id, {
            ...data,
            executing: false,
            errors: validationErrors,
          });
          setErrorPanelOpen(true);
          return;
        }

        // Check if DuckDB is ready
        if (!isDBReady) {
          throw new Error('DuckDB not initialized. Please wait for database to be ready.');
        }

        // Get all table nodes and verify they exist in DuckDB
        const tableNodes = nodes.filter((n) => n.type === 'table');
        for (const tableNode of tableNodes) {
          const tableName = (tableNode.data as { tableName: string }).tableName;
          try {
            await executeQuery(`SELECT 1 FROM "${tableName}" LIMIT 1`);
          } catch (error) {
            throw new Error(`表 "${tableName}" 不存在于数据库中。请重新上传文件或选择正确的表。`);
          }
        }

        // Build SQL query
        const sql = strategy.buildSql(nodes, edges);
        console.log('Generated SQL:', sql);

        // Validate SQL with EXPLAIN
        try {
          await executeQuery(`EXPLAIN ${sql}`);
        } catch (explainError) {
          throw new Error(`SQL 验证失败: ${explainError instanceof Error ? explainError.message : '语法错误'}`);
        }

        // SQL validation successful - notify parent
        console.log('SQL validation successful, notifying parent...');
        if (onSqlValidated) {
          onSqlValidated(sql);
        }

        // Update node to indicate success
        updateNode(id, {
          ...data,
          executing: false,
          errors: [],
        });
      } catch (error) {
        console.error('Execute flow error:', error);
        updateNode(id, {
          ...data,
          executing: false,
          errors: [
            {
              id: `${id}-exec-error`,
              message: error instanceof Error ? error.message : '执行失败',
              severity: ValidationSeverity.ERROR,
              nodeId: id,
              nodeType: FlowNodeType.END,
            },
          ],
        });
        setErrorPanelOpen(true);
      }
    },
    [data, id, nodes, edges, updateNode, setErrorPanelOpen, executeQuery, isDBReady, onSqlValidated]
  );

  // Handle save (disabled)
  const handleSave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Save is disabled for now
    console.log('Save flow (disabled)');
  }, []);

  // Get operator config
  const operatorConfig = OPERATOR_CONFIG[data.operatorType];

  // Error count
  const errorCount = data.errors.length;

  return (
    <div
      style={{
        background: FLOW_COLORS.node.end.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : data.errors.length > 0 ? FLOW_COLORS.edge.error : FLOW_COLORS.node.end.border}`,
        borderRadius: '8px',
        padding: '12px 16px',
        minWidth: '200px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : data.errors.length > 0
          ? `0 0 0 2px ${FLOW_COLORS.edge.error}`
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
      }}
      className="end-node"
      onClick={handleClick}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{
          width: 8,
          height: 8,
          background: errorCount > 0 ? FLOW_COLORS.edge.error : FLOW_COLORS.edge.selected,
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
        <FlagOutlined style={{ marginRight: 8, color: operatorConfig.color }} />
        <span>结束</span>
        <Tag
          color={errorCount > 0 ? 'error' : 'success'}
          style={{ marginLeft: 'auto', fontSize: 10 }}
        >
          {errorCount > 0 ? (
            <Space>
              <ExclamationCircleOutlined />
              <span>{errorCount} 错误</span>
            </Space>
          ) : (
            '可执行'
          )}
        </Tag>
      </div>

      {/* Operator info */}
      <div
        style={{
          padding: '8px 12px',
          background: 'rgba(250, 140, 22, 0.1)',
          borderRadius: '4px',
          marginBottom: 12,
        }}
      >
        <Space>
          <span style={{ fontSize: 16 }}>{operatorConfig.icon}</span>
          <span style={{ color: '#d9d9d9', fontSize: 13 }}>
            {operatorConfig.name}
          </span>
        </Space>
        <div
          style={{
            fontSize: 11,
            color: '#8c8c8c',
            marginTop: 4,
          }}
        >
          {operatorConfig.description}
        </div>
      </div>

      {/* Action buttons */}
      <Space style={{ width: '100%', justifyContent: 'center' }}>
        <Tooltip title={errorCount > 0 ? '请先修复错误' : data.executing ? '执行中...' : '执行分析'}>
          <Badge count={errorCount} dot={errorCount > 0}>
            <Button
              type="primary"
              icon={data.executing ? <Spin indicator={<LoadingOutlined spin />} size="small" /> : <PlayCircleOutlined />}
              onClick={handleExecute}
              disabled={errorCount > 0 || data.executing}
              danger={errorCount > 0}
              loading={data.executing}
            >
              {data.executing ? '执行中' : '执行'}
            </Button>
          </Badge>
        </Tooltip>

        <Tooltip title="保存功能暂未开放">
          <Button
            icon={<SaveOutlined />}
            onClick={handleSave}
            disabled
          >
            保存
          </Button>
        </Tooltip>
      </Space>
    </div>
  );
};

export default EndNode;
