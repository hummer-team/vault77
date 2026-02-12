/**
 * Strategy Factory Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { StrategyFactory } from '../strategyFactory';
import {
  AssociationStrategy,
  AnomalyStrategy,
  ClusteringStrategy,
} from '../strategies';
import { OperatorType } from '../types';

describe('StrategyFactory', () => {
  describe('getStrategy', () => {
    it('should return AssociationStrategy for ASSOCIATION operator', () => {
      const strategy = StrategyFactory.getStrategy(OperatorType.ASSOCIATION);
      expect(strategy).toBeInstanceOf(AssociationStrategy);
      expect(strategy.type).toBe(OperatorType.ASSOCIATION);
    });

    it('should return AnomalyStrategy for ANOMALY operator', () => {
      const strategy = StrategyFactory.getStrategy(OperatorType.ANOMALY);
      expect(strategy).toBeInstanceOf(AnomalyStrategy);
      expect(strategy.type).toBe(OperatorType.ANOMALY);
    });

    it('should return ClusteringStrategy for CLUSTERING operator', () => {
      const strategy = StrategyFactory.getStrategy(OperatorType.CLUSTERING);
      expect(strategy).toBeInstanceOf(ClusteringStrategy);
      expect(strategy.type).toBe(OperatorType.CLUSTERING);
    });

    it('should throw error for unknown operator type', () => {
      expect(() => {
        StrategyFactory.getStrategy('UNKNOWN' as OperatorType);
      }).toThrow('Unknown operator type: UNKNOWN');
    });
  });

  describe('getAllStrategies', () => {
    it('should return array of all strategy instances', () => {
      const strategies = StrategyFactory.getAllStrategies();

      expect(strategies).toHaveLength(3);
      expect(strategies[0]).toBeInstanceOf(AssociationStrategy);
      expect(strategies[1]).toBeInstanceOf(AnomalyStrategy);
      expect(strategies[2]).toBeInstanceOf(ClusteringStrategy);
    });

    it('should return strategies with correct operator types', () => {
      const strategies = StrategyFactory.getAllStrategies();

      const operatorTypes = strategies.map((s) => s.type);
      expect(operatorTypes).toContain(OperatorType.ASSOCIATION);
      expect(operatorTypes).toContain(OperatorType.ANOMALY);
      expect(operatorTypes).toContain(OperatorType.CLUSTERING);
    });
  });

  describe('hasStrategy', () => {
    it('should return true for ASSOCIATION operator', () => {
      expect(StrategyFactory.hasStrategy(OperatorType.ASSOCIATION)).toBe(true);
    });

    it('should return true for ANOMALY operator', () => {
      expect(StrategyFactory.hasStrategy(OperatorType.ANOMALY)).toBe(true);
    });

    it('should return true for CLUSTERING operator', () => {
      expect(StrategyFactory.hasStrategy(OperatorType.CLUSTERING)).toBe(true);
    });

    it('should return false for unknown operator type', () => {
      expect(StrategyFactory.hasStrategy('UNKNOWN' as OperatorType)).toBe(false);
    });
  });

  describe('Strategy consistency', () => {
    it('should return same strategy type from getStrategy and getAllStrategies', () => {
      const associationFromGet = StrategyFactory.getStrategy(OperatorType.ASSOCIATION);
      const allStrategies = StrategyFactory.getAllStrategies();
      const associationFromAll = allStrategies.find(
        (s) => s.type === OperatorType.ASSOCIATION
      );

      expect(associationFromGet).toBeInstanceOf(AssociationStrategy);
      expect(associationFromAll).toBeInstanceOf(AssociationStrategy);
    });

    it('should create new instances each time', () => {
      const strategy1 = StrategyFactory.getStrategy(OperatorType.ASSOCIATION);
      const strategy2 = StrategyFactory.getStrategy(OperatorType.ASSOCIATION);

      // Factory returns singleton instances, so they should be the same
      expect(strategy1).toBe(strategy2);
      // And same type
      expect(strategy1.constructor).toBe(strategy2.constructor);
    });
  });
});
