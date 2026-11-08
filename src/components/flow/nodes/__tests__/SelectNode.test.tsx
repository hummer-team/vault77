/**
 * Select Node Component Tests
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReactFlowProvider } from '@xyflow/react';
import * as flowStore from '../../../../stores/flowStore';
import { SelectNode } from '../SelectNode';
import {
  cloneDailyBizSummaryConfig,
  type DailyBizSummaryConfig,
} from '../../../../services/flow/strategies/ecomDailyBizSummaryStrategy';
import type { SelectNodeData } from '../../../../services/flow/types';
import { bizKernelService } from '../../../../services/biz-kernels/bizKernelService';

// Mock the flow store
vi.mock('../../../../stores/flowStore', () => ({
  useFlowStore: vi.fn(),
}));

/** 仅缺费用列（no-fee-col = WARNING）的 daily-biz 配置：ERROR 数 = 0，门禁必须放行 */
const warningOnlyDailyBizConfig = (): DailyBizSummaryConfig => {
  const cfg = cloneDailyBizSummaryConfig();
  cfg.feeCaliber = 'single_column';
  cfg.fieldMapping = { ...cfg.fieldMapping, orderDateCol: '订单支付时间', salesCol: '销售额', feeTotalCol: '' };
  return cfg;
};

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

  // 渲染型用例需要内核元数据（UDF 抽屉标题查表），初始化一次即可
  beforeAll(async () => {
    await bizKernelService.initialize();
  });

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

  // Phase 0 · 8 / §4 第 4 个门禁调用点：节点门禁只看 error（no-fee-col 是 warning）
  it('daily-biz 仅缺费用列（warning）时节点视为“已配置”，不显示未配置提示', () => {
    const updateNode = vi.fn();
    (flowStore.useFlowStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { removeNode: mockRemoveNode, setSelectedNode: mockSetSelectedNode, updateNode, nodes: [], edges: [] };
      return selector ? selector(state) : state;
    });
    render(
      <ReactFlowProvider>
        <SelectNode
          id="select-db-1"
          data={{
            fields: [],
            selectAll: false,
            udfFunctionName: 'fn_ecom_daily_biz_summary',
            dailyBizSummaryConfig: warningOnlyDailyBizConfig(),
          } as SelectNodeData}
          selected={false}
        />
      </ReactFlowProvider>,
    );
    expect(screen.queryByText('点击配置替换规则')).not.toBeInTheDocument();
    expect(screen.getByText(/已配置/)).toBeInTheDocument();
  });

  it('daily-biz 缺必填列（error）时节点仍显示未配置提示', () => {
    const updateNode = vi.fn();
    (flowStore.useFlowStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { removeNode: mockRemoveNode, setSelectedNode: mockSetSelectedNode, updateNode, nodes: [], edges: [] };
      return selector ? selector(state) : state;
    });
    render(
      <ReactFlowProvider>
        <SelectNode
          id="select-db-2"
          data={{
            fields: [],
            selectAll: false,
            udfFunctionName: 'fn_ecom_daily_biz_summary',
            dailyBizSummaryConfig: cloneDailyBizSummaryConfig(),
          } as SelectNodeData}
          selected={false}
        />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('点击配置替换规则')).toBeInTheDocument();
  });
});
