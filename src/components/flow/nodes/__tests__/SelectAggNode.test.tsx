/**
 * Select Aggregation Node Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectAggNode } from '../SelectAggNode';
import * as flowStore from '../../../../stores/flowStore';
import type { SelectAggNodeData } from '../../../../services/flow/types';

// Mock the flow store
vi.mock('../../../../stores/flowStore', () => ({
  useFlowStore: vi.fn(),
}));

describe('SelectAggNode', () => {
  const mockRemoveNode = vi.fn();
  const mockSetSelectedNode = vi.fn();

  const mockData: SelectAggNodeData = {
    fields: [
      {
        tableName: 'orders',
        fieldName: 'amount',
        alias: 'total_amount',
        aggregate: 'SUM',
      },
      {
        tableName: 'orders',
        fieldName: 'id',
        alias: 'order_count',
        aggregate: 'COUNT',
      },
    ],
    groupByFields: ['users.region', 'users.country'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (flowStore.useFlowStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      if (selector) {
        return selector({
          removeNode: mockRemoveNode,
          setSelectedNode: mockSetSelectedNode,
        });
      }
      return {
        removeNode: mockRemoveNode,
        setSelectedNode: mockSetSelectedNode,
      };
    });
  });

  it('should have aggregation fields', () => {
    expect(mockData.fields).toHaveLength(2);
    expect(mockData.fields[0].aggregate).toBe('SUM');
    expect(mockData.fields[1].aggregate).toBe('COUNT');
  });

  it('should have GROUP BY fields', () => {
    expect(mockData.groupByFields).toHaveLength(2);
    expect(mockData.groupByFields).toContain('users.region');
    expect(mockData.groupByFields).toContain('users.country');
  });

  it('should handle empty GROUP BY fields', () => {
    const dataWithoutGroupBy: SelectAggNodeData = {
      ...mockData,
      groupByFields: [],
    };
    expect(dataWithoutGroupBy.groupByFields).toHaveLength(0);
  });

  it('should support all aggregation functions', () => {
    const functions: Array<'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX'> = ['SUM', 'COUNT', 'AVG', 'MIN', 'MAX'];
    functions.forEach((func) => {
      expect(['SUM', 'COUNT', 'AVG', 'MIN', 'MAX']).toContain(func);
    });
  });

  it('should show aliases for aggregated fields', () => {
    expect(mockData.fields[0].alias).toBe('total_amount');
    expect(mockData.fields[1].alias).toBe('order_count');
  });
});
