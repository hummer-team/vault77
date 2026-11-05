/**
 * EcomZeroNegativeOrderDetectDrawer
 *
 * Configuration drawer for fn_ecom_zero_negative_order_detect (0 元单 / 负金额单检测).
 * Five sections: order info / amount info / detect rules / thresholds / formula slots.
 * All column selects are searchable with regex autofill; every colour and radius comes from TOKEN.
 * Chinese labels, rule names, thresholds and autofill regexes are imported — never re-declared here.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Collapse, Drawer, Input, InputNumber, Select, Switch, Tag, Tooltip, Typography,
} from 'antd';
import { FunctionOutlined, InfoCircleOutlined } from '@ant-design/icons';
import {
  DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG,
  DEFAULT_ZERO_NEGATIVE_RULES,
  ZERO_NEGATIVE_DERIVED_COLS,
  ZERO_NEGATIVE_DERIVED_COL_LABEL,
  ZERO_NEGATIVE_FIELD_LABEL,
  ZERO_NEGATIVE_REQUIRED_FIELDS,
  ZERO_NEGATIVE_RULE_DESC,
  ZERO_NEGATIVE_RULE_DEPENDENCY_COLS,
  ZERO_NEGATIVE_RULE_KEYS,
  ZERO_NEGATIVE_RULE_LABEL,
  ZERO_NEGATIVE_SLOT_OPERATORS,
  ZERO_NEGATIVE_SOURCE_COL_FIELD,
  ZERO_NEGATIVE_SOURCE_COLS,
  buildZeroNegativeFormulaPreview,
  canEvaluateNegativeUnitPrice,
  cloneZeroNegativeOrderDetectConfig,
  collectEnabledZeroNegativeRules,
  collectZeroNegativeBlockers,
  hasColumnValue,
  matchZeroNegativeColumns,
  type ZeroNegativeFieldKey,
  type ZeroNegativeOrderDetectConfig,
  type ZeroNegativeRuleKey,
} from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;
const { TextArea } = Input;

export interface EcomZeroNegativeOrderDetectDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: ZeroNegativeOrderDetectConfig;
  kernelDisplayName?: string;
  onConfirm: (config: ZeroNegativeOrderDetectConfig) => void;
  onCancel: () => void;
}

/** 增强规则 = 键集差集（核心 6 条由 DEFAULT_ZERO_NEGATIVE_RULES 定义） */
const ENHANCED_RULE_KEYS: ZeroNegativeRuleKey[] = ZERO_NEGATIVE_RULE_KEYS.filter(
  (k) => DEFAULT_ZERO_NEGATIVE_RULES.indexOf(k) < 0,
);
const CORE_RULE_KEYS: ZeroNegativeRuleKey[] = ZERO_NEGATIVE_RULE_KEYS.filter(
  (k) => DEFAULT_ZERO_NEGATIVE_RULES.indexOf(k) >= 0,
);

const OPTIONAL_AMOUNT_KEYS: ZeroNegativeFieldKey[] = [
  'quantityCol', 'unitPriceCol', 'couponAmountCol', 'platformDiscountCol', 'merchantDiscountCol', 'refundAmountCol',
];

/** 为什么需要这一列（业务口径一句话；名称本身复用 ZERO_NEGATIVE_FIELD_LABEL） */
const FIELD_TIP: Partial<Record<ZeroNegativeFieldKey, string>> = {
  orderIdCol: '用于按订单聚合并输出订单号；未指定时按数据行计数，多行同单可能重复统计',
  orderTimeCol: '用于观察区间过滤（近 N 天）与订单时间列输出',
  orderStatusCol: '用于剔除取消/退款等无效状态，避免把非有效单判为异常',
  payAmountCol: '检测零实付、负实付与金额不符的基准列，必填',
  productAmountCol: '计算应付金额与优惠溢出的基准列，必填',
  discountTotalCol: '计算应付金额与优惠溢出的基准列，必填',
  quantityCol: '无单价列时用于「商品金额 ÷ 数量」推导单价，判断负单价',
  unitPriceCol: '直接判断负单价；缺列时退回「商品金额 ÷ 数量」',
  couponAmountCol: '参与「优惠分项不符」：券 + 平台 + 商家之和应与优惠合计一致',
  platformDiscountCol: '参与「优惠分项不符」：券 + 平台 + 商家之和应与优惠合计一致',
  merchantDiscountCol: '参与「优惠分项不符」：券 + 平台 + 商家之和应与优惠合计一致',
  refundAmountCol: '映射后按「实付 − 退款」计净回款，负实付不再误报',
  exemptionCol: '与豁免值配合，命中该列值的订单整单跳过，不参与判定',
};

// ── 本地视觉基元（R4-6：不抽公共组件，不影响已上线抽屉） ────────────────────

const Section: React.FC<{ title: string; warn?: boolean; children: React.ReactNode }> = ({ title, warn, children }) => (
  <div style={{
    marginBottom: 14, padding: '10px 12px', background: TOKEN.bgSection,
    borderRadius: TOKEN.radiusLg, border: `1px solid ${TOKEN.borderSubtle}`,
    borderLeft: `3px solid ${TOKEN.borderPrimary}`,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <Text style={{
        fontSize: 11, color: TOKEN.textSecondary, fontWeight: 600, letterSpacing: '0.06em',
      }}>
        {title}
      </Text>
      {warn && (
        <Tag style={{ marginInlineEnd: 0, fontSize: 10, color: 'var(--vm-color-warning)', borderColor: 'var(--vm-color-warning)' }}>
          必填列未齐
        </Tag>
      )}
    </div>
    {children}
  </div>
);

const FieldRow: React.FC<{
  fieldKey: ZeroNegativeFieldKey;
  tip?: string;
  children: React.ReactNode;
}> = ({ fieldKey, tip, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }} data-field={fieldKey}>
    <div style={{ width: 148, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
      {ZERO_NEGATIVE_REQUIRED_FIELDS.indexOf(fieldKey) >= 0 && (
        <span style={{ color: TOKEN.primary, fontSize: 10 }}>*</span>
      )}
      <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>{ZERO_NEGATIVE_FIELD_LABEL[fieldKey]}</Text>
      {tip && (
        <Tooltip title={tip} placement="top">
          <InfoCircleOutlined style={{ fontSize: 11, color: TOKEN.textMuted, cursor: 'help' }} />
        </Tooltip>
      )}
    </div>
    {children}
  </div>
);

const ColumnSelect: React.FC<{
  value: string;
  columns: string[];
  status?: 'error';
  onChange: (v: string) => void;
}> = ({ value, columns, status, onChange }) => (
  <Select
    size="small"
    value={value || undefined}
    status={status}
    style={{ flex: 1 }}
    allowClear
    placeholder="可选择 · 支持搜索"
    onChange={(v) => onChange(v ?? '')}
    options={columns.map((c) => ({ label: c, value: c }))}
    optionFilterProp="label"
    showSearch
    styles={{ popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } } }}
  />
);

/** 数值行（阈值 / 分档 / 天数 / TopN）：清空时写 NaN，交由 blockers 统一拦截 */
const NumberRow: React.FC<{
  fieldKey: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  suffix: string;
  tip?: string;
  onChange: (v: number) => void;
}> = ({ fieldKey, label, value, min, max, suffix, tip, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }} data-field={fieldKey}>
    <div style={{ width: 148, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>{label}</Text>
      {tip && (
        <Tooltip title={tip} placement="top">
          <InfoCircleOutlined style={{ fontSize: 11, color: TOKEN.textMuted, cursor: 'help' }} />
        </Tooltip>
      )}
    </div>
    <InputNumber
      size="small"
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : null}
      style={{ width: 96 }}
      onChange={(v) => onChange(typeof v === 'number' ? v : Number.NaN)}
    />
    <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>{suffix}</Text>
  </div>
);

/** 公式槽位编辑器：操作符下拉 + 操作数下拉 + 删除 */
const FormulaSlotEditor: React.FC<{
  groupKey: 'expectedSlots' | 'lossSlots';
  slots: ReadonlyArray<{ operator: '+' | '-'; column: string }>;
  options: Array<{ label: string; value: string }>;
  onChange: (next: Array<{ operator: '+' | '-'; column: string }>) => void;
}> = ({ groupKey, slots, options, onChange }) => (
  <div data-formula={groupKey} style={{ marginBottom: 8 }}>
    {slots.map((slot, i) => (
      <div key={`${groupKey}-${i}`} style={{ display: 'flex', gap: 6, marginBottom: 6 }} data-slot={i}>
        <Select
          size="small"
          style={{ width: 64 }}
          value={slot.operator}
          onChange={(v) => onChange(slots.map((s, j) => (j === i ? { ...s, operator: v } : s)))}
          options={ZERO_NEGATIVE_SLOT_OPERATORS.map((o) => ({ label: o, value: o }))}
        />
        <Select
          size="small"
          style={{ flex: 1 }}
          value={slot.column || undefined}
          placeholder="选择操作数 · 支持搜索"
          showSearch
          optionFilterProp="label"
          onChange={(v) => onChange(slots.map((s, j) => (j === i ? { ...s, column: v ?? '' } : s)))}
          options={options}
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
      + 新增槽位
    </Button>
  </div>
);

// ── 主组件 ───────────────────────────────────────────────────────────────

export const EcomZeroNegativeOrderDetectDrawer: React.FC<EcomZeroNegativeOrderDetectDrawerProps> = ({
  open, columns, initialConfig, kernelDisplayName, onConfirm, onCancel,
}) => {
  const [cfg, setCfg] = useState<ZeroNegativeOrderDetectConfig>(
    () => cloneZeroNegativeOrderDetectConfig(initialConfig ?? DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG),
  );

  // 单一 effect：打开时重建草稿 + 正则预填（仅填空白槽位，不覆盖已保存值）
  useEffect(() => {
    if (!open) return;
    const base = cloneZeroNegativeOrderDetectConfig(initialConfig ?? DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG);
    base.fieldMapping = matchZeroNegativeColumns(columns, base.fieldMapping);
    setCfg(base);
  }, [open, initialConfig, columns]);

  const patch = useCallback((next: Partial<ZeroNegativeOrderDetectConfig>) => {
    setCfg((prev) => ({ ...prev, ...next }));
  }, []);
  const patchMapping = useCallback((key: ZeroNegativeFieldKey, value: string) => {
    setCfg((prev) => ({ ...prev, fieldMapping: { ...prev.fieldMapping, [key]: value } }));
  }, []);
  const patchThreshold = useCallback((key: 'toleranceYuan' | 'mismatchMinYuan' | 'pennyOrderMaxYuan', v: number) => {
    setCfg((prev) => ({ ...prev, thresholds: { ...prev.thresholds, [key]: v } }));
  }, []);
  const patchTier = useCallback((key: 'criticalYuan' | 'highYuan' | 'mediumYuan' | 'ruleCountUpgrade', v: number) => {
    setCfg((prev) => ({ ...prev, tiers: { ...prev.tiers, [key]: v } }));
  }, []);

  const enabledRules = useMemo(() => collectEnabledZeroNegativeRules(cfg), [cfg]);
  const blockers = useMemo(() => collectZeroNegativeBlockers(cfg), [cfg]);
  const preview = useMemo(() => buildZeroNegativeFormulaPreview(cfg), [cfg]);

  const toggleRule = useCallback((key: ZeroNegativeRuleKey, checked: boolean) => {
    const next = new Set(collectEnabledZeroNegativeRules(cfg));
    if (checked) next.add(key); else next.delete(key);
    // 任一次切换即固化为显式数组（顺序稳定，便于比对与回放）
    patch({ enabledRules: ZERO_NEGATIVE_RULE_KEYS.filter((k) => next.has(k)) });
  }, [cfg, patch]);

  /** 规则缺哪些依赖列（置灰依据与 Tag 文案同源） */
  const missingDepsOf = useCallback((key: ZeroNegativeRuleKey): ZeroNegativeFieldKey[] => {
    if (key === 'negative_unit_price') {
      return canEvaluateNegativeUnitPrice(cfg) ? [] : ['unitPriceCol', 'quantityCol'];
    }
    const deps = ZERO_NEGATIVE_RULE_DEPENDENCY_COLS[key];
    if (!deps) return [];
    return deps.filter((c) => !hasColumnValue(cfg.fieldMapping[c]));
  }, [cfg]);

  const requiredMissing = ZERO_NEGATIVE_REQUIRED_FIELDS.some((k) => !hasColumnValue(cfg.fieldMapping[k]));

  const sourceOptions = useMemo(
    () => ZERO_NEGATIVE_SOURCE_COLS.map((c) => ({ label: ZERO_NEGATIVE_FIELD_LABEL[ZERO_NEGATIVE_SOURCE_COL_FIELD[c]], value: c })),
    [],
  );
  const lossOptions = useMemo(
    () => [
      ...sourceOptions,
      ...ZERO_NEGATIVE_DERIVED_COLS.map((c) => ({ label: ZERO_NEGATIVE_DERIVED_COL_LABEL[c], value: c })),
    ],
    [sourceOptions],
  );

  const renderRuleRow = (key: ZeroNegativeRuleKey): React.ReactNode => {
    const isCore = CORE_RULE_KEYS.indexOf(key) >= 0;
    const checked = enabledRules.indexOf(key) >= 0;
    const missing = missingDepsOf(key);
    const blocked = missing.length > 0;
    return (
      <div key={key} data-rule={key} style={{ padding: '7px 0', borderTop: `1px dashed ${TOKEN.borderSubtle}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch size="small" checked={checked} disabled={blocked} onChange={(v) => toggleRule(key, v)} />
          <Text style={{ fontSize: 12, color: blocked ? TOKEN.textMuted : TOKEN.textPrimary, fontWeight: 600 }}>
            {ZERO_NEGATIVE_RULE_LABEL[key]}
          </Text>
          <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>{isCore ? '核心' : '增强'}</Tag>
          {blocked && (
            <Tooltip title={`缺少依赖列：${missing.map((c) => ZERO_NEGATIVE_FIELD_LABEL[c]).join('、')}`}>
              <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>缺少依赖列</Tag>
            </Tooltip>
          )}
        </div>
        <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginLeft: 32, marginTop: 2 }}>
          {ZERO_NEGATIVE_RULE_DESC[key]}
        </Text>
      </div>
    );
  };

  return (
    <Drawer
      open={open}
      onClose={onCancel}
      width={680}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FunctionOutlined style={{ color: TOKEN.primary }} />
          <Text style={{ fontSize: 14, fontWeight: 600 }}>{kernelDisplayName ?? '0元单/负金额单检测'}</Text>
        </div>
      }
      footer={
        <div>
          {blockers.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 8 }}
              message="配置未完成，暂不能应用"
              description={
                <div style={{ fontSize: 12, color: TOKEN.textSecondary }}>
                  {blockers.map((b) => b.message).join('；')}
                </div>
              }
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button size="small" onClick={onCancel}>取消</Button>
            <Button
              size="small"
              type="primary"
              disabled={blockers.length > 0}
              onClick={() => onConfirm(cloneZeroNegativeOrderDetectConfig(cfg))}
            >
              确定
            </Button>
          </div>
        </div>
      }
    >
      {/* ① 订单信息 */}
      <Section title="① 订单信息">
        <FieldRow fieldKey="orderIdCol" tip={FIELD_TIP.orderIdCol}>
          <ColumnSelect value={cfg.fieldMapping.orderIdCol} columns={columns} onChange={(v) => patchMapping('orderIdCol', v)} />
        </FieldRow>
        {!hasColumnValue(cfg.fieldMapping.orderIdCol) && (
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8, marginLeft: 148 }}>
            未指定订单号列时按数据行计数，多行同单可能重复统计
          </Text>
        )}
        <FieldRow fieldKey="orderTimeCol" tip={FIELD_TIP.orderTimeCol}>
          <ColumnSelect value={cfg.fieldMapping.orderTimeCol} columns={columns} onChange={(v) => patchMapping('orderTimeCol', v)} />
        </FieldRow>
        <FieldRow fieldKey="orderStatusCol" tip={FIELD_TIP.orderStatusCol}>
          <ColumnSelect value={cfg.fieldMapping.orderStatusCol} columns={columns} onChange={(v) => patchMapping('orderStatusCol', v)} />
        </FieldRow>
      </Section>

      {/* ② 金额信息 */}
      <Section title="② 金额信息" warn={requiredMissing}>
        {ZERO_NEGATIVE_REQUIRED_FIELDS.map((k) => (
          <FieldRow key={k} fieldKey={k} tip={FIELD_TIP[k]}>
            <ColumnSelect
              value={cfg.fieldMapping[k]}
              columns={columns}
              status={hasColumnValue(cfg.fieldMapping[k]) ? undefined : 'error'}
              onChange={(v) => patchMapping(k, v)}
            />
          </FieldRow>
        ))}
        {OPTIONAL_AMOUNT_KEYS.map((k) => (
          <FieldRow key={k} fieldKey={k} tip={FIELD_TIP[k]}>
            <ColumnSelect value={cfg.fieldMapping[k]} columns={columns} onChange={(v) => patchMapping(k, v)} />
          </FieldRow>
        ))}
      </Section>

      {/* ③ 检测规则 */}
      <Section title="③ 检测规则">
        <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>核心规则（默认开启）</Text>
        {CORE_RULE_KEYS.map(renderRuleRow)}
        <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', margin: '8px 0 4px' }}>增强规则（默认关闭，按需开启）</Text>
        {ENHANCED_RULE_KEYS.map(renderRuleRow)}
      </Section>

      {/* ④ 判定阈值 */}
      <Section title="④ 判定阈值">
        <NumberRow fieldKey="toleranceYuan" label="金额容差" value={cfg.thresholds.toleranceYuan} min={0} suffix="元"
          tip="判等时允许的浮点误差，超出即视为不相等" onChange={(v) => patchThreshold('toleranceYuan', v)} />
        <NumberRow fieldKey="mismatchMinYuan" label="最小可报告缺口" value={cfg.thresholds.mismatchMinYuan} min={0} suffix="元"
          tip="差额小于该值不报告，服务「金额不符」与「微额订单」两项规则" onChange={(v) => patchThreshold('mismatchMinYuan', v)} />
        <NumberRow fieldKey="pennyOrderMaxYuan" label="微额上限" value={cfg.thresholds.pennyOrderMaxYuan} min={0} suffix="元"
          tip="实付不超过该值且与应付存在缺口的订单判为微额订单" onChange={(v) => patchThreshold('pennyOrderMaxYuan', v)} />
        <NumberRow fieldKey="criticalYuan" label="严重档起点" value={cfg.tiers.criticalYuan} min={0} suffix="元"
          onChange={(v) => patchTier('criticalYuan', v)} />
        <NumberRow fieldKey="highYuan" label="高档起点" value={cfg.tiers.highYuan} min={0} suffix="元"
          onChange={(v) => patchTier('highYuan', v)} />
        <NumberRow fieldKey="mediumYuan" label="中档起点" value={cfg.tiers.mediumYuan} min={0} suffix="元"
          onChange={(v) => patchTier('mediumYuan', v)} />
        <NumberRow fieldKey="ruleCountUpgrade" label="升档命中数" value={cfg.tiers.ruleCountUpgrade} min={1} suffix="类及以上升一档"
          onChange={(v) => patchTier('ruleCountUpgrade', v)} />
        <NumberRow fieldKey="observationDays" label="观察区间" value={cfg.windows.observationDays} min={0} max={3650} suffix="天（0 = 全量）"
          tip="按订单支付时间回看最近 N 天，0 表示不裁剪" onChange={(v) => patch({ windows: { observationDays: v } })} />
        <NumberRow fieldKey="topN" label="洞察 TopN" value={cfg.topN} min={1} max={10} suffix="条（1–10）"
          onChange={(v) => patch({ topN: v })} />

        <div data-field="excludeStatusValues" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>剔除订单状态</Text>
            <Button size="small" type="link" onClick={() => patch({ excludeStatusValues: DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG.excludeStatusValues })}>
              恢复默认
            </Button>
          </div>
          <TextArea
            rows={2}
            value={cfg.excludeStatusValues}
            placeholder="逗号分隔，中英文均可，如：已取消,已退款,CANCELLED"
            onChange={(e) => patch({ excludeStatusValues: e.target.value })}
          />
        </div>

        <div data-field="exemption" style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${TOKEN.borderSubtle}` }}>
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 6 }}>
            误报豁免（列与值同时填写才生效，命中值的订单整单跳过）
          </Text>
          <FieldRow fieldKey="exemptionCol" tip={FIELD_TIP.exemptionCol}>
            <ColumnSelect value={cfg.fieldMapping.exemptionCol} columns={columns} onChange={(v) => patchMapping('exemptionCol', v)} />
          </FieldRow>
          <div data-field="exemptionValues" style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 148, flexShrink: 0 }}>
              <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>豁免值</Text>
            </div>
            <Input
              size="small"
              value={cfg.exemptionValues}
              placeholder="逗号分隔，如：赠品,试用"
              onChange={(e) => patch({ exemptionValues: e.target.value })}
            />
          </div>
        </div>
      </Section>

      {/* ⑤ 计算公式 */}
      <Section title="⑤ 计算公式">
        <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>应付金额（仅可引用源数据列）</Text>
        <FormulaSlotEditor
          groupKey="expectedSlots"
          slots={cfg.formula.expectedSlots}
          options={sourceOptions}
          onChange={(next) => patch({ formula: { ...cfg.formula, expectedSlots: next } })}
        />
        <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', margin: '8px 0 4px' }}>损失金额（可引用派生列）</Text>
        <FormulaSlotEditor
          groupKey="lossSlots"
          slots={cfg.formula.lossSlots}
          options={lossOptions}
          onChange={(next) => patch({ formula: { ...cfg.formula, lossSlots: next } })}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }} data-field="includeOverflowLoss">
          <Switch size="small" checked={cfg.includeOverflowLoss} onChange={(v) => patch({ includeOverflowLoss: v })} />
          <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>超额优惠并入损失</Text>
          <Tooltip title="开启后，优惠超过商品金额的部分（应付款为负的绝对值）也计入损失；与应付金额公式互为补充，不重复计算">
            <InfoCircleOutlined style={{ fontSize: 11, color: TOKEN.textMuted, cursor: 'help' }} />
          </Tooltip>
        </div>

        <div data-field="formulaPreview" style={{ background: TOKEN.bgBase, borderRadius: TOKEN.radiusLg, padding: '8px 10px', border: `1px solid ${TOKEN.borderSubtle}` }}>
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, display: 'block' }}>
            应付金额 = {preview.expectedHuman}
          </Text>
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, display: 'block' }}>
            损失金额 = GREATEST(0, {preview.lossHuman}){cfg.includeOverflowLoss ? ' + GREATEST(0, -应付金额)' : ''}
          </Text>
          <Collapse
            ghost
            size="small"
            items={[{
              key: 'sql',
              label: <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>查看 SQL 表达式</Text>,
              children: (
                <pre style={{ fontSize: 11, color: TOKEN.textSecondary, margin: 0, whiteSpace: 'pre-wrap' }}>
{`COALESCE(${preview.expectedSql}) AS expected_amount
COALESCE(${preview.lossSql}) AS loss_amount`}
                </pre>
              ),
            }]}
          />
        </div>
        <Button
          size="small"
          type="link"
          onClick={() => patch({
            formula: cloneZeroNegativeOrderDetectConfig(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG).formula,
            includeOverflowLoss: DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG.includeOverflowLoss,
          })}
        >
          恢复默认公式
        </Button>
      </Section>
    </Drawer>
  );
};

export default EcomZeroNegativeOrderDetectDrawer;