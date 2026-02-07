/**
 * Unit tests for strategy factory
 */

import { describe, it, expect } from 'bun:test';
import { getStrategy } from '../index';
import { AnomalyActionStrategy } from '../AnomalyActionStrategy';

describe('Strategy Factory', () => {
  describe('getStrategy', () => {
    it('should return AnomalyActionStrategy for anomaly type', () => {
      const strategy = getStrategy('anomaly');
      
      expect(strategy).toBeInstanceOf(AnomalyActionStrategy);
      expect(strategy.algorithmType).toBe('anomaly');
    });
    
    it('should throw for clustering type (not implemented)', () => {
      expect(() => getStrategy('clustering')).toThrow('not implemented');
      expect(() => getStrategy('clustering')).toThrow('ClusteringActionStrategy');
    });
    
    it('should throw for regression type (not implemented)', () => {
      expect(() => getStrategy('regression')).toThrow('not implemented');
      expect(() => getStrategy('regression')).toThrow('RegressionActionStrategy');
    });
    
    it('should provide clear error message for unimplemented types', () => {
      try {
        getStrategy('clustering');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect((error as Error).message).toContain('Clustering strategy not implemented yet');
        expect((error as Error).message).toContain('strategies/ClusteringActionStrategy.ts');
      }
    });
  });
  
  describe('AnomalyActionStrategy', () => {
    it('should have correct algorithmType', () => {
      const strategy = new AnomalyActionStrategy();
      expect(strategy.algorithmType).toBe('anomaly');
    });
    
    it('should have all required methods', () => {
      const strategy = new AnomalyActionStrategy();
      
      expect(typeof strategy.buildContext).toBe('function');
      expect(typeof strategy.aggregateData).toBe('function');
      expect(typeof strategy.buildPrompt).toBe('function');
    });
  });
});
