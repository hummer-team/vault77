/**
 * Condition Group Node Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConditionGroupNode } from '../ConditionGroupNode';
import * as flowStore from '../../../../stores/flowStore';
import type { ConditionGroupNodeData, FlowNode } from '../../../../services/flow/types';

// Mock the flow store
vi.mock('../../../../stores/flowStore', () => ({
  useFlowStore: vi.fn(),
}));

describe('ConditionGroupNode', () => {
  const mockRemoveNode = vi.fn();
  const mockSetSelectedNode = vi.fn();

  const mockData: ConditionGroupNodeData = {
    logicType: 'AND',
    conditionIds: ['cond-1', 'cond-2'],
  };

  const mockNodes: FlowNode[] = [
    {
      id: 'cond-1',
      type: 'condition',
      position: { x: 0, y: 0 },
      data: {
        tableName: 'users',
        field: 'age',
        operator: '>',
        value: '18',
        logicType: 'AND',
      },
    },
    {
      id: 'cond-2',
      type: 'condition',
      position: { x: 0, y: 0 },
      data: {
        tableName: 'orders',
        field: 'status',
        operator: '=',
        value: 'completed',
        logicType: 'AND',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (flowStore.useFlowStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      if (selector) {
        return selector({
          removeNode: mockRemoveNode,
          setSelectedNode: mockSetSelectedNode,
          nodes: mockNodes,
        });
      }
      return {
        removeNode: mockRemoveNode,
        setSelectedNode: mockSetSelectedNode,
        nodes: mockNodes,
      };
    });
  });

  it('should render condition group with AND logic type', () => {
    render(
      <ConditionGroupNode
        id="group-1"
        data={mockData}
        selected={false}
      />
    );

    expect(screen.getByText('全部满足 (AND)')).toBeInTheDocument();
    expect(screen.getByText('AND')).toBeInTheDocument();
  });

  it('should render condition group with OR logic type', () => {
    const orData: ConditionGroupNodeData = { ...mockData, logicType: 'OR' };
    render(
      <ConditionGroupNode
        id="group-1"
        data={orData}
        selected={false}
      />
    );

    expect(screen.getByText('任一满足 (OR)')).toBeInTheDocument();
    expect(screen.getByText('OR')).toBeInTheDocument();
  });

  it('should display child conditions count', () => {
    render(
      <ConditionGroupNode
        id="group-1"
        data={mockData}
        selected={false}
      />
    );

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should render child condition summaries', () => {
    render(
      <ConditionGroupNode
        id="group-1"
        data={mockData}
        selected={false}
      />
    );

    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
  });

  it('should show empty state when no conditions', () => {
    const emptyData: ConditionGroupNodeData = { ...mockData, conditionIds: [] };
    render(
      <ConditionGroupNode
        id="group-1"
        data={emptyData}
        selected={false}
      />
    );

    expect(screen.getByText('拖拽条件到此处')).toBeInTheDocument();
  });

  it('should call setSelectedNode when clicked', () => {
    render(
      <ConditionGroupNode
        id="group-1"
        data={mockData}
        selected={false}
      />
    );

    const node = screen.getByText('全部满足 (AND)').closest('.condition-group-node');
    fireEvent.click(node!);

    expect(mockSetSelectedNode).toHaveBeenCalledWith('group-1');
  });

  it('should show delete button when selected', () => {
    render(
      <ConditionGroupNode
        id="group-1"
        data={mockData}
        selected={true}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    expect(deleteButton).toBeInTheDocument();
  });

  it('should call removeNode when delete button is clicked', () => {
    render(
      <ConditionGroupNode
        id="group-1"
        data={mockData}
        selected={true}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    expect(mockRemoveNode).toHaveBeenCalledWith('group-1');
  });

  it('should toggle expand/collapse when expand button is clicked', () => {
    render(
      <ConditionGroupNode
        id="group-1"
        data={mockData}
        selected={false}
      />
    );

    // Initially expanded, so child conditions should be visible
    expect(screen.getByText('1.')).toBeInTheDocument();

    // Click to collapse
    const expandButton = screen.getByRole('button');
    fireEvent.click(expandButton);

    // After collapse, child conditions should not be visible
    expect(screen.queryByText('1.')).not.toBeInTheDocument();
  });
});
