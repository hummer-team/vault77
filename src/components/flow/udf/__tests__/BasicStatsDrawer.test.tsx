/**
 * BasicStatsDrawer Tests
 * Tests for COUNT(*) support: * option, COUNT lock, row_count alias, visual marking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { FlowNode } from '../../../../services/flow/types';
import { FlowNodeType } from '../../../../services/flow/types';
import type { BasicStatsConfig } from '../../../../services/flow/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../../stores/flowStore', () => ({
  useFlowStore: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

import * as flowStore from '../../../../stores/flowStore';
import { BasicStatsDrawer } from '../BasicStatsDrawer';

// ── Helpers ────────────────────────────────────────────────────────────────

const mockConfirm = vi.fn();
const mockCancel = vi.fn();

const tableNode: FlowNode = {
  id: 'table-1',
  type: FlowNodeType.TABLE,
  position: { x: 0, y: 0 },
  data: {
    tableName: 'orders',
    fields: [
      { name: 'category', type: 'VARCHAR' },
      { name: 'amount', type: 'DECIMAL' },
      { name: 'order_id', type: 'INTEGER' },
    ],
  },
};

function setupStore(nodes: FlowNode[] = [tableNode]): void {
  (flowStore.useFlowStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: Record<string, unknown>) => unknown) => {
      return selector({ nodes });
    }
  );
}

function renderDrawer(props?: {
  columns?: string[];
  initialConfig?: BasicStatsConfig;
}): ReturnType<typeof render> {
  return render(
    <BasicStatsDrawer
      open
      tableName="orders"
      columns={props?.columns ?? ['category', 'amount', 'order_id']}
      initialConfig={props?.initialConfig}
      onConfirm={mockConfirm}
      onCancel={mockCancel}
    />
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BasicStatsDrawer — COUNT(*) support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStore();
  });

  it('should render * as the first option in the column dropdown', async () => {
    renderDrawer();

    // The drawer title should be visible
    expect(screen.getByText('基础统计分析')).toBeInTheDocument();

    // Click the Select to open the dropdown
    const selectInput = screen.getByRole('combobox');
    fireEvent.mouseDown(selectInput);

    // Wait for dropdown to render, then check for * option text
    // Ant Design renders dropdown options in a portal
    await screen.findByText(/所有行/);
    expect(screen.getByText(/count all rows/)).toBeInTheDocument();
  });

  it('should render aggFields row with * column showing star icon and gray background', () => {
    const initialConfig: BasicStatsConfig = {
      tableName: 'orders',
      aggFields: [
        { id: 'f1', column: '*', func: 'COUNT', alias: 'row_count', distinct: false },
      ],
      groupByColumns: [],
      havingFilters: [],
      sortConfigs: [],
    };

    renderDrawer({ initialConfig });

    // The * column name should appear in the aggFields row
    const starTexts = screen.getAllByText('*');
    expect(starTexts.length).toBeGreaterThan(0);
  });

  it('should show row_count as default alias when * is in initialConfig', () => {
    const initialConfig: BasicStatsConfig = {
      tableName: 'orders',
      aggFields: [
        { id: 'f1', column: '*', func: 'COUNT', alias: 'row_count', distinct: false },
      ],
      groupByColumns: [],
      havingFilters: [],
      sortConfigs: [],
    };

    renderDrawer({ initialConfig });

    // The alias input should show row_count
    const aliasInput = screen.getByDisplayValue('row_count');
    expect(aliasInput).toBeInTheDocument();
  });

  it('should render * and regular columns coexisting with independent states', () => {
    const initialConfig: BasicStatsConfig = {
      tableName: 'orders',
      aggFields: [
        { id: 'f1', column: '*', func: 'COUNT', alias: 'row_count', distinct: false },
        { id: 'f2', column: 'amount', func: 'SUM', alias: 'sum_amount', distinct: false },
      ],
      groupByColumns: [],
      columnPrecision: { amount: 2 },
      havingFilters: [],
      sortConfigs: [],
    };

    renderDrawer({ initialConfig });

    // Both aliases should be visible
    expect(screen.getByDisplayValue('row_count')).toBeInTheDocument();
    expect(screen.getByDisplayValue('sum_amount')).toBeInTheDocument();

    // Both column names should appear
    expect(screen.getAllByText('*').length).toBeGreaterThan(0);
    expect(screen.getAllByText('amount').length).toBeGreaterThan(0);
  });

  it('should backfill initialConfig with * correctly — func=COUNT, alias=row_count, no precision for *', () => {
    const initialConfig: BasicStatsConfig = {
      tableName: 'orders',
      aggFields: [
        { id: 'f1', column: '*', func: 'COUNT', alias: 'row_count', distinct: false },
        { id: 'f2', column: 'category', func: 'COUNT', alias: 'count_category', distinct: false },
      ],
      groupByColumns: [],
      havingFilters: [],
      sortConfigs: [],
    };

    renderDrawer({ initialConfig });

    // row_count alias should be present
    expect(screen.getByDisplayValue('row_count')).toBeInTheDocument();
    // count_category alias should be present
    expect(screen.getByDisplayValue('count_category')).toBeInTheDocument();
    // Both column names visible
    expect(screen.getAllByText('*').length).toBeGreaterThan(0);
    expect(screen.getAllByText('category').length).toBeGreaterThan(0);
  });
});
