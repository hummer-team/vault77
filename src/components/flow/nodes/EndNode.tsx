/**
 * End Node Component
 * Final node for the analysis flow - shows execute button and flow status
 * Supports placeholder value filling before execution (Q15)
 */

import React, { useCallback, useState, useMemo } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Button, Tag, Space, Tooltip, Popover, notification } from 'antd';
import {
  PlayCircleOutlined,
  SaveOutlined,
  FlagOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { EndNodeData, ConditionGroupDefinitionNodeData, OperatorNodeData } from '../../../services/flow/types';
import { FLOW_COLORS, OPERATOR_CONFIG } from '../../../services/flow/constants';
import { StrategyFactory } from '../../../services/flow/strategyFactory';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import { ValidationSeverity, FlowNodeType, OperatorType, EndNodeTriggerSource } from '../../../services/flow/types';
import { ValueFillPanel } from '../panels/ValueFillPanel';
import { bizKernelService } from '../../../services/biz-kernels/bizKernelService';
import { buildFlowSummary, type FlowSummary } from '../../../services/flow/flowSummary';
import { TOKEN } from '../../../theme';

interface EndNodeProps {
  id: string;
  data: EndNodeData;
  selected?: boolean;
  onSqlValidated?: (sql: string, flowSummary?: FlowSummary) => void;
}

export const EndNode: React.FC<EndNodeProps> = ({ id, data, selected, onSqlValidated }) => {
  const setErrorPanelOpen = useFlowStore((state) => state.setErrorPanelOpen);
  const removeNode = useFlowStore((state) => state.removeNode);
  const updateNode = useFlowStore((state) => state.updateNode);
  const storeNodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const getAllPlaceholderValues = useFlowStore((state) => state.getAllPlaceholderValues);
  // Read triggerSource DIRECTLY from Zustand (same store that updateNode writes to).
  // This bypasses the data prop → FlowCanvas useEffect → setNodes sync chain,
  // which has a render-cycle lag inside React Flow's React.memo node wrapper.
  const triggerSource = useFlowStore((state) => {
    const endNode = state.nodes.find((n) => n.id === id);
    return (endNode?.data as EndNodeData | undefined)?.triggerSource;
  });
  const { executeQuery, isDBReady } = useDuckDBContext();

  // State for value fill panel
  const [valueFillPanelOpen, setValueFillPanelOpen] = useState(false);

  // Collect all placeholders from condition definition nodes
  const allPlaceholders = useMemo(() => {
    const placeholders: string[] = [];
    storeNodes.forEach((node) => {
      if (node.type === 'conditionGroupDefinition') {
        const nodeData = node.data as ConditionGroupDefinitionNodeData;
        nodeData.conditions.forEach((cond) => {
          placeholders.push(cond.placeholder);
        });
      }
    });
    return placeholders;
  }, [storeNodes]);

  // Check if there are unfilled placeholders
  const hasUnfilledPlaceholders = useMemo(() => {
    const placeholderValues = getAllPlaceholderValues();
    return allPlaceholders.some((p) => placeholderValues[p] === undefined);
  }, [allPlaceholders, getAllPlaceholderValues]);

  /**
   * Dynamically resolve operatorType from the current OperatorNode's kernel selection.
   * Uses a precise kernelName → OperatorType mapping for all UDF data-clean kernels,
   * replacing the coarse `isDataCleanKernel()` check that mapped everything to UDF_REPLACE_COLUMN.
   */
  const KERNEL_OPERATOR_MAP: Record<string, OperatorType> = {
    fn_ecom_data_clean_replace_spec_column_value: OperatorType.UDF_REPLACE_COLUMN,
    fn_ecom_data_clean_up_lower:                  OperatorType.UDF_UP_LOWER,
    fn_ecom_data_clean_number_precision_control:  OperatorType.UDF_FORMAT_NUMBER,
    fn_ecom_data_clean_data_flag:                 OperatorType.UDF_FLAG_SPEC,
    fn_ecom_data_format_date:                     OperatorType.UDF_FORMAT_DATE,
    fn_basic_statis:                              OperatorType.BASIC_STATS,
    fn_ecom_order_distribution:                   OperatorType.ORDER_DISTRIBUTION,
    fn_ecom_repurchase_cycle:                     OperatorType.REPURCHASE_CYCLE,
  };

  const resolvedOperatorType = useMemo((): OperatorType => {
    const operatorNode = storeNodes.find((n) => n.type === FlowNodeType.OPERATOR);
    const kernelName = (operatorNode?.data as OperatorNodeData | undefined)?.kernelName;

    if (kernelName) {
      if (KERNEL_OPERATOR_MAP[kernelName]) {
        return KERNEL_OPERATOR_MAP[kernelName];
      }
      const kernel = bizKernelService.getKernelByName(kernelName);
      switch (kernel?.category) {
        case '风险风控': return OperatorType.ANOMALY;
        case '用户增长': return OperatorType.CLUSTERING;
        default: return OperatorType.ASSOCIATION;
      }
    }
    return data.operatorType;
  }, [storeNodes, data.operatorType]);

  // Button text: 'direct' → "直接执行", else → "填充值并执行"
  // No UDF exception — UDF flows can also have conditions and need value filling.
  const shouldExecuteDirectly = triggerSource === EndNodeTriggerSource.DIRECT;

  // Handle execute after value filling — returns success/error so ValueFillPanel can stay open on failure
  const executeFlow = useCallback(
    async (): Promise<{ success: boolean; error?: string }> => {
      // Set executing state
      updateNode(id, {
        ...data,
        executing: true,
        errors: [],
      });

      try {
        const strategy = StrategyFactory.getStrategy(resolvedOperatorType);

        const validationErrors = strategy.validate(storeNodes, edges);
        if ((validationErrors?.length || 0) > 0) {
          updateNode(id, {
            ...data,
            executing: false,
            errors: validationErrors,
          });
          setErrorPanelOpen(true);
          return { success: false, error: validationErrors[0]?.message ?? '流程配置校验失败' };
        }

        if (!isDBReady) {
          throw new Error('DuckDB not initialized. Please wait for database to be ready.');
        }

        const tableNodes = storeNodes.filter((n) => n.type === 'table');
        for (const tableNode of tableNodes) {
          const tableName = (tableNode.data as { tableName: string }).tableName;
          try {
            await executeQuery(`SELECT 1 FROM "${tableName}" LIMIT 1`);
          } catch {
            throw new Error(`表 "${tableName}" 不存在于数据库中。请重新上传文件或选择正确的表。`);
          }
        }

        const placeholderValues = getAllPlaceholderValues();
        const sql = strategy.buildSql(storeNodes, edges, placeholderValues);

        try {
          await executeQuery(`EXPLAIN ${sql}`);
        } catch (explainError) {
          throw new Error(`SQL 验证失败: ${explainError instanceof Error ? explainError.message : '语法错误'}`);
        }

        if (onSqlValidated) {
          const flowSummary = buildFlowSummary(storeNodes, edges);
          onSqlValidated(sql, flowSummary);
        }

        updateNode(id, {
          ...data,
          executing: false,
          errors: [],
        });

        return { success: true };
      } catch (error) {
        console.error('Execute flow error:', error);
        const message = error instanceof Error ? error.message : '执行失败';
        updateNode(id, {
          ...data,
          executing: false,
          errors: [
            {
              id: `${id}-exec-error`,
              message,
              severity: ValidationSeverity.ERROR,
              nodeId: id,
              nodeType: FlowNodeType.END,
            },
          ],
        });
        setErrorPanelOpen(true);
        notification.error({
          message: '执行失败',
          description: message,
          duration: 0,
          placement: 'topRight',
        });
        return { success: false, error: message };
      }
    },
    [data, id, storeNodes, edges, updateNode, setErrorPanelOpen, executeQuery, isDBReady, onSqlValidated, getAllPlaceholderValues, resolvedOperatorType]
  );

  // Handle value fill panel close
  const handleValueFillClose = useCallback((e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    setValueFillPanelOpen(false);
  }, []);

  // Handle execute from ValueFillPanel — close drawer only on success
  const handleValueFillExecute = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const result = await executeFlow();
    if (result.success) {
      setValueFillPanelOpen(false);
    }
    return result;
  }, [executeFlow]);

  // Handle preview from ValueFillPanel — runs COUNT(*) on the full result SQL
  const handleValueFillPreview = useCallback(async (): Promise<number | null> => {
    try {
      const strategy = StrategyFactory.getStrategy(resolvedOperatorType);
      const placeholderValues = getAllPlaceholderValues();
      const sql = strategy.buildSql(storeNodes, edges, placeholderValues);
      const previewSql = `SELECT COUNT(*) AS __count FROM (${sql}) AS __preview`;
      const result = await executeQuery(previewSql);
      const raw = result.data[0]?.__count ?? Object.values(result.data[0] ?? {})[0];
      return raw !== undefined && raw !== null ? Number(raw) : null;
    } catch (error) {
      console.error('[EndNode] Preview failed:', error);
      return null;
    }
  }, [executeQuery, storeNodes, edges, getAllPlaceholderValues, resolvedOperatorType]);

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

  // Handle click - execute directly (for DIRECT trigger) or open execution params panel
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (shouldExecuteDirectly) {
      executeFlow();
      return;
    }
    setValueFillPanelOpen(true);
  }, [shouldExecuteDirectly, executeFlow]);

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
          : `var(--vm-flow-shadow)`,
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
        handleStyle={{ backgroundColor: '#CA8A04', borderColor: 'var(--vm-border-mid)', width: 10, height: 10 }}
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
          color: TOKEN.textPrimary,
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
          color: 'var(--vm-color-error)',
          zIndex: 10,
        }}
      />

      {/* Status info */}
      <div
        style={{
          padding: '8px 12px',
          background: hasErrors ? 'var(--vm-flow-error-light)' : 'var(--vm-flow-success-light)',
          borderRadius: '4px',
          marginBottom: 12,
        }}
      >
        <Space>
          <span style={{ fontSize: 16 }}>{hasErrors ? '⚠️' : '✓'}</span>
          <span style={{ color: 'var(--vm-text-light)', fontSize: 13 }}>
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
            ? (
              <Popover
                content={
                  <ul style={{ margin: 0, paddingLeft: 16, maxWidth: 320 }}>
                    {(data.errors ?? []).map((e, i) => (
                      <li key={`${e.nodeId}-${i}`} style={{ color: 'var(--vm-color-error)', fontSize: 12 }}>
                        {e.message}
                      </li>
                    ))}
                  </ul>
                }
                title="错误详情"
                trigger="click"
                placement="top"
              >
                <span style={{ cursor: 'pointer', color: 'var(--vm-color-error)', fontSize: 12 }}>
                  存在 {errorCount} 个错误，点击查看详情
                </span>
              </Popover>
            )
            : (
              <span style={{ color: 'var(--vm-flow-success)', fontSize: 12 }}>流程配置正确，可以执行</span>
            )}
        </div>
      </div>

      {/* Action buttons - execute is handled via execution params panel or directly */}
      <Space style={{ width: '100%', justifyContent: 'center' }}>
        <Tooltip title={shouldExecuteDirectly ? '直接执行流程' : '填写执行参数后运行'}>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              if (shouldExecuteDirectly) {
                executeFlow();
              } else {
                setValueFillPanelOpen(true);
              }
            }}
            danger={errorCount > 0}
          >
            {shouldExecuteDirectly ? '执行' : hasUnfilledPlaceholders ? '填写参数并执行' : '执行'}
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

      {/* Value Fill Panel — only shown for condition-based execution (non-UDF, non-direct) */}
      {!shouldExecuteDirectly && (
        <ValueFillPanel
          open={valueFillPanelOpen}
          onClose={handleValueFillClose}
          onExecute={handleValueFillExecute}
          onPreview={handleValueFillPreview}
        />
      )}
    </div>
  );
};

export default EndNode;
