/**
 * Condition Node Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConditionNode } from '../ConditionNode';
import * as flowStore from '../../../../stores/flowStore';
import type { ConditionNodeData } from '../../../../services/flow/types';

// Mock the flow store
vi.mock('../../../../stores/flowStore', () => ({
  useFlowStore: vi.fn(),
}));

describe('ConditionNode', () => {
  const mockRemoveNode = vi.fn();
  const mockSetSelectedNode = vi.fn();

  const mockData: ConditionNodeData = {
    tableName: 'users',
    field: 'age',
    operator: '>',
    value: '18',
    logicType: 'AND',
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

  it('should render condition node with correct data', () => {
    render(
      <ConditionNode
        id="cond-1"
        data={mockData}
        selected={false}
      />
    );

    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('age')).toBeInTheDocument();
    expect(screen.getByText('大于')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('should show AND logic type badge', () => {
    render(
      <ConditionNode
        id="cond-1"
        data={mockData}
        selected={false}
      />
    );

    expect(screen.getByText('且')).toBeInTheDocument();
  });

  it('should show OR logic type badge when logicType is OR', () => {
    const orData: ConditionNodeData = { ...mockData, logicType: 'OR' };
    render(
      <ConditionNode
        id="cond-1"
        data={orData}
        selected={false}
      />
    );

    expect(screen.getByText('或')).toBeInTheDocument();
  });

  it('should show incomplete warning when condition is incomplete', () => {
    const incompleteData: ConditionNodeData = {
      ...mockData,
      field: '',
    };
    render(
      <ConditionNode
        id="cond-1"
        data={incompleteData}
        selected={false}
      />
    );

    expect(screen.getByText('配置不完整')).toBeInTheDocument();
  });

  it('should call setSelectedNode when clicked', () => {
    render(
      <ConditionNode
        id="cond-1"
        data={mockData}
        selected={false}
      />
    );

    const node = screen.getByText('条件').closest('.condition-node');
    fireEvent.click(node!);

    expect(mockSetSelectedNode).toHaveBeenCalledWith('cond-1');
  });

  it('should show delete button when selected', () => {
    render(
      <ConditionNode
        id="cond-1"
        data={mockData}
        selected={true}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    expect(deleteButton).toBeInTheDocument();
  });

  it('should call removeNode when delete button is clicked', () => {
    render(
      <ConditionNode
        id="cond-1"
        data={mockData}
        selected={true}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    expect(mockRemoveNode).toHaveBeenCalledWith('cond-1');
  });

  it('should handle null value correctly', () => {
    const nullData: ConditionNodeData = {
      ...mockData,
      operator: 'IS NULL',
      value: null,
    };
    render(
      <ConditionNode
        id="cond-1"
        data={nullData}
        selected={false}
      />
    );

    expect(screen.getByText('为空')).toBeInTheDocument();
  });

  it('should format array values correctly', () => {
    const arrayData: ConditionNodeData = {
      ...mockData,
      operator: 'IN',
      value: ['a', 'b', 'c', 'd'],
    };
    render(
      <ConditionNode
        id="cond-1"
        data={arrayData}
        selected={false}
      />
    );

    expect(screen.getByText('a, b...')).toBeInTheDocument();
  });
});
