/**
 * Phase 4 — registration surface + metadata contract.
 * Covers the 5 registration files, the root UDF entry and the 12/15/12 metadata contract.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StrategyFactory } from '../strategyFactory';
import { BaseStrategy } from '../strategies';
import { EcomDailyBizSummaryStrategy } from '../strategies/ecomDailyBizSummaryStrategy';
import { OperatorType } from '../types';
import {
  SelectNodePanelType,
  resolveSelectNodePanelType,
  shouldRenderUdfDrawer,
  executeSelectNodeClickStrategy,
} from '../bizKernelsBuilderStrategies';
import { KERNEL_UDF_MAP } from '../../duckDBUdfService';
import { SEED_KERNELS } from '../../biz-kernels/bizKernelMeta';
import { DAILY_BIZ_COMPARE_COPY } from '../strategies/ecomDailyBizSummaryStrategy';

const FN = 'fn_ecom_daily_biz_summary';
const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');

describe('Phase 4 — 枚举', () => {
  it('DAILY_BIZ_SUMMARY 取值正确且唯一', () => {
    expect(OperatorType.DAILY_BIZ_SUMMARY).toBe('daily_biz_summary');
    const values = Object.values(OperatorType);
    expect(values.filter((v) => v === OperatorType.DAILY_BIZ_SUMMARY)).toHaveLength(1);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('Phase 4 — 工厂', () => {
  it('getStrategy 返回策略实例且继承 BaseStrategy', () => {
    const strategy = StrategyFactory.getStrategy(OperatorType.DAILY_BIZ_SUMMARY);
    expect(strategy).toBeInstanceOf(EcomDailyBizSummaryStrategy);
    expect(strategy).toBeInstanceOf(BaseStrategy);
    expect(strategy.type).toBe(OperatorType.DAILY_BIZ_SUMMARY);
    expect(StrategyFactory.getAllStrategies()).toHaveLength(26);
  });
});

describe('Phase 4 — 路由与点击策略', () => {
  it('函数名路由到专用抽屉', () => {
    expect(resolveSelectNodePanelType(FN)).toBe(SelectNodePanelType.DAILY_BIZ_SUMMARY_DRAWER);
    expect(shouldRenderUdfDrawer(FN)).toBe(true);
    expect(resolveSelectNodePanelType('fn_not_exist')).toBe(SelectNodePanelType.STANDARD_DETAIL_PANEL);
  });

  it('点击策略只开抽屉不开详情面板', () => {
    const actions = {
      openDetailPanel: vi.fn(),
      openUdfDrawer: vi.fn(),
      openReplaceColumnDrawer: vi.fn(),
      openUpLowerDrawer: vi.fn(),
      openFormatNumberDrawer: vi.fn(),
      openFlagSpecDrawer: vi.fn(),
      openFormatDateDrawer: vi.fn(),
    };
    executeSelectNodeClickStrategy(FN, actions as never);
    expect(actions.openUdfDrawer).toHaveBeenCalledTimes(1);
    expect(actions.openDetailPanel).not.toHaveBeenCalled();
  });

  it('根入口 UDF 映射存在（缺失会静默回落错误面板）', () => {
    expect(KERNEL_UDF_MAP[FN]).toBe(FN);
  });
});

describe('Phase 4 — 元数据契约', () => {
  const kernel = SEED_KERNELS.find((k) => k.name === FN)!;

  it('条目存在且名称唯一', () => {
    expect(kernel).toBeDefined();
    expect(SEED_KERNELS.filter((k) => k.name === FN)).toHaveLength(1);
  });

  it('12 入 / 15 出 / 12 约束', () => {
    expect(kernel.metadata.inputFields).toHaveLength(12);
    expect(kernel.metadata.outputFields).toHaveLength(15);
    expect(kernel.metadata.constraints).toHaveLength(12);
  });

  it('字段无重复且关键输出齐全', () => {
    const { inputFields, outputFields, constraints } = kernel.metadata;
    expect(new Set(inputFields).size).toBe(inputFields.length);
    expect(new Set(outputFields).size).toBe(outputFields.length);
    expect(new Set(constraints).size).toBe(constraints.length);
    for (const f of ['net_profit_rate', 'avg_order_value', 'data_quality_flag', 'sales_cmp']) {
      expect(outputFields).toContain(f);
    }
  });

  it('约束覆盖退款口径与质量短码', () => {
    const { constraints } = kernel.metadata;
    expect(constraints.filter((c) => c.includes('退款')).length).toBeGreaterThanOrEqual(2);
    expect(constraints.filter((c) => c.includes('data_quality_flag')).length).toBeGreaterThanOrEqual(1);
  });

  it('constraints[8]（费用）声明空值语义与部分映射口径（Issue 3）', () => {
    const fee = kernel.metadata.constraints[8];
    expect(fee).toContain('费用');
    expect(fee).toContain('未识别到费用列');
    expect(fee).toContain('空值');
    expect(fee).toContain('未映射到列的分项按 0 计');
    expect(fee).not.toContain('按 0 计费用');
    expect(fee).not.toContain('费用按 0');
  });

  it('constraints[10]（对比列）内含单一真源常量且不含旧口径表述（Issue 2）', () => {
    const compare = kernel.metadata.constraints[10];
    expect(compare).not.toContain('上一可对齐出数日');
    expect(compare).not.toContain('上一个出数日');
    expect(compare).toContain(DAILY_BIZ_COMPARE_COPY);
    for (const col of ['sales_cmp', 'profit_cmp', 'net_profit_cmp']) expect(compare).toContain(col);
    for (const word of ['日环比', '周环比', '月环比', '年同比']) expect(compare).toContain(word);
  });
});

describe('Phase 4 — 两处 KERNEL_OPERATOR_MAP 一致', () => {
  const line = (file: string) =>
    src(file)
      .split('\n')
      .find((l) => l.includes(FN))!
      .replace(/\s+/g, ' ')
      .trim();

  it('SelectNode 与 EndNode 映射到同一 OperatorType', () => {
    const select = line('../../../components/flow/nodes/SelectNode.tsx');
    const end = line('../../../components/flow/nodes/EndNode.tsx');
    expect(select).toContain('OperatorType.DAILY_BIZ_SUMMARY');
    expect(select).toBe(end);
  });
});
