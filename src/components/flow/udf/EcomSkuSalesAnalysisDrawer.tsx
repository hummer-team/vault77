/**
 * EcomSkuSalesAnalysisDrawer
 *
 * Configuration drawer for 本算子（SKU/SPU 销量毛利排行分析）.
 * Six sections: 统计对象与维度 / 金额与成本 / 销量与库存 / 标签阈值 / 计算公式 / 结果预览与提示.
 * All labels, thresholds and gates are imported from the contract module — never re-declared here.
 * Every colour, radius and spacing token comes from TOKEN; no literal colour is used.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Collapse, Drawer, Input, InputNumber, Radio, Select, Tag, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined, TagsOutlined } from '@ant-design/icons';
import {
  DEFAULT_SKU_SALES_CONFIG,
  DEFAULT_SKU_SALES_EXCLUDE_STATUSES,
  SKU_SALES_FIELD_LABEL,
  SKU_SALES_QUALITY_DESC,
  SKU_SALES_REQUIRED_FIELDS,
  SKU_SALES_SLOT_FIELDS,
  SKU_SALES_SLOT_OPERATORS,
  buildSkuSalesFormulaPreview,
  cloneSkuSalesConfig,
  collectSkuSalesBlockers,
  joinSkuSalesQuality,
  matchSkuSalesColumns,
  matchesSkuSalesColumnSearch,
  resolveSkuSalesProfitSlots,
  resolveSkuSalesQualityCodes,
  skuSalesBlockingErrors,
  skuSalesColumnOptionLabel,
  skuSalesSlotsIncludeRefund,
  type SkuSalesFieldKey,
  type SkuSalesSlotGroup,
} from '../../../services/flow/strategies/ecomSkuSalesAnalysisContract';
import { hasColumnValue, type EcomSkuSalesAnalysisConfig, type FormulaSlot } from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;
const { TextArea } = Input;

export interface EcomSkuSalesAnalysisDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: EcomSkuSalesAnalysisConfig;
  kernelDisplayName?: string;
  onConfirm: (config: EcomSkuSalesAnalysisConfig) => void;
  onCancel: () => void;
}

/** 每个字段的业务口径一句话（名称取自契约字典，不在此重复） */
const FIELD_TIP: Partial<Record<SkuSalesFieldKey, string>> = {
  skuIdCol: '按 SKU 统计时用来区分商品，必填',
  productIdCol: '按 SPU 汇总时用来合并同款商品',
  categoryCol: '作为附加维度带进结果，可按商品品类看排行',
  brandCol: '作为附加维度带进结果，可按品牌看排行',
  shopCol: '作为附加维度带进结果，可按店铺看排行',
  salesCol: '销售额公式以实收金额为基础，必填',
  quantityCol: '销量用于排行榜、滞销判定与 ABC 中的销量统计，必填',
  grossProfitCol: '毛利额；未识别时按「销售额 − 商品成本」降级',
  costCol: '毛利额未识别时，用商品成本做降级计算',
  refundAmountCol: '选已扣退款口径时用于核对，避免退款被扣两次',
  stockQtyCol: '库存数量用于售罄率、动销率与滞销判定',
  orderIdCol: '映射后订单数按订单号去重；不映射则按数据行计数',
  orderStatusCol: '用于剔除取消、未支付等无效单',
};

const GROUP_OPTIONS = [
  { label: '按 SKU 统计', value: 'sku' },
  { label: '按 SPU 汇总', value: 'spu' },
] as const;

const DIMENSION_OPTIONS = [
  { label: '无', value: 'none' },
  { label: '商品品类', value: 'category' },
  { label: '品牌', value: 'brand' },
  { label: '店铺', value: 'shop' },
] as const;

/** 附加维度 → 对应字段槽（用于标题与取值控件切换） */
const DIMENSION_FIELD: Record<'category' | 'brand' | 'shop', SkuSalesFieldKey> = {
  category: 'categoryCol',
  brand: 'brandCol',
  shop: 'shopCol',
};

// ── 本地视觉基元（不抽公共组件，避免影响已上线抽屉） ──────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    marginBottom: 14, padding: '10px 12px', background: TOKEN.bgSection,
    borderRadius: TOKEN.radiusLg, border: `1px solid ${TOKEN.borderSubtle}`,
    borderLeft: `3px solid ${TOKEN.borderPrimary}`,
  }}>
    <Text style={{ fontSize: 11, color: TOKEN.textSecondary, fontWeight: 600, letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
      {title}
    </Text>
    {children}
  </div>
);

const FieldRow: React.FC<{
  fieldKey: string;
  label: string;
  required?: boolean;
  tip?: string;
  children: React.ReactNode;
}> = ({ fieldKey, label, required, tip, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }} data-field={fieldKey}>
    <div style={{ width: 148, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
      {required && <span style={{ color: TOKEN.primary, fontSize: 10 }}>*</span>}
      <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>{label}</Text>
      {tip && (
        <Tooltip title={tip} placement="top">
          <InfoCircleOutlined style={{ fontSize: 11, color: TOKEN.textMuted, cursor: 'help' }} />
        </Tooltip>
      )}
    </div>
    {children}
  </div>
);

/** 统一的搜索下拉：label 走契约字典，过滤走契约匹配函数（中英双向） */
const ColumnSelect: React.FC<{
  value: string;
  columns: readonly string[];
  disabled?: boolean;
  status?: 'error';
  placeholder?: string;
  onChange: (v: string) => void;
}> = ({ value, columns, disabled, status, placeholder, onChange }) => {
  const options = useMemo(() => {
    const list = columns.map((c) => ({ label: skuSalesColumnOptionLabel(c), value: c }));
    // 上游表已变更时保留旧值并标出，不静默清空
    if (hasColumnValue(value) && columns.indexOf(value) < 0) {
      list.unshift({ label: `⚠ ${skuSalesColumnOptionLabel(value)}`, value });
    }
    return list;
  }, [columns, value]);

  return (
    <div data-searchable="true" style={{ flex: 1 }}>
      <Select
        size="small"
        value={value || undefined}
        status={status}
        disabled={disabled}
        style={{ width: '100%' }}
        allowClear
        placeholder={placeholder ?? '可选择 · 支持搜索'}
        onChange={(v) => onChange((v as string) ?? '')}
        options={options}
        optionFilterProp="label"
        filterOption={(input, option) => matchesSkuSalesColumnSearch(input, String(option?.value ?? ''))}
        showSearch
        popupMatchSelectWidth={280}
        styles={{ popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } } }}
      />
    </div>
  );
};

/** 维度取值：标题与绑定项随附加维度切换，只保留一行 */
const DimensionColumnSelect: React.FC<{
  dimension: 'category' | 'brand' | 'shop';
  value: string;
  columns: readonly string[];
  onChange: (v: string) => void;
}> = ({ dimension, value, columns, onChange }) => {
  const fieldKey = DIMENSION_FIELD[dimension];
  const label = DIMENSION_OPTIONS.find((o) => o.value === dimension)?.label ?? '';
  return (
    <FieldRow fieldKey={fieldKey} label={`${label}取值`} tip={FIELD_TIP[fieldKey]}>
      <ColumnSelect
        value={value}
        columns={columns}
        status={hasColumnValue(value) ? undefined : 'error'}
        onChange={onChange}
      />
    </FieldRow>
  );
};

/** 槽位编辑器：运算符 + 可搜索项 + 删除/新增（两组各自独立） */
const FormulaSlotEditor: React.FC<{
  groupKey: SkuSalesSlotGroup;
  slots: FormulaSlot[];
  options: readonly string[];
  onChange: (next: FormulaSlot[]) => void;
}> = ({ groupKey, slots, options, onChange }) => (
  <div data-formula={groupKey} style={{ marginBottom: 8 }}>
    {slots.map((slot, i) => (
      <div key={`${groupKey}-${i}`} style={{ display: 'flex', gap: 6, marginBottom: 6 }} data-slot={i}>
        <Select
          size="small"
          style={{ width: 64 }}
          value={slot.operator}
          onChange={(v) => onChange(slots.map((s, j) => (j === i ? { ...s, operator: v as '+' | '-' } : s)))}
          options={SKU_SALES_SLOT_OPERATORS.map((o) => ({ label: o, value: o }))}
        />
        <ColumnSelect
          value={slot.column}
          columns={options}
          onChange={(v) => onChange(slots.map((s, j) => (j === i ? { ...s, column: v } : s)))}
        />
        <Button
          size="small"
          type="text"
          disabled={slots.length <= 1}
          onClick={() => onChange(slots.filter((_, j) => j !== i))}
        >
          删除
        </Button>
      </div>
    ))}
    <Button size="small" type="dashed" onClick={() => onChange([...slots, { operator: '+', column: '' }])}>
      + 新增项
    </Button>
  </div>
);

// ── 主组件 ───────────────────────────────────────────────────────────────

export const EcomSkuSalesAnalysisDrawer: React.FC<EcomSkuSalesAnalysisDrawerProps> = ({
  open, columns, initialConfig, kernelDisplayName, onConfirm, onCancel,
}) => {
  const [cfg, setCfg] = useState<EcomSkuSalesAnalysisConfig>(
    () => cloneSkuSalesConfig(initialConfig ?? DEFAULT_SKU_SALES_CONFIG),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // 单一 effect：打开时重建草稿 + 按正则预填（只填空槽，不覆盖已保存值）
  useEffect(() => {
    if (!open) return;
    const base = cloneSkuSalesConfig(initialConfig ?? DEFAULT_SKU_SALES_CONFIG);
    base.fieldMapping = matchSkuSalesColumns(columns, base.fieldMapping).fieldMapping;
    setCfg(base);
    setAdvancedOpen(false);
  }, [open, initialConfig, columns]);

  const patch = useCallback((next: Partial<EcomSkuSalesAnalysisConfig>) => {
    setCfg((prev) => ({ ...prev, ...next }));
  }, []);
  const patchMapping = useCallback((key: SkuSalesFieldKey, value: string) => {
    setCfg((prev) => ({ ...prev, fieldMapping: { ...prev.fieldMapping, [key]: value } }));
  }, []);
  const patchSlots = useCallback((group: SkuSalesSlotGroup, next: FormulaSlot[]) => {
    setCfg((prev) => ({ ...prev, [group]: next }));
  }, []);

  const blockers = useMemo(() => collectSkuSalesBlockers(cfg), [cfg]);
  const blockingErrors = useMemo(() => skuSalesBlockingErrors(cfg), [cfg]);
  const warnings = useMemo(() => blockers.filter((b) => b.severity === 'warning'), [blockers]);
  // 歧义只消费 matchSkuSalesColumns 的结果，不另写过滤判定
  const ambiguous = useMemo(
    () => matchSkuSalesColumns(columns, cfg.fieldMapping).ambiguous,
    [columns, cfg.fieldMapping],
  );
  const preview = useMemo(() => buildSkuSalesFormulaPreview(cfg), [cfg]);
  const qualityCodes = useMemo(() => resolveSkuSalesQualityCodes(cfg), [cfg]);
  const quality = useMemo(() => joinSkuSalesQuality(qualityCodes), [qualityCodes]);
  const profitSlotsResolved = useMemo(
    () => resolveSkuSalesProfitSlots(cfg.fieldMapping, cfg.profitSlots),
    [cfg.fieldMapping, cfg.profitSlots],
  );

  const refundDoubleDeduct = cfg.salesCaliber === 'net' && skuSalesSlotsIncludeRefund(cfg.salesSlots);
  const slotOptions = useCallback((group: SkuSalesSlotGroup) => SKU_SALES_SLOT_FIELDS[group], []);

  const restoreDefaults = useCallback(() => {
    const fresh = cloneSkuSalesConfig(DEFAULT_SKU_SALES_CONFIG);
    setCfg((prev) => ({ ...prev, salesSlots: fresh.salesSlots, profitSlots: fresh.profitSlots }));
  }, []);

  const changeDimension = useCallback((next: EcomSkuSalesAnalysisConfig['extraDimension']) => {
    // 换维度时清空所有维度取值，避免残留不可见的旧选择
    setCfg((prev) => ({
      ...prev,
      extraDimension: next,
      fieldMapping: { ...prev.fieldMapping, categoryCol: '', brandCol: '', shopCol: '' },
    }));
  }, []);

  const handleConfirm = useCallback(() => {
    if (skuSalesBlockingErrors(cfg).length > 0) return;
    onConfirm(cloneSkuSalesConfig(cfg));
  }, [cfg, onConfirm]);

  // 商品编码必填随统计粒度切换：SKU 粒度看 SKU 编码，SPU 粒度看商品编码（计划 :94）
  const required = (key: SkuSalesFieldKey): boolean =>
    SKU_SALES_REQUIRED_FIELDS.indexOf(key) >= 0 ||
    (key === 'skuIdCol' && cfg.groupLevel === 'sku') ||
    (key === 'productIdCol' && cfg.groupLevel === 'spu');

  return (
    <Drawer
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TagsOutlined style={{ color: TOKEN.primary }} />
          <span style={{ fontSize: 14 }}>{kernelDisplayName || 'SKU/SPU 销量毛利排行分析'}</span>
        </span>
      }
      open={open}
      width={760}
      destroyOnHidden
      onClose={onCancel}
      styles={{ body: { background: TOKEN.bgBase, paddingTop: 12 }, header: { background: TOKEN.bgHeader } }}
      footer={
        <div>
          {blockingErrors.length > 0 && (
            <div data-alert="blockers" style={{ marginBottom: 8, color: TOKEN.flowError, fontSize: 12 }}>
              {blockingErrors.map((b) => (
                <div key={b.code} style={{ lineHeight: 1.6 }}>· {b.message}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" disabled={blockingErrors.length > 0} onClick={handleConfirm}>
              确定
            </Button>
          </div>
        </div>
      }
    >
      {/* ① 统计对象与维度 */}
      <Section title="① 统计对象与维度">
        <FieldRow fieldKey="groupLevel" label="统计粒度" tip="按 SKU 看单品，按 SPU 看同款合计数">
          <Radio.Group size="small" value={cfg.groupLevel}
            onChange={(e) => patch({ groupLevel: e.target.value as 'sku' | 'spu' })}>
            {GROUP_OPTIONS.map((o) => (
              <Radio key={o.value} value={o.value}>{o.label}</Radio>
            ))}
          </Radio.Group>
        </FieldRow>
        <FieldRow fieldKey="skuIdCol" label={SKU_SALES_FIELD_LABEL.skuIdCol}
          required={required('skuIdCol')} tip={FIELD_TIP.skuIdCol}>
          <ColumnSelect value={cfg.fieldMapping.skuIdCol ?? ''} columns={columns}
            status={cfg.groupLevel === 'sku' && !hasColumnValue(cfg.fieldMapping.skuIdCol) ? 'error' : undefined}
            onChange={(v) => patchMapping('skuIdCol', v)} />
        </FieldRow>
        <FieldRow fieldKey="productIdCol" label={SKU_SALES_FIELD_LABEL.productIdCol}
          required={required('productIdCol')} tip={FIELD_TIP.productIdCol}>
          <ColumnSelect value={cfg.fieldMapping.productIdCol ?? ''} columns={columns}
            status={cfg.groupLevel === 'spu' && !hasColumnValue(cfg.fieldMapping.productIdCol) ? 'error' : undefined}
            onChange={(v) => patchMapping('productIdCol', v)} />
        </FieldRow>
        <FieldRow fieldKey="extraDimension" label="附加维度" tip="带一个业务维度进结果，便于按品类/品牌/店铺看排行">
          <Radio.Group size="small" value={cfg.extraDimension}
            onChange={(e) => changeDimension(e.target.value as EcomSkuSalesAnalysisConfig['extraDimension'])}>
            {DIMENSION_OPTIONS.map((o) => (
              <Radio key={o.value} value={o.value}>{o.label}</Radio>
            ))}
          </Radio.Group>
        </FieldRow>
        {cfg.extraDimension !== 'none' && (
          <DimensionColumnSelect
            dimension={cfg.extraDimension}
            value={cfg.fieldMapping[DIMENSION_FIELD[cfg.extraDimension]] ?? ''}
            columns={columns}
            onChange={(v) => patchMapping(DIMENSION_FIELD[cfg.extraDimension as 'category' | 'brand' | 'shop'], v)}
          />
        )}
      </Section>

      {/* ② 金额与成本 */}
      <Section title="② 金额与成本">
        <FieldRow fieldKey="salesCol" label={SKU_SALES_FIELD_LABEL.salesCol}
          required={required('salesCol')} tip={FIELD_TIP.salesCol}>
          <ColumnSelect value={cfg.fieldMapping.salesCol} columns={columns}
            status={hasColumnValue(cfg.fieldMapping.salesCol) ? undefined : 'error'}
            onChange={(v) => patchMapping('salesCol', v)} />
        </FieldRow>
        <FieldRow fieldKey="salesCaliber" label="销售额口径" tip="你的实收金额是否已扣过退款？决定毛利是否再扣一次">
          <Radio.Group size="small" value={cfg.salesCaliber}
            onChange={(e) => patch({ salesCaliber: e.target.value as 'gross' | 'net' })}>
            <Radio value="gross">未扣退款</Radio>
            <Radio value="net">已扣退款</Radio>
          </Radio.Group>
        </FieldRow>
        {refundDoubleDeduct && (
          <Text data-hint="refund-double-deduct" style={{ fontSize: 11, color: TOKEN.flowWarning, display: 'block', marginBottom: 8, marginLeft: 148 }}>
            已选『已扣退款』口径，退款金额会被重复扣除
          </Text>
        )}
        <FieldRow fieldKey="refundAmountCol" label={SKU_SALES_FIELD_LABEL.refundAmountCol} tip={FIELD_TIP.refundAmountCol}>
          <ColumnSelect value={cfg.fieldMapping.refundAmountCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('refundAmountCol', v)} />
        </FieldRow>
        <FieldRow fieldKey="grossProfitCol" label={SKU_SALES_FIELD_LABEL.grossProfitCol} tip={FIELD_TIP.grossProfitCol}>
          <ColumnSelect value={cfg.fieldMapping.grossProfitCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('grossProfitCol', v)} />
        </FieldRow>
        <FieldRow fieldKey="costCol" label={SKU_SALES_FIELD_LABEL.costCol} tip={FIELD_TIP.costCol}>
          <ColumnSelect value={cfg.fieldMapping.costCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('costCol', v)} />
        </FieldRow>
      </Section>

      {/* ③ 销量与库存 */}
      <Section title="③ 销量与库存">
        <FieldRow fieldKey="quantityCol" label={SKU_SALES_FIELD_LABEL.quantityCol}
          required={required('quantityCol')} tip={FIELD_TIP.quantityCol}>
          <ColumnSelect value={cfg.fieldMapping.quantityCol} columns={columns}
            status={hasColumnValue(cfg.fieldMapping.quantityCol) ? undefined : 'error'}
            onChange={(v) => patchMapping('quantityCol', v)} />
        </FieldRow>
        <FieldRow fieldKey="orderIdCol" label={SKU_SALES_FIELD_LABEL.orderIdCol} tip={FIELD_TIP.orderIdCol}>
          <ColumnSelect value={cfg.fieldMapping.orderIdCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('orderIdCol', v)} />
        </FieldRow>
        <FieldRow fieldKey="orderStatusCol" label={SKU_SALES_FIELD_LABEL.orderStatusCol} tip={FIELD_TIP.orderStatusCol}>
          <ColumnSelect value={cfg.fieldMapping.orderStatusCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('orderStatusCol', v)} />
        </FieldRow>
        <div data-field="excludeStatusValues" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>剔除状态值</Text>
            <Tooltip title="已退款的单仍属有效销售，请用退款金额扣减，而不是剔除状态">
              <InfoCircleOutlined style={{ fontSize: 11, color: TOKEN.textMuted, cursor: 'help' }} />
            </Tooltip>
            <Button size="small" type="link"
              onClick={() => patch({ excludeStatusValues: DEFAULT_SKU_SALES_CONFIG.excludeStatusValues })}>
              恢复默认
            </Button>
          </div>
          <TextArea
            rows={2}
            value={cfg.excludeStatusValues}
            placeholder={`逗号分隔，如：${DEFAULT_SKU_SALES_EXCLUDE_STATUSES}`}
            onChange={(e) => patch({ excludeStatusValues: e.target.value })}
          />
        </div>
        <FieldRow fieldKey="stockQtyCol" label={SKU_SALES_FIELD_LABEL.stockQtyCol} tip={FIELD_TIP.stockQtyCol}>
          <ColumnSelect value={cfg.fieldMapping.stockQtyCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('stockQtyCol', v)} />
        </FieldRow>
      </Section>

      {/* ④ 标签阈值 */}
      <Section title="④ 标签阈值">
        <FieldRow fieldKey="abcMetric" label="ABC 排序指标" tip="按哪个指标累计分出 A/B/C 三档">
          <Radio.Group size="small" value={cfg.abcMetric}
            onChange={(e) => patch({ abcMetric: e.target.value as 'sales' | 'profit' })}>
            <Radio value="sales">销售额</Radio>
            <Radio value="profit">毛利</Radio>
          </Radio.Group>
        </FieldRow>
        <FieldRow fieldKey="abcThresholdA" label="A 类阈值" tip="累计占比到此为止的商品算 A 类">
          <InputNumber size="small" style={{ width: 120 }} min={1} max={100} suffix="%"
            value={cfg.abcThresholdA} onChange={(v) => patch({ abcThresholdA: Number(v ?? 0) })} />
        </FieldRow>
        <FieldRow fieldKey="abcThresholdB" label="B 类阈值" tip="A 类之后累计到此为止的商品算 B 类，其余为 C 类">
          <InputNumber size="small" style={{ width: 120 }} min={1} max={100} suffix="%"
            value={cfg.abcThresholdB} onChange={(v) => patch({ abcThresholdB: Number(v ?? 0) })} />
        </FieldRow>
        <FieldRow fieldKey="slowMovingQtyThreshold" label="滞销销量阈值" tip="销量低于此值的商品算滞销">
          <InputNumber size="small" style={{ width: 120 }} min={0} suffix="件"
            value={cfg.slowMovingQtyThreshold} onChange={(v) => patch({ slowMovingQtyThreshold: Number(v ?? 0) })} />
        </FieldRow>
        <FieldRow fieldKey="profitMarginThreshold" label="毛利率阈值" tip="毛利率达到此值且销量为正的商品算利润款">
          <InputNumber size="small" style={{ width: 120 }} min={0} max={100} suffix="%"
            value={cfg.profitMarginThreshold} onChange={(v) => patch({ profitMarginThreshold: Number(v ?? 0) })} />
        </FieldRow>
      </Section>

      {/* ⑤ 计算公式 */}
      <Section title="⑤ 计算公式">
        <div data-field="formulaPreview" style={{
          background: TOKEN.bgBase, borderRadius: TOKEN.radiusLg, padding: '8px 10px',
          border: `1px solid ${TOKEN.borderSubtle}`, marginBottom: 8,
        }}>
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, display: 'block' }}>
            销售额 = {preview.salesFormula ?? '未设置'}
          </Text>
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, display: 'block' }}>
            毛利 = {preview.profitFormula ?? '未设置'}
          </Text>
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block' }}>
            {preview.salesCaliberNote}
          </Text>
          {preview.droppedSlots.length > 0 && (
            <Text data-hint="dropped-slots" style={{ fontSize: 11, color: TOKEN.flowWarning, display: 'block' }}>
              有 {preview.droppedSlots.length} 项不在可引用范围，已忽略
            </Text>
          )}
        </div>

        <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>销售额公式</Text>
        <FormulaSlotEditor groupKey="salesSlots" slots={cfg.salesSlots} options={slotOptions('salesSlots')}
          onChange={(next) => patchSlots('salesSlots', next)} />
        <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>毛利公式</Text>
        <FormulaSlotEditor groupKey="profitSlots" slots={cfg.profitSlots} options={slotOptions('profitSlots')}
          onChange={(next) => patchSlots('profitSlots', next)} />
        {profitSlotsResolved.length === 0 && (
          <Text data-hint="profit-degraded" style={{ fontSize: 11, color: TOKEN.flowWarning, display: 'block', marginBottom: 4 }}>
            毛利公式没有可用项，毛利按销售额减商品成本降级；两者都没有时毛利为空
          </Text>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button size="small" type="link" onClick={restoreDefaults}>恢复默认公式</Button>
          <Collapse
            ghost
            size="small"
            activeKey={advancedOpen ? ['detail'] : []}
            onChange={(keys) => setAdvancedOpen(Array.isArray(keys) ? keys.length > 0 : keys === 'detail')}
            items={[{
              key: 'detail',
              label: <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>查看计算明细（高级）</Text>,
              children: (
                <pre style={{ fontSize: 11, color: TOKEN.textSecondary, margin: 0, whiteSpace: 'pre-wrap' }}>
{`销售额：${preview.salesSql ?? '未设置'}\n毛利：${preview.profitSql ?? '未设置'}`}
                </pre>
              ),
            }]}
          />
        </div>
      </Section>

      {/* ⑥ 结果预览与提示 */}
      <Section title="⑥ 结果预览与提示">
        <FieldRow fieldKey="topN" label="返回条数" tip="排行只取前 N 名，取 0 表示不限">
          <InputNumber size="small" style={{ width: 120 }} min={0}
            value={cfg.topN} onChange={(v) => patch({ topN: Number(v ?? 0) })} />
        </FieldRow>
        {cfg.topN === 0 && (
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 8, marginLeft: 148 }}>
            0 表示不限
          </Text>
        )}
        <Text data-hint="inherit-filter" style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 8 }}>
          时间范围继承上游筛选条件
        </Text>

        {ambiguous.length > 0 && (
          <div data-hint="ambiguous" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 11, color: TOKEN.flowWarning, display: 'block' }}>
              以下项目未能自动识别，请手动选择
            </Text>
            {ambiguous.map((a) => (
              <Text key={a.field} style={{ fontSize: 11, color: TOKEN.flowWarning, display: 'block' }}>
                · {SKU_SALES_FIELD_LABEL[a.field]}：有 {a.candidates.length} 个候选
              </Text>
            ))}
          </div>
        )}

        <div data-field="dataQuality" style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>
            当前数据质量：{quality}
          </Text>
          {qualityCodes.filter((c) => c !== 'OK').length === 0 ? (
            <Tag style={{ fontSize: 10, color: TOKEN.flowSuccess, borderColor: TOKEN.flowSuccess }}>
              {SKU_SALES_QUALITY_DESC.OK}
            </Tag>
          ) : (
            qualityCodes.filter((c) => c !== 'OK').map((code) => (
              <Tag
                key={code}
                style={{ fontSize: 10, marginBottom: 4, color: TOKEN.flowWarning, borderColor: TOKEN.flowWarning }}
              >
                {SKU_SALES_QUALITY_DESC[code]}
              </Tag>
            ))
          )}
        </div>

        {warnings.length > 0 && (
          <div data-field="warnings">
            <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>待补全项</Text>
            {/* 同一 code 可能对应多条告警（每个槽位组各一条 slot-dropped），key 必须带序号 */}
            {warnings.map((w, idx) => (
              <Text key={`${w.code}-${idx}`} data-hint="warning" style={{ fontSize: 11, color: TOKEN.flowWarning, display: 'block' }}>
                · {w.message}
              </Text>
            ))}
          </div>
        )}
      </Section>
    </Drawer>
  );
};

export default EcomSkuSalesAnalysisDrawer;