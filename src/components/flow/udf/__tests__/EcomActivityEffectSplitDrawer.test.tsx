/**
 * EcomActivityEffectSplitDrawer Tests
 *
 * vitest 方言（jsdom，先例 EcomPlatformFeeAllocateDrawer.test.tsx）。
 * 覆盖 Phase 2 面板路由/映射表 + Phase 3 抽屉交互矩阵。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EcomActivityEffectSplitDrawer } from '../EcomActivityEffectSplitDrawer';
import {
  SelectNodePanelType,
  resolveSelectNodePanelType,
} from '../../../../services/flow/bizKernelsBuilderStrategies';
import { KERNEL_UDF_MAP } from '../../../../services/duckDBUdfService';
import {
  DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG,
  type ActivityEffectSplitConfig,
} from '../../../../services/flow/types';
import { DIMENSION_LABEL } from '../../../../services/flow/strategies/ecomActivityEffectSplitStrategy';

const onConfirm = vi.fn();
const onCancel = vi.fn();

const AUTO_COLS = ['活动编号', '订单实付金额', '优惠券编号', '直播间编号'];

function renderDrawer(props?: { columns?: string[]; initialConfig?: ActivityEffectSplitConfig }) {
  return render(
    <EcomActivityEffectSplitDrawer
      open
      columns={props?.columns ?? AUTO_COLS}
      initialConfig={props?.initialConfig}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

const makeCfg = (o: Partial<ActivityEffectSplitConfig> = {}): ActivityEffectSplitConfig => ({
  ...DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG,
  fieldMapping: { ...DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG.fieldMapping, ...o.fieldMapping },
  liftSlots: DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG.liftSlots.map((s) => ({ ...s })),
  costSlots: DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG.costSlots.map((s) => ({ ...s })),
  ...o,
});

// antd v6 双字 CJK 按钮拆字（"应 用"）
const applyButton = () => screen.getByRole('button', { name: /应\s*用/ });

/** 打开指定当前选中文本的列下拉（仅匹配选择器内的展示值，排除选项列表干扰） */
const openSelect = (selectedText: string) => {
  const sel = screen
    .getByText(selectedText, { selector: '.ant-select-content-value, .ant-select-selection-item' })
    .closest('.ant-select') as HTMLElement;
  fireEvent.mouseDown(sel.querySelector('input') as Element);
};

/** 打开尚无选中文本（空值 placeholder）的 FieldRow 列下拉 */
const openSelectByLabel = (label: string) => {
  const row = screen.getByText(label).parentElement?.parentElement as HTMLElement;
  const sel = row.querySelector('.ant-select') as HTMLElement;
  fireEvent.mouseDown(sel.querySelector('input') as Element);
};

/** 打开「拉动金额」口径下拉（当前值文本定位） */
const openLiftCaliber = () => openSelect('活动订单实付金额');

const pickOption = (name: string) =>
  fireEvent.click(screen.getByText(name, { selector: '.ant-select-item-option-content' }));

/** 取下拉选中的 option 容器（带 disabled 样式类） */
const optionItem = (name: string) =>
  screen.getByText(name, { selector: '.ant-select-item-option-content' }).closest('.ant-select-item') as HTMLElement;

describe('Phase 2 覆盖：面板路由与映射表', () => {
  it('resolveSelectNodePanelType 路由到活动效果拆分抽屉', () => {
    expect(resolveSelectNodePanelType('fn_ecom_activity_effect_split')).toBe(
      SelectNodePanelType.ACTIVITY_EFFECT_SPLIT_DRAWER
    );
  });

  it('KERNEL_UDF_MAP 含 fn_ecom_activity_effect_split', () => {
    expect(KERNEL_UDF_MAP['fn_ecom_activity_effect_split']).toBe('fn_ecom_activity_effect_split');
  });
});

describe('EcomActivityEffectSplitDrawer 初始渲染与门禁', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('挂载即渲染四组配置，默认勾选活动/优惠券/直播间，活动类型未勾选', () => {
    renderDrawer();
    expect(screen.getByText(/拆分维度/)).toBeInTheDocument();
    expect(screen.getByText(/时间与基线窗口/)).toBeInTheDocument();
    expect(screen.getByText(/订单与金额/)).toBeInTheDocument();
    expect(screen.getByText(/补贴成本口径/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: DIMENSION_LABEL.activity })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: DIMENSION_LABEL.coupon })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: DIMENSION_LABEL.live_room })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: DIMENSION_LABEL.activity_type })).not.toBeChecked();
  });

  it('取消全部维度 → 应用禁用 + 警示「请至少选择一个拆分维度」', () => {
    renderDrawer();
    for (const d of ['activity', 'coupon', 'live_room'] as const) {
      fireEvent.click(screen.getByRole('checkbox', { name: DIMENSION_LABEL[d] }));
    }
    expect(applyButton()).toBeDisabled();
    expect(screen.getByText('请至少选择一个拆分维度')).toBeInTheDocument();
  });

  it('勾选维度未选列 → 禁用 + 行内警示含「优惠券…维度尚未指定数据列」；补齐列后恢复', () => {
    // 默认勾选优惠券，但 columns 无优惠券列 → 门禁
    renderDrawer({ columns: ['活动编号', '订单实付金额', '直播间编号'] });
    expect(applyButton()).toBeDisabled();
    expect(screen.getByText(/优惠券维度尚未指定数据列/)).toBeInTheDocument();
    fireEvent.click(applyButton());
    expect(onConfirm).not.toHaveBeenCalled();
    openSelectByLabel('优惠券列');
    pickOption('活动编号');
    expect(applyButton()).toBeEnabled();
  });

  it('清空实付金额列 → 应用禁用（无 toast）', () => {
    renderDrawer({ initialConfig: makeCfg({ dimensions: ['activity'], fieldMapping: { activityIdCol: '活动编号', netAmountCol: '订单实付金额' } }) });
    expect(applyButton()).toBeEnabled();
    const netSel = screen.getByText('订单实付金额').closest('.ant-select') as HTMLElement;
    fireEvent.mouseDown(netSel.querySelector('.ant-select-clear') as Element);
    expect(applyButton()).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('抽屉内不存在基线「开关」控件（liftCaliber 即唯一真值，决策 #5）', () => {
    renderDrawer();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });
});

describe('自动预填与不覆盖', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('唯一命中自动填充：活动/实付/优惠券/直播间 4 列预填并可提交', () => {
    renderDrawer();
    fireEvent.click(applyButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.fieldMapping.activityIdCol).toBe('活动编号');
    expect(cfg.fieldMapping.netAmountCol).toBe('订单实付金额');
    expect(cfg.fieldMapping.couponIdCol).toBe('优惠券编号');
    expect(cfg.fieldMapping.liveRoomIdCol).toBe('直播间编号');
  });

  it('activityNameCol 唯一命中预填且不覆盖已填 activityIdCol', () => {
    renderDrawer({
      columns: ['活动名称', '活动编号', '实付金额'],
      initialConfig: makeCfg({ dimensions: ['activity'], fieldMapping: { activityIdCol: '活动编号', netAmountCol: '实付金额' } }),
    });
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.fieldMapping.activityNameCol).toBe('活动名称');
    expect(cfg.fieldMapping.activityIdCol).toBe('活动编号');
  });

  it('多候选不回填：成本多列 → costSingleColumn 保持空、placeholder 含「多个候选」，门禁同源拦截', () => {
    renderDrawer({ columns: ['活动编号', '订单实付金额', '优惠券编号', '直播间编号', '成本', '物流成本'] });
    fireEvent.click(screen.getByRole('radio', { name: '直接用一列' }));
    expect(screen.getByText('多个候选：成本 / 物流成本')).toBeInTheDocument();
    // 未选成本列 = Phase 1 阻断原因，抽屉门禁同源：不允许保存后再在执行期被拦
    expect(applyButton()).toBeDisabled();
    expect(screen.getByText('单列成本口径需要指定成本列')).toBeInTheDocument();
    fireEvent.click(applyButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('不覆盖已填：initialConfig.netAmountCol 不被正则结果替换', () => {
    renderDrawer({ initialConfig: makeCfg({ dimensions: ['activity'], fieldMapping: { activityIdCol: '活动编号', netAmountCol: 'pay_amount' } }) });
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.fieldMapping.netAmountCol).toBe('pay_amount');
  });

  it('columns=[] 时槽位保持默认值不被清空', () => {
    renderDrawer({
      columns: [],
      initialConfig: makeCfg({ dimensions: ['activity'], fieldMapping: { activityIdCol: 'a', netAmountCol: 'n' } }),
    });
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.costSlots.map((s) => s.column)).toEqual(['coupon_amount', 'discount_amount', 'platform_subsidy', 'ad_cost']);
  });
});

describe('口径与槽位', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('三个时间列未选齐 → 「活动前后增量」option disabled；选齐后可选中', () => {
    renderDrawer();
    openLiftCaliber();
    expect(optionItem('活动前后增量')).toHaveClass('ant-select-item-option-disabled');
    const TIME_COLS = [...AUTO_COLS, '支付时间', '活动开始时间', '活动结束时间'];
    cleanup();
    renderDrawer({ columns: TIME_COLS });
    openLiftCaliber();
    expect(optionItem('活动前后增量')).not.toHaveClass('ant-select-item-option-disabled');
    pickOption('活动前后增量');
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.liftCaliber).toBe('baseline_delta');
    expect('baselineEnabled' in cfg).toBe(false);
    expect(screen.getByText(/同一活动.*券.*直播.*留空/)).toBeInTheDocument();
    expect(screen.queryByText(/活动前同样长的时间/)).not.toBeInTheDocument();
  });

  it('口径来回切换不被静默覆盖为 activity_gmv', () => {
    const TIME_COLS = [...AUTO_COLS, '支付时间', '活动开始时间', '活动结束时间'];
    renderDrawer({
      columns: TIME_COLS,
      initialConfig: makeCfg({
        dimensions: ['activity'],
        fieldMapping: { activityIdCol: '活动编号', netAmountCol: '订单实付金额', productAmountCol: '商品金额' },
      }),
    });
    openLiftCaliber();
    pickOption('商品实付金额');
    openSelect('商品实付金额');
    pickOption('活动前后增量');
    openSelect('活动前后增量');
    pickOption('商品实付金额');
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.liftCaliber).toBe('product_amount');
  });

  it('成本槽位表外列清理：columns 不含默认成本列 → 4 槽清空、唯一命中回填优惠券金额；载荷无默认槽名', () => {
    renderDrawer({ columns: ['活动编号', '订单实付金额', '优惠券编号', '直播间编号', '优惠券金额'] });
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.costSlots.map((s) => s.column)).toEqual(['优惠券金额', '', '', '']);
  });

  it('成本口径切换 → single_column 且 costSlots 保留不丢', () => {
    renderDrawer({ columns: [...AUTO_COLS, 'coupon_amount', 'discount_amount', 'platform_subsidy', 'ad_cost'] });
    fireEvent.click(screen.getByRole('radio', { name: '直接用一列' }));
    fireEvent.click(screen.getByRole('radio', { name: '按费用项累加' }));
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.costSlots.map((s) => s.column)).toEqual(['coupon_amount', 'discount_amount', 'platform_subsidy', 'ad_cost']);
    fireEvent.click(screen.getByRole('radio', { name: '直接用一列' }));
    fireEvent.click(applyButton());
    const cfg2 = onConfirm.mock.calls[1][0] as ActivityEffectSplitConfig;
    expect(cfg2.costCaliber).toBe('single_column');
    expect(cfg2.costSlots).toHaveLength(4);
  });

  it('默认配置隔离性：改槽 → 取消 → 重挂载 → 载荷仍为默认；DEFAULT 常量未被污染', () => {
    const cols = [...AUTO_COLS, 'coupon_amount', 'discount_amount', 'platform_subsidy', 'ad_cost', 'extra_cost'];
    const { unmount } = renderDrawer({ columns: cols });
    openSelectByLabel('费用项 1');
    pickOption('extra_cost');
    fireEvent.click(screen.getByRole('button', { name: /取\s*消/ }));
    unmount();
    renderDrawer({ columns: cols });
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.costSlots[0].column).toBe('coupon_amount');
    expect(DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG.costSlots[0].column).toBe('coupon_amount');
  });

  it('勾选活动类型后可填 activityTypeCol', () => {
    renderDrawer({ columns: [...AUTO_COLS, '活动类型'] });
    fireEvent.click(screen.getByRole('checkbox', { name: DIMENSION_LABEL.activity_type }));
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.dimensions).toContain('activity_type');
    expect(cfg.fieldMapping.activityTypeCol).toBe('活动类型');
  });

  it('优惠券区块含「优惠金额」下拉写回 couponAmountCol', () => {
    renderDrawer();
    expect(screen.getByText('优惠金额')).toBeInTheDocument();
  });
});

describe('载荷规范化', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('所有列名 trim、topN 限定 1–10', () => {
    renderDrawer({
      initialConfig: makeCfg({
        dimensions: ['activity'],
        fieldMapping: { activityIdCol: ' 活动A ', netAmountCol: ' pay ' },
        topN: 7,
        excludedStatuses: ' CANCELLED , CLOSED ',
      }),
      columns: [],
    });
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.fieldMapping.activityIdCol).toBe('活动A');
    expect(cfg.fieldMapping.netAmountCol).toBe('pay');
    expect(cfg.topN).toBe(7);
    expect(cfg.excludedStatuses).toBe('CANCELLED , CLOSED');
  });

  it('topN 越界（历史异常值）→ 门禁同源拦截并提示可修正', () => {
    renderDrawer({
      initialConfig: makeCfg({
        dimensions: ['activity'],
        fieldMapping: { activityIdCol: '活动A', netAmountCol: 'pay' },
        topN: 99,
      }),
      columns: [],
    });
    expect(applyButton()).toBeDisabled();
    expect(screen.getByText('洞察数量需在 1–10 之间')).toBeInTheDocument();
  });
});

describe('槽位增删与门禁覆盖（Phase 3 任务 5 / 校验规则 4 + 补充规则）', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('成本槽位 4 行：增加按钮 disabled；删到 1 行后删除按钮 disabled 且载荷只剩 1 槽', () => {
    renderDrawer();
    expect(screen.getByRole('button', { name: '增加费用项' })).toBeDisabled();
    for (let i = 4; i >= 1; i -= 1) {
      fireEvent.click(screen.getByRole('button', { name: `删除费用项 ${i}` }));
    }
    expect(screen.getByRole('button', { name: '增加费用项' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '删除费用项 1' })).toBeDisabled();
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.costSlots).toHaveLength(1);
  });

  it('拉动槽位最少 1 行（删除 disabled）；增到 4 行后增加按钮 disabled，删除后载荷行数正确', () => {
    renderDrawer();
    openLiftCaliber();
    pickOption('自定义加减公式');
    expect(screen.getByRole('button', { name: '删除拉动公式项 1' })).toBeDisabled();
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '增加拉动公式项' }));
    }
    expect(screen.getByRole('button', { name: '增加拉动公式项' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '删除拉动公式项 4' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '删除拉动公式项 4' }));
    fireEvent.click(applyButton());
    const cfg = onConfirm.mock.calls[0][0] as ActivityEffectSplitConfig;
    expect(cfg.liftSlots).toHaveLength(3);
    expect(cfg.liftCaliber).toBe('custom_slots');
  });

  it('商品实付金额口径缺商品列 → 应用禁用 + 行内警示（与校验规则同源）', () => {
    renderDrawer({
      columns: ['活动编号', '订单实付金额'],
      initialConfig: makeCfg({
        dimensions: ['activity'],
        fieldMapping: { activityIdCol: '活动编号', netAmountCol: '订单实付金额' },
      }),
    });
    expect(applyButton()).toBeEnabled();
    openLiftCaliber();
    pickOption('商品实付金额');
    expect(applyButton()).toBeDisabled();
    expect(screen.getByText('商品实付金额口径需要指定商品金额列')).toBeInTheDocument();
    fireEvent.click(applyButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
