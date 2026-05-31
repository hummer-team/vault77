/**
 * Select Node Component
 * Displays selected fields for output with optional aggregation.
 * When linked to a UDF data-cleaning operator, routes click to the appropriate
 * configuration drawer instead of the standard detail panel.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Button, Tag, Space, Tooltip, List } from 'antd';
import {
  TableOutlined,
  DeleteOutlined,
  EditOutlined,
  FunctionOutlined,
  SettingOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type {
  SelectNodeData,
  ReplaceRule,
  UpLowerConfig,
  FormatNumberConfig,
  FlagSpecConfig,
  FormatDateConfig,
  OperatorNodeData,
  BasicStatsConfig,
  TableNodeData,
  OrderDistributionConfig,
  RepurchaseCycleConfig,
  ArbitrageAnalyzeConfig,
  InventoryForecastConfig,
  MarketBasketConfig,
  AbnormalAmountConfig,
  RfmProfileConfig,
  OrderChannelAnalysisConfig,
  OrderFunnelAnalysisConfig,
} from '../../../services/flow/types';
import { OperatorType, FlowNodeType } from '../../../services/flow/types';
import { FLOW_COLORS } from '../../../services/flow/constants';
import {
  executeSelectNodeClickStrategy,
  shouldRenderUdfDrawer,
  resolveSelectNodePanelType,
  SelectNodePanelType,
} from '../../../services/flow/bizKernelsBuilderStrategies';
import ReplaceColumnDrawer from '../udf/ReplaceColumnDrawer';
import UpLowerDrawer from '../udf/UpLowerDrawer';
import FormatNumberDrawer from '../udf/FormatNumberDrawer';
import FlagSpecDrawer from '../udf/FlagSpecDrawer';
import FormatDateDrawer from '../udf/FormatDateDrawer';
import { BasicStatsDrawer } from '../udf/BasicStatsDrawer';
import { OrderDistributionDrawer } from '../udf/OrderDistributionDrawer';
import { RepurchaseCycleDrawer } from '../udf/RepurchaseCycleDrawer';
import { ArbitrageAnalyzeDrawer } from '../udf/ArbitrageAnalyzeDrawer';
import { InventoryForecastDrawer } from '../udf/InventoryForecastDrawer';
import { MarketBasketDrawer } from '../udf/MarketBasketDrawer';
import { OrderAbnormalAmountDrawer } from '../udf/OrderAbnormalAmountDrawer';
import RfmDrawer from '../udf/RfmDrawer';
import { OrderChannelAnalysisDrawer } from '../udf/OrderChannelAnalysisDrawer';
import { OrderFunnelAnalysisDrawer } from '../udf/OrderFunnelAnalysisDrawer';
import { NodeNextButton } from '../shared/NodeNextButton';
import { useUpstreamJoinedTables } from '../hooks/useUpstreamJoinedTables';
import { bizKernelService } from '../../../services/biz-kernels/bizKernelService';

interface SelectNodeProps {
  id: string;
  data: SelectNodeData;
  selected?: boolean;
}

// Aggregation function labels
const AGG_FUNCTION_LABELS: Record<string, string> = {
  SUM: '求和',
  COUNT: '计数',
  AVG: '平均',
  MIN: '最小',
  MAX: '最大',
};

// Aggregation function colors
const AGG_FUNCTION_COLORS: Record<string, string> = {
  SUM: 'var(--vm-flow-info)',
  COUNT: 'var(--vm-flow-success)',
  AVG: 'var(--vm-flow-warning)',
  MIN: 'var(--vm-flow-purple)',
  MAX: 'var(--vm-flow-pink)',
};

export const SelectNode: React.FC<SelectNodeProps> = ({
  id,
  data,
  selected,
}) => {
  const removeNode = useFlowStore((state) => state.removeNode);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const updateNode = useFlowStore((state) => state.updateNode);
  const storeNodes = useFlowStore((state) => state.nodes);

  // Compute upstream configured joined tables via shared hook
  const joinedTables = useUpstreamJoinedTables(id);

  // UDF drawer visibility state
  const [udfDrawerOpen, setUdfDrawerOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const handleMouseEnter = useCallback(() => setIsHovering(true), []);
  const handleMouseLeave = useCallback(() => setIsHovering(false), []);

  // Whether this node is linked to a UDF data-cleaning operator
  const isUdfNode = !!data.udfFunctionName;

  /**
   * Resolve whether the current operator is ASSOCIATION (关联查询).
   * ASSOCIATION operators build their own JOIN SQL — the SelectNode's column list is irrelevant.
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
    fn_ecom_arbitrage_analyze:                    OperatorType.ARBITRAGE_ANALYZE,
    fn_ecom_inventory_forecast:                   OperatorType.INVENTORY_FORECAST,
    fn_ecom_market_basket:                        OperatorType.MARKET_BASKET,
    fn_ecom_abnormal_amount:                      OperatorType.ABNORMAL_AMOUNT,
    fn_ecom_rfm_profile:                          OperatorType.RFM_PROFILE,
    fn_ecom_order_channel_analysis:               OperatorType.ORDER_CHANNEL_ANALYSIS,
    fn_ecom_order_funnel_analysis:                OperatorType.ORDER_FUNNEL_ANALYSIS,
  };
  const isAssociationOperator = useMemo(() => {
    if (isUdfNode) return false;
    const operatorNode = storeNodes.find((n) => n.type === FlowNodeType.OPERATOR);
    const kernelName = (operatorNode?.data as OperatorNodeData | undefined)?.kernelName;
    if (!kernelName) return false;
    if (KERNEL_OPERATOR_MAP[kernelName]) return false;  // known UDF → not ASSOCIATION
    const kernel = bizKernelService.getKernelByName(kernelName);
    return kernel?.category !== '风险风控' && kernel?.category !== '用户增长';
  }, [isUdfNode, storeNodes]);

  // Handle delete
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeNode(id);
    },
    [id, removeNode]
  );

  /**
   * Click routing delegated to bizKernelsBuilderStrategies:
   * - UDF replace operator → open ReplaceColumnDrawer
   * - Standard / other kernels → open NodeDetailPanel
   */
  const handleClick = useCallback(() => {
    executeSelectNodeClickStrategy(data.udfFunctionName, {
      openUdfDrawer: () => setUdfDrawerOpen(true),
      openDetailPanel: () => setSelectedNode(id),
    });
  }, [data.udfFunctionName, id, setSelectedNode]);

  /** Called when user confirms rules in ReplaceColumnDrawer */
  const handleUdfConfirm = useCallback(
    (rules: ReplaceRule[], outputColumns: string[]) => {
      updateNode(id, { replacementRules: rules, outputColumns } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
      // Propagate operatorType to EndNode so the correct strategy is used
      const endNode = useFlowStore.getState().nodes.find((n) => n.type === 'end');
      if (endNode) {
        updateNode(endNode.id, { operatorType: OperatorType.UDF_REPLACE_COLUMN } as Record<string, unknown>);
      }
    },
    [id, updateNode]
  );

  const handleUpLowerConfirm = useCallback(
    (config: UpLowerConfig, outputColumns: string[]) => {
      updateNode(id, { upLowerConfig: config, outputColumns } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleFormatNumberConfirm = useCallback(
    (config: FormatNumberConfig, outputColumns: string[]) => {
      updateNode(id, { formatNumberConfig: config, outputColumns } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleFlagSpecConfirm = useCallback(
    (config: FlagSpecConfig, outputColumns: string[]) => {
      updateNode(id, { flagSpecConfig: config, outputColumns } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleFormatDateConfirm = useCallback(
    (config: FormatDateConfig, outputColumns: string[]) => {
      updateNode(id, { formatDateConfig: config, outputColumns } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleBasicStatsConfirm = useCallback(
    (config: BasicStatsConfig) => {
      updateNode(id, { basicStatsConfig: config } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleOrderDistConfirm = useCallback(
    (config: OrderDistributionConfig) => {
      updateNode(id, { orderDistConfig: config } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleRepurchaseCycleConfirm = useCallback(
    (config: RepurchaseCycleConfig) => {
      updateNode(id, { repurchaseCycleConfig: config } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleArbitrageAnalyzeConfirm = useCallback(
    (config: ArbitrageAnalyzeConfig) => {
      updateNode(id, { arbitrageAnalyzeConfig: config } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleInventoryForecastConfirm = useCallback(
    (config: InventoryForecastConfig) => {
      updateNode(id, { inventoryForecastConfig: config } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleMarketBasketConfirm = useCallback(
    (config: MarketBasketConfig) => {
      updateNode(id, { marketBasketConfig: config } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleAbnormalAmountConfirm = useCallback(
    (config: AbnormalAmountConfig) => {
      updateNode(id, { abnormalAmountConfig: config } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleRfmProfileConfirm = useCallback(
    (config: RfmProfileConfig) => {
      updateNode(id, { rfmProfileConfig: config } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleOrderChannelAnalysisConfirm = useCallback(
    (config: OrderChannelAnalysisConfig) => {
      updateNode(id, { orderChannelAnalysisConfig: config } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  const handleOrderFunnelAnalysisConfirm = useCallback(
    (config: OrderFunnelAnalysisConfig) => {
      updateNode(id, { orderFunnelAnalysisConfig: config } as Partial<SelectNodeData>);
      setUdfDrawerOpen(false);
    },
    [id, updateNode]
  );

  // Derive columns (with full field info) from the first upstream joined table
  const allFields = useMemo(() => {
    const tableName = joinedTables[0];
    if (!tableName) return [];
    const tableNode = storeNodes.find(
      (n) => n.type === FlowNodeType.TABLE && (n.data as TableNodeData).tableName === tableName
    );
    return (tableNode?.data as TableNodeData | undefined)?.fields ?? [];
  }, [joinedTables, storeNodes]);

  // Extract column names for drawers that only need names
  const columnNames = useMemo(() => allFields.map(f => f.name), [allFields]);

  // Use full field objects for OrderDistributionDrawer (needs type filtering)
  const orderDistColumns = allFields;

  // UDF nodes are configured when any relevant config key has been filled
  const isUdfConfigured = isUdfNode && (() => {
    const panelType = resolveSelectNodePanelType(data.udfFunctionName);
    switch (panelType) {
      case SelectNodePanelType.REPLACE_COLUMN_DRAWER:
        return (data.replacementRules?.length ?? 0) > 0 &&
          data.replacementRules?.some((r) => r.sourceTable && r.targetColumn?.length > 0);
      case SelectNodePanelType.UP_LOWER_DRAWER:
        return (data.upLowerConfig?.cols?.length ?? 0) > 0;
      case SelectNodePanelType.FORMAT_NUMBER_DRAWER:
        return Object.keys(data.formatNumberConfig?.colsConfig ?? {}).length > 0;
      case SelectNodePanelType.FLAG_SPEC_DRAWER:
        return Object.keys(data.flagSpecConfig?.flagsConfig ?? {}).length > 0;
      case SelectNodePanelType.FORMAT_DATE_DRAWER:
        return Object.keys(data.formatDateConfig?.colConfigJson ?? {}).length > 0;
      case SelectNodePanelType.BASIC_STATS_DRAWER:
        return !!(data.basicStatsConfig && data.basicStatsConfig.aggFields.length > 0);
      case SelectNodePanelType.ORDER_DISTRIBUTION_DRAWER:
        return !!(data.orderDistConfig?.subType);
      case SelectNodePanelType.REPURCHASE_CYCLE_DRAWER:
        return !!(data.repurchaseCycleConfig?.userIdCol);
      case SelectNodePanelType.ARBITRAGE_ANALYZE_DRAWER:
        return !!(data.arbitrageAnalyzeConfig?.fieldMapping?.orderIdCol);
      case SelectNodePanelType.INVENTORY_FORECAST_DRAWER:
        return !!(data.inventoryForecastConfig?.skuCol);
      case SelectNodePanelType.MARKET_BASKET_DRAWER:
        return !!(data.marketBasketConfig?.orderIdCol && data.marketBasketConfig?.productIdCol);
      case SelectNodePanelType.ABNORMAL_AMOUNT_DRAWER:
        return !!(data.abnormalAmountConfig?.fieldMapping?.orderIdCol &&
                  data.abnormalAmountConfig?.fieldMapping?.amountCol &&
                  data.abnormalAmountConfig?.fieldMapping?.originalAmountCol);
      case SelectNodePanelType.RFM_PROFILE_DRAWER:
        return !!(data.rfmProfileConfig?.userIdColumn &&
                  data.rfmProfileConfig?.orderTimeColumn &&
                  data.rfmProfileConfig?.amountColumn);
      case SelectNodePanelType.ORDER_CHANNEL_ANALYSIS_DRAWER:
        return !!(data.orderChannelAnalysisConfig?.dimensionCol &&
                  data.orderChannelAnalysisConfig?.orderIdCol);
      case SelectNodePanelType.ORDER_FUNNEL_ANALYSIS_DRAWER:
        return !!(data.orderFunnelAnalysisConfig?.orderIdCol &&
                  data.orderFunnelAnalysisConfig?.steps?.order?.colName);
      default:
        return false;
    }
  })();

  const hasFields = isUdfNode
    ? isUdfConfigured
    : (isAssociationOperator || data.fields.length > 0 || data.selectAll);

  return (
    <>
    <div
      style={{
        background: FLOW_COLORS.node.select.background,
        border: `2px solid ${selected ? FLOW_COLORS.edge.selected : hasFields ? FLOW_COLORS.node.select.border : '#ff4d4f'}`,
        borderRadius: '8px',
        minWidth: '200px',
        minHeight: '80px',
        boxShadow: selected
          ? `0 0 0 2px ${FLOW_COLORS.edge.selected}`
          : 'var(--vm-flow-shadow)',
        overflow: 'visible',
        position: 'relative',
      }}
      className="select-node"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Node Resizer - only show when selected */}
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={80}
        maxWidth={400}
        maxHeight={400}
        lineStyle={{ borderColor: 'var(--vm-flow-success)', borderWidth: 2 }}
        handleStyle={{ backgroundColor: 'var(--vm-flow-success)', borderColor: 'var(--vm-border-mid)', width: 10, height: 10 }}
      />
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{
          width: 8,
          height: 8,
          background: FLOW_COLORS.node.select.border,
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
          background: FLOW_COLORS.node.select.border,
          border: '2px solid #fff',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          background: selected ? 'var(--vm-flow-success-light)' : 'transparent',
          borderBottom: hasFields ? '1px solid #303030' : 'none',
        }}
      >
        {isUdfNode
          ? <SettingOutlined style={{ color: 'var(--vm-flow-purple)', marginRight: 8 }} />
          : <TableOutlined style={{ color: FLOW_COLORS.node.select.border, marginRight: 8 }} />
        }

        <span
          style={{
            flex: 1,
            color: 'var(--vm-text-primary)',
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          选择列
        </span>

        {/* UDF configured indicator */}
        {isUdfNode && isUdfConfigured && (
          <Tag color="success" style={{ margin: 0, marginRight: 8, fontSize: 10 }}>
            已配置 {data.replacementRules?.length} 条
          </Tag>
        )}

        {/* Standard field count badge */}
        {!isUdfNode && !data.selectAll && data.fields.length > 0 && (
          <Tag color="success" style={{ margin: 0, marginRight: 8 }}>
            {data.fields.length} 列
          </Tag>
        )}

        {!isUdfNode && data.selectAll && (
          <Tag color="success" style={{ margin: 0, marginRight: 8 }}>
            全部
          </Tag>
        )}

        {/* Actions */}
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            style={{ color: 'var(--vm-text-helper)' }}
          />
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            danger
            style={{ color: 'var(--vm-color-error)' }}
          />
        </Space>
      </div>

      {/* UDF configured: summary only — details are in the drawer */}

      {/* UDF unconfigured state */}
      {isUdfNode && !isUdfConfigured && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            background: 'var(--vm-flow-error-light)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--vm-color-error)' }}>
            点击配置替换规则
          </span>
        </div>
      )}

      {/* Standard: Selected fields list */}
      {!isUdfNode && !isAssociationOperator && !data.selectAll && data.fields.length > 0 && (
        <div
          style={{
            padding: '8px',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          <List
            size="small"
            dataSource={data.fields}
            renderItem={(field) => (
              <div
                style={{
                  padding: '6px 8px',
                  marginBottom: 4,
                  background: 'var(--vm-surface-hover)',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {/* Aggregation function */}
                {field.aggregate && (
                  <Tooltip title={AGG_FUNCTION_LABELS[field.aggregate]}>
                    <Tag
                      icon={<FunctionOutlined />}
                      color={AGG_FUNCTION_COLORS[field.aggregate]}
                      style={{ margin: 0, marginRight: 8, fontSize: 10 }}
                    >
                      {field.aggregate}
                    </Tag>
                  </Tooltip>
                )}

                {/* Table and field name */}
                <div style={{ flex: 1, fontSize: 12 }}>
                  <Tag color="default" style={{ fontSize: 10, marginRight: 4 }}>
                    {field.tableName}
                  </Tag>
                  <span style={{ color: 'var(--vm-text-light)' }}>{field.fieldName}</span>
                </div>

                {/* Alias */}
                {field.alias && (
                  <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>
                    as {field.alias}
                  </Tag>
                )}
              </div>
            )}
          />
        </div>
      )}

      {/* Standard: Select all message */}
      {!isUdfNode && !isAssociationOperator && data.selectAll && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            color: 'var(--vm-flow-success)',
            fontSize: 12,
          }}
        >
          已选择所有字段
        </div>
      )}

      {/* Association operator: outputs all columns from the join */}
      {!isUdfNode && isAssociationOperator && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            color: 'var(--vm-flow-success)',
            fontSize: 12,
          }}
        >
          <LinkOutlined style={{ marginRight: 6 }} />
          关联查询，输出全部列
        </div>
      )}

      {/* Standard: Empty state */}
      {!isUdfNode && !isAssociationOperator && !data.selectAll && data.fields.length === 0 && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            background: 'var(--vm-flow-error-light)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--vm-color-error)' }}>
            请至少选择一个字段
          </span>
        </div>
      )}
      <NodeNextButton nodeId={id} nodeType={FlowNodeType.SELECT} visible={isHovering} />
    </div>

    {/* UDF Drawers — rendered based on udfFunctionName routing */}
    {shouldRenderUdfDrawer(data.udfFunctionName) && (() => {
      const panelType = resolveSelectNodePanelType(data.udfFunctionName);
      // Lookup kernel metadata for dynamic title/subtitle in UDF Drawers
      const kernelMeta = data.udfFunctionName
        ? bizKernelService.getKernelByName(data.udfFunctionName)
        : undefined;
      switch (panelType) {
        case SelectNodePanelType.REPLACE_COLUMN_DRAWER:
          return (
            <ReplaceColumnDrawer
              open={udfDrawerOpen}
              onClose={() => setUdfDrawerOpen(false)}
              onConfirm={handleUdfConfirm}
              initialRules={data.replacementRules}
              initialOutputColumns={data.outputColumns}
              joinedTables={joinedTables}
            />
          );
        case SelectNodePanelType.UP_LOWER_DRAWER:
          return (
            <UpLowerDrawer
              open={udfDrawerOpen}
              onClose={() => setUdfDrawerOpen(false)}
              onConfirm={handleUpLowerConfirm}
              initialConfig={data.upLowerConfig}
              initialOutputColumns={data.outputColumns}
              joinedTables={joinedTables}
            />
          );
        case SelectNodePanelType.FORMAT_NUMBER_DRAWER:
          return (
            <FormatNumberDrawer
              open={udfDrawerOpen}
              onClose={() => setUdfDrawerOpen(false)}
              onConfirm={handleFormatNumberConfirm}
              initialConfig={data.formatNumberConfig}
              initialOutputColumns={data.outputColumns}
              joinedTables={joinedTables}
            />
          );
        case SelectNodePanelType.FLAG_SPEC_DRAWER:
          return (
            <FlagSpecDrawer
              open={udfDrawerOpen}
              onClose={() => setUdfDrawerOpen(false)}
              onConfirm={handleFlagSpecConfirm}
              initialConfig={data.flagSpecConfig}
              initialOutputColumns={data.outputColumns}
              joinedTables={joinedTables}
            />
          );
        case SelectNodePanelType.FORMAT_DATE_DRAWER:
          return (
            <FormatDateDrawer
              open={udfDrawerOpen}
              onClose={() => setUdfDrawerOpen(false)}
              onConfirm={handleFormatDateConfirm}
              initialConfig={data.formatDateConfig}
              initialOutputColumns={data.outputColumns}
              joinedTables={joinedTables}
            />
          );
        case SelectNodePanelType.BASIC_STATS_DRAWER:
          return (
            <BasicStatsDrawer
              open={udfDrawerOpen}
              tableName={joinedTables[0] ?? ''}
              columns={columnNames}
              initialConfig={data.basicStatsConfig}
              onConfirm={handleBasicStatsConfirm}
              onCancel={() => setUdfDrawerOpen(false)}
            />
          );
        case SelectNodePanelType.ORDER_DISTRIBUTION_DRAWER:
          return (
            <OrderDistributionDrawer
              open={udfDrawerOpen}
              columns={orderDistColumns}
              initialConfig={data.orderDistConfig}
              onConfirm={handleOrderDistConfirm}
              onCancel={() => setUdfDrawerOpen(false)}
            />
          );
        case SelectNodePanelType.REPURCHASE_CYCLE_DRAWER:
          return (
            <RepurchaseCycleDrawer
              open={udfDrawerOpen}
              columns={columnNames}
              initialConfig={data.repurchaseCycleConfig}
              onConfirm={handleRepurchaseCycleConfirm}
              onCancel={() => setUdfDrawerOpen(false)}
            />
          );
        case SelectNodePanelType.ARBITRAGE_ANALYZE_DRAWER:
          return (
            <ArbitrageAnalyzeDrawer
              open={udfDrawerOpen}
              columns={columnNames}
              initialConfig={data.arbitrageAnalyzeConfig}
              kernelDisplayName={kernelMeta?.displayName}
              kernelIndustry={kernelMeta?.industry}
              kernelCategory={kernelMeta?.category}
              onConfirm={handleArbitrageAnalyzeConfirm}
              onCancel={() => setUdfDrawerOpen(false)}
            />
          );
        case SelectNodePanelType.INVENTORY_FORECAST_DRAWER:
          return (
            <InventoryForecastDrawer
              open={udfDrawerOpen}
              columns={columnNames}
              initialConfig={data.inventoryForecastConfig}
              kernelDisplayName={kernelMeta?.displayName}
              kernelIndustry={kernelMeta?.industry}
              kernelCategory={kernelMeta?.category}
              onConfirm={handleInventoryForecastConfirm}
              onCancel={() => setUdfDrawerOpen(false)}
            />
          );
        case SelectNodePanelType.MARKET_BASKET_DRAWER:
          return (
            <MarketBasketDrawer
              open={udfDrawerOpen}
              columns={columnNames}
              initialConfig={data.marketBasketConfig}
              kernelDisplayName={kernelMeta?.displayName}
              kernelIndustry={kernelMeta?.industry}
              kernelCategory={kernelMeta?.category}
              onConfirm={handleMarketBasketConfirm}
              onCancel={() => setUdfDrawerOpen(false)}
            />
          );
        case SelectNodePanelType.ABNORMAL_AMOUNT_DRAWER:
          return (
            <OrderAbnormalAmountDrawer
              open={udfDrawerOpen}
              columns={columnNames}
              initialConfig={data.abnormalAmountConfig}
              kernelDisplayName={kernelMeta?.displayName}
              kernelIndustry={kernelMeta?.industry}
              kernelCategory={kernelMeta?.category}
              onConfirm={handleAbnormalAmountConfirm}
              onCancel={() => setUdfDrawerOpen(false)}
            />
          );
        case SelectNodePanelType.RFM_PROFILE_DRAWER:
          return (
            <RfmDrawer
              open={udfDrawerOpen}
              columns={columnNames}
              initialConfig={data.rfmProfileConfig}
              kernelDisplayName={kernelMeta?.displayName}
              kernelIndustry={kernelMeta?.industry}
              kernelCategory={kernelMeta?.category}
              onConfirm={handleRfmProfileConfirm}
              onClose={() => setUdfDrawerOpen(false)}
            />
          );
        case SelectNodePanelType.ORDER_CHANNEL_ANALYSIS_DRAWER:
          return (
            <OrderChannelAnalysisDrawer
              open={udfDrawerOpen}
              columns={columnNames}
              initialConfig={data.orderChannelAnalysisConfig}
              kernelDisplayName={kernelMeta?.displayName}
              kernelIndustry={kernelMeta?.industry}
              kernelCategory={kernelMeta?.category}
              onConfirm={handleOrderChannelAnalysisConfirm}
              onCancel={() => setUdfDrawerOpen(false)}
            />
          );
        case SelectNodePanelType.ORDER_FUNNEL_ANALYSIS_DRAWER:
          return (
            <OrderFunnelAnalysisDrawer
              open={udfDrawerOpen}
              columns={columnNames}
              initialConfig={data.orderFunnelAnalysisConfig}
              kernelDisplayName={kernelMeta?.displayName}
              kernelIndustry={kernelMeta?.industry}
              kernelCategory={kernelMeta?.category}
              onConfirm={handleOrderFunnelAnalysisConfirm}
              onCancel={() => setUdfDrawerOpen(false)}
            />
          );
        default:
          return null;
      }
    })()}
    </>
  );
};

export default SelectNode;
