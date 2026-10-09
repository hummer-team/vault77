/**
 * OrderProfitMarginCalcStrategy
 * 
 * Skeleton file for fn_ecom_order_profit_margin_calc (订单毛利/净利率自动计算)
 * Will be fully implemented in Phase 1.
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
} from '../types';

/**
 * Profit Margin Calculation Strategy
 * Calculates gross profit, net profit, profit margins, and risk classification
 */
export class OrderProfitMarginCalcStrategy extends BaseStrategy {
  readonly type = OperatorType.PROFIT_MARGIN_CALC;
  readonly name = '订单毛利/净利率自动计算';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  protected buildOperatorSql(
    _nodes: FlowNode[],
    _edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    _userWhere: string
  ): string {
    // Phase 1 implementation
    return 'SELECT 1 WHERE false';
  }

  async postProcess(_queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    // Phase 1 implementation - return empty result
    return {
      type: OperatorType.PROFIT_MARGIN_CALC,
      sql: '',
      data: [],
      schema: [],
      displayConfig: {},
    };
  }
}
