/**
 * Strategy factory for algorithm-specific action strategies
 * Central registry for all supported algorithm types
 */

import type { AlgorithmType } from '../../../types/insight-action.types';
import { ActionStrategy } from './BaseActionStrategy';
import { AnomalyActionStrategy } from './AnomalyActionStrategy';
import { ClusteringActionStrategy } from './ClusteringActionStrategy';

/**
 * Get strategy instance for the given algorithm type
 * @param algorithmType - Type of algorithm (anomaly, clustering, regression)
 * @returns Strategy implementation for the algorithm
 * @throws Error if algorithm type is not supported
 */
export function getStrategy(algorithmType: AlgorithmType): ActionStrategy {
  switch (algorithmType) {
    case 'anomaly':
      return new AnomalyActionStrategy();
      
    case 'clustering':
      return new ClusteringActionStrategy();
      
    case 'regression':
      throw new Error(
        '[getStrategy] Regression strategy not implemented yet. ' +
        'Please implement RegressionActionStrategy in strategies/RegressionActionStrategy.ts'
      );
      
    default:
      // TypeScript exhaustiveness check - ensures all AlgorithmType cases are handled
      const _exhaustive: never = algorithmType;
      throw new Error(`[getStrategy] Unknown algorithm type: ${_exhaustive}`);
  }
}

// Re-export strategy types for convenience
export type { ActionStrategy, QueryExecutor } from './BaseActionStrategy';
export { AnomalyActionStrategy } from './AnomalyActionStrategy';
export { ClusteringActionStrategy } from './ClusteringActionStrategy';
