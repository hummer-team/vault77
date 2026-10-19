/**
 * EcomPlatformFeeAllocateDrawer
 *
 * Configuration drawer for fn_ecom_platform_fee_allocate (平台佣金/服务费自动分摊).
 *
 * Sections:
 *   Group 1 — 分摊模式（Radio 三态）+ 字段映射（订单号/商品金额必填，购买数量条件必填）
 *   Group 2 — 费用槽位 feeSlots slot1-4（slot1 锚定 '+平台佣金'，逐槽可选列可清空）
 *   Group 3 — 净利扣减 deductSlots slot1-2（默认 '-'，可换 '+/-'）
 *
 * All colors use TOKEN (CSS variables) — no hardcoded hex values.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Drawer,
  Button,
  Select,
  Radio,
  Typography,
  Tooltip,
} from 'antd';
import {
  CloseOutlined,
  ApartmentOutlined,
  FunctionOutlined,
  SplitCellsOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  DEFAULT_FEE_ALLOCATE_CONFIG,
  type FeeAllocateMode,
  type FormulaSlot,
  type PlatformFeeAllocateConfig,
} from '../../../services/flow/types';
import { FIELD_MATCH_PATTERNS } from '../../../services/flow/strategies/ecomPlatformFeeAllocateStrategy';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Section wrapper
// ============================================================================

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  badge?: string;
  children: React.ReactNode;
}> = ({ icon, title, badge, children }) => (
  <div
    style={{
      marginBottom: 16,
      padding: '12px 14px',
      background: TOKEN.bgSection,
      borderRadius: TOKEN.radiusLg,
      border: `1px solid ${TOKEN.borderSubtle}`,
      borderLeft: `3px solid var(--vm-primary-border)`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <span style={{ color: TOKEN.textMuted, fontSize: 13 }}>{icon}</span>
      <Text style={{ fontSize: 11, color: TOKEN.textSecondary, fontWeight: 600, letterSpacing: '0.06em' }}>
        {title}
      </Text>
      {badge && (
        <span
          style={{
            fontSize: 10,
            color: TOKEN.primary,
            background: 'var(--vm-primary-glow)',
            border: `1px solid var(--vm-primary-border)`,
            borderRadius: 3,
            padding: '0 5px',
            lineHeight: '16px',
          }}
        >
          {badge}
        </span>
      )}
    </div>
    {children}
  </div>
);

// ============================================================================
// FieldRow — label + Select
// ============================================================================

const FieldRow: React.FC<{
  label: string;
  required?: boolean;
  tip?: string;
  value: string;
  columns: string[];
  onChange: (v: string) => void;
  status?: 'error';
}> = ({ label, required, tip, value, columns, onChange, status }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
    <div style={{ width: 140, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
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
      placeholder={required ? '必填' : '可选 · 自动推断'}
      onChange={(v) => onChange(v ?? '')}
      options={columns.map((c) => ({ label: c, value: c }))}
      showSearch
      filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
      styles={{
        popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } },
      }}
    />
  </div>
);

// ============================================================================
// SlotRow — label + operator Select + column Select (FormulaSlot editor)
// ============================================================================

const SlotRow: React.FC<{
  label: string;
  slot: FormulaSlot;
  columns: string[];
  onOperatorChange: (op: '+' | '-') => void;
  onColumnChange: (col: string) => void;
  operatorLocked?: boolean;
}> = ({ label, slot, columns, onOperatorChange, onColumnChange, operatorLocked }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
    <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 88, flexShrink: 0 }}>
      {label}
    </Text>
    {operatorLocked ? (
      <Text style={{ fontSize: 13, color: TOKEN.textMuted, width: 48, textAlign: 'center' }}>+</Text>
    ) : (
      <Select
        size="small"
        value={slot.operator}
        style={{ width: 60, flexShrink: 0 }}
        onChange={(op) => onOperatorChange(op as '+' | '-')}
        options={[{ label: '+', value: '+' }, { label: '−', value: '-' }]}
      />
    )}
    <Select
      size="small"
      value={slot.column || undefined}
      style={{ flex: 1 }}
      allowClear
      placeholder="可选 · 留空跳过"
      onChange={(v) => onColumnChange(v ?? '')}
      options={columns.map((c) => ({ label: c, value: c }))}
      showSearch
      filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
      styles={{
        popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } },
      }}
    />
  </div>
);

// ============================================================================
// Props
// ============================================================================

export interface EcomPlatformFeeAllocateDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: PlatformFeeAllocateConfig;
  kernelDisplayName?: string;
  kernelIndustry?: string;
  kernelCategory?: string;
  onConfirm: (config: PlatformFeeAllocateConfig) => void;
  onCancel: () => void;
}

type FeeSlots = PlatformFeeAllocateConfig['feeSlots'];
type DeductSlots = PlatformFeeAllocateConfig['deductSlots'];

const MODE_OPTIONS: Array<{ value: FeeAllocateMode; label: string; desc: string }> = [
  { value: 'amount', label: '金额比例分摊', desc: '按行商品金额占比分摊' },
  { value: 'quantity', label: '数量比例分摊', desc: '按行购买数量占比分摊' },
  { value: 'even', label: '整单均摊', desc: '订单费用按行数均分' },
];

const emptySlot = (operator: '+' | '-'): FormulaSlot => ({ operator, column: '' });

export const EcomPlatformFeeAllocateDrawer: React.FC<EcomPlatformFeeAllocateDrawerProps> = ({
  open,
  columns,
  initialConfig,
  kernelDisplayName,
  onConfirm,
  onCancel,
}) => {
  const [mode, setMode] = useState<FeeAllocateMode>(DEFAULT_FEE_ALLOCATE_CONFIG.mode);
  const [orderIdCol, setOrderIdCol] = useState('');
  const [amountCol, setAmountCol] = useState('');
  const [quantityCol, setQuantityCol] = useState('');
  const [feeSlots, setFeeSlots] = useState<FeeSlots>({
    slot1: emptySlot('+'),
    slot2: emptySlot('+'),
    slot3: emptySlot('+'),
    slot4: emptySlot('+'),
  });
  const [deductSlots, setDeductSlots] = useState<DeductSlots>({
    slot1: emptySlot('-'),
    slot2: emptySlot('-'),
  });
  const [submitted, setSubmitted] = useState(false);

  // Restore from initialConfig, or auto-fill defaults from column names
  useEffect(() => {
    if (!open) return;
    setSubmitted(false);

    if (initialConfig) {
      setMode(initialConfig.mode);
      setOrderIdCol(initialConfig.fieldMapping.orderIdCol);
      setAmountCol(initialConfig.fieldMapping.amountCol);
      setQuantityCol(initialConfig.fieldMapping.quantityCol ?? '');
      setFeeSlots(initialConfig.feeSlots);
      setDeductSlots(initialConfig.deductSlots);
    } else {
      // Auto-fill from column names via regex; 无匹配列时槽位留空、可手动选择
      const usedCols = new Set<string>();
      const pick = (patternKey: string): string => {
        const found = columns.find(
          (c) => !usedCols.has(c) && FIELD_MATCH_PATTERNS[patternKey]?.test(c),
        ) ?? '';
        if (found) usedCols.add(found);
        return found;
      };
      setMode(DEFAULT_FEE_ALLOCATE_CONFIG.mode);
      setOrderIdCol(pick('orderIdCol'));
      setAmountCol(pick('amountCol'));
      setQuantityCol(pick('quantityCol'));
      setFeeSlots({
        slot1: { operator: '+', column: pick('platformFeeCol') },
        slot2: { operator: '+', column: pick('adFeeCol') },
        slot3: { operator: '+', column: pick('serviceFeeCol') },
        slot4: { operator: '+', column: pick('shippingFeeCol') },
      });
      setDeductSlots({
        slot1: { operator: '-', column: '' },
        slot2: { operator: '-', column: '' },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialConfig, columns]);

  const updateFeeSlot = (key: keyof FeeSlots, patch: Partial<FormulaSlot>) =>
    setFeeSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const updateDeductSlot = (key: keyof DeductSlots, patch: Partial<FormulaSlot>) =>
    setDeductSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  const errors = {
    orderIdCol: !orderIdCol,
    amountCol: !amountCol,
    quantityCol: mode === 'quantity' && !quantityCol,
    feeSlots: !feeSlots.slot1.column,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    if (hasErrors) return;

    const config: PlatformFeeAllocateConfig = {
      mode,
      fieldMapping: {
        orderIdCol,
        amountCol,
        quantityCol: quantityCol || undefined,
      },
      feeSlots,
      deductSlots,
    };
    onConfirm(config);
  }, [hasErrors, mode, orderIdCol, amountCol, quantityCol, feeSlots, deductSlots, onConfirm]);

  // ------------------------------------------------------------------
  // Formula preview（中文标签为主，括号内附原始列名）
  // ------------------------------------------------------------------

  const feeParts = (['slot1', 'slot2', 'slot3', 'slot4'] as const)
    .map((k) => feeSlots[k])
    .filter((s) => s.column)
    .map((s) => `${s.operator === '-' ? '−' : '+'} ${s.column}`)
    .join(' ');
  const deductParts = (['slot1', 'slot2'] as const)
    .map((k) => deductSlots[k])
    .filter((s) => s.column)
    .map((s) => `${s.operator === '-' ? '−' : '+'} ${s.column}`)
    .join(' ');

  const feePreview = feeParts
    ? `订单费用 = ${feeParts}（按订单去重取总）`
    : '订单费用 = 未配置（槽位 1 必选）';
  const netPreview = deductParts
    ? `单品净利 = 商品金额 − 分摊费用 ${deductParts}`
    : '单品净利 = 商品金额 − 分摊费用';

  const activeMode = MODE_OPTIONS.find((m) => m.value === mode);

  return (
    <>
      <Drawer
        open={open}
        onClose={onCancel}
        width={520}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FunctionOutlined style={{ color: TOKEN.primary }} />
            <Text style={{ fontSize: 14, fontWeight: 600 }}>{kernelDisplayName}</Text>
          </div>
        }
        styles={{
          body: {
            background: TOKEN.bgBase,
            padding: '16px 20px',
          },
          header: {
            background: TOKEN.bgBase,
            borderBottom: `1px solid ${TOKEN.borderMid}`,
            padding: '12px 20px',
          },
        }}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="small" icon={<CloseOutlined />} onClick={onCancel}>
              取消
            </Button>
            <Button size="small" type="primary" onClick={handleSubmit}>
              应用
            </Button>
          </div>
        }
      >
        {/* Group 1: Mode + Field mapping */}
        <Section icon={<SplitCellsOutlined />} title="分摊模式与字段映射" badge="Group 1">
          <div style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 6 }}>
              支持整单均摊、金额比例分摊、数量比例分摊，尾差自动回补至订单内金额最大行，逐单对平。
            </Text>
            <Radio.Group
              value={mode}
              onChange={(e) => setMode(e.target.value as FeeAllocateMode)}
              optionType="button"
              buttonStyle="solid"
              size="small"
              options={MODE_OPTIONS.map((m) => ({ label: m.label, value: m.value }))}
            />
            {activeMode && (
              <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginTop: 6 }}>
                {activeMode.desc}
              </Text>
            )}
          </div>

          <FieldRow
            label="订单号"
            required
            tip="订单级费用的分组依据（同一订单各行费用值相同或仅首行填充）"
            value={orderIdCol}
            columns={columns}
            onChange={setOrderIdCol}
            status={submitted && errors.orderIdCol ? 'error' : undefined}
          />
          <FieldRow
            label="商品金额"
            required
            tip="行级商品金额：金额比例分摊的权重，也是单品净利的被减数"
            value={amountCol}
            columns={columns}
            onChange={setAmountCol}
            status={submitted && errors.amountCol ? 'error' : undefined}
          />
          <FieldRow
            label="购买数量"
            required={mode === 'quantity'}
            tip="仅「数量比例分摊」必填；其余模式可留空"
            value={quantityCol}
            columns={columns}
            onChange={setQuantityCol}
            status={submitted && errors.quantityCol ? 'error' : undefined}
          />
          {submitted && errors.quantityCol && (
            <Text style={{ fontSize: 11, color: TOKEN.textError }}>
              数量比例分摊需要选择购买数量列
            </Text>
          )}
        </Section>

        {/* Group 2: Fee slots */}
        <Section icon={<ApartmentOutlined />} title="订单费用槽位（相加 = 订单费用）" badge="Group 2">
          <SlotRow
            label="槽位 1 · 佣金 *"
            slot={feeSlots.slot1}
            columns={columns}
            operatorLocked
            onOperatorChange={() => undefined}
            onColumnChange={(col) => updateFeeSlot('slot1', { column: col })}
          />
          <SlotRow
            label="槽位 2 · 广告费"
            slot={feeSlots.slot2}
            columns={columns}
            onOperatorChange={(op) => updateFeeSlot('slot2', { operator: op })}
            onColumnChange={(col) => updateFeeSlot('slot2', { column: col })}
          />
          <SlotRow
            label="槽位 3 · 服务费"
            slot={feeSlots.slot3}
            columns={columns}
            onOperatorChange={(op) => updateFeeSlot('slot3', { operator: op })}
            onColumnChange={(col) => updateFeeSlot('slot3', { column: col })}
          />
          <SlotRow
            label="槽位 4 · 其他"
            slot={feeSlots.slot4}
            columns={columns}
            onOperatorChange={(op) => updateFeeSlot('slot4', { operator: op })}
            onColumnChange={(col) => updateFeeSlot('slot4', { column: col })}
          />
          {submitted && errors.feeSlots && (
            <Text style={{ fontSize: 11, color: TOKEN.textError }}>
              槽位 1（平台佣金）为必选，请选择费用列
            </Text>
          )}
        </Section>

        {/* Group 3: Deduct slots */}
        <Section icon={<ApartmentOutlined />} title="净利扣减槽位（可选）" badge="Group 3">
          <SlotRow
            label="扣减 1"
            slot={deductSlots.slot1}
            columns={columns}
            onOperatorChange={(op) => updateDeductSlot('slot1', { operator: op })}
            onColumnChange={(col) => updateDeductSlot('slot1', { column: col })}
          />
          <SlotRow
            label="扣减 2"
            slot={deductSlots.slot2}
            columns={columns}
            onOperatorChange={(op) => updateDeductSlot('slot2', { operator: op })}
            onColumnChange={(col) => updateDeductSlot('slot2', { column: col })}
          />
        </Section>

        {/* Preview */}
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--vm-primary-glow)',
            border: `1px solid var(--vm-primary-border)`,
            borderRadius: TOKEN.radius,
          }}
        >
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, fontWeight: 500 }}>
            💸 分摊逻辑预览：
          </Text>
          <div style={{ marginTop: 6, fontSize: 11, color: TOKEN.textSecondary, lineHeight: '18px' }}>
            {feePreview}
            <br />
            {netPreview}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: TOKEN.textMuted }}>
            💡 分摊模式：{activeMode?.label}；{activeMode?.desc}；尾差回补至订单内金额最大行，保证每笔订单分摊合计恰好等于订单费用。
          </div>
        </div>
      </Drawer>
    </>
  );
};

export default EcomPlatformFeeAllocateDrawer;
