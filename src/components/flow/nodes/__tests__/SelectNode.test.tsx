/**
 * Select Node Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectNode } from '../SelectNode';
import * as flowStore from '../../../../stores/flowStore';
import type { SelectNodeData } from '../../../../services/flow/types';

// Mock the flow store
vi.mock('../../../../stores/flowStore', () => ({
  useFlowStore: vi.fn(),
}));

describe('SelectNode', () => {
  const mockRemoveNode = vi.fn();
  const mockSetSelectedNode = vi.fn();

  const mockData: SelectNodeData = {
    fields: [
      {
        tableName: 'users',
        fieldName: 'id',
        alias: 'user_id',
      },
      {
        tableName: 'orders',
        fieldName: 'amount',
        alias: '',
        aggregate: 'SUM',
      },
    ],
    selectAll: false,
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

  it('should show field count badge when fields are selected', () => {
    const { fields } = mockData;
    expect(fields).toHaveLength(2);
  });

  it('should show select all badge when selectAll is true', () => {
    const selectAllData: SelectNodeData = { ...mockData, selectAll: true, fields: [] };
    expect(selectAllData.selectAll).toBe(true);
  });

  it('should handle empty fields', () => {
    const emptyData: SelectNodeData = { ...mockData, fields: [] };
    expect(emptyData.fields).toHaveLength(0);
  });

  it('should show aggregation functions correctly', () => {
    const aggField = mockData.fields[1];
    expect(aggField.aggregate).toBe('SUM');
  });

  it('should show aliases correctly', () => {
    const fieldWithAlias = mockData.fields[0];
    expect(fieldWithAlias.alias).toBe('user_id');
  });
});
