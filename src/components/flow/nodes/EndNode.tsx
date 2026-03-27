/**
 * End Node Component
 * Final node for the analysis flow - shows execute button and flow status
 * Supports placeholder value filling before execution (Q15)
 */

import React, { useCallback, useState, useMemo } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Button, Tag, Space, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  SaveOutlined,
  FlagOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { EndNodeData, ConditionDefinitionNodeData, OperatorNodeData } from '../../../services/flow/types';
import { FLOW_COLORS, OPERATOR_CONFIG } from '../../../services/flow/constants';
import { StrategyFactory } from '../../../services/flow/strategyFactory';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import { ValidationSeverity, FlowNodeType, OperatorType, EndNodeTriggerSource } from '../../../services/flow/types';
import { ValueFillPanel } from '../panels/ValueFillPanel';
import { duckDBUdfService } from '../../../services/duckDBUdfService';
import { bizKernelService } from '../../../services/biz-kernels/bizKernelService';

interface EndNodeProps {
  id: string;
  data: EndNodeData;
  selected?: boolean;
  onSqlValidated?: (sql: string) => void;
}

export const EndNode: React.FC<EndNodeProps> = ({ id, data, selected, onSqlValidated }) => {
  const setErrorPanelOpen = useFlowStore((state) => state.setErrorPanelOpen);
  const removeNode = useFlowStore((state) => state.removeNode);
  const updateNode = useFlowStore((state) => state.updateNode);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const getAllPlaceholderValues = useFlowStore((state) => state.getAllPlaceholderValues);
  const { executeQuery, isDBReady } = useDuckDBContext();

  // State for value fill panel
  const [valueFillPanelOpen, setValueFillPanelOpen] = useState(false);

  // Collect all placeholders from condition definition nodes
  const allPlaceholders = useMemo(() => {
    const placeholders: string[] = [];
    nodes.forEach((node) => {
      if (node.type === 'conditionDefinition') {
        const nodeData = node.data as ConditionDefinitionNodeData;
        nodeData.conditions.forEach((cond) => {
          placeholders.push(cond.placeholder);
        });
      }
    });
    return placeholders;
  }, [nodes]);

  // Check if there are unfilled placeholders
  const hasUnfilledPlaceholders = useMemo(() => {
    const placeholderValues = getAllPlaceholderValues();
    return allPlaceholders.some((p) => placeholderValues[p] === undefined);
  }, [allPlaceholders, getAllPlaceholderValues]);

  /**
   * Dynamically resolve operatorType from the current OperatorNode's kernel selection.
   * This ensures the correct strategy is used even when the user changes the kernel
   * after the EndNode was created, without relying on potentially stale data.operatorType.
   */
  const resolvedOperatorType = useMemo((): OperatorType => {
    const operatorNode = nodes.find((n) => n.type === FlowNodeType.OPERATOR);
    const kernelName = (operatorNode?.data as OperatorNodeData | undefined)?.kernelName;

    if (kernelName) {
      // UDF data-cleaning kernels
      if (duckDBUdfService.isDataCleanKernel(kernelName)) {
        return OperatorType.UDF_REPLACE_COLUMN;
      }
      // Map kernel category to OperatorType
      const kernel = bizKernelService.getKernelByName(kernelName);
      switch (kernel?.category) {
        case '风险风控': return OperatorType.ANOMALY;
        case '用户增长': return OperatorType.CLUSTERING;
        default: return OperatorType.ASSOCIATION;
      }
    }
    // Fallback to stored value if no OperatorNode found
    return data.operatorType;
  }, [nodes, data.operatorType]);

  // Whether this EndNode was created via "直接执行" — skips condition filling
  const isDirectExecution = data.triggerSource === EndNodeTriggerSource.DIRECT;

  // Handle execute after value filling
  const executeFlow = useCallback(
    async () => {
      if ((data.errors?.length || 0) > 0) {
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
        // Resolve strategy from current OperatorNode kernel (dynamic, not stale data.operatorType)
        const strategy = StrategyFactory.getStrategy(resolvedOperatorType);

        // Validate flow configuration
        const validationErrors = strategy.validate(nodes, edges);
        if ((validationErrors?.length || 0) > 0) {
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

        // Build SQL query with placeholder values - get fresh values from store
        const placeholderValues = getAllPlaceholderValues();
        console.log('[EndNode.executeFlow] About to build SQL with placeholderValues:', placeholderValues);
        const sql = strategy.buildSql(nodes, edges, placeholderValues);
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
    [data, id, nodes, edges, updateNode, setErrorPanelOpen, executeQuery, isDBReady, onSqlValidated, getAllPlaceholderValues, resolvedOperatorType]
  );

  // Handle value fill panel close
  const handleValueFillClose = useCallback((e?: React.MouseEvent | React.KeyboardEvent) => {
    console.log('[EndNode] handleValueFillClose called, event:', e?.type);
    // Prevent any potential event bubbling issues
    if (e) {
      e.stopPropagation();
    }
    setValueFillPanelOpen(false);
    console.log('[EndNode] setValueFillPanelOpen(false) called, state should update');
  }, []);

  // Handle value fill and execute
  const handleValueFillExecute = useCallback(() => {
    console.log('[EndNode] handleValueFillExecute called');
    setValueFillPanelOpen(false);
    console.log('[EndNode] setValueFillPanelOpen(false) called, will execute flow');
    executeFlow();
  }, [executeFlow]);

  // Handle save (disabled)
  const handleSave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Save is disabled for now
    console.log('Save flow (disabled)');
  }, []);

  // Handle delete
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    removeNode(id);
  }, [id, removeNode]);

  // Handle click - open value fill panel, or execute directly for DIRECT trigger source
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectExecution) {
      console.log('[EndNode] Direct execution — skipping ValueFillPanel');
      executeFlow();
      return;
    }
    console.log('[EndNode] Node clicked, opening value fill panel');
    setValueFillPanelOpen(true);
  }, [isDirectExecution, executeFlow]);

  // Get operator config
  const operatorConfig = OPERATOR_CONFIG[data.operatorType];

  // Error count
  const errorCount = data.errors?.length || 0;
  const hasErrors = errorCount > 0;
  if (hasErrors) {
    console.warn(`[EndNode] Node ${id} has ${data.operatorType} errors:`, data.errors);
  }
  return (
    <div
      style={{
        background: FLOW_COLORS.node.end.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : hasErrors ? FLOW_COLORS.edge.error : FLOW_COLORS.node.end.border}`,
        borderRadius: '8px',
        padding: '12px 16px',
        minWidth: '200px',
        minHeight: '120px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : hasErrors
          ? `0 0 0 2px ${FLOW_COLORS.edge.error}`
          : `0 2px 8px rgba(0, 0, 0, 0.3)`,
        position: 'relative',
      }}
      className="end-node"
      onClick={handleClick}
    >
      {/* Node Resizer - only show when selected */}
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={120}
        maxWidth={350}
        maxHeight={400}
        lineStyle={{ borderColor: '#CA8A04', borderWidth: 2 }}
        handleStyle={{ backgroundColor: '#CA8A04', borderColor: '#fff', width: 10, height: 10 }}
      />
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

      {/* Delete button — absolutely positioned top-right, always visible */}
      <Button
        type="text"
        size="small"
        icon={<DeleteOutlined />}
        onClick={handleDelete}
        danger
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          color: '#ff4d4f',
          zIndex: 10,
        }}
      />

      {/* Status info */}
      <div
        style={{
          padding: '8px 12px',
          background: hasErrors ? 'rgba(255, 77, 79, 0.1)' : 'rgba(82, 196, 26, 0.1)',
          borderRadius: '4px',
          marginBottom: 12,
        }}
      >
        <Space>
          <span style={{ fontSize: 16 }}>{hasErrors ? '⚠️' : '✓'}</span>
          <span style={{ color: '#d9d9d9', fontSize: 13 }}>
            {hasErrors ? '配置异常' : '配置完整'}
          </span>
        </Space>
        <div
          style={{
            fontSize: 11,
            color: hasErrors ? '#ff4d4f' : '#8c8c8c',
            marginTop: 4,
          }}
        >
          {hasErrors 
            ? `存在 ${errorCount} 个错误，请修复后执行` 
            : '流程配置正确，可以执行'}
        </div>
      </div>

      {/* Action buttons - only show save button, execute is handled via ValueFillPanel */}
      <Space style={{ width: '100%', justifyContent: 'center' }}>
        <Tooltip title={isDirectExecution ? '直接执行流程' : '点击节点填充条件值并执行'}>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              if (isDirectExecution) {
                executeFlow();
              } else {
                setValueFillPanelOpen(true);
              }
            }}
            disabled={errorCount > 0}
            danger={errorCount > 0}
          >
            {isDirectExecution ? '直接执行' : hasUnfilledPlaceholders ? '填充值并执行' : '查看/修改条件值'}
          </Button>
        </Tooltip>

        <Tooltip title="保存为模板">
          <Button
            icon={<SaveOutlined />}
            onClick={handleSave}
          >
            保存为模板
          </Button>
        </Tooltip>
      </Space>

      {/* Value Fill Panel — only shown for condition-based execution */}
      {!isDirectExecution && (
        <ValueFillPanel
          open={valueFillPanelOpen}
          onClose={handleValueFillClose}
          onExecute={handleValueFillExecute}
        />
      )}
    </div>
  );
};

export default EndNode;
