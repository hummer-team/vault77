/**
 * EcomDailyBizSummaryDrawer
 *
 * Configuration drawer for fn_ecom_daily_biz_summary（店铺每日经营全景汇总）.
 * Five sections: 时间与主体 / 金额口径 / 公式 / 过滤与对比 / 输出与质量.
 * All labels, thresholds and gates come from the strategy contract module — never re-declared here.
 * Every colour, radius and spacing token comes from TOKEN; no literal colour is used.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Collapse, Drawer, Input, Radio, Select, Tag, Tooltip, Typography } from 'antd';
import { CalendarOutlined, InfoCircleOutlined } from '@ant-design/icons';
import {
  DAILY_BIZ_COLUMN_LABEL,
  DAILY_BIZ_FIELD_LABEL,
  DAILY_BIZ_QUALITY_DESC,
  DAILY_BIZ_REQUIRED_FIELDS,
  DAILY_BIZ_SLOT_FIELDS,
  DAILY_BIZ_SLOT_OPERATORS,
  DEFAULT_DAILY_BIZ_SUMMARY_CONFIG,
  applyDailyBizSalesCaliber,
  buildDailyBizFormulaPreview,
  cloneDailyBizSummaryConfig,
  collectDailyBizBlockers,
  dailyBizDefaultNetProfitSlots,
  hasDailyBizCaliberConflict,
  joinDailyBizQuality,
  matchDailyBizColumns,
  resolveDailyBizQualityCodes,
  type DailyBizFieldKey,
  type DailyBizSlotGroup,
} from '../../../services/flow/strategies/ecomDailyBizSummaryStrategy';
import { hasColumnValue, type DailyBizSummaryConfig, type FormulaSlot } from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;
const { TextArea } = Input;

export interface EcomDailyBizSummaryDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: DailyBizSummaryConfig;
  kernelDisplayName?: string;
  onConfirm: (config: DailyBizSummaryConfig) => void;
  onCancel: () => void;
}

/** 为什么需要这一列（业务口径一句话；名称复用契约字典） */
const FIELD_TIP: Partial<Record<DailyBizFieldKey, string>> = {
  orderDateCol: '按这一列的日期把订单归入每一天，必填',
  orderIdCol: '映射后按订单号去重计数；不映射则按数据行计数',
  salesCol: '日报里的销售与净利都以这一列为基础，必填',
  orderStatusCol: '用于剔除取消、未支付等无效单',
  grossProfitCol: '毛利额；不映射时自动按「销售额 − 商品成本」降级',
  costCol: '毛利额缺失时用于降级计算',
  refundAmountCol: '用于计算退款率，并在毛额口径下从净利中扣减一次',
  feeTotalCol: '费用合计列（与分项相加二选一）',
  commissionFeeCol: '分项相加模式下参与费用合计',
  shippingFeeCol: '分项相加模式下参与费用合计',
  serviceFeeCol: '分项相加模式下参与费用合计',
  quantityCol: '不映射时结果不含销量列',
};

const COMPARE_OPTIONS = [
  { label: '关闭', value: 'none' },
  { label: '日环比', value: 'day' },
  { label: '周环比', value: 'week' },
  { label: '月环比', value: 'month' },
  { label: '年同比', value: 'year' },
] as const;

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

/** 列下拉：统一可搜索（容器打 data-searchable 便于测试与后续统一样式） */
const ColumnSelect: React.FC<{
  value: string;
  columns: string[];
  disabled?: boolean;
  status?: 'error';
  onChange: (v: string) => void;
}> = ({ value, columns, disabled, status, onChange }) => (
  <div data-searchable="true" style={{ flex: 1 }}>
    <Select
      size="small"
      value={value || undefined}
      status={status}
      disabled={disabled}
      style={{ width: '100%' }}
      allowClear
      placeholder="可选择 · 支持搜索"
      onChange={(v) => onChange((v as string) ?? '')}
      options={columns.map((c) => ({ label: c, value: c }))}
      optionFilterProp="label"
      showSearch
      styles={{ popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } } }}
    />
  </div>
);

/** 槽位编辑器：运算符 + 可搜索列 + 删除/新增（按组隔离） */
const FormulaSlotEditor: React.FC<{
  groupKey: DailyBizSlotGroup;
  slots: FormulaSlot[];
  options: Array<{ label: string; value: string }>;
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
          options={DAILY_BIZ_SLOT_OPERATORS.map((o) => ({ label: o, value: o }))}
        />
        <div data-searchable="true" style={{ flex: 1 }}>
          <Select
            size="small"
            style={{ width: '100%' }}
            value={slot.column || undefined}
            placeholder="选择项 · 支持搜索"
            showSearch
            optionFilterProp="label"
            onChange={(v) => onChange(slots.map((s, j) => (j === i ? { ...s, column: (v as string) ?? '' } : s)))}
            options={options}
          />
        </div>
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

export const EcomDailyBizSummaryDrawer: React.FC<EcomDailyBizSummaryDrawerProps> = ({
  open, columns, initialConfig, kernelDisplayName, onConfirm, onCancel,
}) => {
  const [cfg, setCfg] = useState<DailyBizSummaryConfig>(
    () => cloneDailyBizSummaryConfig(initialConfig ?? DEFAULT_DAILY_BIZ_SUMMARY_CONFIG),
  );

  // 单一 effect：打开时重建草稿 + 正则预填（仅填空槽，不覆盖已保存值）
  useEffect(() => {
    if (!open) return;
    const base = cloneDailyBizSummaryConfig(initialConfig ?? DEFAULT_DAILY_BIZ_SUMMARY_CONFIG);
    base.fieldMapping = matchDailyBizColumns(columns, base.fieldMapping).mapping;
    setCfg(base);
  }, [open, initialConfig, columns]);

  const patch = useCallback((next: Partial<DailyBizSummaryConfig>) => {
    setCfg((prev) => ({ ...prev, ...next }));
  }, []);
  const patchMapping = useCallback((key: DailyBizFieldKey, value: string) => {
    setCfg((prev) => ({ ...prev, fieldMapping: { ...prev.fieldMapping, [key]: value } }));
  }, []);
  const patchSlots = useCallback((group: DailyBizSlotGroup, next: FormulaSlot[]) => {
    setCfg((prev) => ({ ...prev, [group]: next }));
  }, []);

  // 全量 blockers（含 warning）供提示展示；门禁只看 error
  const blockers = useMemo(() => collectDailyBizBlockers(cfg), [cfg]);
  const blockingErrors = useMemo(() => blockers.filter((b) => b.severity === 'error'), [blockers]);
  const preview = useMemo(() => buildDailyBizFormulaPreview(cfg), [cfg]);
  const qualityCodes = useMemo(() => resolveDailyBizQualityCodes(cfg), [cfg]);
  const quality = useMemo(() => joinDailyBizQuality(qualityCodes), [qualityCodes]);
  const conflict = hasDailyBizCaliberConflict(cfg);
  const profitDegraded = !hasColumnValue(cfg.fieldMapping.grossProfitCol);
  const slotSum = cfg.feeCaliber === 'slot_sum';

  const optionsOf = useCallback(
    (group: DailyBizSlotGroup) =>
      DAILY_BIZ_SLOT_FIELDS[group].map((col) => ({
        label: DAILY_BIZ_COLUMN_LABEL[col] ?? col,
        value: col,
      })),
    [],
  );

  const restoreDefaults = useCallback(() => {
    const fresh = cloneDailyBizSummaryConfig(DEFAULT_DAILY_BIZ_SUMMARY_CONFIG);
    setCfg((prev) => ({
      ...prev,
      salesSlots: fresh.salesSlots,
      profitSlots: fresh.profitSlots,
      netProfitSlots: dailyBizDefaultNetProfitSlots(prev.salesCaliber),
      feeSlots: fresh.feeSlots,
    }));
  }, []);

  return (
    <Drawer
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarOutlined style={{ color: TOKEN.primary }} />
          <span style={{ fontSize: 14 }}>{kernelDisplayName || '店铺每日经营全景汇总'}</span>
        </span>
      }
      open={open}
      width={620}
      onClose={onCancel}
      styles={{ body: { background: TOKEN.bgBase, paddingTop: 12 }, header: { background: TOKEN.bgHeader } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" disabled={blockingErrors.length > 0} onClick={() => onConfirm(cloneDailyBizSummaryConfig(cfg))}>
            确定
          </Button>
        </div>
      }
    >
      {/* ① 时间与主体 */}
      <Section title="① 时间与主体">
        <FieldRow fieldKey="orderDateCol" label={DAILY_BIZ_FIELD_LABEL.orderDateCol}
          required={DAILY_BIZ_REQUIRED_FIELDS.indexOf('orderDateCol') >= 0} tip={FIELD_TIP.orderDateCol}>
          <ColumnSelect value={cfg.fieldMapping.orderDateCol} columns={columns}
            status={hasColumnValue(cfg.fieldMapping.orderDateCol) ? undefined : 'error'}
            onChange={(v) => patchMapping('orderDateCol', v)} />
        </FieldRow>
        <FieldRow fieldKey="orderIdCol" label={DAILY_BIZ_FIELD_LABEL.orderIdCol} tip={FIELD_TIP.orderIdCol}>
          <ColumnSelect value={cfg.fieldMapping.orderIdCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('orderIdCol', v)} />
        </FieldRow>
        {!hasColumnValue(cfg.fieldMapping.orderIdCol) && (
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 8, marginLeft: 148 }}>
            未指定订单号时，订单数按数据行计数
          </Text>
        )}
      </Section>

      {/* ② 金额口径 */}
      <Section title="② 金额口径">
        <FieldRow fieldKey="salesCol" label={DAILY_BIZ_FIELD_LABEL.salesCol}
          required={DAILY_BIZ_REQUIRED_FIELDS.indexOf('salesCol') >= 0} tip={FIELD_TIP.salesCol}>
          <ColumnSelect value={cfg.fieldMapping.salesCol} columns={columns}
            status={hasColumnValue(cfg.fieldMapping.salesCol) ? undefined : 'error'}
            onChange={(v) => patchMapping('salesCol', v)} />
        </FieldRow>

        <FieldRow fieldKey="salesCaliber" label="销售额口径" tip="你的销售额是否已扣过退款？决定净利是否再扣一次退款">
          <Radio.Group size="small" value={cfg.salesCaliber}
            onChange={(e) => setCfg((prev) => applyDailyBizSalesCaliber(prev, e.target.value as 'gross' | 'net'))}>
            <Radio value="gross">未扣退款（毛额）</Radio>
            <Radio value="net">已扣退款（净额）</Radio>
          </Radio.Group>
        </FieldRow>

        <FieldRow fieldKey="refundAmountCol" label={DAILY_BIZ_FIELD_LABEL.refundAmountCol} tip={FIELD_TIP.refundAmountCol}>
          <ColumnSelect value={cfg.fieldMapping.refundAmountCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('refundAmountCol', v)} />
        </FieldRow>

        <FieldRow fieldKey="grossProfitCol" label={DAILY_BIZ_FIELD_LABEL.grossProfitCol} tip={FIELD_TIP.grossProfitCol}>
          <ColumnSelect value={cfg.fieldMapping.grossProfitCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('grossProfitCol', v)} />
        </FieldRow>
        <FieldRow fieldKey="costCol" label={DAILY_BIZ_FIELD_LABEL.costCol} tip={FIELD_TIP.costCol}>
          <ColumnSelect value={cfg.fieldMapping.costCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('costCol', v)} />
        </FieldRow>

        <FieldRow fieldKey="feeCaliber" label="费用口径" tip="费用来源：一列费用合计，或佣金/运费/服务费三项相加">
          <Radio.Group size="small" value={cfg.feeCaliber}
            onChange={(e) => patch({ feeCaliber: e.target.value as 'single_column' | 'slot_sum' })}>
            <Radio value="single_column">费用合计列</Radio>
            <Radio value="slot_sum">分项相加</Radio>
          </Radio.Group>
        </FieldRow>

        <FieldRow fieldKey="feeTotalCol" label={DAILY_BIZ_FIELD_LABEL.feeTotalCol} tip={FIELD_TIP.feeTotalCol}>
          <ColumnSelect value={cfg.fieldMapping.feeTotalCol ?? ''} columns={columns} disabled={slotSum}
            onChange={(v) => patchMapping('feeTotalCol', v)} />
        </FieldRow>
        {(['commissionFeeCol', 'shippingFeeCol', 'serviceFeeCol'] as DailyBizFieldKey[]).map((key) => (
          <FieldRow key={key} fieldKey={key} label={DAILY_BIZ_FIELD_LABEL[key]} tip={FIELD_TIP[key]}>
            <ColumnSelect value={cfg.fieldMapping[key] ?? ''} columns={columns} disabled={!slotSum}
              onChange={(v) => patchMapping(key, v)} />
          </FieldRow>
        ))}
      </Section>

      {/* ③ 公式 */}
      <Section title="③ 公式">
        <div data-field="formulaPreview" style={{
          background: TOKEN.bgBase, borderRadius: TOKEN.radiusLg, padding: '8px 10px',
          border: `1px solid ${TOKEN.borderSubtle}`, marginBottom: 8,
        }}>
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, display: 'block' }}>
            销售额 = {preview.salesHuman}
          </Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, color: TOKEN.textPrimary, display: 'block' }}>
              毛利 = {preview.profitHuman}
            </Text>
            {profitDegraded && (
              <Tag data-tag="degraded" style={{ marginInlineEnd: 0, fontSize: 10, color: TOKEN.flowWarning, borderColor: TOKEN.flowWarning }}>
                自动降级
              </Tag>
            )}
          </div>
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, display: 'block' }}>
            净利 = {preview.netProfitHuman}
          </Text>
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, display: 'block' }}>
            费用合计 = {preview.feeHuman}
          </Text>
        </div>

        {conflict && (
          <Alert
            data-alert="caliber-conflict"
            type="warning"
            showIcon
            style={{ marginBottom: 8 }}
            message="销售额口径=已扣退款，但净利公式仍含退款扣减项"
            description="退款会被扣两次。可点下方「恢复默认公式」按当前口径重建净利公式。"
          />
        )}

        <FormulaSlotEditor groupKey="salesSlots" slots={cfg.salesSlots} options={optionsOf('salesSlots')}
          onChange={(next) => patchSlots('salesSlots', next)} />
        <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>毛利公式</Text>
        <FormulaSlotEditor groupKey="profitSlots" slots={cfg.profitSlots} options={optionsOf('profitSlots')}
          onChange={(next) => patchSlots('profitSlots', next)} />
        <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>净利公式</Text>
        <FormulaSlotEditor groupKey="netProfitSlots" slots={cfg.netProfitSlots} options={optionsOf('netProfitSlots')}
          onChange={(next) => patchSlots('netProfitSlots', next)} />
        {slotSum && (
          <>
            <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>费用分项</Text>
            <FormulaSlotEditor groupKey="feeSlots" slots={cfg.feeSlots} options={optionsOf('feeSlots')}
              onChange={(next) => patchSlots('feeSlots', next)} />
          </>
        )}

        <Collapse
          ghost
          size="small"
          items={[{
            key: 'sql',
            label: <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>查看计算明细（高级）</Text>,
            children: (
              <pre style={{ fontSize: 11, color: TOKEN.textSecondary, margin: 0, whiteSpace: 'pre-wrap' }}>
{preview.sqlLines.join('\n')}
              </pre>
            ),
          }]}
        />
        <Button size="small" type="link" onClick={restoreDefaults}>恢复默认公式</Button>
      </Section>

      {/* ④ 过滤与对比 */}
      <Section title="④ 过滤与对比">
        <FieldRow fieldKey="orderStatusCol" label={DAILY_BIZ_FIELD_LABEL.orderStatusCol} tip={FIELD_TIP.orderStatusCol}>
          <ColumnSelect value={cfg.fieldMapping.orderStatusCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('orderStatusCol', v)} />
        </FieldRow>
        <div data-field="excludeStatusValues" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>剔除状态值</Text>
            <Tooltip title="已退款单仍属有效销售，请用退款金额扣减，而不是剔除状态">
              <InfoCircleOutlined style={{ fontSize: 11, color: TOKEN.textMuted, cursor: 'help' }} />
            </Tooltip>
            <Button size="small" type="link"
              onClick={() => patch({ excludeStatusValues: DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.excludeStatusValues })}>
              恢复默认
            </Button>
          </div>
          <TextArea
            rows={2}
            value={cfg.excludeStatusValues}
            placeholder="逗号分隔，如：已取消,交易关闭,未支付"
            onChange={(e) => patch({ excludeStatusValues: e.target.value })}
          />
        </div>
        <FieldRow fieldKey="compareMode" label="对比口径"
          tip="与上一可对齐出数日比较；月环比对齐上月同日，上月无该日时取上月最后一天；对齐日无出数则该列为空">
          <Select
            size="small"
            style={{ width: 160 }}
            value={cfg.compareMode}
            onChange={(v) => patch({ compareMode: v as DailyBizSummaryConfig['compareMode'] })}
            options={COMPARE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          />
        </FieldRow>
      </Section>

      {/* ⑤ 输出与质量 */}
      <Section title="⑤ 输出与质量">
        <FieldRow fieldKey="quantityCol" label={DAILY_BIZ_FIELD_LABEL.quantityCol} tip={FIELD_TIP.quantityCol}>
          <ColumnSelect value={cfg.fieldMapping.quantityCol ?? ''} columns={columns}
            onChange={(v) => patchMapping('quantityCol', v)} />
        </FieldRow>
        <div data-field="dataQuality" style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>
            当前数据质量：{quality}
          </Text>
          {quality === 'OK' ? (
            <Text style={{ fontSize: 12, color: TOKEN.flowSuccess }}>口径完整</Text>
          ) : (
            qualityCodes.filter((c) => c !== 'OK').map((code) => (
              <Text key={code} style={{ fontSize: 11, color: TOKEN.textSecondary, display: 'block' }}>
                · {DAILY_BIZ_QUALITY_DESC[code]}（{code}）
              </Text>
            ))
          )}
        </div>
      </Section>

      {blockingErrors.length > 0 && (
        <Alert
          data-alert="blockers"
          type="warning"
          showIcon
          message="还不能执行"
          description={blockingErrors.map((b) => b.message).join('；')}
        />
      )}
    </Drawer>
  );
};

export default EcomDailyBizSummaryDrawer;
