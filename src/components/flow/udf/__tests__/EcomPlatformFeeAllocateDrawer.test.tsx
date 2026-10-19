/**
 * EcomPlatformFeeAllocateDrawer Tests (review finding 5a)
 *
 * vitest 方言（jsdom，先例 BasicStatsDrawer.test.tsx）。
 * bun test 无 DOM（document is not defined）——仓库存量组件测试同样受限，非本特性回归。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EcomPlatformFeeAllocateDrawer } from '../EcomPlatformFeeAllocateDrawer';
import {
  SelectNodePanelType,
  resolveSelectNodePanelType,
} from '../../../../services/flow/bizKernelsBuilderStrategies';
import type { PlatformFeeAllocateConfig } from '../../../../services/flow/types';

// ── Helpers ────────────────────────────────────────────────────────────────

const onConfirm = vi.fn();
const onCancel = vi.fn();

/** auto-fillable column set (matches FIELD_MATCH_PATTERNS; `extra_fee` matches nothing) */
const AUTO_COLS = ['order_no', 'product_amount', 'quantity', 'platform_fee', 'ad_fee', 'extra_fee'];

function renderDrawer(props?: {
  columns?: string[];
  initialConfig?: PlatformFeeAllocateConfig;
}) {
  return render(
    <EcomPlatformFeeAllocateDrawer
      open
      columns={props?.columns ?? AUTO_COLS}
      initialConfig={props?.initialConfig}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

const makeInitial = (
  overrides: Partial<PlatformFeeAllocateConfig> = {}
): PlatformFeeAllocateConfig => ({
  mode: 'amount',
  fieldMapping: { orderIdCol: 'order_no', amountCol: 'product_amount' },
  feeSlots: {
    slot1: { operator: '+', column: 'platform_fee' },
    slot2: { operator: '+', column: '' },
    slot3: { operator: '+', column: '' },
    slot4: { operator: '+', column: '' },
  },
  deductSlots: {
    slot1: { operator: '-', column: '' },
    slot2: { operator: '-', column: '' },
  },
  ...overrides,
});

/** antd v6 splits two-char CJK buttons into "应 用" (letter-spacing) -> regex name */
const applyButton = () => screen.getByRole('button', { name: /应\s*用/ });

/** open a slot's column Select by climbing from its current selection-item text */
const openColumnSelect = (selectedText: string) => {
  const sel = screen.getByText(selectedText).closest('.ant-select') as HTMLElement;
  fireEvent.mouseDown(sel.querySelector('input') as Element);
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('EcomPlatformFeeAllocateDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('panel routing resolves fn_ecom_platform_fee_allocate to the fee-allocate drawer', () => {
    expect(resolveSelectNodePanelType('fn_ecom_platform_fee_allocate')).toBe(
      SelectNodePanelType.PLATFORM_FEE_ALLOCATE_CALC_DRAWER
    );
  });

  it('renders sections with three mode options, amount ratio as default', () => {
    renderDrawer();
    expect(screen.getByText('分摊模式与字段映射')).toBeInTheDocument();
    expect(screen.getByText('订单费用槽位（相加 = 订单费用）')).toBeInTheDocument();
    expect(screen.getByText('净利扣减槽位（可选）')).toBeInTheDocument();
    expect(screen.getByText('金额比例分摊')).toBeInTheDocument();
    expect(screen.getByText('数量比例分摊')).toBeInTheDocument();
    expect(screen.getByText('整单均摊')).toBeInTheDocument();
    expect((screen.getByRole('radio', { name: '金额比例分摊' }) as HTMLInputElement).checked).toBe(true);
  });

  it('auto-fills field mapping and fee slots from FIELD_MATCH_PATTERNS', () => {
    renderDrawer();
    expect(screen.getByText('order_no')).toBeInTheDocument();
    expect(screen.getByText('product_amount')).toBeInTheDocument();
    expect(screen.getByText('quantity')).toBeInTheDocument();
    expect(screen.getByText('platform_fee')).toBeInTheDocument();
    expect(screen.getByText('ad_fee')).toBeInTheDocument();
    expect(screen.getByText(/订单费用 = \+ platform_fee \+ ad_fee（按订单去重取总）/)).toBeInTheDocument();
  });

  it('switching mode updates description sentence (三模式切换)', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('radio', { name: '数量比例分摊' }));
    expect(screen.getByText('按行购买数量占比分摊')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '整单均摊' }));
    expect(screen.getByText('订单费用按行数均分')).toBeInTheDocument();
  });

  it('quantityCol is conditionally required in quantity mode', () => {
    renderDrawer({ initialConfig: makeInitial({ mode: 'amount' }) });
    fireEvent.click(screen.getByRole('radio', { name: '数量比例分摊' }));
    fireEvent.click(applyButton());
    expect(screen.getByText('数量比例分摊需要选择购买数量列')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('slot selection updates the formula preview (槽位增删与公式预览)', () => {
    renderDrawer();
    // slot2 auto-filled with ad_fee -> switch its column to the unmatched extra_fee
    openColumnSelect('ad_fee');
    fireEvent.click(screen.getByText('extra_fee', { selector: '.ant-select-item-option-content' }));
    expect(screen.getByText(/订单费用 = \+ platform_fee \+ extra_fee（按订单去重取总）/)).toBeInTheDocument();
  });

  it('saving writes back a platformFeeAllocateConfig-shaped object', () => {
    renderDrawer();
    fireEvent.click(applyButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const cfg = onConfirm.mock.calls[0][0] as PlatformFeeAllocateConfig;
    expect(cfg.mode).toBe('amount');
    expect(cfg.fieldMapping).toEqual({
      orderIdCol: 'order_no',
      amountCol: 'product_amount',
      quantityCol: 'quantity',
    });
    expect(cfg.feeSlots.slot1.column).toBe('platform_fee');
    expect(cfg.feeSlots.slot2.column).toBe('ad_fee');
    expect(cfg.deductSlots.slot1.column).toBe('');
  });

  it('slot 1 is mandatory — submit without any fee column is blocked', () => {
    renderDrawer({
      columns: ['order_no', 'product_amount'],
      initialConfig: makeInitial({
        feeSlots: {
          slot1: { operator: '+', column: '' },
          slot2: { operator: '+', column: '' },
          slot3: { operator: '+', column: '' },
          slot4: { operator: '+', column: '' },
        },
      }),
    });
    fireEvent.click(applyButton());
    expect(screen.getByText(/槽位 1（平台佣金）为必选/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dead config removed: no 预警阈值 / 风险分级 / 维度透传 controls', () => {
    renderDrawer();
    expect(screen.queryByText(/预警阈值|warningThresholdPct/)).toBeNull();
    expect(screen.queryByText(/风险分级/)).toBeNull();
    expect(screen.queryByText(/维度透传/)).toBeNull();
  });
});
