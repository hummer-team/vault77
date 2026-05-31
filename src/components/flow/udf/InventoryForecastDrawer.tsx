/**
 * InventoryForecastDrawer
 * Configuration drawer for fn_ecom_inventory_forecast (库存需求预测).
 *
 * Sections:
 *   1. Column mapping (skuCol, timeCol, demandCol)
 *   2. Forecast parameters (granularity, predictSteps, predictionMode)
 *   3. Usage tips (collapsible)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Button,
  Select,
  Radio,
  Space,
  Tooltip,
  Typography,
  Collapse,
  message,
} from 'antd';
import {
  DatabaseOutlined,
  SettingOutlined,
  BulbOutlined,
  InfoCircleOutlined,
  FundOutlined,
} from '@ant-design/icons';
import type { InventoryForecastConfig } from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

export interface InventoryForecastDrawerProps {
  open: boolean;
  /** All available columns from the upstream table */
  columns: string[];
  /** Pre-existing config to restore when reopening */
  initialConfig?: InventoryForecastConfig;
  /** Kernel display name for dynamic title (falls back to '库存需求预测') */
  kernelDisplayName?: string;
  /** Kernel industry label for dynamic subtitle */
  kernelIndustry?: string;
  /** Kernel category label for dynamic subtitle */
  kernelCategory?: string;
  onConfirm: (config: InventoryForecastConfig) => void;
  onCancel: () => void;
}

type Granularity = InventoryForecastConfig['granularity'];
type PredictionMode = InventoryForecastConfig['predictionMode'];

// ============================================================================
// Section wrapper (same pattern as RepurchaseCycleDrawer)
// ============================================================================

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ icon, title, required, children }) => (
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
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
    {children}
  </div>
);

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: InventoryForecastConfig = {
  skuCol: '',
  timeCol: '',
  demandCol: '',
  granularity: 'day',
  predictSteps: 7,
  predictionMode: 'ensemble',
  trendThreshold: 0.08,
};

/** Step ranges per granularity */
const STEP_RANGES: Record<Granularity, { min: number; max: number; label: string }> = {
  day:   { min: 1, max: 30, label: '天' },
  week:  { min: 1, max: 12, label: '周' },
  month: { min: 1, max: 24, label: '个月' },
};

const DEFAULT_STEPS: Record<Granularity, number> = {
  day: 7,
  week: 4,
  month: 3,
};

const selectStyle: React.CSSProperties = { width: '100%' };

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: TOKEN.textSecondary,
  flexShrink: 0,
  width: 80,
};

// ============================================================================
// Step options helper
// ============================================================================

function buildStepOptions(granularity: Granularity): { value: number; label: string }[] {
  const { min, max, label } = STEP_RANGES[granularity];
  return Array.from({ length: max - min + 1 }, (_, i) => ({
    value: min + i,
    label: `${min + i} ${label}`,
  }));
}

// ============================================================================
// Main component
// ============================================================================

export const InventoryForecastDrawer: React.FC<InventoryForecastDrawerProps> = ({
  open,
  columns,
  initialConfig,
  kernelDisplayName,
  kernelIndustry,
  kernelCategory,
  onConfirm,
  onCancel,
}) => {
  const [messageApi, contextHolder] = message.useMessage();

  const [skuCol, setSkuCol] = useState('');
  const [timeCol, setTimeCol] = useState('');
  const [demandCol, setDemandCol] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [predictSteps, setPredictSteps] = useState<number>(7);
  const [predictionMode, setPredictionMode] = useState<PredictionMode>('ensemble');
  const [trendThreshold, setTrendThreshold] = useState<number>(0.08);

  // Restore / reset when drawer opens
  useEffect(() => {
    if (!open) return;
    const cfg = initialConfig ?? DEFAULT_CONFIG;
    setSkuCol(cfg.skuCol);
    setTimeCol(cfg.timeCol);
    setDemandCol(cfg.demandCol);
    setGranularity(cfg.granularity);
    setPredictSteps(cfg.predictSteps);
    setPredictionMode(cfg.predictionMode);
    setTrendThreshold(cfg.trendThreshold ?? 0.08);
  }, [open, initialConfig]);

  // When granularity changes, reset predictSteps to sensible default and
  // reset predictionMode away from seasonal_7 if no longer on day granularity.
  const handleGranularityChange = useCallback((g: Granularity) => {
    setGranularity(g);
    setPredictSteps(DEFAULT_STEPS[g]);
    if (g !== 'day' && predictionMode === 'seasonal_7') {
      setPredictionMode('ensemble');
    }
  }, [predictionMode]);

  const stepOptions = useMemo(() => buildStepOptions(granularity), [granularity]);

  const handleConfirm = useCallback(() => {
    if (!skuCol || !timeCol || !demandCol) {
      void messageApi.warning('请选择 SKU / 商品列、时间列、需求量列');
      return;
    }
    onConfirm({ skuCol, timeCol, demandCol, granularity, predictSteps, predictionMode, trendThreshold });
  }, [skuCol, timeCol, demandCol, granularity, predictSteps, predictionMode, trendThreshold, onConfirm, messageApi]);

  const colOptions = useMemo(
    () => columns.map((c) => ({ value: c, label: c })),
    [columns]
  );

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
                border: '1px solid var(--vm-primary-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FundOutlined style={{ color: TOKEN.primary, fontSize: 14 }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--vm-text-primary)' }}>
                {kernelDisplayName ?? '库存需求预测'}
              </div>
              <div style={{ fontSize: 11, color: TOKEN.textMuted, fontWeight: 400 }}>
                {kernelIndustry && kernelCategory
                  ? `${kernelIndustry} · ${kernelCategory}`
                  : '电商/商品 · 经营决策'}
              </div>
            </div>
          </div>
        }
        open={open}
        onClose={onCancel}
        width={380}
        closable={false}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={onCancel} style={{ color: TOKEN.textSecondary }}>
              取消
            </Button>
            <Button type="primary" onClick={handleConfirm}>
              确认
            </Button>
          </div>
        }
        styles={{
          body: {
            background: 'var(--vm-bg-base)',
            padding: '16px 16px 0',
            overflowY: 'auto',
          },
          header: {
            background: 'var(--vm-bg-base)',
            borderBottom: `1px solid ${TOKEN.borderSubtle}`,
          },
          footer: {
            background: 'var(--vm-bg-base)',
            borderTop: `1px solid ${TOKEN.borderSubtle}`,
          },
        }}
      >
        {/* ---- Section 1: Column mapping ---- */}
        <Section icon={<DatabaseOutlined />} title="数据列配置" required>
          <div style={rowStyle}>
            <span style={labelStyle}>SKU / 商品列</span>
            <Select
              style={selectStyle}
              placeholder="选择商品标识列"
              value={skuCol || undefined}
              options={colOptions}
              onChange={setSkuCol}
              size="small"
              allowClear
              showSearch
              filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>时间列</span>
            <Select
              style={selectStyle}
              placeholder="选择日期 / 时间列"
              value={timeCol || undefined}
              options={colOptions}
              onChange={setTimeCol}
              size="small"
              allowClear
              showSearch
              filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>需求量列</span>
            <Select
              style={selectStyle}
              placeholder="选择数量 / 销量列"
              value={demandCol || undefined}
              options={colOptions}
              onChange={setDemandCol}
              size="small"
              allowClear
              showSearch
              filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>
        </Section>

        {/* ---- Section 2: Forecast parameters ---- */}
        <Section icon={<SettingOutlined />} title="预测参数">
          {/* Granularity */}
          <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
            <span style={{ ...labelStyle, paddingTop: 4 }}>时间粒度</span>
            <Radio.Group
              value={granularity}
              onChange={(e) => handleGranularityChange(e.target.value as Granularity)}
              size="small"
            >
              <Radio.Button value="day">日</Radio.Button>
              <Radio.Button value="week">周</Radio.Button>
              <Radio.Button value="month">月</Radio.Button>
            </Radio.Group>
          </div>

          {/* Predict steps */}
          <div style={rowStyle}>
            <span style={labelStyle}>预测步数</span>
            <Select
              style={selectStyle}
              value={predictSteps}
              options={stepOptions}
              onChange={setPredictSteps}
              size="small"
            />
          </div>

          {/* Prediction mode */}
          <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
            <span style={{ ...labelStyle, paddingTop: 4 }}>预测模式</span>
            <Radio.Group
              value={predictionMode}
              onChange={(e) => setPredictionMode(e.target.value as PredictionMode)}
              style={{ flex: 1 }}
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {(
                  [
                    {
                      value: 'linear' as PredictionMode,
                      label: '稳定趋势',
                      desc: '适合平稳增长/下降场景',
                      disabled: false,
                    },
                    {
                      value: 'polynomial_2' as PredictionMode,
                      label: '加速增长',
                      desc: '适合S型曲线、需求加速场景',
                      disabled: false,
                    },
                    {
                      value: 'polynomial_3' as PredictionMode,
                      label: '复杂曲线',
                      desc: '适合非线性饱和场景',
                      disabled: false,
                    },
                    {
                      value: 'seasonal_7' as PredictionMode,
                      label: '周期波动',
                      desc: '日粒度专用，周期=7天',
                      disabled: granularity !== 'day',
                      disabledTip: '仅在时间粒度为"日"时可用',
                    },
                    {
                      value: 'ensemble' as PredictionMode,
                      label: '智能集成（推荐）',
                      desc: '生产环境首选，自动融合多种模型',
                      disabled: false,
                    },
                  ] as Array<{
                    value: PredictionMode;
                    label: string;
                    desc: string;
                    disabled: boolean;
                    disabledTip?: string;
                  }>
                ).map(({ value, label, desc, disabled, disabledTip }) => {
                  const radio = (
                    <Radio
                      key={value}
                      value={value}
                      disabled={disabled}
                      style={{
                        color: disabled
                          ? 'var(--vm-text-disabled)'
                          : TOKEN.textPrimary,
                        fontSize: 12,
                        alignItems: 'flex-start',
                      }}
                    >
                      <span style={{ fontWeight: predictionMode === value ? 600 : 400 }}>
                        {label}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: disabled ? 'var(--vm-text-disabled)' : TOKEN.textMuted,
                          marginLeft: 4,
                        }}
                      >
                        — {desc}
                      </span>
                    </Radio>
                  );
                  return disabled && disabledTip ? (
                    <Tooltip key={value} title={disabledTip} placement="right">
                      {radio}
                    </Tooltip>
                  ) : (
                    <React.Fragment key={value}>{radio}</React.Fragment>
                  );
                })}
              </Space>
            </Radio.Group>
          </div>
        </Section>

        {/* ---- Section 3: Trend sensitivity (above tips) ---- */}
        <Section icon={<InfoCircleOutlined />} title="趋势灵敏度">
          <div style={rowStyle}>
            <span style={{ ...labelStyle, width: 96 }}>上升/下降阈值</span>
            <Radio.Group
              value={trendThreshold}
              onChange={(e) => setTrendThreshold(e.target.value as number)}
              size="small"
            >
              {([0.05, 0.08, 0.10, 0.15, 0.20] as const).map((v) => (
                <Radio.Button key={v} value={v}>
                  {`${Math.round(v * 100)}%`}{v === 0.08 ? '（默认）' : ''}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>
          <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>
            前后半段均值变化超过该阈值时，判定为上升↑或下降↓趋势；
            值越小，趋势判断越敏感。
          </Text>
        </Section>

        {/* ---- Section 4: Tips (collapsible) ---- */}
        <Collapse
          ghost
          size="small"
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'tips',
              label: (
                <span style={{ fontSize: 11, color: TOKEN.textMuted }}>
                  <BulbOutlined style={{ marginRight: 4 }} />
                  使用提示
                </span>
              ),
              children: (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  {[
                    '如需过滤特定商品，请在画布中添加「条件」节点设置过滤条件',
                    '每个 SKU 至少需要 2 个历史数据点，否则该 SKU 将返回错误',
                    '时间列将按所选粒度聚合（同一周期的需求量会自动累加）',
                    '预测结果为未来 N 步的需求量，不包含历史数据',
                  ].map((tip, i) => (
                    <div
                      key={i}
                      style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}
                    >
                      <InfoCircleOutlined
                        style={{ color: TOKEN.textMuted, fontSize: 11, marginTop: 2 }}
                      />
                      <Text style={{ fontSize: 11, color: TOKEN.textSecondary }}>
                        {tip}
                      </Text>
                    </div>
                  ))}
                </Space>
              ),
            },
          ]}
        />
      </Drawer>
    </>
  );
};
