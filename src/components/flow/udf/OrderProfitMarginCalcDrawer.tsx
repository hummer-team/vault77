/**
 * OrderProfitMarginCalcDrawer
 *
 * Configuration drawer for fn_ecom_order_profit_margin_calc (订单毛利/净利率自动计算).
 *
 * Sections:
 *   Group 1 — Required field mapping (2 required + 3 optional + 6 dimension columns)
 *   Group 2 — Formula builder (5 slots with operator dropdowns, slot1 locked +)
 *   Group 3 — Risk threshold configuration
 *
 * All colors use TOKEN (CSS variables) — no hardcoded hex values.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Drawer,
  Button,
  Select,
  Space,
  Typography,
  Tooltip,
  Collapse,
  InputNumber,
} from 'antd';
import {
  CloseOutlined,
  ApartmentOutlined,
  FunctionOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { ProfitMarginCalcConfig, FormulaSlot } from '../../../services/flow/types';
import { FIELD_MATCH_PATTERNS } from '../../../services/flow/strategies/orderProfitMarginCalcStrategy';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Auto-match helper
// ============================================================================

function autoMatch(columns: string[], patternKey: string): string {
  return columns.find((c) => FIELD_MATCH_PATTERNS[patternKey]?.test(c)) ?? '';
}

// ============================================================================
// Section wrapper (reuses OrderAbnormalAmountDrawer pattern)
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
  selectRef?: React.Ref<any>;
}> = ({ label, required, tip, value, columns, onChange, status, selectRef }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
    <div style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
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
      allowClear
      ref={selectRef}
      status={status}
      style={{ flex: 1 }}
      value={value || undefined}
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
// Formula slot row — operator dropdown + column dropdown
// ============================================================================

const FormulaSlotRow: React.FC<{
  label: string;
  slot: FormulaSlot;
  columns: string[];
  onOperatorChange: (op: '+' | '-') => void;
  onColumnChange: (col: string) => void;
  operatorLocked?: boolean;
}> = ({ label, slot, columns, onOperatorChange, onColumnChange, operatorLocked }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
    <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 60, flexShrink: 0 }}>
      {label}
    </Text>
    {operatorLocked ? (
      <Text style={{ fontSize: 12, color: TOKEN.textMuted, width: 56, textAlign: 'center' }}>
        +
      </Text>
    ) : (
      <Select
        size="small"
        value={slot.operator}
        onChange={onOperatorChange}
        style={{ width: 56 }}
        options={[
          { label: '+', value: '+' },
          { label: '-', value: '-' },
        ]}
        styles={{
          popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } },
        }}
      />
    )}
    <Select
      size="small"
      allowClear
      style={{ flex: 1 }}
      value={slot.column || undefined}
      placeholder="选择列"
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

export interface OrderProfitMarginCalcDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: ProfitMarginCalcConfig;
  kernelDisplayName?: string;
  kernelIndustry?: string;
  kernelCategory?: string;
  onConfirm: (config: ProfitMarginCalcConfig) => void;
  onCancel: () => void;
}

// ============================================================================
// Main component
// ============================================================================

export const OrderProfitMarginCalcDrawer: React.FC<OrderProfitMarginCalcDrawerProps> = ({
  open,
  columns,
  initialConfig,
  kernelDisplayName = '订单毛利/净利率自动计算',
  onConfirm,
  onCancel,
}) => {
  // --- Group 1: Required fields ---
  const [netAmountCol, setNetAmountCol] = useState('');
  const [costCol, setCostCol] = useState('');
  const [netAmountError, setNetAmountError] = useState(false);
  const [costError, setCostError] = useState(false);
  const netAmountRef = useRef<any>(null);
  const costRef = useRef<any>(null);

  // --- Group 1: Optional fields ---
  const [shippingFeeCol, setShippingFeeCol] = useState('');
  const [platformFeeCol, setPlatformFeeCol] = useState('');
  const [serviceFeeCol, setServiceFeeCol] = useState('');

  // --- Group 1: Dimension columns ---
  const [orderIdCol, setOrderIdCol] = useState('');
  const [userIdCol, setUserIdCol] = useState('');
  const [skuIdCol, setSkuIdCol] = useState('');
  const [orderTimeCol, setOrderTimeCol] = useState('');
  const [categoryCol, setCategoryCol] = useState('');
  const [channelCol, setChannelCol] = useState('');

  // --- Group 2: Formula slots ---
  const [slot1, setSlot1] = useState<FormulaSlot>({ operator: '+', column: '' });
  const [slot2, setSlot2] = useState<FormulaSlot>({ operator: '-', column: '' });
  const [slot3, setSlot3] = useState<FormulaSlot>({ operator: '-', column: '' });
  const [slot4, setSlot4] = useState<FormulaSlot>({ operator: '-', column: '' });
  const [slot5, setSlot5] = useState<FormulaSlot>({ operator: '-', column: '' });

  // --- Group 3: Risk threshold ---
  const [warningThresholdPct, setWarningThresholdPct] = useState(5);


  // Restore or auto-fill when drawer opens
  useEffect(() => {
    if (!open) return;

    if (initialConfig) {
      const fm = initialConfig.fieldMapping;
      setNetAmountCol(fm.netAmountCol);
      setCostCol(fm.costCol);
      setShippingFeeCol(fm.shippingFeeCol ?? '');
      setPlatformFeeCol(fm.platformFeeCol ?? '');
      setServiceFeeCol(fm.serviceFeeCol ?? '');
      setOrderIdCol(fm.orderIdCol ?? '');
      setUserIdCol(fm.userIdCol ?? '');
      setSkuIdCol(fm.skuIdCol ?? '');
      setOrderTimeCol(fm.orderTimeCol ?? '');
      setCategoryCol(fm.categoryCol ?? '');
      setChannelCol(fm.channelCol ?? '');
      setSlot1(initialConfig.formulaSlots.slot1);
      setSlot2(initialConfig.formulaSlots.slot2);
      setSlot3(initialConfig.formulaSlots.slot3);
      setSlot4(initialConfig.formulaSlots.slot4);
      setSlot5(initialConfig.formulaSlots.slot5);
      setWarningThresholdPct(initialConfig.warningThresholdPct);
    } else {
      // Auto-fill from column names via regex (skip already-occupied columns)
      const usedCols = new Set<string>();
      const autoMatchSkip = (cols: string[], patternKey: string): string => {
        const available = cols.filter(c => !usedCols.has(c));
        const matched = autoMatch(available, patternKey);
        if (matched) usedCols.add(matched);
        return matched;
      };

      const net = autoMatchSkip(columns, 'netAmountCol');
      const cost = autoMatchSkip(columns, 'costCol');
      const shipping = autoMatchSkip(columns, 'shippingFeeCol');
      const platform = autoMatchSkip(columns, 'platformFeeCol');
      const service = autoMatchSkip(columns, 'serviceFeeCol');

      setNetAmountCol(net);
      setCostCol(cost);
      setShippingFeeCol(shipping);
      setPlatformFeeCol(platform);
      setServiceFeeCol(service);

      setOrderIdCol(autoMatchSkip(columns, 'orderIdCol'));
      setUserIdCol(autoMatchSkip(columns, 'userIdCol'));
      setSkuIdCol(autoMatchSkip(columns, 'skuIdCol'));
      setOrderTimeCol(autoMatchSkip(columns, 'orderTimeCol'));
      setCategoryCol(autoMatchSkip(columns, 'categoryCol'));
      setChannelCol(autoMatchSkip(columns, 'channelCol'));

      // Default formula slots linked to mapped columns
      setSlot1({ operator: '+', column: net });
      setSlot2({ operator: '-', column: cost });
      setSlot3({ operator: '-', column: shipping });
      setSlot4({ operator: '-', column: platform });
      setSlot5({ operator: '-', column: service });

      setWarningThresholdPct(5);
    }
  }, [open, columns, initialConfig]);

  // Formula preview text (business Chinese, always visible)
  const formulaPreview = useMemo(() => {
    const colName = (col: string) => col || '?';
    const opSymbol = (op: string) => op === '+' ? '+' : '−';
    return `毛利 = 订单净额(${colName(slot1.column)}) ${opSymbol(slot2.operator)} 商品成本(${colName(slot2.column)}) ${opSymbol(slot3.operator)} 运费(${colName(slot3.column)}) ${opSymbol(slot4.operator)} 平台佣金(${colName(slot4.column)}) ${opSymbol(slot5.operator)} 服务费(${colName(slot5.column)})`;
  }, [slot1, slot2, slot3, slot4, slot5]);

  // Sync field mapping changes to formula slots
  const handleNetAmountColChange = useCallback((v: string) => {
    setNetAmountCol(v);
    setSlot1((prev) => ({ ...prev, column: v }));
    if (v) setNetAmountError(false);
  }, []);

  const handleCostColChange = useCallback((v: string) => {
    setCostCol(v);
    setSlot2((prev) => ({ ...prev, column: v }));
    if (v) setCostError(false);
  }, []);

  const handleShippingFeeColChange = useCallback((v: string) => {
    setShippingFeeCol(v);
    setSlot3((prev) => ({ ...prev, column: v }));
  }, []);

  const handlePlatformFeeColChange = useCallback((v: string) => {
    setPlatformFeeCol(v);
    setSlot4((prev) => ({ ...prev, column: v }));
  }, []);

  const handleServiceFeeColChange = useCallback((v: string) => {
    setServiceFeeCol(v);
    setSlot5((prev) => ({ ...prev, column: v }));
  }, []);

  // Preset: default formula (net - cost - shipping - platform - service)
  const handleResetFormula = useCallback(() => {
    setSlot1({ operator: '+', column: netAmountCol });
    setSlot2({ operator: '-', column: costCol });
    setSlot3({ operator: '-', column: shippingFeeCol });
    setSlot4({ operator: '-', column: platformFeeCol });
    setSlot5({ operator: '-', column: serviceFeeCol });
  }, [netAmountCol, costCol, shippingFeeCol, platformFeeCol, serviceFeeCol]);

  const handleSubmit = useCallback(() => {
    const hasNet = !!netAmountCol;
    const hasCost = !!costCol;
    setNetAmountError(!hasNet);
    setCostError(!hasCost);
    if (!hasNet) {
      netAmountRef.current?.focus();
      return;
    }
    if (!hasCost) {
      costRef.current?.focus();
      return;
    }

    // Assemble config
    const config: ProfitMarginCalcConfig = {
      fieldMapping: {
        netAmountCol,
        costCol,
        ...(shippingFeeCol && { shippingFeeCol }),
        ...(platformFeeCol && { platformFeeCol }),
        ...(serviceFeeCol && { serviceFeeCol }),
        ...(orderIdCol && { orderIdCol }),
        ...(userIdCol && { userIdCol }),
        ...(skuIdCol && { skuIdCol }),
        ...(orderTimeCol && { orderTimeCol }),
        ...(categoryCol && { categoryCol }),
        ...(channelCol && { channelCol }),
      },
      formulaSlots: {
        slot1: { operator: '+', column: slot1.column },
        slot2: { operator: slot2.operator, column: slot2.column },
        slot3: { operator: slot3.operator, column: slot3.column },
        slot4: { operator: slot4.operator, column: slot4.column },
        slot5: { operator: slot5.operator, column: slot5.column },
      },
      warningThresholdPct,
    };

    onConfirm(config);
  }, [
    netAmountCol,
    costCol,
    shippingFeeCol,
    platformFeeCol,
    serviceFeeCol,
    orderIdCol,
    userIdCol,
    skuIdCol,
    orderTimeCol,
    categoryCol,
    channelCol,
    slot1,
    slot2,
    slot3,
    slot4,
    slot5,
    warningThresholdPct,
    onConfirm,
  ]);

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: TOKEN.textSecondary, width: 110, flexShrink: 0 };

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
          <Space>
            <Button size="small" icon={<CloseOutlined />} onClick={onCancel}>
              取消
            </Button>
            <Button size="small" type="primary" onClick={handleSubmit}>
              确认
            </Button>
          </Space>
        }
        closable={false}
      >
        {/* Formula summary (always visible, above Collapse) */}
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--vm-primary-glow)',
            border: `1px solid var(--vm-primary-border)`,
            borderRadius: TOKEN.radius,
          }}
        >
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, fontWeight: 500 }}>
            📊 公式预览：
          </Text>
          <div style={{ marginTop: 6, fontSize: 11, color: TOKEN.textSecondary, lineHeight: '18px' }}>
            {formulaPreview}
          </div>
        </div>

        {/* Group 1: Field Mapping */}
        <Section icon={<ApartmentOutlined />} title="字段映射" badge="Group 1">
          {/* Required fields */}
          <FieldRow
            label="订单净额（退款后实收）"
            required
            tip="退款后的实际收入金额"
            value={netAmountCol}
            columns={columns}
            onChange={handleNetAmountColChange}
            status={netAmountError ? 'error' : undefined}
            selectRef={netAmountRef}
          />
          <FieldRow
            label="商品成本"
            required
            tip="商品进货价或生产成本"
            value={costCol}
            columns={columns}
            onChange={handleCostColChange}
            status={costError ? 'error' : undefined}
            selectRef={costRef}
          />

          {/* Optional fields */}
          <FieldRow
            label="运费"
            tip="物流费用"
            value={shippingFeeCol}
            columns={columns}
            onChange={handleShippingFeeColChange}
          />
          <FieldRow
            label="平台佣金"
            tip="平台收取的佣金或手续费"
            value={platformFeeCol}
            columns={columns}
            onChange={handlePlatformFeeColChange}
          />
          <FieldRow
            label="服务费"
            tip="其他服务费用"
            value={serviceFeeCol}
            columns={columns}
            onChange={handleServiceFeeColChange}
          />

          {/* Dimension columns */}
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: `1px dashed ${TOKEN.borderSubtle}`,
            }}
          >
            <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginBottom: 8, display: 'block' }}>
              维度透传（可选）
            </Text>
            <FieldRow label="订单编号" value={orderIdCol} columns={columns} onChange={setOrderIdCol} />
            <FieldRow label="用户" value={userIdCol} columns={columns} onChange={setUserIdCol} />
            <FieldRow label="商品" value={skuIdCol} columns={columns} onChange={setSkuIdCol} />
            <FieldRow label="下单时间" value={orderTimeCol} columns={columns} onChange={setOrderTimeCol} />
            <FieldRow label="类目" value={categoryCol} columns={columns} onChange={setCategoryCol} />
            <FieldRow label="渠道" value={channelCol} columns={columns} onChange={setChannelCol} />
          </div>
        </Section>

        {/* Group 2: Formula Builder + Risk Threshold (in Collapse) */}
        <Collapse
          ghost
          size="small"
          defaultActiveKey={[]}
          style={{ marginBottom: 16 }}
          items={[
            {
              key: '1',
              label: (
                <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>
                  <SettingOutlined style={{ marginRight: 6 }} />
                  更多设置
                </span>
              ),
              children: (
                <>
                  {/* Formula editor */}
                  <Section icon={<FunctionOutlined />} title="计算公式" badge="Group 2">
                    <div style={{ marginBottom: 12 }}>
                      <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>
                        编辑各槽位的运算符和列映射（槽位1运算符固定为 +）
                      </Text>
                    </div>
                    <FormulaSlotRow
                      label="订单净额"
                      slot={slot1}
                      columns={columns}
                      onOperatorChange={() => {}}
                      onColumnChange={handleNetAmountColChange}
                      operatorLocked
                    />
                    <FormulaSlotRow
                      label="商品成本"
                      slot={slot2}
                      columns={columns}
                      onOperatorChange={(op) => setSlot2((prev) => ({ ...prev, operator: op }))}
                      onColumnChange={handleCostColChange}
                    />
                    <FormulaSlotRow
                      label="运费"
                      slot={slot3}
                      columns={columns}
                      onOperatorChange={(op) => setSlot3((prev) => ({ ...prev, operator: op }))}
                      onColumnChange={handleShippingFeeColChange}
                    />
                    <FormulaSlotRow
                      label="平台佣金"
                      slot={slot4}
                      columns={columns}
                      onOperatorChange={(op) => setSlot4((prev) => ({ ...prev, operator: op }))}
                      onColumnChange={handlePlatformFeeColChange}
                    />
                    <FormulaSlotRow
                      label="服务费"
                      slot={slot5}
                      columns={columns}
                      onOperatorChange={(op) => setSlot5((prev) => ({ ...prev, operator: op }))}
                      onColumnChange={handleServiceFeeColChange}
                    />
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button size="small" onClick={handleResetFormula}>
                        恢复默认公式
                      </Button>
                    </div>
                  </Section>

                  {/* Risk threshold */}
                  <Section icon={<FilterOutlined />} title="风险分级配置" badge="Group 3">
                    <div style={rowStyle}>
                      <Text style={labelStyle}>预警毛利率</Text>
                      <InputNumber
                        size="small"
                        style={{ width: 100 }}
                        value={warningThresholdPct}
                        min={0}
                        max={100}
                        step={0.5}
                        suffix="%"
                        onChange={(v) => setWarningThresholdPct(v ?? 5)}
                      />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 11, color: TOKEN.textMuted, lineHeight: '18px' }}>
                        风险等级判定顺序：① 订单净额 ≤ 0 → 高风险；② 毛利 &lt; 0 → 高风险；③ 毛利率 &lt; 预警值 → 预警；④ 其余 → 健康
                      </Text>
                    </div>
                  </Section>
                </>
              ),
            },
          ]}
        />

        {/* Hint line */}
        <div
          style={{
            padding: '10px 14px',
            background: TOKEN.bgSection,
            borderRadius: TOKEN.radius,
            marginTop: 4,
          }}
        >
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, lineHeight: '18px' }}>
            💡 <b>提示：</b>如需剔除已取消订单，请在画布中添加「条件」节点过滤；本算子按原表净额列取数，未加条件节点时已取消订单不会被自动归零。
          </Text>
        </div>
      </Drawer>
    </>
  );
};

export default OrderProfitMarginCalcDrawer;
