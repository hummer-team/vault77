/**
 * EcomSuspiciousOrderDetectDrawer Tests — Phase 4 interaction matrix.
 * vitest dialect (jsdom), precedent: EcomActivityEffectSplitDrawer.test.tsx.
 * antd Drawer renders into a body portal, so queries go through document.body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EcomSuspiciousOrderDetectDrawer } from '../ecomSuspiciousOrderDetectDrawer';
import {
  DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG,
  cloneSuspiciousOrderDetectConfig,
  type SuspiciousOrderDetectConfig,
} from '../../../../services/flow/types';

const onConfirm = vi.fn();
const onCancel = vi.fn();

const ALL_COLS = [
  '用户ID', '订单支付时间', '收货地址', '收货手机', '设备号',
  '实付金额', '原价', '订单号', '订单状态', '注册时间', '首次下单时间',
];

const selValue = (text: string) =>
  screen.queryAllByText(text, { selector: '.ant-select-content-value, .ant-select-selection-item' });

/** Inputs inside one rule row: [weight, ...thresholds]. */
const ruleInputs = (key: string) =>
  Array.from(document.body.querySelectorAll(`[data-rule="${key}"] input`)) as HTMLInputElement[];

const fieldInput = (field: string) =>
  document.body.querySelector(`[data-field="${field}"] input`) as HTMLInputElement;

const applyButton = () => screen.getByRole('button', { name: /应\s*用/ });

function makeCfg(patch: Partial<SuspiciousOrderDetectConfig> = {}): SuspiciousOrderDetectConfig {
  const base = cloneSuspiciousOrderDetectConfig(DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG);
  return {
    ...base,
    ...patch,
    fieldMapping: { ...base.fieldMapping, ...patch.fieldMapping },
    ruleToggles: { ...base.ruleToggles, ...patch.ruleToggles },
  };
}

function renderDrawer(props?: { columns?: string[]; initialConfig?: SuspiciousOrderDetectConfig }) {
  return render(
    <EcomSuspiciousOrderDetectDrawer
      open
      columns={props?.columns ?? ALL_COLS}
      initialConfig={props?.initialConfig}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
}

/** antd Switch exposes role=switch with aria-checked. */
const checkedSwitchCount = () =>
  screen.getAllByRole('switch').filter((el) => el.getAttribute('aria-checked') === 'true').length;

beforeEach(() => {
  cleanup();
  onConfirm.mockClear();
  onCancel.mockClear();
});

describe('EcomSuspiciousOrderDetectDrawer — column autofill', () => {
  it('prefills each subject/rule column when the regex yields a unique hit', () => {
    renderDrawer({ columns: ['用户ID', '订单支付时间', '收货手机', '收货地址', '设备号'] });

    expect(selValue('用户ID').length).toBeGreaterThan(0);
    expect(selValue('订单支付时间').length).toBeGreaterThan(0);
    expect(selValue('收货手机').length).toBeGreaterThan(0);
    expect(selValue('收货地址').length).toBeGreaterThan(0);
    expect(selValue('设备号').length).toBeGreaterThan(0);
  });

  it('keeps the column empty and shows a multi-candidate hint when several columns match', () => {
    renderDrawer({ columns: ['pay_time', 'payment_time'] });

    expect(screen.getAllByText(/多个候选/).length).toBeGreaterThan(0);
    expect(selValue('pay_time')).toHaveLength(0);
    expect(selValue('payment_time')).toHaveLength(0);
  });

  it('never overwrites a manual mapping that already points to an in-table column', () => {
    renderDrawer({
      columns: ALL_COLS,
      initialConfig: makeCfg({ fieldMapping: { orderTimeCol: '首次下单时间' } as never }),
    });

    // 手动选择必须保留；正则不得把它改回 订单支付时间
    expect(selValue('首次下单时间').length).toBeGreaterThan(0);
    expect(selValue('订单支付时间')).toHaveLength(0);
  });

  it('clears a column that no longer exists in the table and re-prefills from the regex', () => {
    renderDrawer({
      columns: ['用户ID', '订单支付时间', '收货手机号'],
      initialConfig: makeCfg({ fieldMapping: { mobileCol: '已删除列' } as never }),
    });

    expect(selValue('已删除列')).toHaveLength(0);
    expect(selValue('收货手机号').length).toBeGreaterThan(0);
  });

  it('does not clear columns when the upstream table exposes no columns yet', () => {
    renderDrawer({
      columns: [],
      initialConfig: makeCfg({ fieldMapping: { mobileCol: '手工手机列' } as never }),
    });

    expect(selValue('手工手机列').length).toBeGreaterThan(0);
  });
});

describe('EcomSuspiciousOrderDetectDrawer — rule toggles', () => {
  it('enables the 5 core rules and disables the 3 enhanced rules by default', () => {
    renderDrawer();

    expect(screen.getAllByRole('switch')).toHaveLength(8);
    expect(checkedSwitchCount()).toBe(5);
    // 增强行「已关闭」标识 = 3（覆盖摘要的「已关闭 3 项」不计入行标识）
    expect(screen.getAllByText(/已关闭·点击启用/).length).toBe(3);
  });

  it('edits a rule weight and applies only that weight', () => {
    renderDrawer();
    fireEvent.change(ruleInputs('burstOrders')[0], { target: { value: '5' } });
    fireEvent.click(applyButton());

    const cfg = onConfirm.mock.calls[0][0] as SuspiciousOrderDetectConfig;
    expect(cfg.weights.burstOrders).toBe(5);
    expect(cfg.weights.addressCluster).toBe(DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.weights.addressCluster);
  });

  it('edits a rule threshold and applies it as an integer', () => {
    renderDrawer();
    const inputs = ruleInputs('burstOrders');
    fireEvent.change(inputs[1], { target: { value: '3' } });
    fireEvent.click(applyButton());

    expect((onConfirm.mock.calls[0][0] as SuspiciousOrderDetectConfig).thresholds.burstOrderCount).toBe(3);
  });

  it('keeps the refund status list trimmed when edited', () => {
    renderDrawer({
      initialConfig: makeCfg({ ruleToggles: { refundAnomaly: true } as never }),
    });

    const input = fieldInput('refundStatusValues');
    expect(input.value).toContain('已退款');
    expect(input.value).toContain('REFUNDED');

    fireEvent.change(input, { target: { value: ' 已退款 , 已取消 ' } });
    fireEvent.click(applyButton());

    expect((onConfirm.mock.calls[0][0] as SuspiciousOrderDetectConfig).refundStatusValues).toBe('已退款,已取消');
  });

  it('keeps the price-anomaly ratio decimal instead of rounding it (0.3 stays 0.3)', () => {
    renderDrawer();
    fireEvent.click(applyButton());

    expect((onConfirm.mock.calls[0][0] as SuspiciousOrderDetectConfig).thresholds.priceAnomalyMaxRatio).toBe(0.3);
  });
});

describe('EcomSuspiciousOrderDetectDrawer — preview and gates', () => {
  it('renders the risk formula and the calibration table', () => {
    renderDrawer();

    expect(screen.getAllByText(/风险分 =/).length).toBeGreaterThan(0);
    expect(screen.getByText('命中项数')).toBeTruthy();
    expect(screen.getAllByText(/严重/).length).toBeGreaterThan(0);
  });

  // review 问题 2：Plan Phase 4 ⑦ 要求权重为 0 的规则在公式预览中标注「未计分」
  it('marks a zero-weight rule as 未计分 in the formula preview', () => {
    renderDrawer();
    expect(screen.queryByText(/未计分/)).toBeNull();

    fireEvent.change(ruleInputs('burstOrders')[0], { target: { value: '0' } });

    expect(screen.getByText(/命中密集下单（未计分）/)).toBeTruthy();
    // 其余规则仍按 命中X×权重 渲染
    expect(screen.getByText(/风险分 = min\(100, .*命中同地址多账号×20/)).toBeTruthy();
  });

  it('flags a rule whose dependency column is unmapped', () => {
    renderDrawer({
      columns: ['用户ID', '订单支付时间', '实付金额'],
      initialConfig: makeCfg({ fieldMapping: { amountCol: '实付金额', originalAmountCol: '' } as never, ruleToggles: { priceAnomaly: true } as never }),
    });

    expect(screen.getAllByText(/缺依赖列/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/本次仅 \d+\/8 项规则参与计算/).length).toBeGreaterThan(0);
  });

  it('shows the closed / skipped / effective three-state coverage summary', () => {
    const view = renderDrawer();
    expect(screen.getAllByText(/已关闭 3 项/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/生效 5\/8/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/生效 8\/8/)).toBeNull();
    view.unmount();

    renderDrawer({
      initialConfig: makeCfg({
        ruleToggles: {
          burstOrders: true, addressCluster: true, mobileCluster: true, deviceCluster: true,
          newAccounts: true, priceAnomaly: true, amountDeviation: true, refundAnomaly: true,
        } as never,
      }),
    });
    expect(screen.getAllByText(/生效 8\/8/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/已关闭/)).toBeNull();
    cleanup();

    renderDrawer({ columns: ['用户ID', '订单支付时间'] });
    expect(screen.getAllByText(/跳过 3 项/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/生效 2\/8/).length).toBeGreaterThan(0);
  });

  it('disables apply and explains the missing subject column', () => {
    renderDrawer({
      columns: ['订单支付时间'],
      initialConfig: makeCfg({ fieldMapping: { userIdCol: '' } as never }),
    });

    expect(applyButton()).toBeDisabled();
    expect(screen.getAllByText(/用户ID列/).length).toBeGreaterThan(0);
  });

  it('hands a deep copy to onConfirm so later edits cannot pollute it', () => {
    renderDrawer();
    fireEvent.click(applyButton());
    const payload = onConfirm.mock.calls[0][0] as SuspiciousOrderDetectConfig;

    fireEvent.change(ruleInputs('burstOrders')[0], { target: { value: '1' } });
    fireEvent.click(applyButton());

    expect(payload.weights.burstOrders).toBe(DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.weights.burstOrders);
    expect((onConfirm.mock.calls[1][0] as SuspiciousOrderDetectConfig).weights.burstOrders).toBe(1);
  });
});
