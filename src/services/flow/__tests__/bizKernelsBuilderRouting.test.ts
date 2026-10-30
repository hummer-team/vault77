/**
 * SelectNode UDF 路由：fn_ecom_suspicious_order_detect 三态（解析 / 点击分发 / 渲染判定）
 * 对应 plan Phase 3 单测矩阵；纯函数，无 React 挂载。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  SelectNodePanelType,
  resolveSelectNodePanelType,
  executeSelectNodeClickStrategy,
  shouldRenderUdfDrawer,
} from '../bizKernelsBuilderStrategies';

const KERNEL = 'fn_ecom_suspicious_order_detect';

describe('bizKernelsBuilderStrategies — suspicious_order_detect 路由', () => {
  it('resolveSelectNodePanelType 解析到 SUSPICIOUS_ORDER_DETECT_DRAWER', () => {
    expect(resolveSelectNodePanelType(KERNEL)).toBe(SelectNodePanelType.SUSPICIOUS_ORDER_DETECT_DRAWER);
  });

  it('executeSelectNodeClickStrategy 点击分发到 openUdfDrawer 而非 openDetailPanel', () => {
    const actions = { openUdfDrawer: vi.fn(), openDetailPanel: vi.fn() };
    executeSelectNodeClickStrategy(KERNEL, actions);
    expect(actions.openUdfDrawer).toHaveBeenCalledTimes(1);
    expect(actions.openDetailPanel).not.toHaveBeenCalled();
  });

  it('shouldRenderUdfDrawer 为 true', () => {
    expect(shouldRenderUdfDrawer(KERNEL)).toBe(true);
  });
});
