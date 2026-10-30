/**
 * Phase 5 元数据一致性硬校验：fn_ecom_suspicious_order_detect 的 inputFields/outputFields/
 * description/constraints 必须与已实现能力（8 规则 + 降级口径）一一对应。
 */
import { describe, it, expect } from 'vitest';
import { getKernelByName } from '../bizKernelMeta';

const kernel = getKernelByName('fn_ecom_suspicious_order_detect');

describe('bizKernelMeta — fn_ecom_suspicious_order_detect', () => {
  it('元数据存在且归类风险风控', () => {
    expect(kernel).toBeDefined();
    expect(kernel!.category).toBe('风险风控');
  });

  it('inputFields 覆盖必填列', () => {
    const inputs = kernel!.metadata.inputFields!;
    expect(inputs).toContain('user_id');
    expect(inputs).toContain('order_time');
  });

  it('inputFields 覆盖 8 条规则的依赖列', () => {
    const inputs = kernel!.metadata.inputFields!;
    expect(inputs).toContain('receiver_address');
    expect(inputs).toContain('receiver_mobile');
    expect(inputs).toContain('device_id');
    expect(inputs).toContain('pay_amount');
    expect(inputs).toContain('origin_amount');
    expect(inputs).toContain('order_status');
    // 批量小号：注册时间或首单时间任一即可
    expect(inputs.filter((c) => /register_time|first_order_time/.test(c))).toHaveLength(2);
  });

  it('outputFields 含核心输出与注入列', () => {
    const outputs = kernel!.metadata.outputFields!;
    for (const col of ['risk_score', 'risk_level', 'risk_type', 'order_count_abnormal', 'risk_evidence', 'suggestion', 'skipped_rules']) {
      expect(outputs).toContain(col);
    }
    expect(outputs).toHaveLength(21);
  });

  it('description 首屏一句话覆盖 8 项能力', () => {
    for (const kw of ['密集下单', '同地址', '同手机', '同设备', '批量小号', '改价异常', '金额突变', '退款']) {
      expect(kernel!.description).toContain(kw);
    }
  });

  it('constraints 声明降级与统计口径', () => {
    const cons = kernel!.metadata.constraints!;
    expect(cons.length).toBeGreaterThanOrEqual(13);
    expect(cons.filter((c) => c.includes('自动跳过')).length).toBeGreaterThanOrEqual(5);
    expect(cons.filter((c) => c.startsWith('统计口径')).length).toBe(4);
    expect(cons.some((c) => c.includes('去重') || c.includes('不重复计数'))).toBe(true);
    const rowCaliber = cons.filter((c) => c.includes('按数据行计数'));
    expect(rowCaliber.length).toBe(1);
    expect(rowCaliber[0]).toContain('订单号列');
  });
});
