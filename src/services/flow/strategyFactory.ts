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
