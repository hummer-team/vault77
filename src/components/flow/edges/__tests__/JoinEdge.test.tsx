/**
 * JoinEdge Component Tests
 * Tests for the custom edge that renders join relationship between two TableNodes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as flowStore from '../../../../stores/flowStore';
import { JoinType } from '../../../../services/flow/types';
import type { JoinEdgeData } from '../../../../services/flow/types';

// ── Mock @xyflow/react ─────────────────────────────────────────────────────
vi.mock('@xyflow/react', () => ({
  BaseEdge: ({ path, style }: { path: string; style?: React.CSSProperties }) => (
    <path data-testid="base-edge" d={path} style={style} />
  ),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="edge-label-renderer">{children}</div>
  ),
  getBezierPath: () => ['M0,0 L100,100', 50, 50],
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

// ── Mock flowStore ─────────────────────────────────────────────────────────
vi.mock('../../../../stores/flowStore', () => ({
  useFlowStore: vi.fn(),
}));

// ── Import component AFTER mocks ───────────────────────────────────────────
import { JoinEdge } from '../JoinEdge';

// ── Helpers ────────────────────────────────────────────────────────────────

const mockOpenJoinPanel = vi.fn();
const mockRemoveEdge = vi.fn();

const baseEdgeProps = {
  id: 'edge-1',
  source: 'table-1',
  target: 'table-2',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  sourcePosition: 'right' as const,
  targetPosition: 'left' as const,
  selected: false,
  animated: false,
  markerEnd: '',
  markerStart: '',
  style: {},
  label: '',
  labelStyle: {},
  labelShowBg: false,
  labelBgStyle: {},
  labelBgPadding: [0, 0] as [number, number],
  labelBgBorderRadius: 0,
  interactionWidth: 20,
};

function setupStore() {
  (flowStore.useFlowStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: Record<string, unknown>) => unknown) => {
      return selector({
        removeEdge: mockRemoveEdge,
        openJoinPanel: mockOpenJoinPanel,
      });
    }
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('JoinEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStore();
  });

  describe('Unconfigured state', () => {
    it('renders 构建关系 button when not configured', () => {
      const data: JoinEdgeData = {
        joinType: JoinType.INNER,
        sourceTableName: 'order_table',
        targetTableName: 'order_item_table',
        conditions: [],
        order: 1,
        configured: false,
      };
      render(<JoinEdge {...baseEdgeProps} data={data} />);
      expect(screen.getByText('构建关系')).toBeInTheDocument();
    });

    it('renders 删除关系 button when not configured', () => {
      const data: JoinEdgeData = {
        joinType: JoinType.INNER,
        sourceTableName: 'order_table',
        targetTableName: 'order_item_table',
        conditions: [],
        order: 1,
        configured: false,
      };
      render(<JoinEdge {...baseEdgeProps} data={data} />);
      expect(screen.getByText('删除关系')).toBeInTheDocument();
    });

    it('calls openJoinPanel with edge id when 构建关系 is clicked', () => {
      const data: JoinEdgeData = {
        joinType: JoinType.INNER,
        sourceTableName: 'a',
        targetTableName: 'b',
        conditions: [],
        order: 1,
        configured: false,
      };
      render(<JoinEdge {...baseEdgeProps} data={data} />);
      fireEvent.click(screen.getByText('构建关系'));
      expect(mockOpenJoinPanel).toHaveBeenCalledWith('edge-1');
    });

    it('calls removeEdge with edge id when 删除关系 is clicked', () => {
      const data: JoinEdgeData = {
        joinType: JoinType.INNER,
        sourceTableName: 'a',
        targetTableName: 'b',
        conditions: [],
        order: 1,
        configured: false,
      };
      render(<JoinEdge {...baseEdgeProps} data={data} />);
      fireEvent.click(screen.getByText('删除关系'));
      expect(mockRemoveEdge).toHaveBeenCalledWith('edge-1');
    });
  });

  describe('Configured state', () => {
    it('renders join type label (内连) when configured', () => {
      const data: JoinEdgeData = {
        joinType: JoinType.INNER,
        sourceTableName: 'a',
        targetTableName: 'b',
        conditions: [{ id: 'c1', leftTable: 'a', leftField: 'id', operator: '=', rightTable: 'b', rightField: 'id' }],
        order: 1,
        configured: true,
      };
      render(<JoinEdge {...baseEdgeProps} data={data} />);
      // The join type label should be visible (not buttons, since not hovering)
      expect(screen.getByText('内连')).toBeInTheDocument();
    });

    it('renders 左连 label for LEFT join type', () => {
      const data: JoinEdgeData = {
        joinType: JoinType.LEFT,
        sourceTableName: 'a',
        targetTableName: 'b',
        conditions: [{ id: 'c1', leftTable: 'a', leftField: 'id', operator: '=', rightTable: 'b', rightField: 'id' }],
        order: 1,
        configured: true,
      };
      render(<JoinEdge {...baseEdgeProps} data={data} />);
      expect(screen.getByText('左连')).toBeInTheDocument();
    });
  });

  describe('Selected state', () => {
    it('shows 构建关系 and 删除关系 buttons when selected and configured', () => {
      const data: JoinEdgeData = {
        joinType: JoinType.INNER,
        sourceTableName: 'a',
        targetTableName: 'b',
        conditions: [{ id: 'c1', leftTable: 'a', leftField: 'id', operator: '=', rightTable: 'b', rightField: 'id' }],
        order: 1,
        configured: true,
      };
      render(<JoinEdge {...baseEdgeProps} data={data} selected />);
      expect(screen.getByText('构建关系')).toBeInTheDocument();
      expect(screen.getByText('删除关系')).toBeInTheDocument();
    });
  });
});
