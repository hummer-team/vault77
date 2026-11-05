/**
 * EcomZeroNegativeOrderDetectDrawer Tests — Phase 3 interaction matrix.
 * vitest dialect (jsdom), precedent: EcomSuspiciousOrderDetectDrawer.test.tsx.
 * antd Drawer renders into a body portal, so queries go through document.body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EcomZeroNegativeOrderDetectDrawer } from '../EcomZeroNegativeOrderDetectDrawer';
import {
  DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG,
  buildZeroNegativeFormulaPreview,
  cloneZeroNegativeOrderDetectConfig,
  type ZeroNegativeOrderDetectConfig,
} from '../../../../services/flow/types';

const onConfirm = vi.fn();
const onCancel = vi.fn();

const ALL_COLS = [
  '订单号', '支付时间', '订单状态', '实付金额', '商品金额', '优惠合计', '数量', '单价', '退款金额',
];
/** 追加三条优惠分项，用于解锁「优惠分项不符」（R7） */
const RICH_COLS = [...ALL_COLS, '优惠券金额', '平台补贴', '商家优惠'];

const body = () => within(document.body);
const confirmBtn = () => screen.getByRole('button', { name: /确\s*定/ });
const fieldRow = (k: string) => document.body.querySelector(`[data-field="${k}"]`) as HTMLElement;
const inputOf = (k: string) => fieldRow(k).querySelector('input') as HTMLInputElement;
/** 已选值取自 antd 的选中态节点，避免与左侧中文标签串味 */
const selText = (k: string) =>
  fieldRow(k).querySelector('.ant-select-content-value, .ant-select-selection-item')?.textContent ?? '';
const previewText = () => fieldRow('formulaPreview').textContent ?? '';
const ruleSwitch = (rule: string) =>
  document.body.querySelector(`[data-rule="${rule}"] [role="switch"]`) as HTMLElement;
const isSwitchDisabled = (el: HTMLElement) =>
  el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.className.includes('disabled');
const openSelect = (sel: Element) => fireEvent.mouseDown(sel.querySelector('input') as Element);
const optionTexts = () =>
  Array.from(document.body.querySelectorAll('.ant-select-item-option-content')).map((e) => e.textContent ?? '');
/** 选项列表是虚拟滚动的，取靠后的选项必须先键入过滤词 */
function searchOptions(sel: Element, query: string): string[] {
  openSelect(sel);
  fireEvent.change(sel.querySelector('input') as Element, { target: { value: query } });
  return optionTexts();
}

function pickOptionInSelect(sel: Element, label: string): void {
  openSelect(sel);
  fireEvent.change(sel.querySelector('input') as Element, { target: { value: label } });
  const opt = Array.from(document.body.querySelectorAll('.ant-select-item-option-content'))
    .find((e) => e.textContent === label) as HTMLElement | undefined;
  if (!opt) throw new Error(`option not found: ${label}`);
  fireEvent.click(opt);
}

function pickOption(rowKey: string, label: string): void {
  pickOptionInSelect(fieldRow(rowKey).querySelector('.ant-select') as Element, label);
}

function renderDrawer(props?: {
  columns?: string[];
  initialConfig?: ZeroNegativeOrderDetectConfig;
  kernelDisplayName?: string;
  open?: boolean;
}) {
  return render(
    <EcomZeroNegativeOrderDetectDrawer
      open={props?.open ?? true}
      columns={props?.columns ?? RICH_COLS}
      initialConfig={props?.initialConfig}
      kernelDisplayName={props?.kernelDisplayName}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
}

beforeEach(() => {
  cleanup();
  onConfirm.mockClear();
  onCancel.mockClear();
});

describe('EcomZeroNegativeOrderDetectDrawer — 渲染与分区', () => {
  it('renders all five sections and the kernel display name', () => {
    renderDrawer({ kernelDisplayName: '0元单检测' });
    ['① 订单信息', '② 金额信息', '③ 检测规则', '④ 判定阈值', '⑤ 计算公式'].forEach((title) => {
      expect(body().getByText(title)).toBeInTheDocument();
    });
    expect(body().getByText('0元单检测')).toBeInTheDocument();
  });

  it('renders no form body when closed', () => {
    renderDrawer({ open: false });
    expect(body().queryByText('① 订单信息')).toBeNull();
    expect(body().queryByText('③ 检测规则')).toBeNull();
  });
});

describe('EcomZeroNegativeOrderDetectDrawer — 正则预填', () => {
  it('autofills the five key slots from distinctive column names', () => {
    renderDrawer({
      columns: ['订单号', '支付时间', '订单状态', '实付金额', '商品金额', '优惠合计', '数量', '单价', '退款金额'],
    });
    expect(selText('orderIdCol')).toBe('订单号');
    expect(selText('orderTimeCol')).toBe('支付时间');
    expect(selText('orderStatusCol')).toBe('订单状态');
    expect(selText('payAmountCol')).toBe('实付金额');
    expect(selText('productAmountCol')).toBe('商品金额');
    expect(selText('discountTotalCol')).toBe('优惠合计');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps an already saved value instead of overwriting it', () => {
    const initial = cloneZeroNegativeOrderDetectConfig(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG);
    initial.fieldMapping.payAmountCol = '自定义列';
    renderDrawer({ columns: ALL_COLS, initialConfig: initial });
    expect(selText('payAmountCol')).toBe('自定义列');
    expect(selText('productAmountCol')).toBe('商品金额');
  });
});

describe('EcomZeroNegativeOrderDetectDrawer — 依赖置灰', () => {
  it('disables R7 until its three discount columns are mapped', () => {
    renderDrawer({ columns: ALL_COLS });
    expect(isSwitchDisabled(ruleSwitch('discount_sum_mismatch'))).toBe(true);
    expect(body().getAllByText('缺少依赖列').length).toBeGreaterThan(0);
  });

  it('enables R7 once coupon/platform/merchant columns are available', () => {
    renderDrawer({ columns: RICH_COLS });
    expect(isSwitchDisabled(ruleSwitch('discount_sum_mismatch'))).toBe(false);
  });
});

describe('EcomZeroNegativeOrderDetectDrawer — 规则开关', () => {
  it('starts with six core rules on and two enhanced rules off', () => {
    renderDrawer();
    const core = ['zero_pay', 'negative_pay', 'negative_unit_price', 'discount_overflow', 'negative_field', 'amount_mismatch'];
    const enhanced = ['penny_order', 'discount_sum_mismatch'];
    core.forEach((k) => expect(ruleSwitch(k).getAttribute('aria-checked')).toBe('true'));
    enhanced.forEach((k) => expect(ruleSwitch(k).getAttribute('aria-checked')).toBe('false'));
  });

  it('emits an explicit enabledRules array without the switched-off key', () => {
    renderDrawer();
    fireEvent.click(ruleSwitch('zero_pay'));
    expect(confirmBtn()).toBeEnabled();
    fireEvent.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const payload = onConfirm.mock.calls[0][0] as ZeroNegativeOrderDetectConfig;
    expect(Array.isArray(payload.enabledRules)).toBe(true);
    expect(payload.enabledRules).not.toContain('zero_pay');
    expect(payload.enabledRules).toContain('negative_pay');
    expect(payload.enabledRules).toHaveLength(5);
  });
});

describe('EcomZeroNegativeOrderDetectDrawer — 阈值与 TopN', () => {
  it('blocks confirm when TopN leaves the 1-10 range', () => {
    // 控件本身会把越界值夹回区间，故用已保存的越界配置驱动门禁
    const initial = cloneZeroNegativeOrderDetectConfig(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG);
    initial.topN = 20;
    renderDrawer({ initialConfig: initial });
    expect(confirmBtn()).toBeDisabled();
    expect(body().getByText('洞察列出订单数需在 1–10 之间')).toBeInTheDocument();
  });

  it('blocks confirm when the tolerance is cleared', () => {
    renderDrawer();
    fireEvent.change(inputOf('toleranceYuan'), { target: { value: '' } });
    expect(confirmBtn()).toBeDisabled();
    expect(body().getByText('阈值需为不小于 0 的数字')).toBeInTheDocument();
  });
});

describe('EcomZeroNegativeOrderDetectDrawer — 公式槽位', () => {
  it('updates the human preview when a slot is added and restores the default formula', () => {
    renderDrawer();
    const initialPreview = previewText();
    const group = document.body.querySelector('[data-formula="expectedSlots"]') as HTMLElement;
    fireEvent.click(within(group).getByRole('button', { name: /新增槽位/ }));
    const added = group.querySelector('[data-slot="2"]') as HTMLElement;
    pickOptionInSelect(added.querySelectorAll('.ant-select')[1] as Element, '退款金额');
    expect(previewText()).not.toBe(initialPreview);

    fireEvent.click(body().getByRole('button', { name: '恢复默认公式' }));
    expect(previewText()).toBe(initialPreview);
    expect(selText('payAmountCol')).toBe('实付金额');
  });

  it('offers derived columns to the loss group only', () => {
    renderDrawer();
    const lossGroup = document.body.querySelector('[data-formula="lossSlots"]') as HTMLElement;
    const operand = lossGroup.querySelectorAll('.ant-select')[1] as Element;
    expect(searchOptions(operand, '应付')).toContain('应付金额');
  });

  it('keeps derived columns out of the expected group', () => {
    renderDrawer();
    const expGroup = document.body.querySelector('[data-formula="expectedSlots"]') as HTMLElement;
    const operand = expGroup.querySelectorAll('.ant-select')[1] as Element;
    expect(searchOptions(operand, '应付')).toEqual([]);
    expect(searchOptions(operand, '商品')).toContain('商品金额');
  });

  it('hides the SQL preview until the collapse is expanded', () => {
    renderDrawer();
    expect(previewText()).not.toContain('COALESCE');
    fireEvent.click(body().getByText('查看 SQL 表达式'));
    expect(previewText()).toContain('COALESCE');
  });
});

describe('EcomZeroNegativeOrderDetectDrawer — 门禁与提交', () => {
  const LOOSE_COLS = ['订单号', '支付时间', '订单状态', '实付金额', '优惠合计', '杂项列'];

  it('blocks confirm while a required column is missing, then confirms a deep copy', () => {
    renderDrawer({ columns: LOOSE_COLS });
    expect(confirmBtn()).toBeDisabled();
    expect(body().getByText('请指定商品金额列')).toBeInTheDocument();

    pickOption('productAmountCol', '杂项列');
    expect(confirmBtn()).toBeEnabled();

    fireEvent.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // 深拷贝：污染第一次返回值不得渗透回抽屉内部状态
    const first = onConfirm.mock.calls[0][0] as ZeroNegativeOrderDetectConfig;
    first.fieldMapping.productAmountCol = '污染';
    first.formula.expectedSlots[0].column = '污染';

    fireEvent.click(confirmBtn());
    const second = onConfirm.mock.calls[1][0] as ZeroNegativeOrderDetectConfig;
    expect(second.fieldMapping.productAmountCol).toBe('杂项列');
    expect(second.formula.expectedSlots[0].column).not.toBe('污染');
  });

  it('cancels without confirming', () => {
    renderDrawer();
    fireEvent.click(body().getByRole('button', { name: /取\s*消/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('EcomZeroNegativeOrderDetectDrawer — 主题合规', () => {
  it('emits no hardcoded hexadecimal colours', () => {
    const { baseElement } = renderDrawer();
    const html = baseElement.innerHTML;
    const hexes = html.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes).toEqual([]);
  });

  it('renders the default formula preview from the shared pure function', () => {
    renderDrawer();
    const expected = buildZeroNegativeFormulaPreview(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG);
    expect(previewText()).toContain(expected.expectedHuman);
    expect(previewText()).toContain(expected.lossHuman);
  });
});