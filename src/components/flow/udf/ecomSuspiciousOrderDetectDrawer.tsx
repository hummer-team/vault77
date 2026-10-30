/**
 * EcomSuspiciousOrderDetectDrawer
 *
 * Configuration drawer for fn_ecom_suspicious_order_detect (malicious-order risk detection).
 * Seven sections: observation windows / subject columns / core rules / enhanced rules /
 * optional columns / score tiers / coverage + formula preview.
 * All column selects are searchable with unique-hit regex autofill; zero hardcoded colors.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer, Button, Select, Input, InputNumber, Switch, Tag, Tooltip, Typography } from 'antd';
import { FunctionOutlined, InfoCircleOutlined } from '@ant-design/icons';
import {
  DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG,
  SUSPICIOUS_FIELD_MATCH_PATTERNS,
  SUSPICIOUS_ORDER_RULE_KEYS,
  SUSPICIOUS_RULE_DEPENDENCY_COLS,
  SUSPICIOUS_RULE_LABEL,
  buildScoreCalibration,
  cloneSuspiciousOrderDetectConfig,
  collectEffectiveRules,
  collectSuspiciousOrderBlockers,
  hasColumnValue,
  type SuspiciousOrderDetectConfig,
  type SuspiciousOrderDetectFieldMapping,
  type SuspiciousOrderDetectThresholds,
  type SuspiciousOrderDetectWindows,
  type SuspiciousOrderDetectTiers,
  type SuspiciousOrderRuleKey,
} from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

export interface EcomSuspiciousOrderDetectDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: SuspiciousOrderDetectConfig;
  kernelDisplayName?: string;
  onConfirm: (config: SuspiciousOrderDetectConfig) => void;
  onCancel: () => void;
}

/** Core rules are enabled by default; enhanced rules ship disabled (D16). */
const CORE_RULE_KEYS: SuspiciousOrderRuleKey[] = [
  'burstOrders', 'addressCluster', 'mobileCluster', 'deviceCluster', 'newAccounts',
];

/** Column keys that belong to the optional-field section (subject columns stay in section 2). */
const OPTIONAL_COL_KEYS: Array<keyof SuspiciousOrderDetectFieldMapping> = [
  'amountCol', 'originalAmountCol', 'orderIdCol', 'orderStatusCol', 'registerTimeCol', 'firstOrderTimeCol',
];

const FIELD_LABEL: Record<keyof SuspiciousOrderDetectFieldMapping, string> = {
  userIdCol: '用户ID列',
  orderTimeCol: '下单时间列',
  addressCol: '收货地址列',
  mobileCol: '收货手机列',
  deviceCol: '设备号列',
  amountCol: '实付金额列',
  originalAmountCol: '原价列',
  orderIdCol: '订单号列',
  orderStatusCol: '订单状态列',
  registerTimeCol: '注册时间列',
  firstOrderTimeCol: '首次下单时间列',
};

const FIELD_TIP: Partial<Record<keyof SuspiciousOrderDetectFieldMapping, string>> = {
  addressCol: '用于「同地址多账号」：按地址前缀归一后统计同一地址下的账号数',
  mobileCol: '用于「同手机多账号」：去除分隔符与全角字符后统计同一手机号的账号数',
  deviceCol: '用于「同设备多账号」：同一设备登录的账号数超过阈值时命中',
  amountCol: '用于「改价异常」与「金额突变」：订单实付金额',
  originalAmountCol: '用于「改价异常」：订单原价/吊牌价，缺失时该规则自动跳过',
  orderIdCol: '选中后异常订单数按订单号去重；未选中时按数据行计数',
  orderStatusCol: '用于「退款异常」：判断订单是否退款/取消',
  registerTimeCol: '用于「批量小号」：账号注册时间，缺失时回退首次下单时间',
  firstOrderTimeCol: '用于「批量小号」：注册时间缺失时作为账号年龄基准',
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    marginBottom: 14, padding: '10px 12px', background: TOKEN.bgSection,
    borderRadius: TOKEN.radiusLg, border: `1px solid ${TOKEN.borderSubtle}`,
    borderLeft: `3px solid ${TOKEN.borderPrimary}`,
  }}>
    <Text style={{
      fontSize: 11, color: TOKEN.textSecondary, fontWeight: 600,
      letterSpacing: '0.06em', display: 'block', marginBottom: 8,
    }}>
      {title}
    </Text>
    {children}
  </div>
);

const ColumnRow: React.FC<{
  colKey: keyof SuspiciousOrderDetectFieldMapping;
  value: string;
  columns: string[];
  required?: boolean;
  placeholder?: string;
  status?: 'error';
  onChange: (v: string) => void;
}> = ({ colKey, value, columns, required, placeholder, status, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
    <div style={{ width: 132, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
      {required && <span style={{ color: TOKEN.primary, fontSize: 10 }}>*</span>}
      <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>{FIELD_LABEL[colKey]}</Text>
      {FIELD_TIP[colKey] && (
        <Tooltip title={FIELD_TIP[colKey]} placement="top">
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

/** Placeholder hint when several columns match the regex (unique/empty hits keep the default). */
function multiCandidateHint(key: string, columns: string[]): string | undefined {
  const pattern = SUSPICIOUS_FIELD_MATCH_PATTERNS[key as keyof SuspiciousOrderDetectFieldMapping];
  if (!pattern) return undefined;
  const hits = columns.filter((c) => pattern.test(c));
  return hits.length > 1 ? `多个候选：${hits.slice(0, 3).join(' / ')}` : undefined;
}

const RATIO_KEYS = new Set<keyof SuspiciousOrderDetectThresholds>(['priceAnomalyMaxRatio', 'amountDeviationMultiple', 'refundRatePercent']);

/** Integer-semantics thresholds are rounded; ratio/percent keep decimals (0.3 must survive). */
function normalizeThresholds(t: SuspiciousOrderDetectThresholds): SuspiciousOrderDetectThresholds {
  const out = { ...t };
  for (const key of Object.keys(out) as Array<keyof SuspiciousOrderDetectThresholds>) {
    const raw = Number(out[key]);
    const safe = Number.isFinite(raw) ? raw : DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.thresholds[key];
    out[key] = RATIO_KEYS.has(key) ? safe : Math.round(safe);
  }
  out.burstOrderCount = Math.max(2, out.burstOrderCount);
  out.addrClusterUsers = Math.max(1, out.addrClusterUsers);
  out.mobileClusterUsers = Math.max(1, out.mobileClusterUsers);
  out.deviceClusterUsers = Math.max(1, out.deviceClusterUsers);
  out.newAccountMaxAgeDays = Math.max(1, out.newAccountMaxAgeDays);
  out.newAccountMinOrders = Math.max(1, out.newAccountMinOrders);
  out.priceAnomalyMinOrders = Math.max(1, out.priceAnomalyMinOrders);
  out.amountDeviationMinOrders = Math.max(1, out.amountDeviationMinOrders);
  out.refundMinOrders = Math.max(1, out.refundMinOrders);
  out.priceAnomalyMaxRatio = Math.min(1, Math.max(0.01, out.priceAnomalyMaxRatio));
  out.refundRatePercent = Math.min(100, Math.max(1, out.refundRatePercent));
  out.amountDeviationMultiple = Math.max(0.1, out.amountDeviationMultiple);
  out.addressPrefixLength = Math.min(40, Math.max(1, out.addressPrefixLength));
  return out;
}

function normalizeWindows(w: SuspiciousOrderDetectWindows): SuspiciousOrderDetectWindows {
  const safe = (v: number, fallback: number) => (Number.isFinite(v) ? Math.round(v) : fallback);
  const d = DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.windows;
  return {
    burstWindowMinutes: Math.max(1, safe(w.burstWindowMinutes, d.burstWindowMinutes)),
    clusterWindowMinutes: Math.max(1, safe(w.clusterWindowMinutes, d.clusterWindowMinutes)),
    observationDays: Math.max(0, safe(w.observationDays, d.observationDays)),
  };
}

export const EcomSuspiciousOrderDetectDrawer: React.FC<EcomSuspiciousOrderDetectDrawerProps> = ({
  open, columns, initialConfig, kernelDisplayName, onConfirm, onCancel,
}) => {
  const [cfg, setCfg] = useState<SuspiciousOrderDetectConfig>(
    () => cloneSuspiciousOrderDetectConfig(DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG),
  );

  // On open: deep clone → drop stale out-of-table columns → regex autofill (never overwrite a manual choice)
  useEffect(() => {
    if (!open) return;
    const base = cloneSuspiciousOrderDetectConfig(initialConfig ?? DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG);
    const guard = columns.length > 0;
    const inTable = (col: string) => !hasColumnValue(col) || columns.includes(col);
    const fillIfEmpty = (key: keyof SuspiciousOrderDetectFieldMapping, current?: string): string => {
      if (hasColumnValue(current)) return current ?? '';
      const hits = columns.filter((c) => SUSPICIOUS_FIELD_MATCH_PATTERNS[key].test(c));
      return hits.length === 1 ? hits[0] : (current ?? '');
    };
    for (const key of Object.keys(SUSPICIOUS_FIELD_MATCH_PATTERNS) as Array<keyof SuspiciousOrderDetectFieldMapping>) {
      const current = guard && !inTable(base.fieldMapping[key] ?? '') ? '' : (base.fieldMapping[key] ?? '');
      base.fieldMapping[key] = fillIfEmpty(key, current);
    }
    setCfg(base);
  }, [open, initialConfig, columns]);

  const patchField = useCallback((key: keyof SuspiciousOrderDetectFieldMapping, v: string) =>
    setCfg((prev) => ({ ...prev, fieldMapping: { ...prev.fieldMapping, [key]: v } })), []);
  const patchThreshold = useCallback((key: keyof SuspiciousOrderDetectThresholds, v: number) =>
    setCfg((prev) => ({ ...prev, thresholds: { ...prev.thresholds, [key]: v } })), []);
  const patchWindow = useCallback((key: keyof SuspiciousOrderDetectWindows, v: number) =>
    setCfg((prev) => ({ ...prev, windows: { ...prev.windows, [key]: v } })), []);
  const patchWeight = useCallback((key: SuspiciousOrderRuleKey, v: number) =>
    setCfg((prev) => ({ ...prev, weights: { ...prev.weights, [key]: v } })), []);
  const patchTier = useCallback((key: keyof SuspiciousOrderDetectTiers, v: number) =>
    setCfg((prev) => ({ ...prev, tiers: { ...prev.tiers, [key]: v } })), []);
  const toggleRule = useCallback((key: SuspiciousOrderRuleKey, on: boolean) =>
    setCfg((prev) => ({ ...prev, ruleToggles: { ...prev.ruleToggles, [key]: on } })), []);

  // Apply gate shares the single blocker source with strategy validate() / isUdfConfigured
  const blockers = useMemo(() => collectSuspiciousOrderBlockers(cfg), [cfg]);
  const gateOk = blockers.length === 0;
  const coverage = useMemo(() => collectEffectiveRules(cfg), [cfg]);
  const calibration = useMemo(() => buildScoreCalibration(cfg.weights, cfg.tiers), [cfg.weights, cfg.tiers]);
  const weightTotal = useMemo(
    () => SUSPICIOUS_ORDER_RULE_KEYS.reduce((s, k) => s + (Number.isFinite(cfg.weights[k]) ? cfg.weights[k] : 0), 0),
    [cfg.weights],
  );

  const coverageText = useMemo(() => {
    const parts = [`生效 ${coverage.effective.length}/8 项`];
    if (coverage.closed.length > 0) parts.unshift(`已关闭 ${coverage.closed.length} 项`);
    if (coverage.skipped.length > 0) {
      parts.push(`缺依赖列跳过 ${coverage.skipped.length} 项（${coverage.skipped.map((k) => SUSPICIOUS_RULE_LABEL[k]).join('、')}）`);
    }
    return parts.join(' · ');
  }, [coverage]);

  // Plan Phase 4 ⑦：按当前权重渲染，权重为 0 的规则标注「未计分」（review 问题 2）
  const formulaText = useMemo(
    () =>
      `风险分 = min(100, ${SUSPICIOUS_ORDER_RULE_KEYS.map((k) =>
        cfg.weights[k] === 0 ? `命中${SUSPICIOUS_RULE_LABEL[k]}（未计分）` : `命中${SUSPICIOUS_RULE_LABEL[k]}×${cfg.weights[k]}`,
      ).join(' + ')})`,
    [cfg.weights],
  );

  const handleConfirm = useCallback(() => {
    const next = cloneSuspiciousOrderDetectConfig(cfg);
    for (const key of Object.keys(next.fieldMapping) as Array<keyof SuspiciousOrderDetectFieldMapping>) {
      next.fieldMapping[key] = (next.fieldMapping[key] ?? '').trim();
    }
    next.thresholds = normalizeThresholds(next.thresholds);
    next.windows = normalizeWindows(next.windows);
    next.tiers = {
      severeScore: Math.min(100, Math.round(Number(next.tiers.severeScore) || 0)),
      highScore: Math.round(Number(next.tiers.highScore) || 0),
      midScore: Math.round(Number(next.tiers.midScore) || 0),
    };
    next.topN = Math.min(10, Math.max(1, Math.round(Number(next.topN) || 1)));
    for (const key of SUSPICIOUS_ORDER_RULE_KEYS) {
      next.weights[key] = Math.min(100, Math.max(0, Math.round(Number(next.weights[key]) || 0)));
    }
    next.refundStatusValues = (next.refundStatusValues ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .join(',');
    onConfirm(next);
  }, [cfg, onConfirm]);

  /** One rule row: switch + business judgement text + thresholds + weight + dependency columns. */
  const renderRuleRow = (key: SuspiciousOrderRuleKey) => {
    const enabled = cfg.ruleToggles[key];
    const isCore = CORE_RULE_KEYS.includes(key);
    const deps = SUSPICIOUS_RULE_DEPENDENCY_COLS[key] ?? [];
    const missingDeps = deps.filter((c) => !hasColumnValue(cfg.fieldMapping[c]));
    return (
      <div key={key} data-rule={key} style={{ padding: '8px 0', borderTop: `1px dashed ${TOKEN.borderSubtle}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Switch size="small" checked={enabled} onChange={(v) => toggleRule(key, v)} />
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, fontWeight: 600 }}>
            {SUSPICIOUS_RULE_LABEL[key]}
          </Text>
          {isCore ? (
            <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>核心</Tag>
          ) : (
            <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>增强</Tag>
          )}
          {!enabled && <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>已关闭·点击启用</Text>}
          {enabled && missingDeps.length > 0 && (
            <Text style={{ fontSize: 11, color: 'var(--vm-color-warning)' }}>
              缺依赖列：{missingDeps.map((c) => FIELD_LABEL[c]).join('、')}
            </Text>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>权重</Text>
            <InputNumber
              size="small" min={0} max={100} value={cfg.weights[key]} style={{ width: 62 }}
              onChange={(v) => patchWeight(key, typeof v === 'number' ? v : 0)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingLeft: 34 }}>
          {key === 'burstOrders' && (
            <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>
              单用户 ≥
              <InputNumber
                size="small" min={2} max={1000} value={cfg.thresholds.burstOrderCount}
                style={{ width: 64, margin: '0 4px' }}
                onChange={(v) => patchThreshold('burstOrderCount', typeof v === 'number' ? v : 2)}
              />
              单
            </span>
          )}
          {key === 'addressCluster' && (
            <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>
              同一地址 ≥
              <InputNumber
                size="small" min={1} max={1000} value={cfg.thresholds.addrClusterUsers}
                style={{ width: 64, margin: '0 4px' }}
                onChange={(v) => patchThreshold('addrClusterUsers', typeof v === 'number' ? v : 1)}
              />
              个账号
            </span>
          )}
          {key === 'mobileCluster' && (
            <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>
              同一手机 ≥
              <InputNumber
                size="small" min={1} max={1000} value={cfg.thresholds.mobileClusterUsers}
                style={{ width: 64, margin: '0 4px' }}
                onChange={(v) => patchThreshold('mobileClusterUsers', typeof v === 'number' ? v : 1)}
              />
              个账号
            </span>
          )}
          {key === 'deviceCluster' && (
            <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>
              同一设备 ≥
              <InputNumber
                size="small" min={1} max={1000} value={cfg.thresholds.deviceClusterUsers}
                style={{ width: 64, margin: '0 4px' }}
                onChange={(v) => patchThreshold('deviceClusterUsers', typeof v === 'number' ? v : 1)}
              />
              个账号
            </span>
          )}
          {key === 'newAccounts' && (
            <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>
              账号年龄 ≤
              <InputNumber
                size="small" min={1} max={3650} value={cfg.thresholds.newAccountMaxAgeDays}
                style={{ width: 64, margin: '0 4px' }}
                onChange={(v) => patchThreshold('newAccountMaxAgeDays', typeof v === 'number' ? v : 1)}
              />
              天 且订单 ≥
              <InputNumber
                size="small" min={1} max={1000} value={cfg.thresholds.newAccountMinOrders}
                style={{ width: 64, margin: '0 4px' }}
                onChange={(v) => patchThreshold('newAccountMinOrders', typeof v === 'number' ? v : 1)}
              />
              单
            </span>
          )}
          {key === 'priceAnomaly' && (
            <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>
              实付 ≤ 原价
              <InputNumber
                size="small" min={0.01} max={1} step={0.05} value={cfg.thresholds.priceAnomalyMaxRatio}
                style={{ width: 72, margin: '0 4px' }}
                onChange={(v) => patchThreshold('priceAnomalyMaxRatio', typeof v === 'number' ? v : 0.3)}
              />
              倍 且订单 ≥
              <InputNumber
                size="small" min={1} max={1000} value={cfg.thresholds.priceAnomalyMinOrders}
                style={{ width: 64, margin: '0 4px' }}
                onChange={(v) => patchThreshold('priceAnomalyMinOrders', typeof v === 'number' ? v : 1)}
              />
              单
            </span>
          )}
          {key === 'amountDeviation' && (
            <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>
              金额 ≥ 其余订单均值
              <InputNumber
                size="small" min={0.1} max={100} step={0.5} value={cfg.thresholds.amountDeviationMultiple}
                style={{ width: 72, margin: '0 4px' }}
                onChange={(v) => patchThreshold('amountDeviationMultiple', typeof v === 'number' ? v : 3)}
              />
              倍 且订单 ≥
              <InputNumber
                size="small" min={1} max={1000} value={cfg.thresholds.amountDeviationMinOrders}
                style={{ width: 64, margin: '0 4px' }}
                onChange={(v) => patchThreshold('amountDeviationMinOrders', typeof v === 'number' ? v : 1)}
              />
              单
            </span>
          )}
          {key === 'refundAnomaly' && (
            <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>
              退款/取消 ≥
              <InputNumber
                size="small" min={1} max={1000} value={cfg.thresholds.refundMinOrders}
                style={{ width: 64, margin: '0 4px' }}
                onChange={(v) => patchThreshold('refundMinOrders', typeof v === 'number' ? v : 1)}
              />
              单 且占比 ≥
              <InputNumber
                size="small" min={1} max={100} value={cfg.thresholds.refundRatePercent}
                style={{ width: 64, margin: '0 4px' }}
                onChange={(v) => patchThreshold('refundRatePercent', typeof v === 'number' ? v : 1)}
              />
              %
            </span>
          )}
          {deps.map((dep) => (
            <div key={String(dep)} style={{ minWidth: 240, flex: 1 }}>
              <ColumnRow
                colKey={dep}
                value={cfg.fieldMapping[dep] ?? ''}
                columns={columns}
                placeholder={multiCandidateHint(String(dep), columns)}
                onChange={(v) => patchField(dep, v)}
              />
            </div>
          ))}
        </div>

        {key === 'refundAnomaly' && enabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 34, marginTop: 4 }} data-field="refundStatusValues">
            <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 96, flexShrink: 0 }}>退款状态值</Text>
            <Input
              size="small"
              value={cfg.refundStatusValues}
              placeholder="逗号分隔，如 已退款,REFUNDED"
              onChange={(e) => setCfg((prev) => ({ ...prev, refundStatusValues: e.target.value }))}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <Drawer
      open={open}
      onClose={onCancel}
      width={640}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FunctionOutlined style={{ color: TOKEN.primary }} />
          <Text style={{ fontSize: 14, fontWeight: 600 }}>{kernelDisplayName ?? '恶意订单识别'}</Text>
        </div>
      }
      footer={
        <div>
          {blockers.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--vm-color-warning)', marginBottom: 8 }}>
              {blockers.map((b) => b.message).join('；')}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button size="small" onClick={onCancel}>取消</Button>
            <Button size="small" type="primary" disabled={!gateOk} onClick={handleConfirm}>应用</Button>
          </div>
        </div>
      }
    >
      {/* ① Observation windows */}
      <Section title="① 观察窗口">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }} data-field="burstWindowMinutes">
          <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 132 }}>密集下单观察时长</Text>
          <InputNumber
            size="small" min={1} max={1440} value={cfg.windows.burstWindowMinutes}
            style={{ width: 90 }}
            onChange={(v) => patchWindow('burstWindowMinutes', typeof v === 'number' ? v : 60)}
          />
          <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>分钟（同一用户在该时长内的下单数）</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }} data-field="clusterWindowMinutes">
          <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 132 }}>聚集观察时长</Text>
          <InputNumber
            size="small" min={1} max={1440} value={cfg.windows.clusterWindowMinutes}
            style={{ width: 90 }}
            onChange={(v) => patchWindow('clusterWindowMinutes', typeof v === 'number' ? v : 120)}
          />
          <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>分钟（地址/手机/设备聚集的观察时长）</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} data-field="observationDays">
          <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 132 }}>观察区间</Text>
          <InputNumber
            size="small" min={0} max={3650} value={cfg.windows.observationDays}
            style={{ width: 90 }}
            onChange={(v) => patchWindow('observationDays', typeof v === 'number' ? v : 0)}
          />
          <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>天，0 表示全部数据</Text>
        </div>
      </Section>

      {/* ② Subject columns */}
      <Section title="② 风险主体">
        <ColumnRow
          colKey="userIdCol" required value={cfg.fieldMapping.userIdCol} columns={columns}
          status={hasColumnValue(cfg.fieldMapping.userIdCol) ? undefined : 'error'}
          placeholder={multiCandidateHint('userIdCol', columns)}
          onChange={(v) => patchField('userIdCol', v)}
        />
        <ColumnRow
          colKey="orderTimeCol" required value={cfg.fieldMapping.orderTimeCol} columns={columns}
          status={hasColumnValue(cfg.fieldMapping.orderTimeCol) ? undefined : 'error'}
          placeholder={multiCandidateHint('orderTimeCol', columns)}
          onChange={(v) => patchField('orderTimeCol', v)}
        />
      </Section>

      {/* ③ Core rules (enabled by default) */}
      <Section title="③ 核心规则（默认开启）">
        {CORE_RULE_KEYS.map(renderRuleRow)}
      </Section>

      {/* ④ Enhanced rules (disabled by default) */}
      <Section title="④ 增强规则（默认关闭）">
        {SUSPICIOUS_ORDER_RULE_KEYS.filter((k) => !CORE_RULE_KEYS.includes(k)).map(renderRuleRow)}
      </Section>

      {/* ⑤ Optional columns */}
      <Section title="⑤ 更多字段（可选）">
        {OPTIONAL_COL_KEYS.map((key) => (
          <ColumnRow
            key={String(key)} colKey={key} value={cfg.fieldMapping[key] ?? ''} columns={columns}
            placeholder={multiCandidateHint(String(key), columns)}
            onChange={(v) => patchField(key, v)}
          />
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} data-field="addressPrefixLength">
          <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 132 }}>地址前缀长度</Text>
          <InputNumber
            size="small" min={1} max={40} value={cfg.thresholds.addressPrefixLength}
            style={{ width: 90 }}
            onChange={(v) => patchThreshold('addressPrefixLength', typeof v === 'number' ? v : 15)}
          />
          <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>个字符（用于同地址归一）</Text>
        </div>
        {cfg.thresholds.addressPrefixLength < 10 && (
          <Text style={{ fontSize: 11, color: 'var(--vm-color-warning)', display: 'block', marginTop: 4 }}>
            地址前缀过短会把不同住户合并，建议不少于 10 个字符
          </Text>
        )}
      </Section>

      {/* ⑥ Score tiers */}
      <Section title="⑥ 风险分档">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: TOKEN.textSecondary }} data-field="severeScore">
            严重 ≥
            <InputNumber
              size="small" min={1} max={100} value={cfg.tiers.severeScore} style={{ width: 66, margin: '0 4px' }}
              onChange={(v) => patchTier('severeScore', typeof v === 'number' ? v : 80)}
            />
          </span>
          <span style={{ fontSize: 12, color: TOKEN.textSecondary }} data-field="highScore">
            高 ≥
            <InputNumber
              size="small" min={1} max={100} value={cfg.tiers.highScore} style={{ width: 66, margin: '0 4px' }}
              onChange={(v) => patchTier('highScore', typeof v === 'number' ? v : 60)}
            />
          </span>
          <span style={{ fontSize: 12, color: TOKEN.textSecondary }} data-field="midScore">
            中 ≥
            <InputNumber
              size="small" min={1} max={100} value={cfg.tiers.midScore} style={{ width: 66, margin: '0 4px' }}
              onChange={(v) => patchTier('midScore', typeof v === 'number' ? v : 40)}
            />
          </span>
          <span style={{ fontSize: 12, color: TOKEN.textSecondary }} data-field="topN">
            洞察列出主体数
            <InputNumber
              size="small" min={1} max={10} value={cfg.topN} style={{ width: 66, margin: '0 4px' }}
              onChange={(v) => setCfg((prev) => ({ ...prev, topN: typeof v === 'number' ? v : 5 }))}
            />
          </span>
        </div>
        <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>需满足 严重 &gt; 高 &gt; 中，且均不超过 100</Text>
      </Section>

      {/* ⑦ Coverage + formula preview */}
      <Section title="⑦ 覆盖与公式预览">
        <div style={{ fontSize: 12, color: TOKEN.textSecondary, marginBottom: 6 }}>{coverageText}</div>
        {weightTotal < cfg.tiers.severeScore && (
          <div style={{ fontSize: 11, color: 'var(--vm-color-warning)', marginBottom: 6 }}>
            当前权重合计 {weightTotal} 分，低于「严重」阈值 {cfg.tiers.severeScore} 分，该项无法达到
          </div>
        )}
        <div style={{ fontSize: 11, color: TOKEN.textMuted, marginBottom: 6 }}>{formulaText}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ color: TOKEN.textSecondary }}>
              <th style={{ textAlign: 'left', padding: '2px 4px' }}>命中项数</th>
              <th style={{ textAlign: 'right', padding: '2px 4px' }}>最高分</th>
              <th style={{ textAlign: 'right', padding: '2px 4px' }}>档位</th>
            </tr>
          </thead>
          <tbody>
            {calibration.map((row) => (
              <tr key={row.hitCount} style={{ color: TOKEN.textMuted }}>
                <td style={{ padding: '2px 4px' }}>{row.hitCount}</td>
                <td style={{ padding: '2px 4px', textAlign: 'right' }}>{row.maxScore}</td>
                <td style={{ padding: '2px 4px', textAlign: 'right' }}>{row.level}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {coverage.skipped.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--vm-color-warning)', marginTop: 6 }}>
            本次仅 {coverage.effective.length}/8 项规则参与计算：{coverage.skipped.map((k) => SUSPICIOUS_RULE_LABEL[k]).join('、')} 缺少依赖列
          </div>
        )}
      </Section>
    </Drawer>
  );
};

export default EcomSuspiciousOrderDetectDrawer;
