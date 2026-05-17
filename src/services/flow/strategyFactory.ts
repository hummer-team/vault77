/**
 * Strategy Factory
 * Factory for creating strategy instances
 */

import { OperatorType, type FlowStrategy } from './types';
import { AssociationStrategy } from './strategies/associationStrategy';
import { AnomalyStrategy }     from './strategies/anomalyStrategy';
import { ClusteringStrategy }  from './strategies/clusteringStrategy';
import { UdfReplaceColumnStrategy } from './strategies/udfReplaceColumnStrategy';
import { UdfUpLowerStrategy }       from './strategies/udfUpLowerStrategy';
import { UdfFormatNumberStrategy }  from './strategies/udfFormatNumberStrategy';
import { UdfFlagSpecStrategy }      from './strategies/udfFlagSpecStrategy';
import { UdfFormatDateStrategy }    from './strategies/udfFormatDateStrategy';
import { BasicStatsStrategy }       from './strategies/basicStatsStrategy';
import { OrderDistributionStrategy } from './strategies/orderDistributionStrategy';
import { RepurchaseCycleStrategy } from './strategies/repurchaseCycleStrategy';
import { ArbitrageAnalyzeStrategy } from './strategies/arbitrageAnalyzeStrategy';
import { InventoryForecastStrategy } from './strategies/inventoryForecastStrategy';
import { MarketBasketStrategy } from './strategies/marketBasketStrategy';
import { OrderAbnormalAmountStrategy } from './strategies/orderAbnormalAmountStrategy';
import { RfmStrategy } from './strategies/rfmStrategy';

/**
 * Strategy Factory
 * Returns the appropriate strategy based on operator type
 */
export class StrategyFactory {
  private static strategies: Map<OperatorType, FlowStrategy> = new Map<OperatorType, FlowStrategy>([
    [OperatorType.ASSOCIATION,      new AssociationStrategy()],
    [OperatorType.ANOMALY,          new AnomalyStrategy()],
    [OperatorType.CLUSTERING,       new ClusteringStrategy()],
    [OperatorType.UDF_REPLACE_COLUMN, new UdfReplaceColumnStrategy()],
    [OperatorType.UDF_UP_LOWER,     new UdfUpLowerStrategy()],
    [OperatorType.UDF_FORMAT_NUMBER, new UdfFormatNumberStrategy()],
    [OperatorType.UDF_FLAG_SPEC,    new UdfFlagSpecStrategy()],
    [OperatorType.UDF_FORMAT_DATE,  new UdfFormatDateStrategy()],
    [OperatorType.BASIC_STATS,      new BasicStatsStrategy()],
    [OperatorType.ORDER_DISTRIBUTION, new OrderDistributionStrategy()],
    [OperatorType.REPURCHASE_CYCLE,   new RepurchaseCycleStrategy()],
    [OperatorType.ARBITRAGE_ANALYZE,  new ArbitrageAnalyzeStrategy()],
    [OperatorType.INVENTORY_FORECAST, new InventoryForecastStrategy()],
    [OperatorType.MARKET_BASKET,      new MarketBasketStrategy()],
    [OperatorType.ABNORMAL_AMOUNT,    new OrderAbnormalAmountStrategy()],
    [OperatorType.RFM_PROFILE,        new RfmStrategy()],
  ]);

  /**
   * Get strategy by operator type
   */
  static getStrategy(type: OperatorType): FlowStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      console.error(`[StrategyFactory.getStrategy] Unknown operator type: ${type}`);
      throw new Error(`Unknown operator type: ${type}`);
    }
    console.log(`[StrategyFactory.getStrategy] type=${type} → "${strategy.name}"`);
    return strategy;
  }

  /**
   * Get all available strategies
   */
  static getAllStrategies(): FlowStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Check if strategy exists
   */
  static hasStrategy(type: OperatorType): boolean {
    return this.strategies.has(type);
  }
}

export default StrategyFactory;
