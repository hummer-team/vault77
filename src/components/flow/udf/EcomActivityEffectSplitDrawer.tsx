/**
 * EcomActivityEffectSplitDrawer
 *
 * 配置抽屉：活动/优惠券/直播间效果拆分（fn_ecom_activity_effect_split）。
 * 四组配置 + 指标口径区；列下拉全部可搜索；正则唯一命中自动预填；零硬编码颜色（TOKEN/CSS 变量）。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer, Button, Select, Input, InputNumber, Radio, Checkbox, Tooltip, Typography } from 'antd';
import { FunctionOutlined, InfoCircleOutlined } from '@ant-design/icons';
import {
  DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG,
  cloneActivityEffectSplitConfig,
  hasColumnValue,
  missingDimensionColumns,
  type ActivityEffectSplitConfig,
  type ActivityEffectSplitFieldMapping,
  type ActivitySplitDimension,
  type ActivityLiftCaliber,
  type ActivityCostCaliber,
  type FormulaSlot,
} from '../../../services/flow/types';
import {
  DIMENSION_LABEL,
  ACTIVITY_FIELD_MATCH_PATTERNS,
} from '../../../services/flow/strategies/ecomActivityEffectSplitStrategy';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

export interface EcomActivityEffectSplitDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: ActivityEffectSplitConfig;
  kernelDisplayName?: string;
  onConfirm: (config: ActivityEffectSplitConfig) => void;
  onCancel: () => void;
}

const DIMS: ActivitySplitDimension[] = ['activity', 'coupon', 'live_room', 'activity_type'];

const TIME_KEYS: Array<keyof ActivityEffectSplitFieldMapping> = ['payTimeCol', 'activityStartCol', 'activityEndCol'];

/** 槽位列键（fieldMapping 之外的 6 个正则键）→ 落点 */
const SLOT_PATTERN_KEYS = ['couponAmountSlot', 'discountAmountSlot', 'platformSubsidySlot', 'adCostSlot', 'liftAmountSlot', 'costSingleColumn'] as const;
const SLOT_KEY_SET: ReadonlySet<string> = new Set<string>(SLOT_PATTERN_KEYS);

const LIFT_CALIBER_OPTIONS: Array<{ value: ActivityLiftCaliber; label: string }> = [
  { value: 'activity_gmv', label: '活动订单实付金额' },
  { value: 'product_amount', label: '商品实付金额' },
  { value: 'baseline_delta', label: '活动前后增量' },
  { value: 'custom_slots', label: '自定义加减公式' },
];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    marginBottom: 14, padding: '10px 12px', background: TOKEN.bgSection,
    borderRadius: TOKEN.radiusLg, border: `1px solid ${TOKEN.borderSubtle}`,
    borderLeft: '3px solid var(--vm-primary-border)',
  }}>
    <Text style={{ fontSize: 11, color: TOKEN.textSecondary, fontWeight: 600, letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
      {title}
    </Text>
    {children}
  </div>
);

const FieldRow: React.FC<{
  label: string;
  required?: boolean;
  tip?: string;
  value: string;
  columns: string[];
  placeholder?: string;
  status?: 'error';
  onChange: (v: string) => void;
}> = ({ label, required, tip, value, columns, placeholder, status, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
    <div style={{ width: 150, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
      {required && <span style={{ color: TOKEN.primary, fontSize: 10 }}>*</span>}
      <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>{label}</Text>
      {tip && (
        <Tooltip title={tip} placement="top">
          <InfoCircleOutlined style={{ fontSize: 11, color: TOKEN.textMuted, cursor: 'help' }} />
        </Tooltip>
      )}
    </div>
    <Select
      size="small"
      value={value || undefined}
      status={status}
      style={{ flex: 1 }}
      allowClear
      placeholder={placeholder ?? '可选择 · 支持搜索'}
      onChange={(v) => onChange(v ?? '')}
      options={columns.map((c) => ({ label: c, value: c }))}
      showSearch
      filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
      styles={{ popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } } }}
    />
  </div>
);

/** 多候选时的占位提示（唯一命中/空命中返回 undefined → 用默认占位） */
function multiCandidateHint(key: string, columns: string[]): string | undefined {
  const hits = columns.filter((c) => ACTIVITY_FIELD_MATCH_PATTERNS[key]?.test(c));
  if (hits.length <= 1) return undefined;
  return `多个候选：${hits.slice(0, 3).join(' / ')}`;
}

const slotExprText = (slots: FormulaSlot[]): string =>
  slots.filter((s) => hasColumnValue(s.column))
    .map((s) => `${s.operator === '-' ? '−' : '+'} ${s.column.trim()}`)
    .join(' ');

export const EcomActivityEffectSplitDrawer: React.FC<EcomActivityEffectSplitDrawerProps> = ({
  open, columns, initialConfig, kernelDisplayName, onConfirm, onCancel,
}) => {
  const [cfg, setCfg] = useState<ActivityEffectSplitConfig>(
    () => cloneActivityEffectSplitConfig(DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG),
  );

  // 打开即初始化：深拷贝 initialConfig/默认 → 表外列清理 → 正则唯一命中预填（不覆盖已填）
  useEffect(() => {
    if (!open) return;
    const base = cloneActivityEffectSplitConfig(initialConfig ?? DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG);
    if (columns.length > 0) {
      const inTable = (col: string) => !hasColumnValue(col) || columns.includes(col);
      base.costSlots = base.costSlots.map((s) => ({ ...s, column: inTable(s.column) ? s.column : '' }));
      base.liftSlots = base.liftSlots.map((s) => ({ ...s, column: inTable(s.column) ? s.column : '' }));
      if (!inTable(base.costSingleColumn)) base.costSingleColumn = '';
    }
    const fillIfEmpty = (key: string, current?: string): string => {
      if (hasColumnValue(current)) return current ?? '';
      const hits = columns.filter((c) => ACTIVITY_FIELD_MATCH_PATTERNS[key]?.test(c));
      return hits.length === 1 ? hits[0] : (current ?? '');
    };
    for (const key of Object.keys(ACTIVITY_FIELD_MATCH_PATTERNS)) {
      if (SLOT_KEY_SET.has(key)) continue;
      // SAFETY: ACTIVITY_FIELD_MATCH_PATTERNS 的非槽位键恰为 ActivityEffectSplitFieldMapping 的 16 个列键（Phase 1 固定契约）
      const mk = key as keyof ActivityEffectSplitFieldMapping;
      base.fieldMapping[mk] = fillIfEmpty(key, base.fieldMapping[mk]);
    }
    base.costSlots = base.costSlots.map((s, i) => ({ ...s, column: fillIfEmpty(SLOT_PATTERN_KEYS[i] ?? '', s.column) }));
    base.liftSlots = base.liftSlots.map((s, i) => (i === 0 ? { ...s, column: fillIfEmpty('liftAmountSlot', s.column) } : s));
    base.costSingleColumn = fillIfEmpty('costSingleColumn', base.costSingleColumn);
    setCfg(base);
  }, [open, initialConfig, columns]);

  const patch = useCallback((p: Partial<ActivityEffectSplitConfig>) => setCfg((prev) => ({ ...prev, ...p })), []);
  const patchCol = useCallback((key: keyof ActivityEffectSplitFieldMapping, v: string) =>
    setCfg((prev) => ({ ...prev, fieldMapping: { ...prev.fieldMapping, [key]: v } })), []);
  const patchCostSlot = useCallback((i: number, p: Partial<FormulaSlot>) =>
    setCfg((prev) => ({ ...prev, costSlots: prev.costSlots.map((s, j) => (j === i ? { ...s, ...p } : s)) })), []);
  const patchLiftSlot = useCallback((i: number, p: Partial<FormulaSlot>) =>
    setCfg((prev) => ({ ...prev, liftSlots: prev.liftSlots.map((s, j) => (j === i ? { ...s, ...p } : s)) })), []);

  const missingDims = useMemo(() => missingDimensionColumns(cfg), [cfg]);
  const dimsEmpty = cfg.dimensions.length === 0;
  const noNet = !hasColumnValue(cfg.fieldMapping.netAmountCol);
  const gateOk = !dimsEmpty && missingDims.length === 0 && !noNet;

  const timeReady = TIME_KEYS.every((k) => hasColumnValue(cfg.fieldMapping[k]));

  const liftFormula = useMemo(() => {
    switch (cfg.liftCaliber) {
      case 'activity_gmv': return '拉动金额 = 活动订单实付金额合计';
      case 'product_amount': return '拉动金额 = 商品实付金额合计';
      case 'baseline_delta': return '拉动金额 = 活动期实付金额 − 同一活动/券/直播在等长前窗的实付金额（前窗无记录则留空）';
      case 'custom_slots': {
        const e = slotExprText(cfg.liftSlots);
        return `拉动金额 = ${e || '（未配置加减公式列）'}`;
      }
    }
  }, [cfg.liftCaliber, cfg.liftSlots]);

  const costFormula = useMemo(() => {
    if (cfg.costCaliber === 'single_column') {
      return `补贴成本 = ${hasColumnValue(cfg.costSingleColumn) ? cfg.costSingleColumn.trim() : '（未选择列）'}`;
    }
    const e = slotExprText(cfg.costSlots);
    return `补贴成本 = ${e || '（未选择费用列，成本留空）'}`;
  }, [cfg.costCaliber, cfg.costSlots, cfg.costSingleColumn]);

  const handleConfirm = useCallback(() => {
    if (!gateOk) return;
    const out = cloneActivityEffectSplitConfig(cfg);
    out.fieldMapping = Object.fromEntries(
      Object.entries(out.fieldMapping).map(([k, v]) => [k, (v ?? '').trim()]),
    ) as ActivityEffectSplitConfig['fieldMapping'];
    out.costSlots = out.costSlots.map((s) => ({ ...s, column: s.column.trim() }));
    out.liftSlots = out.liftSlots.map((s) => ({ ...s, column: s.column.trim() }));
    out.costSingleColumn = out.costSingleColumn.trim();
    out.excludedStatuses = out.excludedStatuses.trim();
    out.topN = Math.min(10, Math.max(1, Math.round(out.topN || 1)));
    onConfirm(out);
  }, [cfg, gateOk, onConfirm]);

  const colSel = (key: keyof ActivityEffectSplitFieldMapping) => ({
    value: cfg.fieldMapping[key] ?? '',
    columns,
    placeholder: multiCandidateHint(key, columns),
    onChange: (v: string) => patchCol(key, v),
  });

  return (
    <Drawer
      open={open}
      onClose={onCancel}
      width={560}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FunctionOutlined style={{ color: TOKEN.primary }} />
          <Text style={{ fontSize: 14, fontWeight: 600 }}>{kernelDisplayName ?? '活动效果拆分'}</Text>
        </div>
      }
      footer={
        <div>
          {dimsEmpty && (
            <div style={{ fontSize: 12, color: 'var(--vm-color-warning)', marginBottom: 8 }}>
              请至少选择一个拆分维度
            </div>
          )}
          {missingDims.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--vm-color-warning)', marginBottom: 8 }}>
              {missingDims.map((d) => `${DIMENSION_LABEL[d]}维度尚未指定数据列`).join('；')}
            </div>
          )}
          {noNet && !dimsEmpty && missingDims.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--vm-color-warning)', marginBottom: 8 }}>
              订单实付金额为必填列
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button size="small" onClick={onCancel}>取消</Button>
            <Button size="small" type="primary" disabled={!gateOk} onClick={handleConfirm}>应用</Button>
          </div>
        </div>
      }
    >
      {/* ① 拆分维度 */}
      <Section title="拆分维度（勾选哪项按哪项拆分；不同拆分之间不可相加）">
        <Checkbox.Group
          value={cfg.dimensions}
          onChange={(v) => patch({ dimensions: v as ActivitySplitDimension[] })}
          options={DIMS.map((d) => ({ label: DIMENSION_LABEL[d], value: d }))}
          style={{ marginBottom: 10 }}
        />
        {cfg.dimensions.includes('activity') && (
          <>
            <FieldRow required label="活动列" tip="只有该列非空的订单进入活动拆分" {...colSel('activityIdCol')} status={!hasColumnValue(cfg.fieldMapping.activityIdCol) ? 'error' : undefined} />
            <FieldRow label="活动名称列（可选）" {...colSel('activityNameCol')} />
          </>
        )}
        {cfg.dimensions.includes('coupon') && (
          <>
            <FieldRow required label="优惠券列" tip="只有该列非空的订单进入优惠券拆分" {...colSel('couponIdCol')} status={!hasColumnValue(cfg.fieldMapping.couponIdCol) ? 'error' : undefined} />
            <FieldRow label="优惠金额" tip="券覆盖占比按此列是否大于 0 判定" {...colSel('couponAmountCol')} />
          </>
        )}
        {cfg.dimensions.includes('live_room') && (
          <FieldRow required label="直播间列" tip="只有该列非空的订单进入直播间拆分" {...colSel('liveRoomIdCol')} status={!hasColumnValue(cfg.fieldMapping.liveRoomIdCol) ? 'error' : undefined} />
        )}
        {cfg.dimensions.includes('activity_type') && (
          <FieldRow required label="活动类型列" tip="维度值即该列值本身" {...colSel('activityTypeCol')} status={!hasColumnValue(cfg.fieldMapping.activityTypeCol) ? 'error' : undefined} />
        )}
      </Section>

      {/* ② 时间与基线窗口 */}
      <Section title="时间与基线窗口（选齐后可用「活动前后增量」口径）">
        <FieldRow label="订单支付时间列" {...colSel('payTimeCol')} />
        <FieldRow label="活动开始时间列" {...colSel('activityStartCol')} />
        <FieldRow label="活动结束时间列" {...colSel('activityEndCol')} />
      </Section>

      {/* ③ 订单与金额 */}
      <Section title="订单与金额">
        <FieldRow required label="订单实付金额列" value={cfg.fieldMapping.netAmountCol} columns={columns}
          placeholder={multiCandidateHint('netAmountCol', columns)}
          status={noNet ? 'error' : undefined}
          onChange={(v) => patchCol('netAmountCol', v)} />
        <FieldRow label="商品实付金额列" {...colSel('productAmountCol')} />
        <FieldRow label="订单号列" tip="用于按订单去重计数；未选则按行数计数" {...colSel('orderIdCol')} />
        <FieldRow label="用户列" tip="优惠券核销率与覆盖占比的去重键" {...colSel('userIdCol')} />
        <FieldRow label="数量列" {...colSel('quantityCol')} />
        <FieldRow label="订单状态列" {...colSel('orderStatusCol')} />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
          <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 150, flexShrink: 0 }}>排除状态（逗号分隔）</Text>
          <Input size="small" style={{ flex: 1 }} value={cfg.excludedStatuses}
            placeholder="CANCELLED,CLOSED"
            onChange={(e) => patch({ excludedStatuses: e.target.value })} />
        </div>
      </Section>

      {/* ④ 成本与公式 */}
      <Section title="补贴成本口径">
        <Radio.Group
          size="small"
          value={cfg.costCaliber}
          onChange={(e) => patch({ costCaliber: e.target.value as ActivityCostCaliber })}
          style={{ marginBottom: 10 }}
        >
          <Radio value="slot_sum">按费用项累加</Radio>
          <Radio value="single_column">直接用一列</Radio>
        </Radio.Group>
        {cfg.costCaliber === 'slot_sum' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cfg.costSlots.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Select size="small" value={s.operator} style={{ width: 56, flexShrink: 0 }}
                  options={[{ label: '+', value: '+' }, { label: '−', value: '-' }]}
                  onChange={(op) => patchCostSlot(i, { operator: op as '+' | '-' })} />
                <FieldRow label={`费用项 ${i + 1}`} value={s.column} columns={columns}
                  placeholder={multiCandidateHint(SLOT_PATTERN_KEYS[i] ?? '', columns)}
                  onChange={(v) => patchCostSlot(i, { column: v })} />
              </div>
            ))}
          </div>
        )}
        {cfg.costCaliber === 'single_column' && (
          <FieldRow label="成本列" value={cfg.costSingleColumn} columns={columns}
            placeholder={multiCandidateHint('costSingleColumn', columns)}
            onChange={(v) => patch({ costSingleColumn: v })} />
        )}
      </Section>

      {/* ⑤ 指标口径 */}
      <Section title="指标口径">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 88, flexShrink: 0 }}>拉动金额</Text>
          <Select
            size="small"
            style={{ flex: 1 }}
            value={cfg.liftCaliber}
            onChange={(v) => patch({ liftCaliber: v as ActivityLiftCaliber })}
            options={LIFT_CALIBER_OPTIONS.map((o) => ({
              ...o,
              disabled: o.value === 'baseline_delta' && !timeReady,
              title: o.value === 'baseline_delta' && !timeReady ? '需先选择支付时间与活动起止时间' : undefined,
            }))}
          />
        </div>
        <div style={{ fontSize: 11, color: TOKEN.textMuted, marginBottom: 8, paddingLeft: 94 }}>{liftFormula}</div>
        {cfg.liftCaliber === 'custom_slots' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, paddingLeft: 94 }}>
            <Select size="small" value={cfg.liftSlots[0]?.operator ?? '+'} style={{ width: 56 }}
              options={[{ label: '+', value: '+' }, { label: '−', value: '-' }]}
              onChange={(op) => patchLiftSlot(0, { operator: op as '+' | '-' })} />
            <FieldRow label="拉动公式列" value={cfg.liftSlots[0]?.column ?? ''} columns={columns}
              placeholder={multiCandidateHint('liftAmountSlot', columns)}
              onChange={(v) => patchLiftSlot(0, { column: v })} />
          </div>
        )}
        <div style={{ fontSize: 12, color: TOKEN.textSecondary, marginBottom: 4 }}>{costFormula}</div>
        <div style={{ fontSize: 12, color: TOKEN.textMuted, marginBottom: 4 }}>投产比 = 拉动金额 ÷ 补贴成本</div>
        <div style={{ fontSize: 12, color: TOKEN.textMuted, marginBottom: 8 }}>成本率 = 补贴成本 ÷ 拉动金额</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>洞察卡片数量</Text>
          <InputNumber size="small" min={1} max={10} value={cfg.topN}
            onChange={(v) => patch({ topN: typeof v === 'number' ? v : 3 })} />
        </div>
      </Section>
    </Drawer>
  );
};

export default EcomActivityEffectSplitDrawer;
