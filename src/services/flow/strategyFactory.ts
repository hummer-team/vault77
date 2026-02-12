/**
 * Strategy Factory
 * Factory for creating strategy instances
 */

import { OperatorType, type FlowStrategy } from './types';
import {
  AssociationStrategy,
  AnomalyStrategy,
  ClusteringStrategy,
} from './strategies';

/**
 * Strategy Factory
 * Returns the appropriate strategy based on operator type
 */
export class StrategyFactory {
  private static strategies: Map<OperatorType, FlowStrategy> = new Map<OperatorType, FlowStrategy>([
    [OperatorType.ASSOCIATION, new AssociationStrategy()],
    [OperatorType.ANOMALY, new AnomalyStrategy()],
    [OperatorType.CLUSTERING, new ClusteringStrategy()],
  ]);

  /**
   * Get strategy by operator type
   */
  static getStrategy(type: OperatorType): FlowStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(`Unknown operator type: ${type}`);
    }
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
