/**
 * Unit tests for ClusteringActionStrategy
 * Simplified version focusing on core logic
 */

import { describe, it, expect } from 'bun:test';
import { ClusteringActionStrategy } from '../ClusteringActionStrategy';

describe('ClusteringActionStrategy', () => {
  it('should instantiate successfully', () => {
    const strategy = new ClusteringActionStrategy();
    expect(strategy).toBeDefined();
  });

  it('should have required strategy methods', () => {
    const strategy = new ClusteringActionStrategy();
    expect(typeof strategy.buildContext).toBe('function');
    expect(typeof strategy.aggregateData).toBe('function');
    expect(typeof strategy.buildPrompt).toBe('function');
  });
});
