/**
 * Phase 4 单测 — 注册面接入（计划 §Phase 4 测试目标）
 * 纯映射/枚举断言，不渲染 React。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { OperatorType } from '../types';
import { StrategyFactory } from '../strategyFactory';
import { BaseStrategy } from '../strategies';
import { EcomZeroNegativeOrderDetectStrategy } from '../strategies/ecomZeroNegativeOrderDetectStrategy';
import {
  executeSelectNodeClickStrategy,
  resolveSelectNodePanelType,
  shouldRenderUdfDrawer,
  SelectNodePanelType,
  type SelectNodeClickActions,
} from '../bizKernelsBuilderStrategies';
import { KERNEL_UDF_MAP } from '../../duckDBUdfService';
import { SEED_KERNELS } from '../../biz-kernels/bizKernelMeta';

const FN = 'fn_ecom_zero_negative_order_detect';
const HERE = dirname(fileURLToPath(import.meta.url));

function readSource(relFromFlowDir: string): string {
  return readFileSync(resolve(HERE, '..', relFromFlowDir), 'utf8');
}

/** 断言某个源文件中 KERNEL_OPERATOR_MAP 对该函数名的映射值 */
function expectMapEntry(file: string): void {
  const src = readSource(file);
  const re = new RegExp(`${FN}\\s*:\\s*OperatorType\\.(\\w+)`);
  const m = src.match(re);
  expect(m, `${file} 缺少 ${FN} 映射`).not.toBeNull();
  expect(memberFrom(m?.[1]), `${file} 映射到的枚举值错误`).toBe(OperatorType.ZERO_NEGATIVE_ORDER_DETECT);
}

/** 源码中的枚举成员名 → 枚举值 */
function memberFrom(member: string | undefined): string | undefined {
  return member === undefined ? undefined : (OperatorType as Record<string, string>)[member];
}

describe('零元单检测 — 注册面', () => {
  describe('枚举', () => {
    it('OperatorType 值为 zero_negative_order_detect', () => {
      expect(OperatorType.ZERO_NEGATIVE_ORDER_DETECT).toBe('zero_negative_order_detect');
    });

    it('枚举 value 唯一', () => {
      const values = Object.values(OperatorType);
      expect(values.filter((v) => v === OperatorType.ZERO_NEGATIVE_ORDER_DETECT)).toHaveLength(1);
    });
  });

  describe('策略工厂', () => {
    it('返回零元单策略实例且继承 BaseStrategy', () => {
      const strategy = StrategyFactory.getStrategy(OperatorType.ZERO_NEGATIVE_ORDER_DETECT);
      expect(strategy).toBeInstanceOf(EcomZeroNegativeOrderDetectStrategy);
      expect(strategy).toBeInstanceOf(BaseStrategy);
    });

    it('工厂已登记该算子', () => {
      expect(StrategyFactory.hasStrategy(OperatorType.ZERO_NEGATIVE_ORDER_DETECT)).toBe(true);
    });
  });

  describe('面板路由', () => {
    it('路由到专用抽屉', () => {
      expect(resolveSelectNodePanelType(FN)).toBe(SelectNodePanelType.ZERO_NEGATIVE_ORDER_DETECT_DRAWER);
    });

    it('应渲染 UDF 抽屉', () => {
      expect(shouldRenderUdfDrawer(FN)).toBe(true);
    });

    it('未知函数名回落标准详情面板', () => {
      expect(resolveSelectNodePanelType('fn_not_exists_xyz')).toBe(SelectNodePanelType.STANDARD_DETAIL_PANEL);
    });
  });

  describe('点击策略', () => {
    it('打开 UDF 抽屉且不打开详情面板', () => {
      const openUdfDrawer = vi.fn();
      const openDetailPanel = vi.fn();
      const actions: SelectNodeClickActions = { openUdfDrawer, openDetailPanel };

      executeSelectNodeClickStrategy(FN, actions);

      expect(openUdfDrawer).toHaveBeenCalledTimes(1);
      expect(openDetailPanel).not.toHaveBeenCalled();
    });
  });

  describe('KERNEL_UDF_MAP 根入口', () => {
    it('键存在且值等于自身', () => {
      expect(KERNEL_UDF_MAP[FN]).toBe(FN);
    });
  });

  describe('元数据', () => {
    const entry = SEED_KERNELS.find((k) => k.name === FN);

    it('条目存在且唯一', () => {
      expect(entry).toBeDefined();
      expect(SEED_KERNELS.filter((k) => k.name === FN)).toHaveLength(1);
    });

    it('12 入 / 13 出 / ≥10 约束', () => {
      expect(entry?.metadata.inputFields).toHaveLength(12);
      expect(entry?.metadata.outputFields).toHaveLength(13);
      expect(entry?.metadata.constraints.length).toBeGreaterThanOrEqual(10);
    });

    it('输入输出字段无重复', () => {
      const { inputFields, outputFields } = entry!.metadata;
      expect(new Set(inputFields).size).toBe(inputFields.length);
      expect(new Set(outputFields).size).toBe(outputFields.length);
    });

    it('输出字段含关键列', () => {
      const out = entry!.metadata.outputFields;
      expect(out).toEqual(expect.arrayContaining(['loss_amount', 'data_quality_flag', 'skipped_rules']));
    });

    it('inputFields 覆盖全部源列语义', () => {
      expect(entry!.metadata.inputFields).toEqual([
        'order_id', 'order_time', 'order_status', 'pay_amount', 'product_amount', 'discount_total',
        'quantity', 'unit_price', 'coupon_amount', 'platform_discount', 'merchant_discount', 'refund_amount',
      ]);
    });
  });

  describe('两处 KERNEL_OPERATOR_MAP 一致', () => {
    it('SelectNode 与 EndNode 映射到同一枚举', () => {
      expectMapEntry('../../components/flow/nodes/SelectNode.tsx');
      expectMapEntry('../../components/flow/nodes/EndNode.tsx');
    });
  });
});