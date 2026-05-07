/**
 * BizKernels Builder Strategies
 *
 * Implements the dynamic routing strategy for the SelectNode component.
 * Each business kernel (业务算子) type maps to a specific UI panel/drawer.
 * Adding support for a new kernel only requires registering it in UDF_PANEL_ROUTING.
 */

import { useFlowStore } from '../../stores/flowStore';
import { duckDBUdfService } from '../duckDBUdfService';

// ============================================================================
// Types
// ============================================================================

/** Identifies which panel/drawer should open when the user clicks SelectNode */
export enum SelectNodePanelType {
  /** Standard NodeDetailPanel — used for non-UDF kernels (e.g. 关联查询) */
  STANDARD_DETAIL_PANEL = 'STANDARD_DETAIL_PANEL',
  /** ReplaceColumnDrawer — used for 数据清洗 · 替换特定列值 */
  REPLACE_COLUMN_DRAWER = 'REPLACE_COLUMN_DRAWER',
  /** UpLowerDrawer — used for 数据清洗 · 大小写转换 */
  UP_LOWER_DRAWER = 'UP_LOWER_DRAWER',
  /** FormatNumberDrawer — used for 数据清洗 · 数字精度控制 */
  FORMAT_NUMBER_DRAWER = 'FORMAT_NUMBER_DRAWER',
  /** FlagSpecDrawer — used for 数据清洗 · 数据标记 */
  FLAG_SPEC_DRAWER = 'FLAG_SPEC_DRAWER',
  /** FormatDateDrawer — used for 数据清洗 · 日期时间格式化 */
  FORMAT_DATE_DRAWER = 'FORMAT_DATE_DRAWER',
  /** BasicStatsDrawer — used for 数据分析 · 基础统计 */
  BASIC_STATS_DRAWER = 'BASIC_STATS_DRAWER',
  /** OrderDistributionDrawer — used for 订单分布分析 (3 sub-types: time/amount/geo) */
  ORDER_DISTRIBUTION_DRAWER = 'ORDER_DISTRIBUTION_DRAWER',
  /** RepurchaseCycleDrawer — used for 复购周期分析 */
  REPURCHASE_CYCLE_DRAWER = 'REPURCHASE_CYCLE_DRAWER',
  /** ArbitrageAnalyzeDrawer — used for 价格套利分析 */
  ARBITRAGE_ANALYZE_DRAWER = 'ARBITRAGE_ANALYZE_DRAWER',
  /** InventoryForecastDrawer — used for 库存需求预测 (batch multi-SKU) */
  INVENTORY_FORECAST_DRAWER = 'INVENTORY_FORECAST_DRAWER',
  MARKET_BASKET_DRAWER = 'MARKET_BASKET_DRAWER',
}

/** Callback set the strategy executor delegates to */
export interface SelectNodeClickActions {
  /** Open the appropriate UDF-specific drawer (e.g. ReplaceColumnDrawer) */
  openUdfDrawer: () => void;
  /** Open the generic NodeDetailPanel */
  openDetailPanel: () => void;
}

// ============================================================================
// Routing map
// ============================================================================

/**
 * Maps UDF function names to the panel type that should handle them.
 * Extend this map when new UDF kernel types are introduced.
 */
const UDF_PANEL_ROUTING: Readonly<Record<string, SelectNodePanelType>> = {
  udf_replace_spec_column_value: SelectNodePanelType.REPLACE_COLUMN_DRAWER,
  udf_up_lower_str:              SelectNodePanelType.UP_LOWER_DRAWER,
  udf_format_number:             SelectNodePanelType.FORMAT_NUMBER_DRAWER,
  udf_flag_spec_column:          SelectNodePanelType.FLAG_SPEC_DRAWER,
  udf_format_date_time:          SelectNodePanelType.FORMAT_DATE_DRAWER,
  fn_basic_statis:               SelectNodePanelType.BASIC_STATS_DRAWER,
  fn_ecom_order_distribution:    SelectNodePanelType.ORDER_DISTRIBUTION_DRAWER,
  fn_ecom_repurchase_cycle:      SelectNodePanelType.REPURCHASE_CYCLE_DRAWER,
  fn_ecom_arbitrage_analyze:     SelectNodePanelType.ARBITRAGE_ANALYZE_DRAWER,
  fn_ecom_inventory_forecast:    SelectNodePanelType.INVENTORY_FORECAST_DRAWER,
  fn_ecom_market_basket:         SelectNodePanelType.MARKET_BASKET_DRAWER,
};

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Derives the effective UDF function name for a SelectNode.
 *
 * Priority:
 * 1. SelectNode's own `data.udfFunctionName` — set when the node was created by a UDF kernel
 * 2. Fallback: read the OperatorNode's `kernelName` from the store and map it via duckDBUdfService
 *
 * The fallback handles cases where the SelectNode was created before the kernel was switched
 * to a UDF one (e.g. created via NodeNextButton, or stale node from a previous session).
 */
function resolveEffectiveUdfFunctionName(udfFunctionName: string | undefined): string | undefined {
  if (udfFunctionName) return udfFunctionName;

  // Fallback: look up the OperatorNode in the store
  const nodes = useFlowStore.getState().nodes;
  const operatorNode = nodes.find((n) => n.type === 'operator');
  const kernelName = (operatorNode?.data as { kernelName?: string } | undefined)?.kernelName;
  if (!kernelName) return undefined;

  const mappedFn = duckDBUdfService.getUdfFunctionName(kernelName);
  return mappedFn ?? undefined;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolves which panel type to open for a SelectNode given its linked UDF function.
 * Falls back to the OperatorNode's kernel in the store if the SelectNode's own
 * `udfFunctionName` is not set (e.g. node created before the kernel was changed).
 *
 * @param udfFunctionName - The `data.udfFunctionName` of the SelectNode, or `undefined`.
 * @returns The {@link SelectNodePanelType} that should be activated on click.
 */
export function resolveSelectNodePanelType(
  udfFunctionName: string | undefined
): SelectNodePanelType {
  const effectiveFn = resolveEffectiveUdfFunctionName(udfFunctionName);
  if (!effectiveFn) return SelectNodePanelType.STANDARD_DETAIL_PANEL;
  return UDF_PANEL_ROUTING[effectiveFn] ?? SelectNodePanelType.STANDARD_DETAIL_PANEL;
}

/**
 * Executes the SelectNode click routing strategy by delegating to the correct action.
 *
 * @param udfFunctionName - The `data.udfFunctionName` of the SelectNode.
 * @param actions - Callbacks provided by the component (open drawer / open detail panel).
 */
export function executeSelectNodeClickStrategy(
  udfFunctionName: string | undefined,
  actions: SelectNodeClickActions
): void {
  const panelType = resolveSelectNodePanelType(udfFunctionName);
  switch (panelType) {
    case SelectNodePanelType.REPLACE_COLUMN_DRAWER:
    case SelectNodePanelType.UP_LOWER_DRAWER:
    case SelectNodePanelType.FORMAT_NUMBER_DRAWER:
    case SelectNodePanelType.FLAG_SPEC_DRAWER:
    case SelectNodePanelType.FORMAT_DATE_DRAWER:
    case SelectNodePanelType.BASIC_STATS_DRAWER:
    case SelectNodePanelType.ORDER_DISTRIBUTION_DRAWER:
    case SelectNodePanelType.REPURCHASE_CYCLE_DRAWER:
    case SelectNodePanelType.ARBITRAGE_ANALYZE_DRAWER:
    case SelectNodePanelType.INVENTORY_FORECAST_DRAWER:
    case SelectNodePanelType.MARKET_BASKET_DRAWER:
      actions.openUdfDrawer();
      break;
    default:
      actions.openDetailPanel();
  }
}

/**
 * Returns `true` when the SelectNode should render a UDF-specific drawer.
 * Uses the same fallback logic as {@link resolveSelectNodePanelType}.
 *
 * @param udfFunctionName - The `data.udfFunctionName` of the SelectNode.
 */
export function shouldRenderUdfDrawer(udfFunctionName: string | undefined): boolean {
  return resolveSelectNodePanelType(udfFunctionName) !== SelectNodePanelType.STANDARD_DETAIL_PANEL;
}
