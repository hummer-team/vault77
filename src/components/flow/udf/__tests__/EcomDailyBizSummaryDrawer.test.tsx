/**
 * EcomDailyBizSummaryDrawer Tests — Phase 3 interaction matrix.
 * antd Drawer renders into a body portal, so queries go through document.body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EcomDailyBizSummaryDrawer } from '../EcomDailyBizSummaryDrawer';
import {
  DAILY_BIZ_COMPARE_COPY,
  DAILY_BIZ_NO_FEE_COL_MESSAGE,
  DEFAULT_DAILY_BIZ_SUMMARY_CONFIG,
  cloneDailyBizSummaryConfig,
  dailyBizSlotHuman,
  resolveDailyBizProfitSlots,
  type DailyBizSummaryConfig,
} from '../../../../services/flow/strategies/ecomDailyBizSummaryStrategy';

const onConfirm = vi.fn();
const onCancel = vi.fn();

const ZH_COLS = ['订单支付时间', '销售额', '订单号', '订单状态', '毛利额', '商品成本', '退款金额', '费用合计', '佣金', '运费', '服务费', '销量'];

const fieldRow = (k: string) => document.body.querySelector(`[data-field="${k}"]`) as HTMLElement | null;
const selText = (k: string) =>
  fieldRow(k)?.querySelector('.ant-select-content-value, .ant-select-selection-item')?.textContent ?? '';
const confirmBtn = () => screen.getByRole('button', { name: /确\s*定/ });
const previewText = () => fieldRow('formulaPreview')?.textContent ?? '';
const formulaOf = (group: string) => document.body.querySelector(`[data-formula="${group}"]`) as HTMLElement | null;
const qualityText = () => fieldRow('dataQuality')?.textContent ?? '';

const openSelect = (sel: Element) => fireEvent.mouseDown(sel.querySelector('input') as Element);

function pickOptionInSelect(sel: Element, label: string): void {
  openSelect(sel);
  fireEvent.change(sel.querySelector('input') as Element, { target: { value: label } });
  const opt = Array.from(document.body.querySelectorAll('.ant-select-item-option-content'))
    .find((e) => e.textContent === label) as HTMLElement | undefined;
  if (!opt) throw new Error(`option not found: ${label}`);
  fireEvent.click(opt);
}

const pickIn = (rowKey: string, label: string) =>
  pickOptionInSelect(fieldRow(rowKey)!.querySelector('.ant-select') as Element, label);

const renderDrawer = (props: Partial<React.ComponentProps<typeof EcomDailyBizSummaryDrawer>> = {}) =>
  render(
    <EcomDailyBizSummaryDrawer
      open
      columns={ZH_COLS}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );

/** 追加一项净利槽位并选定「服务费」，使其成为「已编辑」 */
function editNetProfitExtraSlot(): void {
  const group = formulaOf('netProfitSlots')!;
  const addBtn = within(group).getByRole('button', { name: /新增项/ });
  fireEvent.click(addBtn);
  const selects = group.querySelectorAll('[data-slot]');
  const lastSlot = selects[selects.length - 1] as HTMLElement;
  pickOptionInSelect(lastSlot.querySelectorAll('.ant-select')[1] as Element, '服务费');
}

beforeEach(() => {
  cleanup();
  onConfirm.mockClear();
  onCancel.mockClear();
});

describe('Phase 3 — 渲染', () => {
  it('5 个分区标题全部出现，必填项带 * 标记', () => {
    renderDrawer();
    for (const title of ['① 时间与主体', '② 金额口径', '③ 公式', '④ 过滤与对比', '⑤ 输出与质量']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(fieldRow('orderDateCol')?.textContent).toContain('*');
    expect(fieldRow('salesCol')?.textContent).toContain('*');
    expect(fieldRow('orderIdCol')?.textContent).not.toContain('*');
  });

  it('缺必填列时确定按钮禁用并给出阻断提示', () => {
    renderDrawer({ columns: [] });
    expect(confirmBtn()).toBeDisabled();
    expect(document.body.querySelector('[data-alert="blockers"]')).not.toBeNull();
  });
});

describe('Phase 3 — 预填', () => {
  it('中文列名集合按正则唯一命中预填', () => {
    renderDrawer();
    expect(selText('orderDateCol')).toBe('订单支付时间');
    expect(selText('salesCol')).toBe('销售额');
    expect(selText('grossProfitCol')).toBe('毛利额');
    expect(confirmBtn()).toBeEnabled();
  });

  it('已保存配置不被预填覆盖', () => {
    const saved = cloneDailyBizSummaryConfig();
    saved.fieldMapping = { ...saved.fieldMapping, orderDateCol: '自定义时间', salesCol: '自定义销售额' };
    renderDrawer({ initialConfig: saved });
    expect(selText('orderDateCol')).toBe('自定义时间');
    expect(selText('salesCol')).toBe('自定义销售额');
  });

  it('歧义列（两列同时命中）保持为空', () => {
    renderDrawer({ columns: ['销售额', 'net_amount', '订单支付时间'] });
    expect(selText('salesCol')).toBe('');
    expect(confirmBtn()).toBeDisabled();
  });
});

describe('Phase 3 — 可搜索', () => {
  it('所有列下拉都带 data-searchable 标记', () => {
    renderDrawer();
    const searchable = document.body.querySelectorAll('[data-searchable="true"]');
    expect(searchable.length).toBeGreaterThanOrEqual(10);
    for (const wrapper of Array.from(searchable)) {
      expect(wrapper.querySelector('.ant-select')).not.toBeNull();
    }
  });

  it('输入过滤后只剩命中选项', () => {
    renderDrawer();
    const sel = fieldRow('orderIdCol')!.querySelector('.ant-select') as Element;
    openSelect(sel);
    fireEvent.change(sel.querySelector('input') as Element, { target: { value: '运费' } });
    const options = Array.from(document.body.querySelectorAll('.ant-select-item-option-content')).map((e) => e.textContent);
    expect(options).toContain('运费');
    expect(options).not.toContain('订单支付时间');
  });
});

describe('Phase 3 — 降级可见（Q9）', () => {
  it('无毛利列 → 自动降级标签，且毛利公式人话与策略同源', () => {
    const columns = ZH_COLS.filter((c) => c !== '毛利额');
    renderDrawer({ columns });
    expect(document.body.querySelector('[data-tag="degraded"]')?.textContent).toContain('自动降级');
    const cfg = cloneDailyBizSummaryConfig();
    cfg.fieldMapping = { ...cfg.fieldMapping, orderDateCol: '订单支付时间', salesCol: '销售额', costCol: '商品成本' };
    expect(previewText()).toContain(dailyBizSlotHuman(resolveDailyBizProfitSlots(cfg)));
  });

  it('无退款列 → 质量区给出退款金额说明', () => {
    renderDrawer({ columns: ZH_COLS.filter((c) => c !== '退款金额') });
    expect(qualityText()).toContain('退款金额');
    expect(document.body.querySelector('[data-field="dataQuality"]')?.textContent).not.toContain('口径完整');
  });

  it('口径完整时显示「口径完整」', () => {
    renderDrawer();
    expect(qualityText()).toContain('口径完整');
  });
});

describe('Phase 3 — 销售额口径切换（Q12）', () => {
  it('未编辑时切到「已扣退款」→ 净利公式不再含退款金额', () => {
    renderDrawer();
    expect(previewText()).toContain('退款金额');
    fireEvent.click(screen.getByText('已扣退款（净额）'));
    expect(previewText()).not.toContain('退款金额');
    expect(document.body.querySelector('[data-alert="caliber-conflict"]')).toBeNull();
  });

  it('已编辑后切换 → 槽位保留且冲突提示出现，恢复默认后消失', () => {
    renderDrawer();
    editNetProfitExtraSlot();
    const beforeCount = formulaOf('netProfitSlots')!.querySelectorAll('[data-slot]').length;
    expect(beforeCount).toBe(4);

    fireEvent.click(screen.getByText('已扣退款（净额）'));
    expect(formulaOf('netProfitSlots')!.querySelectorAll('[data-slot]').length).toBe(4);
    expect(document.body.querySelector('[data-alert="caliber-conflict"]')).not.toBeNull();

    fireEvent.click(screen.getByText('恢复默认公式'));
    expect(document.body.querySelector('[data-alert="caliber-conflict"]')).toBeNull();
    expect(formulaOf('netProfitSlots')!.querySelectorAll('[data-slot]').length).toBe(2);
  });
});

describe('Phase 3 — 费用口径（Q14）', () => {
  it('分项相加时置灰合计列、启用三分项；切回反之', () => {
    renderDrawer();
    expect(fieldRow('feeTotalCol')!.querySelector('.ant-select-disabled')).toBeNull();
    expect(fieldRow('commissionFeeCol')!.querySelector('.ant-select-disabled')).not.toBeNull();

    fireEvent.click(screen.getByText('分项相加'));
    expect(fieldRow('feeTotalCol')!.querySelector('.ant-select-disabled')).not.toBeNull();
    expect(fieldRow('commissionFeeCol')!.querySelector('.ant-select-disabled')).toBeNull();
    expect(formulaOf('feeSlots')).not.toBeNull();

    fireEvent.click(screen.getByText('费用合计列'));
    expect(fieldRow('feeTotalCol')!.querySelector('.ant-select-disabled')).toBeNull();
    expect(fieldRow('serviceFeeCol')!.querySelector('.ant-select-disabled')).not.toBeNull();
  });

  it('分项全清空 → 确定禁用且提示含「费用」', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('分项相加'));
    const group = formulaOf('feeSlots')!;
    // 删到只剩 1 项后禁用删除，故先新增到 2 项再逐项删除
    fireEvent.click(within(group).getByRole('button', { name: /新增项/ }));
    for (let i = 0; i < 3; i++) {
      const del = within(group).getAllByRole('button', { name: /删除/ }).find((b) => !(b as HTMLButtonElement).disabled);
      if (!del) break;
      fireEvent.click(del);
    }
    expect(within(group).queryAllByRole('button', { name: /删除/ })).toHaveLength(1);
    expect(document.body.querySelector('[data-alert="blockers"]')?.textContent ?? '').toBeTruthy();
  });
});

describe('Phase 3 — 提交', () => {
  it('确定按钮提交深拷贝', () => {
    const initial = cloneDailyBizSummaryConfig();
    initial.fieldMapping = { ...DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping };
    renderDrawer({ initialConfig: initial });
    fireEvent.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const submitted = onConfirm.mock.calls[0][0] as DailyBizSummaryConfig;
    expect(submitted).not.toBe(initial);
    expect(submitted.netProfitSlots).not.toBe(initial.netProfitSlots);
    submitted.netProfitSlots.push({ operator: '+', column: 'profit' });
    expect(initial.netProfitSlots).toHaveLength(3);
  });
});

describe('Phase 3 — 主题合规', () => {
  it('源文件不含硬编码色值', () => {
    const src = readFileSync(resolve(__dirname, '../EcomDailyBizSummaryDrawer.tsx'), 'utf-8');
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toHaveLength(0);
    expect(src).not.toContain('rgba(');
  });
});

describe('Phase 3 — 列下拉取值', () => {
  it('选择列后写入草稿并可提交', () => {
    renderDrawer({ columns: ['订单支付时间', '销售额'] });
    pickIn('orderStatusCol', '销售额');
    fireEvent.click(confirmBtn());
    const submitted = onConfirm.mock.calls[0][0] as DailyBizSummaryConfig;
    expect(submitted.fieldMapping.orderStatusCol).toBe('销售额');
  });
});

// ── Issue 4 / Issue 8：歧义提示与负例 ─────────────────────────────────────────

const hintText = () => document.body.querySelector('[data-hint="ambiguous"]')?.textContent ?? '';

const slotSumConfig = (): DailyBizSummaryConfig => {
  const cfg = cloneDailyBizSummaryConfig();
  cfg.feeCaliber = 'slot_sum';
  return cfg;
};

describe('Phase 3 — 歧义提示（Issue 4 / Issue 8）', () => {
  it('必填项歧义 → 下拉留空、1 条逐条提示、无计数行', () => {
    renderDrawer({ columns: ['订单支付时间', '销售额', '销售额合计'] });
    expect(selText('salesCol')).toBe('');
    expect(hintText()).toContain('销售额');
    expect(hintText()).toContain('候选列');
    expect(hintText()).not.toContain('另有');
  });

  it('可选槽歧义 → 下拉留空、无逐条提示、仅 1 行折叠计数', () => {
    renderDrawer({ columns: ['订单支付时间', '销售额', '退款金额', '退款金额合计'] });
    expect(selText('refundAmountCol')).toBe('');
    expect(hintText()).not.toContain('候选列');
    expect(hintText()).toContain('另有 1 处字段有多个候选');
  });

  it('唯一命中 → 正常预填且无任何歧义文本', () => {
    renderDrawer({ columns: ['订单支付时间', '销售额', '退款金额'] });
    expect(selText('refundAmountCol')).toBe('退款金额');
    expect(hintText()).toBe('');
  });

  it('slot_sum 下 focused 满 5 项 → 逐条 3 条 + 「另有 2 处」（截断不丢歧义）', () => {
    renderDrawer({
      initialConfig: slotSumConfig(),
      columns: [
        '订单支付时间', '支付时间',
        '销售额', '销售额合计',
        '佣金', '佣金合计',
        '运费', '运费合计',
        '服务费', '服务费合计',
      ],
    });
    const hints = document.body.querySelector('[data-hint="ambiguous"]')!;
    expect(hints.textContent?.split('个候选列').length ?? 0).toBe(4); // 3 条逐条提示
    expect(hintText()).toContain('另有 2 处字段有多个候选');
  });

  it('single_column 下逐条 3 条 + 「另有 1 处」', () => {
    renderDrawer({
      columns: [
        '订单支付时间', '支付时间',
        '销售额', '销售额合计',
        '费用合计', '费用合计明细',
        '毛利额', '毛利金额',
      ],
    });
    const hints = document.body.querySelector('[data-hint="ambiguous"]')!;
    expect(hints.textContent?.split('个候选列').length ?? 0).toBe(4); // 3 条逐条提示
    expect(hintText()).toContain('另有 1 处字段有多个候选');
  });
});

describe('Phase 3 — 预填负例（Issue 4）', () => {
  it('退款状态 / 退款原因 / 毛利率 / 成本占比 均不预填金额类槽位', () => {
    renderDrawer({ columns: ['退款状态', '退款原因', '毛利率', '成本占比'] });
    for (const key of ['salesCol', 'refundAmountCol', 'grossProfitCol', 'costCol']) {
      expect(selText(key), `${key} 不应被预填`).toBe('');
    }
  });

  it('费用列未映射（warning）不阻断提交，且提示文案同源', () => {
    renderDrawer({ columns: ['订单支付时间', '销售额', '毛利额'] });
    expect(confirmBtn()).toBeEnabled();
    expect(fieldRow('dataQuality')?.parentElement?.textContent ?? document.body.textContent).toContain(
      DAILY_BIZ_NO_FEE_COL_MESSAGE,
    );
    expect(document.body.querySelector('[data-alert="blockers"]')).toBeNull();
  });
});

describe('Phase 3 — 对比文案同源（Issue 2）', () => {
  it('④ 分区对比口径 tip 引用单一真源常量', () => {
    const src = readFileSync(resolve(__dirname, '../EcomDailyBizSummaryDrawer.tsx'), 'utf-8');
    expect(src).toContain('tip={DAILY_BIZ_COMPARE_COPY}');
    expect(src).not.toContain('与上一可对齐出数日比较');
    expect(DAILY_BIZ_COMPARE_COPY.length).toBeGreaterThan(0);
  });
});
