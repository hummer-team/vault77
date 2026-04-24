/**
 * OrderDistributionDrawer
 * Configuration drawer for the "订单分布分析" (fn_ecom_order_distribution) operator.
 * Supports three sub-types: time_dist | amount_dist | geo_dist
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Drawer,
  Button,
  Select,
  DatePicker,
  InputNumber,
  Input,
  Switch,
  Radio,
  Segmented,
  Space,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  CloseOutlined,
  LineChartOutlined,
  BarChartOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type {
  OrderDistributionConfig,
  OrderDistSubType,
  TimeDistConfig,
  AmountDistConfig,
  GeoDistConfig,
  AmountBucket,
  TimeGranularity,
  ComparisonType,
} from '../../../services/flow/types';
import dayjs, { type Dayjs } from 'dayjs';
import { TOKEN } from '../../../theme';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// ============================================================================
// Props
// ============================================================================

export interface OrderDistributionDrawerProps {
  open: boolean;
  /** All available columns from the upstream table */
  columns: string[];
  /** Pre-existing config to restore when reopening */
  initialConfig?: OrderDistributionConfig;
  onConfirm: (config: OrderDistributionConfig) => void;
  onCancel: () => void;
}

// ============================================================================
// Section wrapper (same pattern as BasicStatsDrawer)
// ============================================================================

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  required?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, title, required, right, children }) => (
  <div
    style={{
      marginBottom: 18,
      padding: '12px 14px',
      background: TOKEN.bgSection,
      borderRadius: TOKEN.radiusLg,
      border: `1px solid ${TOKEN.borderSubtle}`,
      borderLeft: `3px solid var(--vm-primary-border)`,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: TOKEN.textMuted, fontSize: 13 }}>{icon}</span>
        <Text
          style={{
            fontSize: 11,
            color: TOKEN.textSecondary,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>
        {required && (
          <span style={{ color: TOKEN.primary, fontSize: 10, lineHeight: 1 }}>*</span>
        )}
      </div>
      {right && <div>{right}</div>}
    </div>
    {children}
  </div>
);

// ============================================================================
// Helpers
// ============================================================================

const selectStyle: React.CSSProperties = {
  width: '100%',
};

const addBtnStyle: React.CSSProperties = {
  width: '100%',
  height: 28,
  borderColor: TOKEN.borderMid,
  color: TOKEN.textSecondary,
  background: 'var(--vm-surface-lighter)',
  fontSize: 12,
  borderRadius: TOKEN.radius,
};

function defaultBuckets(): AmountBucket[] {
  return [
    { min: null, max: 100, label: '100元以下' },
    { min: 100, max: 500, label: '100-500元' },
    { min: 500, max: null, label: '500元以上' },
  ];
}

/** Convert an ISO date string to a dayjs object, or null. */
function toDayjs(iso: string | undefined): Dayjs | null {
  return iso ? dayjs(iso) : null;
}

/** Convert a dayjs object to a YYYY-MM-DD string. */
function toDateStr(d: Dayjs): string {
  return d.toISOString().split('T')[0];
}

/**
 * Auto-compute comparison date range from current range + comparison type.
 * YoY: subtract 1 year; MoM: subtract 1 month.
 */
function autoComparisonRange(
  currentStart: string | undefined,
  currentEnd: string | undefined,
  type: ComparisonType,
): { comparisonStart: string; comparisonEnd: string } | null {
  if (!currentStart || !currentEnd) return null;
  const start = dayjs(currentStart);
  const end = dayjs(currentEnd);
  if (type === 'yoy') {
    return {
      comparisonStart: toDateStr(start.subtract(1, 'year')),
      comparisonEnd: toDateStr(end.subtract(1, 'year')),
    };
  }
  return {
    comparisonStart: toDateStr(start.subtract(1, 'month')),
    comparisonEnd: toDateStr(end.subtract(1, 'month')),
  };
}

// ============================================================================
// Shared comparison section
// ============================================================================

interface ComparisonSectionProps {
  enableComparison: boolean;
  onToggle: (v: boolean) => void;
  comparisonType: ComparisonType | undefined;
  onTypeChange: (v: ComparisonType) => void;
  comparisonStart: string | undefined;
  comparisonEnd: string | undefined;
  onRangeChange: (start: string, end: string) => void;
}

const ComparisonSection: React.FC<ComparisonSectionProps> = ({
  enableComparison,
  onToggle,
  comparisonType,
  onTypeChange,
  comparisonStart,
  comparisonEnd,
  onRangeChange,
}) => (
  <Section
    icon={<LineChartOutlined />}
    title="对比分析"
    right={
      <Switch
        checked={enableComparison}
        onChange={onToggle}
        size="small"
        style={enableComparison ? { background: TOKEN.primary } : {}}
      />
    }
  >
    {enableComparison ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Radio.Group
          value={comparisonType}
          onChange={(e) => onTypeChange(e.target.value as ComparisonType)}
          size="small"
        >
          <Radio value="yoy">
            <Text style={{ fontSize: 12, color: TOKEN.textPrimary }}>同比 (YoY)</Text>
          </Radio>
          <Radio value="mom">
            <Text style={{ fontSize: 12, color: TOKEN.textPrimary }}>环比 (MoM)</Text>
          </Radio>
        </Radio.Group>
        <div>
          <Text style={{ fontSize: 11, color: TOKEN.textSecondary, display: 'block', marginBottom: 6 }}>
            对比时间范围
          </Text>
          <RangePicker
            size="small"
            value={[toDayjs(comparisonStart), toDayjs(comparisonEnd)]}
            onChange={(dates) => {
              if (dates?.[0] && dates?.[1]) {
                onRangeChange(toDateStr(dates[0]), toDateStr(dates[1]));
              }
            }}
            getPopupContainer={() => document.body}
            className="nodrag"
            popupClassName="nodrag"
            style={{ width: '100%' }}
          />
        </div>
      </div>
    ) : (
      <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>开启后可配置同比或环比分析</Text>
    )}
  </Section>
);

// ============================================================================
// Sub-form: Time Trend
// ============================================================================

interface TimeDistFormProps {
  columns: string[];
  state: Partial<TimeDistConfig>;
  onChange: (patch: Partial<TimeDistConfig>) => void;
}

const TimeDistForm: React.FC<TimeDistFormProps> = ({ columns, state, onChange }) => {
  const handleCurrentRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates?.[0] && dates?.[1]) {
      const start = toDateStr(dates[0]);
      const end = toDateStr(dates[1]);
      const patch: Partial<TimeDistConfig> = { currentStart: start, currentEnd: end };
      // Auto-fill comparison dates if comparison is enabled
      if (state.enableComparison && state.comparisonType) {
        const auto = autoComparisonRange(start, end, state.comparisonType);
        if (auto) {
          patch.comparisonStart = auto.comparisonStart;
          patch.comparisonEnd = auto.comparisonEnd;
        }
      }
      onChange(patch);
    }
  };

  const handleCompTypeChange = (type: ComparisonType) => {
    const patch: Partial<TimeDistConfig> = { comparisonType: type };
    const auto = autoComparisonRange(state.currentStart, state.currentEnd, type);
    if (auto) {
      patch.comparisonStart = auto.comparisonStart;
      patch.comparisonEnd = auto.comparisonEnd;
    }
    onChange(patch);
  };

  const colOptions = columns.map((c) => (
    <Select.Option key={c} value={c}>
      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{c}</span>
    </Select.Option>
  ));

  return (
    <>
      <Section icon={<LineChartOutlined />} title="时间列" required>
        <Select
          value={state.orderTimeColumn || undefined}
          onChange={(v: string) => onChange({ orderTimeColumn: v })}
          placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择时间列</span>}
          size="small"
          style={selectStyle}
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
        >
          {colOptions}
        </Select>
      </Section>

      <Section icon={<BarChartOutlined />} title="金额列" required>
        <Select
          value={state.orderAmountColumn || undefined}
          onChange={(v: string) => onChange({ orderAmountColumn: v })}
          placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择金额列</span>}
          size="small"
          style={selectStyle}
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
        >
          {colOptions}
        </Select>
      </Section>

      <Section icon={<LineChartOutlined />} title="时间粒度" required>
        <Radio.Group
          value={state.granularity}
          onChange={(e) => onChange({ granularity: e.target.value as TimeGranularity })}
          size="small"
        >
          <Radio value="day">
            <Text style={{ fontSize: 12, color: TOKEN.textPrimary }}>日</Text>
          </Radio>
          <Radio value="week">
            <Text style={{ fontSize: 12, color: TOKEN.textPrimary }}>周</Text>
          </Radio>
          <Radio value="month">
            <Text style={{ fontSize: 12, color: TOKEN.textPrimary }}>月</Text>
          </Radio>
        </Radio.Group>
      </Section>

      <Section icon={<LineChartOutlined />} title="当前时间范围" required>
        <RangePicker
          size="small"
          value={[toDayjs(state.currentStart), toDayjs(state.currentEnd)]}
          onChange={handleCurrentRangeChange as (dates: unknown, dateStrings: [string, string]) => void}
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
          style={{ width: '100%' }}
        />
      </Section>

      <ComparisonSection
        enableComparison={!!state.enableComparison}
        onToggle={(v) => onChange({ enableComparison: v })}
        comparisonType={state.comparisonType}
        onTypeChange={handleCompTypeChange}
        comparisonStart={state.comparisonStart}
        comparisonEnd={state.comparisonEnd}
        onRangeChange={(s, e) => onChange({ comparisonStart: s, comparisonEnd: e })}
      />
    </>
  );
};

// ============================================================================
// Sub-form: Amount Distribution
// ============================================================================

interface AmountDistFormProps {
  columns: string[];
  state: Partial<AmountDistConfig>;
  onChange: (patch: Partial<AmountDistConfig>) => void;
}

const AmountDistForm: React.FC<AmountDistFormProps> = ({ columns, state, onChange }) => {
  const buckets: AmountBucket[] = state.buckets ?? defaultBuckets();

  const updateBucket = (index: number, patch: Partial<AmountBucket>) => {
    const next = buckets.map((b, i) => (i === index ? { ...b, ...patch } : b));
    onChange({ buckets: next });
  };

  const addBucket = () => {
    onChange({ buckets: [...buckets, { min: null, max: null, label: '' }] });
  };

  const removeBucket = (index: number) => {
    onChange({ buckets: buckets.filter((_, i) => i !== index) });
  };

  const handleCurrentRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates?.[0] && dates?.[1]) {
      const start = toDateStr(dates[0]);
      const end = toDateStr(dates[1]);
      const patch: Partial<AmountDistConfig> = { currentStart: start, currentEnd: end };
      if (state.enableComparison && state.comparisonType) {
        const auto = autoComparisonRange(start, end, state.comparisonType);
        if (auto) {
          patch.comparisonStart = auto.comparisonStart;
          patch.comparisonEnd = auto.comparisonEnd;
        }
      }
      onChange(patch);
    }
  };

  const handleCompTypeChange = (type: ComparisonType) => {
    const patch: Partial<AmountDistConfig> = { comparisonType: type };
    const auto = autoComparisonRange(state.currentStart, state.currentEnd, type);
    if (auto) {
      patch.comparisonStart = auto.comparisonStart;
      patch.comparisonEnd = auto.comparisonEnd;
    }
    onChange(patch);
  };

  const colOptions = columns.map((c) => (
    <Select.Option key={c} value={c}>
      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{c}</span>
    </Select.Option>
  ));

  return (
    <>
      <Section icon={<BarChartOutlined />} title="金额列" required>
        <Select
          value={state.orderAmountColumn || undefined}
          onChange={(v: string) => onChange({ orderAmountColumn: v })}
          placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择金额列</span>}
          size="small"
          style={selectStyle}
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
        >
          {colOptions}
        </Select>
      </Section>

      <Section icon={<LineChartOutlined />} title="时间列" required>
        <Select
          value={state.orderTimeColumn || undefined}
          onChange={(v: string) => onChange({ orderTimeColumn: v })}
          placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择时间列</span>}
          size="small"
          style={selectStyle}
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
        >
          {colOptions}
        </Select>
      </Section>

      <Section icon={<LineChartOutlined />} title="当前时间范围" required>
        <RangePicker
          size="small"
          value={[toDayjs(state.currentStart), toDayjs(state.currentEnd)]}
          onChange={handleCurrentRangeChange as (dates: unknown, dateStrings: [string, string]) => void}
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
          style={{ width: '100%' }}
        />
      </Section>

      <Section icon={<BarChartOutlined />} title="金额分桶" required>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {/* Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 80px 1fr 28px',
              gap: 6,
              padding: '3px 6px',
              background: 'var(--vm-surface-lighter)',
              borderRadius: TOKEN.radius,
            }}
          >
            {(['最小值', '最大值', '标签', ''] as const).map((label) => (
              <Text
                key={label}
                style={{
                  fontSize: 10,
                  color: TOKEN.textSecondary,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </Text>
            ))}
          </div>

          {buckets.map((bucket, index) => (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 80px 1fr 28px',
                gap: 6,
                alignItems: 'center',
                padding: '4px 6px',
                background: TOKEN.bgRow,
                borderRadius: TOKEN.radius,
                border: `1px solid ${TOKEN.borderSubtle}`,
              }}
            >
              <InputNumber
                value={bucket.min}
                onChange={(v) => updateBucket(index, { min: v ?? null })}
                placeholder="∞"
                size="small"
                style={{
                  width: '100%',
                  fontSize: 12,
                  background: 'var(--vm-surface-light)',
                  border: `1px solid ${TOKEN.borderMid}`,
                  borderRadius: TOKEN.radius,
                }}
              />
              <InputNumber
                value={bucket.max}
                onChange={(v) => updateBucket(index, { max: v ?? null })}
                placeholder="∞"
                size="small"
                style={{
                  width: '100%',
                  fontSize: 12,
                  background: 'var(--vm-surface-light)',
                  border: `1px solid ${TOKEN.borderMid}`,
                  borderRadius: TOKEN.radius,
                }}
              />
              <Input
                value={bucket.label}
                onChange={(e) => updateBucket(index, { label: e.target.value })}
                placeholder="标签"
                size="small"
                style={{
                  fontSize: 12,
                  background: 'var(--vm-surface-light)',
                  border: `1px solid ${TOKEN.borderMid}`,
                  borderRadius: TOKEN.radius,
                  color: TOKEN.textPrimary,
                }}
              />
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined style={{ fontSize: 11, color: 'var(--vm-color-error)' }} />}
                onClick={() => removeBucket(index)}
                style={{ padding: '2px 3px', minWidth: 'unset', height: 22, borderRadius: 4 }}
              />
            </div>
          ))}
        </div>

        <Button
          type="dashed"
          icon={<PlusOutlined style={{ fontSize: 12 }} />}
          onClick={addBucket}
          style={addBtnStyle}
        >
          添加分桶
        </Button>
      </Section>

      <ComparisonSection
        enableComparison={!!state.enableComparison}
        onToggle={(v) => onChange({ enableComparison: v })}
        comparisonType={state.comparisonType}
        onTypeChange={handleCompTypeChange}
        comparisonStart={state.comparisonStart}
        comparisonEnd={state.comparisonEnd}
        onRangeChange={(s, e) => onChange({ comparisonStart: s, comparisonEnd: e })}
      />
    </>
  );
};

// ============================================================================
// Sub-form: Geo Distribution
// ============================================================================

interface GeoDistFormProps {
  columns: string[];
  state: Partial<GeoDistConfig>;
  onChange: (patch: Partial<GeoDistConfig>) => void;
}

const GeoDistForm: React.FC<GeoDistFormProps> = ({ columns, state, onChange }) => {
  const handleCurrentRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates?.[0] && dates?.[1]) {
      const start = toDateStr(dates[0]);
      const end = toDateStr(dates[1]);
      const patch: Partial<GeoDistConfig> = { currentStart: start, currentEnd: end };
      if (state.enableComparison && state.comparisonType) {
        const auto = autoComparisonRange(start, end, state.comparisonType);
        if (auto) {
          patch.comparisonStart = auto.comparisonStart;
          patch.comparisonEnd = auto.comparisonEnd;
        }
      }
      onChange(patch);
    }
  };

  const handleCompTypeChange = (type: ComparisonType) => {
    const patch: Partial<GeoDistConfig> = { comparisonType: type };
    const auto = autoComparisonRange(state.currentStart, state.currentEnd, type);
    if (auto) {
      patch.comparisonStart = auto.comparisonStart;
      patch.comparisonEnd = auto.comparisonEnd;
    }
    onChange(patch);
  };

  const colOptions = columns.map((c) => (
    <Select.Option key={c} value={c}>
      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{c}</span>
    </Select.Option>
  ));

  return (
    <>
      <Section icon={<GlobalOutlined />} title="地域列" required>
        <Select
          value={state.geoColumn || undefined}
          onChange={(v: string) => onChange({ geoColumn: v })}
          placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择地域列</span>}
          size="small"
          style={selectStyle}
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
        >
          {colOptions}
        </Select>
      </Section>

      <Section icon={<BarChartOutlined />} title="金额列" required>
        <Select
          value={state.orderAmountColumn || undefined}
          onChange={(v: string) => onChange({ orderAmountColumn: v })}
          placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择金额列</span>}
          size="small"
          style={selectStyle}
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
        >
          {colOptions}
        </Select>
      </Section>

      <Section icon={<LineChartOutlined />} title="时间列" required>
        <Select
          value={state.orderTimeColumn || undefined}
          onChange={(v: string) => onChange({ orderTimeColumn: v })}
          placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择时间列</span>}
          size="small"
          style={selectStyle}
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
        >
          {colOptions}
        </Select>
      </Section>

      <Section icon={<LineChartOutlined />} title="当前时间范围" required>
        <RangePicker
          size="small"
          value={[toDayjs(state.currentStart), toDayjs(state.currentEnd)]}
          onChange={handleCurrentRangeChange as (dates: unknown, dateStrings: [string, string]) => void}
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
          style={{ width: '100%' }}
        />
      </Section>

      <ComparisonSection
        enableComparison={!!state.enableComparison}
        onToggle={(v) => onChange({ enableComparison: v })}
        comparisonType={state.comparisonType}
        onTypeChange={handleCompTypeChange}
        comparisonStart={state.comparisonStart}
        comparisonEnd={state.comparisonEnd}
        onRangeChange={(s, e) => onChange({ comparisonStart: s, comparisonEnd: e })}
      />
    </>
  );
};

// ============================================================================
// Main component
// ============================================================================

export const OrderDistributionDrawer: React.FC<OrderDistributionDrawerProps> = ({
  open,
  columns,
  initialConfig,
  onConfirm,
  onCancel,
}) => {
  const [messageApi, contextHolder] = message.useMessage();

  const [subType, setSubType] = useState<OrderDistSubType>('time_dist');
  const [timeDist, setTimeDist] = useState<Partial<TimeDistConfig>>({});
  const [amountDist, setAmountDist] = useState<Partial<AmountDistConfig>>({
    buckets: defaultBuckets(),
  });
  const [geoDist, setGeoDist] = useState<Partial<GeoDistConfig>>({});

  // Sync from initialConfig when the drawer opens
  useEffect(() => {
    if (open && initialConfig) {
      setSubType(initialConfig.subType);
      if (initialConfig.timeDist) setTimeDist(initialConfig.timeDist);
      if (initialConfig.amountDist) setAmountDist(initialConfig.amountDist);
      if (initialConfig.geoDist) setGeoDist(initialConfig.geoDist);
    }
  }, [open, initialConfig]);

  const patchTimeDist = useCallback((patch: Partial<TimeDistConfig>) => {
    setTimeDist((prev) => ({ ...prev, ...patch }));
  }, []);

  const patchAmountDist = useCallback((patch: Partial<AmountDistConfig>) => {
    setAmountDist((prev) => ({ ...prev, ...patch }));
  }, []);

  const patchGeoDist = useCallback((patch: Partial<GeoDistConfig>) => {
    setGeoDist((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleConfirm = useCallback(() => {
    const warn = (msg: string) => { void messageApi.warning(msg); };

    if (subType === 'time_dist') {
      if (!timeDist.orderTimeColumn) { warn('请选择时间列'); return; }
      if (!timeDist.orderAmountColumn) { warn('请选择金额列'); return; }
      if (!timeDist.granularity) { warn('请选择时间粒度'); return; }
      if (!timeDist.currentStart || !timeDist.currentEnd) { warn('请选择当前时间范围'); return; }
      if (timeDist.enableComparison) {
        if (!timeDist.comparisonType) { warn('请选择对比类型（同比/环比）'); return; }
        if (!timeDist.comparisonStart || !timeDist.comparisonEnd) { warn('请设置对比时间范围'); return; }
      }
      onConfirm({
        subType: 'time_dist',
        timeDist: timeDist as TimeDistConfig,
      });
      return;
    }

    if (subType === 'amount_dist') {
      if (!amountDist.orderAmountColumn) { warn('请选择金额列'); return; }
      if (!amountDist.orderTimeColumn) { warn('请选择时间列'); return; }
      if (!amountDist.currentStart || !amountDist.currentEnd) { warn('请选择当前时间范围'); return; }
      const validBuckets = (amountDist.buckets ?? []).filter((b) => b.label.trim() !== '');
      if (validBuckets.length === 0) { warn('请至少添加一个有效分桶（需填写标签）'); return; }
      if (amountDist.enableComparison) {
        if (!amountDist.comparisonType) { warn('请选择对比类型（同比/环比）'); return; }
        if (!amountDist.comparisonStart || !amountDist.comparisonEnd) { warn('请设置对比时间范围'); return; }
      }
      onConfirm({
        subType: 'amount_dist',
        amountDist: { ...amountDist, buckets: validBuckets } as AmountDistConfig,
      });
      return;
    }

    // geo_dist
    if (!geoDist.geoColumn) { warn('请选择地域列'); return; }
    if (!geoDist.orderAmountColumn) { warn('请选择金额列'); return; }
    if (!geoDist.orderTimeColumn) { warn('请选择时间列'); return; }
    if (!geoDist.currentStart || !geoDist.currentEnd) { warn('请选择当前时间范围'); return; }
    if (geoDist.enableComparison) {
      if (!geoDist.comparisonType) { warn('请选择对比类型（同比/环比）'); return; }
      if (!geoDist.comparisonStart || !geoDist.comparisonEnd) { warn('请设置对比时间范围'); return; }
    }
    onConfirm({
      subType: 'geo_dist',
      geoDist: geoDist as GeoDistConfig,
    });
  }, [subType, timeDist, amountDist, geoDist, onConfirm, messageApi]);

  // Unused import suppressor — uuidv4 is kept for future bucket ID extension
  void uuidv4;

  return (
    <>
      {contextHolder}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: 'var(--vm-primary-light)',
                border: '1px solid var(--vm-primary-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <BarChartOutlined style={{ color: TOKEN.primary, fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--vm-text-primary)' }}>数据分析</span>
              <span style={{ color: 'var(--vm-text-muted)', fontSize: 14 }}>/</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--vm-text-primary)' }}>订单分布分析</span>
            </div>
          </div>
        }
        placement="right"
        width={520}
        open={open}
        onClose={onCancel}
        closable
        closeIcon={<CloseOutlined style={{ color: 'var(--vm-text-muted)', fontSize: 13 }} />}
        style={{ background: 'transparent' }}
        styles={{
          header: {
            background: TOKEN.bgHeader,
            borderBottom: '1px solid var(--vm-border-subtle)',
            padding: '13px 20px',
            boxShadow: 'inset 0 -1px 0 var(--vm-primary-light)',
          },
          body: {
            background: TOKEN.bgBase,
            padding: '22px 26px 28px',
            overflowX: 'hidden',
          },
          mask: {
            background: 'var(--vm-bg-header)',
            backdropFilter: 'blur(3px)',
          },
        }}
        drawerStyle={{
          background: TOKEN.bgBase,
          borderLeft: '1px solid var(--vm-border-mid)',
          boxShadow: 'var(--vm-flow-shadow-drawer)',
        }}
      >
        {/* ── Sub-type selector ──────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <Segmented
            value={subType}
            onChange={(v) => setSubType(v as OrderDistSubType)}
            options={[
              {
                label: (
                  <Space size={4}>
                    <LineChartOutlined />
                    <span>时间趋势</span>
                  </Space>
                ),
                value: 'time_dist',
              },
              {
                label: (
                  <Space size={4}>
                    <BarChartOutlined />
                    <span>金额分布</span>
                  </Space>
                ),
                value: 'amount_dist',
              },
              {
                label: (
                  <Space size={4}>
                    <GlobalOutlined />
                    <span>地域分布</span>
                  </Space>
                ),
                value: 'geo_dist',
              },
            ]}
            block
            style={{ marginBottom: 4 }}
          />
        </div>

        {/* ── Sub-type forms ─────────────────────────────────────────────── */}
        {subType === 'time_dist' && (
          <TimeDistForm columns={columns} state={timeDist} onChange={patchTimeDist} />
        )}
        {subType === 'amount_dist' && (
          <AmountDistForm columns={columns} state={amountDist} onChange={patchAmountDist} />
        )}
        {subType === 'geo_dist' && (
          <GeoDistForm columns={columns} state={geoDist} onChange={patchGeoDist} />
        )}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div
          style={{
            marginTop: 8,
            paddingTop: 18,
            borderTop: `1px solid ${TOKEN.borderSubtle}`,
          }}
        >
          <Space size={8}>
            <Button
              type="primary"
              size="middle"
              onClick={handleConfirm}
              style={{ minWidth: 88, fontWeight: 600 }}
            >
              确认应用
            </Button>
            <Button
              size="middle"
              onClick={onCancel}
              style={{
                minWidth: 72,
                borderColor: 'var(--vm-border-mid)',
                color: TOKEN.textSecondary,
                background: 'var(--vm-surface-light)',
                transition: 'border-color 0.18s ease, color 0.18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = TOKEN.primary;
                e.currentTarget.style.color = TOKEN.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--vm-border-mid)';
                e.currentTarget.style.color = TOKEN.textSecondary;
              }}
            >
              取消
            </Button>
          </Space>
        </div>
      </Drawer>
    </>
  );
};
