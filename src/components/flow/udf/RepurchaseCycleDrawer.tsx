/**
 * RepurchaseCycleDrawer
 * Configuration drawer for fn_ecom_repurchase_cycle (复购周期分析).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Drawer,
  Button,
  Select,
  DatePicker,
  InputNumber,
  Radio,
  Checkbox,
  Space,
  Typography,
  message,
} from 'antd';
import {
  UserOutlined,
  ClockCircleOutlined,
  TagOutlined,
  SettingOutlined,
  FilterOutlined,
  BarChartOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type {
  RepurchaseCycleConfig,
  RepurchaseCycleOutputMode,
  RepurchaseCycleRefDateMode,
  RepurchaseCycleThresholds,
} from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Props
// ============================================================================

export interface RepurchaseCycleDrawerProps {
  open: boolean;
  /** All available columns from the upstream table */
  columns: string[];
  /** Pre-existing config to restore when reopening */
  initialConfig?: RepurchaseCycleConfig;
  onConfirm: (config: RepurchaseCycleConfig) => void;
  onCancel: () => void;
}

// ============================================================================
// Section wrapper
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
    </div>
    {children}
  </div>
);

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_THRESHOLDS: RepurchaseCycleThresholds = { stable: 0.8, watch: 1.2, warning: 2.0 };

const DEFAULT_CONFIG: RepurchaseCycleConfig = {
  userIdCol: '',
  orderTimeCol: '',
  categoryCol: '',
  outputMode: 'detail',
  refDateMode: 'max_order_date',
  customRefDate: undefined,
  thresholds: DEFAULT_THRESHOLDS,
  detailRiskFilter: [],
  summaryValidOnly: false,
};

// ============================================================================
// Shared styles
// ============================================================================

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
  width: 84,
};

// ============================================================================
// Main component
// ============================================================================

export const RepurchaseCycleDrawer: React.FC<RepurchaseCycleDrawerProps> = ({
  open,
  columns,
  initialConfig,
  onConfirm,
  onCancel,
}) => {
  const [messageApi, contextHolder] = message.useMessage();

  const [userIdCol, setUserIdCol] = useState('');
  const [orderTimeCol, setOrderTimeCol] = useState('');
  const [categoryCol, setCategoryCol] = useState('');
  const [outputMode, setOutputMode] = useState<RepurchaseCycleOutputMode>('detail');
  const [refDateMode, setRefDateMode] = useState<RepurchaseCycleRefDateMode>('max_order_date');
  const [customRefDate, setCustomRefDate] = useState<string | undefined>();
  const [thresholds, setThresholds] = useState<RepurchaseCycleThresholds>({ ...DEFAULT_THRESHOLDS });
  const [detailRiskFilter, setDetailRiskFilter] = useState<string[]>([]);
  const [summaryValidOnly, setSummaryValidOnly] = useState(false);

  // Restore from initialConfig when drawer opens
  useEffect(() => {
    if (!open) return;
    if (initialConfig) {
      setUserIdCol(initialConfig.userIdCol);
      setOrderTimeCol(initialConfig.orderTimeCol);
      setCategoryCol(initialConfig.categoryCol);
      setOutputMode(initialConfig.outputMode);
      setRefDateMode(initialConfig.refDateMode);
      setCustomRefDate(initialConfig.customRefDate);
      setThresholds({ ...initialConfig.thresholds });
      setDetailRiskFilter(initialConfig.detailRiskFilter);
      setSummaryValidOnly(initialConfig.summaryValidOnly);
    } else {
      setUserIdCol(DEFAULT_CONFIG.userIdCol);
      setOrderTimeCol(DEFAULT_CONFIG.orderTimeCol);
      setCategoryCol(DEFAULT_CONFIG.categoryCol);
      setOutputMode(DEFAULT_CONFIG.outputMode);
      setRefDateMode(DEFAULT_CONFIG.refDateMode);
      setCustomRefDate(DEFAULT_CONFIG.customRefDate);
      setThresholds({ ...DEFAULT_THRESHOLDS });
      setDetailRiskFilter(DEFAULT_CONFIG.detailRiskFilter);
      setSummaryValidOnly(DEFAULT_CONFIG.summaryValidOnly);
    }
  }, [open, initialConfig]);

  const handleConfirm = useCallback(() => {
    if (!userIdCol || !orderTimeCol || !categoryCol) {
      void messageApi.warning('请选择用户ID、订单时间、商品类目字段');
      return;
    }
    if (refDateMode === 'custom' && !customRefDate) {
      void messageApi.warning('请指定分析基准日期');
      return;
    }
    onConfirm({
      userIdCol,
      orderTimeCol,
      categoryCol,
      outputMode,
      refDateMode,
      customRefDate,
      thresholds,
      detailRiskFilter,
      summaryValidOnly,
    });
  }, [
    userIdCol,
    orderTimeCol,
    categoryCol,
    outputMode,
    refDateMode,
    customRefDate,
    thresholds,
    detailRiskFilter,
    summaryValidOnly,
    messageApi,
    onConfirm,
  ]);

  const colOptions = columns.map((c) => (
    <Select.Option key={c} value={c}>
      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{c}</span>
    </Select.Option>
  ));

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
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--vm-text-primary)' }}>复购周期分析</span>
            </div>
          </div>
        }
        placement="right"
        width={480}
        open={open}
        onClose={onCancel}
        closable
        closeIcon={<CloseOutlined style={{ color: 'var(--vm-text-muted)', fontSize: 13 }} />}
        style={{ background: 'transparent' }}
        maskStyle={{
          background: 'rgba(0, 0, 0, 0.15)',
          backdropFilter: 'blur(2px)',
        }}
        styles={{
          header: {
            background: TOKEN.bgHeader,
            borderBottom: '1px solid var(--vm-border-subtle)',
            padding: '13px 20px',
            boxShadow: 'inset 0 -1px 0 var(--vm-primary-light)',
          },
          body: {
            background: TOKEN.bgBase,
            padding: '16px 16px',
            overflowY: 'auto',
          },
        }}
        drawerStyle={{
          background: TOKEN.bgBase,
          borderLeft: '1px solid var(--vm-border-mid)',
          boxShadow: 'var(--vm-flow-shadow-drawer)',
        }}
      >
        {/* ── 1. 字段映射 ──────────────────────────────────────────────── */}
        <Section icon={<UserOutlined />} title="字段映射" required>
          <div style={rowStyle}>
            <span style={labelStyle}>用户ID 列</span>
            <Select
              value={userIdCol || undefined}
              onChange={(v: string) => setUserIdCol(v)}
              placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择用户ID列</span>}
              size="small"
              style={selectStyle}
              getPopupContainer={() => document.body}
              className="nodrag"
              popupClassName="nodrag"
              showSearch
            >
              {colOptions}
            </Select>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>订单时间 列</span>
            <Select
              value={orderTimeCol || undefined}
              onChange={(v: string) => setOrderTimeCol(v)}
              placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择订单时间列</span>}
              size="small"
              style={selectStyle}
              getPopupContainer={() => document.body}
              className="nodrag"
              popupClassName="nodrag"
              showSearch
            >
              {colOptions}
            </Select>
          </div>
          <div style={{ ...rowStyle, marginBottom: 0 }}>
            <span style={labelStyle}>商品类目 列</span>
            <Select
              value={categoryCol || undefined}
              onChange={(v: string) => setCategoryCol(v)}
              placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择商品类目列</span>}
              size="small"
              style={selectStyle}
              getPopupContainer={() => document.body}
              className="nodrag"
              popupClassName="nodrag"
              showSearch
            >
              {colOptions}
            </Select>
          </div>
        </Section>

        {/* ── 2. Output mode ──────────────────────────────────────────────── */}
        <Section icon={<BarChartOutlined />} title="输出方式">
          <Radio.Group
            value={outputMode}
            onChange={(e) => setOutputMode(e.target.value as RepurchaseCycleOutputMode)}
            size="small"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Radio value="detail">
                <Text style={{ fontSize: 12, color: TOKEN.textPrimary }}>流失预警表（明细）</Text>
              </Radio>
              <Radio value="summary">
                <Text style={{ fontSize: 12, color: TOKEN.textPrimary }}>品类汇总表</Text>
              </Radio>
            </div>
          </Radio.Group>
        </Section>

        {/* ── 3. Analysis Benchmark Date ─────────────────────────────────────────────── */}
        <Section icon={<ClockCircleOutlined />} title="分析基准日">
          <Radio.Group
            value={refDateMode}
            onChange={(e) => setRefDateMode(e.target.value as RepurchaseCycleRefDateMode)}
            size="small"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Radio value="max_order_date">
                <Text style={{ fontSize: 12, color: TOKEN.textPrimary }}>使用数据中最大订单日期（默认）</Text>
              </Radio>
              <Radio value="custom">
                <Text style={{ fontSize: 12, color: TOKEN.textPrimary }}>指定日期</Text>
              </Radio>
            </div>
          </Radio.Group>
          {refDateMode === 'custom' && (
            <div style={{ marginTop: 10 }}>
              <DatePicker
                size="small"
                value={customRefDate ? dayjs(customRefDate) : null}
                onChange={(d) => setCustomRefDate(d ? d.format('YYYY-MM-DD') : undefined)}
                getPopupContainer={() => document.body}
                className="nodrag"
                popupClassName="nodrag"
                style={{ width: '100%' }}
              />
            </div>
          )}
        </Section>

        {/* ── 4. Risk Threshold Configuration ──────────────────────────────────────────── */}
        <Section icon={<SettingOutlined />} title="风险阈值配置">
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 10 }}>
            当前间隔 / 平均复购周期 的比值划分风险等级
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={rowStyle}>
              <span style={{ ...labelStyle, width: 100 }}>稳定阈值（&lt; N）</span>
              <InputNumber
                size="small"
                value={thresholds.stable}
                min={0.1}
                max={0.9}
                step={0.1}
                style={{ width: '100%' }}
                onChange={(v) => setThresholds((prev) => ({ ...prev, stable: v ?? prev.stable }))}
              />
            </div>
            <div style={rowStyle}>
              <span style={{ ...labelStyle, width: 100 }}>关注阈值（&lt; N）</span>
              <InputNumber
                size="small"
                value={thresholds.watch}
                min={0.5}
                max={1.8}
                step={0.1}
                style={{ width: '100%' }}
                onChange={(v) => setThresholds((prev) => ({ ...prev, watch: v ?? prev.watch }))}
              />
            </div>
            <div style={{ ...rowStyle, marginBottom: 0 }}>
              <span style={{ ...labelStyle, width: 100 }}>预警阈值（&lt; N）</span>
              <InputNumber
                size="small"
                value={thresholds.warning}
                min={1.0}
                max={5.0}
                step={0.1}
                style={{ width: '100%' }}
                onChange={(v) => setThresholds((prev) => ({ ...prev, warning: v ?? prev.warning }))}
              />
            </div>
          </div>
        </Section>

        {/* ── 5. Output Filtering (Detail Mode Only) ────────────────────────────────── */}
        {outputMode === 'detail' && (
          <Section icon={<FilterOutlined />} title="输出过滤">
            <Text style={{ fontSize: 11, color: TOKEN.textSecondary, display: 'block', marginBottom: 8 }}>
              筛选风险等级（空=全部输出）
            </Text>
            <Checkbox.Group
              options={['稳定', '关注', '预警', '已流失']}
              value={detailRiskFilter}
              onChange={(vals) => setDetailRiskFilter(vals as string[])}
            />
          </Section>
        )}

        {/* ── 6. Output Filtering (Detail Mode Only) ────────────────────────────────── */}
        {outputMode === 'summary' && (
          <Section icon={<TagOutlined />} title="汇总选项">
            <Checkbox
              checked={summaryValidOnly}
              onChange={(e) => setSummaryValidOnly(e.target.checked)}
            >
              <Text style={{ fontSize: 12, color: TOKEN.textPrimary }}>
                仅统计有效用户（订单≥2）
              </Text>
            </Checkbox>
          </Section>
        )}

        {/* ── Footer ──────────────────────────────────────────────────── */}
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

export default RepurchaseCycleDrawer;
