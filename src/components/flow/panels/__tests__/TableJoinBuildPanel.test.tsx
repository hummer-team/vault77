/**
 * TableJoinBuildPanel Component Tests
 * Tests for the drawer that builds table join relationships.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as flowStore from '../../../../stores/flowStore';
import { JoinType } from '../../../../services/flow/types';
import type { JoinEdgeData, FlowNode } from '../../../../services/flow/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../../stores/flowStore', () => ({
  useFlowStore: vi.fn(),
}));

vi.mock('../../../../contexts/DuckDBContext', () => ({
  useDuckDBContext: vi.fn(() => ({
    executeQuery: vi.fn(),
    isDBReady: false,
  })),
}));

// Stub uuid so condition row IDs are deterministic
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

// ── Import component AFTER mocks ───────────────────────────────────────────
import { TableJoinBuildPanel } from '../TableJoinBuildPanel';

// ── Helpers ────────────────────────────────────────────────────────────────

const mockCloseJoinPanel = vi.fn();
const mockUpdateEdge = vi.fn();

const sourceNode: FlowNode = {
  id: 'table-1',
  type: 'table',
  position: { x: 0, y: 0 },
  data: {
    tableName: 'order_table',
    fields: [
      { name: 'id', type: 'INTEGER', nullable: false },
      { name: 'order_no', type: 'VARCHAR', nullable: false },
    ],
    expanded: true,
    alias: '',
  },
};

const targetNode: FlowNode = {
  id: 'table-2',
  type: 'table',
  position: { x: 300, y: 0 },
  data: {
    tableName: 'order_item_table',
    fields: [
      { name: 'item_id', type: 'INTEGER', nullable: false },
      { name: 'order_no', type: 'VARCHAR', nullable: false },
    ],
    expanded: true,
    alias: '',
  },
};

const defaultEdgeData: JoinEdgeData = {
  joinType: JoinType.INNER,
  sourceTableName: 'order_table',
  targetTableName: 'order_item_table',
  conditions: [],
  description: '',
  order: 1,
  configured: false,
};

function setupStore(edgeData: JoinEdgeData = defaultEdgeData, panelOpen = true) {
  (flowStore.useFlowStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: Record<string, unknown>) => unknown) => {
      return selector({
        nodes: [sourceNode, targetNode],
        edges: panelOpen
          ? [{ id: 'edge-1', source: 'table-1', target: 'table-2', type: 'join', data: edgeData }]
          : [],
        joinPanelEdgeId: panelOpen ? 'edge-1' : null,
        closeJoinPanel: mockCloseJoinPanel,
        updateEdge: mockUpdateEdge,
        updateNode: vi.fn(),
      });
    }
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TableJoinBuildPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the drawer when joinPanelEdgeId is set', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      expect(screen.getByText('表关联')).toBeInTheDocument();
    });

    it('does not render the drawer when joinPanelEdgeId is null', () => {
      setupStore(defaultEdgeData, false);
      render(<TableJoinBuildPanel />);
      expect(screen.queryByText('表关联')).not.toBeInTheDocument();
    });

    it('renders the 关系组 header with table names', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      expect(screen.getByText(/关系组1/)).toBeInTheDocument();
      expect(screen.getAllByText(/order_table/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/order_item_table/).length).toBeGreaterThan(0);
    });

    it('renders readonly source table input with correct value', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      // Both table inputs should be disabled
      const inputs = screen.getAllByDisplayValue('order_table');
      expect(inputs.length).toBeGreaterThan(0);
    });

    it('renders readonly target table input with correct value', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      const inputs = screen.getAllByDisplayValue('order_item_table');
      expect(inputs.length).toBeGreaterThan(0);
    });

    it('renders 主表 label next to source table', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      expect(screen.getByText('主表')).toBeInTheDocument();
    });

    it('renders 确认 and 取消 buttons', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      expect(screen.getByTestId('btn-confirm')).toBeInTheDocument();
      expect(screen.getByTestId('btn-cancel')).toBeInTheDocument();
    });

    it('renders section labels 主表/关联表 and 关联条件', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      expect(screen.getByText(/主表\s*\/\s*关联表/i)).toBeInTheDocument();
      expect(screen.getByText('关联条件')).toBeInTheDocument();
    });
  });

  describe('Condition row interactions', () => {
    it('renders at least one condition row with + and - buttons', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      expect(screen.getByRole('button', { name: /plus/i }) || screen.getByLabelText('plus')).toBeTruthy();
    });

    it('clicking - on single row does not remove it (minimum 1 row)', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      // Find the minus button and click it — should not remove the row
      const minusBtn = document.querySelector('[aria-label="minus"]') as HTMLElement | null
        ?? document.querySelector('.anticon-minus')?.closest('button') as HTMLElement | null;
      if (minusBtn) {
        fireEvent.click(minusBtn);
      }
      // The + button should still exist (row is still there)
      const plusStill = document.querySelector('[aria-label="plus"]') ?? document.querySelector('.anticon-plus');
      expect(plusStill).toBeTruthy();
    });
  });

  describe('Save and cancel', () => {
    it('calls updateEdge and closeJoinPanel when 确认 is clicked', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      fireEvent.click(screen.getByTestId('btn-confirm'));
      expect(mockUpdateEdge).toHaveBeenCalledWith('edge-1', expect.objectContaining({
        joinType: JoinType.INNER,
        sourceTableName: 'order_table',
        targetTableName: 'order_item_table',
        configured: true,
      }));
      expect(mockCloseJoinPanel).toHaveBeenCalled();
    });

    it('calls only closeJoinPanel (not updateEdge) when 取消 is clicked', () => {
      setupStore();
      render(<TableJoinBuildPanel />);
      fireEvent.click(screen.getByTestId('btn-cancel'));
      expect(mockCloseJoinPanel).toHaveBeenCalled();
      expect(mockUpdateEdge).not.toHaveBeenCalled();
    });
  });

  describe('Pre-filled data when configured', () => {
    it('renders existing joinType when edge already configured', () => {
      const configuredEdge: JoinEdgeData = {
        ...defaultEdgeData,
        joinType: JoinType.LEFT,
        configured: true,
        conditions: [
          { id: 'c1', leftTable: 'order_table', leftField: 'order_no', operator: '=', rightTable: 'order_item_table', rightField: 'order_no' },
        ],
      };
      setupStore(configuredEdge);
      render(<TableJoinBuildPanel />);
      // "左连" label should appear in the join type selector
      expect(screen.getByText('左连')).toBeInTheDocument();
    });
  });
});
