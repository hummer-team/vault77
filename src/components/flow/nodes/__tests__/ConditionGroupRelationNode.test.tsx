/**
 * Condition Group Node Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConditionGroupRelationNode } from '../ConditionGroupRelationNode';
import * as flowStore from '../../../../stores/flowStore';
import type { ConditionGroupRelationNodeData, FlowNode } from '../../../../services/flow/types';
import { LogicType, FlowNodeType } from '../../../../services/flow/types';

// Mock the flow store
vi.mock('../../../../stores/flowStore', () => ({
  useFlowStore: vi.fn(),
}));

describe('ConditionGroupRelationNode', () => {
  const mockRemoveNode = vi.fn();
  const mockSetSelectedNode = vi.fn();

  const mockData: ConditionGroupRelationNodeData = {
    logicType: LogicType.AND,
    conditionIds: ['cond-1', 'cond-2'],
  };

  const mockNodes: FlowNode[] = [
    {
      id: 'cond-1',
      type: FlowNodeType.CONDITION,
      position: { x: 0, y: 0 },
      data: {
        tableName: 'users',
        field: 'age',
        operator: '>',
        value: '18',
        logicType: LogicType.AND,
      },
    },
    {
      id: 'cond-2',
      type: FlowNodeType.CONDITION,
      position: { x: 0, y: 0 },
      data: {
        tableName: 'orders',
        field: 'status',
        operator: '=',
        value: 'completed',
        logicType: LogicType.AND,
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
      <ConditionGroupRelationNode
        id="group-1"
        data={mockData}
        selected={false}
      />
    );

    expect(screen.getByText('全部满足 (AND)')).toBeInTheDocument();
    expect(screen.getByText('AND')).toBeInTheDocument();
  });

  it('should render condition group with OR logic type', () => {
    const orData: ConditionGroupRelationNodeData = { ...mockData, logicType: LogicType.OR };
    render(
      <ConditionGroupRelationNode
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
      <ConditionGroupRelationNode
        id="group-1"
        data={mockData}
        selected={false}
      />
    );

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should render child condition summaries', () => {
    render(
      <ConditionGroupRelationNode
        id="group-1"
        data={mockData}
        selected={false}
      />
    );

    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
  });

  it('should show empty state when no conditions', () => {
    const emptyData: ConditionGroupRelationNodeData = { ...mockData, conditionIds: [] };
    render(
      <ConditionGroupRelationNode
        id="group-1"
        data={emptyData}
        selected={false}
      />
    );

    expect(screen.getByText('拖拽条件到此处')).toBeInTheDocument();
  });

  it('should call setSelectedNode when clicked', () => {
    render(
      <ConditionGroupRelationNode
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
      <ConditionGroupRelationNode
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
      <ConditionGroupRelationNode
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
      <ConditionGroupRelationNode
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
