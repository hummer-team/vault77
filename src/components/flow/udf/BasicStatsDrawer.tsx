/**
 * BasicStatsDrawer
 * Configuration drawer for the "基础统计分析" (fn_basic_statis) operator.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Button,
  Checkbox,
  Select,
  Input,
  InputNumber,
  Switch,
  Space,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  CloseOutlined,
  BarChartOutlined,
  GroupOutlined,
  FilterOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type {
  BasicStatsConfig,
  AggFieldConfig,
  AggFunction,
  HavingFilter,
  SortConfig,
} from '../../../services/flow/types';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

export interface BasicStatsDrawerProps {
  open: boolean;
  tableName: string;
  columns: string[];
  initialConfig?: BasicStatsConfig;
  onConfirm: (config: BasicStatsConfig) => void;
  onCancel: () => void;
}

// ============================================================================
// Design tokens (aligned with global.css + ReplaceColumnDrawer)
// ============================================================================

const TOKEN = {
  bgBase: 'rgba(14, 14, 16, 0.99)',
  bgHeader: 'rgba(22, 20, 18, 0.99)',
  bgSection: 'rgba(255, 255, 255, 0.02)',
  bgRow: 'rgba(255, 255, 255, 0.015)',
  bgRowHover: 'rgba(255, 107, 0, 0.045)',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderMid: 'rgba(255, 255, 255, 0.1)',
  borderPrimary: 'rgba(255, 107, 0, 0.35)',
  primary: '#FF6B00',
  primaryHover: '#FF8533',
  purple: '#722ed1',
  purpleLight: '#b37feb',
  purpleBg: 'rgba(114, 46, 209, 0.12)',
  textPrimary: 'rgba(255, 255, 255, 0.88)',
  textSecondary: 'rgba(255, 255, 255, 0.45)',
  textMuted: 'rgba(255, 255, 255, 0.25)',
  textError: '#ff4d4f',
  radius: '6px',
  radiusLg: '8px',
};

const AGG_OPTIONS: { label: string; value: AggFunction }[] = [
  { label: 'COUNT', value: 'COUNT' },
  { label: 'SUM', value: 'SUM' },
  { label: 'AVG', value: 'AVG' },
  { label: 'MAX', value: 'MAX' },
  { label: 'MIN', value: 'MIN' },
];

const OPERATOR_OPTIONS = [
  { label: '>', value: '>' as const },
  { label: '>=', value: '>=' as const },
  { label: '<', value: '<' as const },
  { label: '<=', value: '<=' as const },
];

// ============================================================================
// Helpers
// ============================================================================

function defaultAlias(func: AggFunction, col: string): string {
  return `${func.toLowerCase()}_${col}`;
}

function buildEmptyHavingFilter(): HavingFilter {
  return { id: uuidv4(), resultAlias: '', operator: '>', value: 0 };
}

function buildEmptySortConfig(): SortConfig {
  return { id: uuidv4(), column: '', direction: 'ASC' };
}

// ============================================================================
// Section wrapper
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
      borderLeft: `3px solid rgba(255, 107, 0, 0.35)`,
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
// Component
// ============================================================================

export const BasicStatsDrawer: React.FC<BasicStatsDrawerProps> = ({
  open,
  tableName,
  columns,
  initialConfig,
  onConfirm,
  onCancel,
}) => {
  // ── Stat columns & agg fields ───────────────────────────────────────────────
  const [selectedStatCols, setSelectedStatCols] = useState<string[]>([]);
  const [aggFields, setAggFields] = useState<AggFieldConfig[]>([]);

  // ── Group-by ────────────────────────────────────────────────────────────────
  const [groupByEnabled, setGroupByEnabled] = useState(false);
  const [groupByColumns, setGroupByColumns] = useState<string[]>([]);

  // ── Having filters ──────────────────────────────────────────────────────────
  const [havingFilters, setHavingFilters] = useState<HavingFilter[]>([]);

  // ── Sort ────────────────────────────────────────────────────────────────────
  const [sortEnabled, setSortEnabled] = useState(false);
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([]);

  // ── Validation ──────────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<string[]>([]);

  // ── Sync from initialConfig on open ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setErrors([]);

    if (initialConfig) {
      const cols = initialConfig.aggFields.map((f) => f.column);
      setSelectedStatCols(cols);
      setAggFields(initialConfig.aggFields);
      setGroupByEnabled(initialConfig.groupByColumns.length > 0);
      setGroupByColumns(initialConfig.groupByColumns);
      setHavingFilters(initialConfig.havingFilters);
      setSortEnabled(initialConfig.sortConfigs.length > 0);
      setSortConfigs(initialConfig.sortConfigs);
    } else {
      setSelectedStatCols([]);
      setAggFields([]);
      setGroupByEnabled(false);
      setGroupByColumns([]);
      setHavingFilters([]);
      setSortEnabled(false);
      setSortConfigs([]);
    }
  }, [open, initialConfig]);

  // ── Sync aggFields when selectedStatCols changes ────────────────────────────
  const handleStatColsChange = useCallback((cols: string[]) => {
    setSelectedStatCols(cols);
    setAggFields((prev) => {
      // Remove agg fields for deselected columns
      const retained = prev.filter((f) => cols.includes(f.column));
      // Add new agg fields for newly selected columns
      const existingCols = retained.map((f) => f.column);
      const newFields: AggFieldConfig[] = cols
        .filter((c) => !existingCols.includes(c))
        .map((c) => ({
          id: uuidv4(),
          column: c,
          func: 'COUNT' as AggFunction,
          alias: defaultAlias('COUNT', c),
          distinct: false,
        }));
      return [...retained, ...newFields];
    });
    // Remove group-by columns that were just selected as stat cols
    setGroupByColumns((prev) => prev.filter((c) => !cols.includes(c)));
  }, []);

  const updateAggField = useCallback(
    (id: string, patch: Partial<AggFieldConfig>) => {
      setAggFields((prev) =>
        prev.map((f) => {
          if (f.id !== id) return f;
          const updated = { ...f, ...patch };
          // Auto-regenerate alias when func changes, unless user already edited it
          if (patch.func && updated.alias === defaultAlias(f.func, f.column)) {
            updated.alias = defaultAlias(patch.func, updated.column);
          }
          return updated;
        })
      );
    },
    []
  );

  // ── Available alias list for having/sort dropdowns ───────────────────────────
  const aliasOptions = useMemo(
    () => aggFields.filter((f) => f.alias.trim()).map((f) => f.alias),
    [aggFields]
  );

  // Columns available for group-by (exclude stat columns)
  const groupByAvailableCols = useMemo(
    () => columns.filter((c) => !selectedStatCols.includes(c)),
    [columns, selectedStatCols]
  );

  // Columns available for sort (agg aliases + group-by columns)
  const sortAvailableCols = useMemo(
    () => [...aliasOptions, ...groupByColumns],
    [aliasOptions, groupByColumns]
  );

  // ── Having filter helpers ────────────────────────────────────────────────────
  const addHavingFilter = useCallback(() => {
    setHavingFilters((prev) => [...prev, buildEmptyHavingFilter()]);
  }, []);

  const updateHavingFilter = useCallback(
    (id: string, patch: Partial<HavingFilter>) => {
      setHavingFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
      );
    },
    []
  );

  const removeHavingFilter = useCallback((id: string) => {
    setHavingFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ── Sort helpers ─────────────────────────────────────────────────────────────
  const addSortConfig = useCallback(() => {
    setSortConfigs((prev) => [...prev, buildEmptySortConfig()]);
  }, []);

  const updateSortConfig = useCallback(
    (id: string, patch: Partial<SortConfig>) => {
      setSortConfigs((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
    },
    []
  );

  const removeSortConfig = useCallback((id: string) => {
    setSortConfigs((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // ── Confirm ──────────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    const errs: string[] = [];

    if (aggFields.length === 0) {
      errs.push('请至少选择一个统计列');
    }

    const emptyAlias = aggFields.some((f) => !f.alias.trim());
    if (emptyAlias) {
      errs.push('统计列别名不能为空');
    }

    const invalidValue = havingFilters.some((f) => !isFinite(f.value));
    if (invalidValue) {
      errs.push('结果过滤的值必须为有效数字');
    }

    const emptyHavingAlias = havingFilters.some((f) => !f.resultAlias.trim());
    if (emptyHavingAlias) {
      errs.push('结果过滤的统计结果不能为空');
    }

    const emptySortColumn = sortConfigs.some((s) => !s.column.trim());
    if (emptySortColumn) {
      errs.push('排序列不能为空');
    }

    if (errs.length > 0) {
      setErrors(errs);
      return;
    }

    setErrors([]);
    onConfirm({
      tableName,
      aggFields,
      groupByColumns: groupByEnabled ? groupByColumns : [],
      havingFilters,
      sortConfigs: sortEnabled ? sortConfigs : [],
    });
  }, [
    aggFields,
    havingFilters,
    groupByEnabled,
    groupByColumns,
    sortEnabled,
    sortConfigs,
    tableName,
    onConfirm,
  ]);

  // ============================================================================
  // Render
  // ============================================================================

  const addBtnStyle: React.CSSProperties = {
    width: '100%',
    borderColor: 'rgba(255, 107, 0, 0.2)',
    color: TOKEN.textSecondary,
    background: 'rgba(255, 107, 0, 0.03)',
    height: 30,
    fontSize: 12,
    borderRadius: TOKEN.radius,
  };

  const selectStyle: React.CSSProperties = { width: '100%' };

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: 'rgba(255, 107, 0, 0.12)',
              border: '1px solid rgba(255, 107, 0, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BarChartOutlined style={{ color: TOKEN.primary, fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#fff' }}>数据分析</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>/</span>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#fff' }}>基础统计分析</span>
          </div>
        </div>
      }
      placement="right"
      width={620}
      open={open}
      onClose={onCancel}
      closable
      closeIcon={<CloseOutlined style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }} />}
      style={{ background: 'transparent' }}
      styles={{
        header: {
          background: TOKEN.bgHeader,
          borderBottom: '1px solid rgba(68, 64, 60, 0.5)',
          padding: '13px 20px',
          boxShadow: 'inset 0 -1px 0 rgba(255, 107, 0, 0.06)',
        },
        body: {
          background: TOKEN.bgBase,
          padding: '22px 26px 28px',
          overflowX: 'hidden',
        },
        mask: {
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(3px)',
        },
      }}
      drawerStyle={{
        background: TOKEN.bgBase,
        borderLeft: '1px solid rgba(68, 64, 60, 0.55)',
        boxShadow: '-6px 0 32px rgba(0, 0, 0, 0.6), -1px 0 0 rgba(255, 107, 0, 0.07)',
      }}
    >
      {/* ── Section 1: 选择统计列 ──────────────────────────────────────────── */}
      <Section icon={<BarChartOutlined />} title="选择统计列" required>
        <Select
          mode="multiple"
          placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择要统计的列</span>}
          value={selectedStatCols}
          onChange={handleStatColsChange}
          style={selectStyle}
          size="small"
          getPopupContainer={() => document.body}
          className="nodrag"
          popupClassName="nodrag"
          notFoundContent={
            <span style={{ fontSize: 11, color: TOKEN.textMuted }}>无可用列</span>
          }
        >
          {columns.map((col) => (
            <Select.Option key={col} value={col}>
              <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{col}</span>
            </Select.Option>
          ))}
        </Select>

        {/* Per-column agg function + alias rows */}
        {aggFields.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 110px 1fr',
                gap: 6,
                padding: '4px 6px',
                background: 'rgba(255,255,255,0.025)',
                borderRadius: TOKEN.radius,
              }}
            >
              {(['列名', '聚合函数', '结果别名'] as const).map((label) => (
                <Text
                  key={label}
                  style={{
                    fontSize: 10,
                    color: TOKEN.textSecondary,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {label}
                </Text>
              ))}
            </div>

            {aggFields.map((field) => (
              <div
                key={field.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 110px auto 1fr',
                  gap: 6,
                  alignItems: 'center',
                  padding: '4px 6px',
                  background: TOKEN.bgRow,
                  borderRadius: TOKEN.radius,
                  border: `1px solid ${TOKEN.borderSubtle}`,
                }}
              >
                {/* Column name */}
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: TOKEN.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {field.column}
                </Text>

                {/* Agg function dropdown */}
                <Select
                  value={field.func}
                  onChange={(val: AggFunction) => updateAggField(field.id, { func: val })}
                  size="small"
                  getPopupContainer={() => document.body}
                  className="nodrag"
                  popupClassName="nodrag"
                  style={{ width: '100%' }}
                >
                  {AGG_OPTIONS.map((opt) => (
                    <Select.Option key={opt.value} value={opt.value}>
                      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{opt.label}</span>
                    </Select.Option>
                  ))}
                </Select>

                {/* DISTINCT checkbox */}
                <Checkbox
                  checked={field.distinct ?? false}
                  onChange={(e) =>
                    updateAggField(field.id, { distinct: e.target.checked })
                  }
                  style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                >
                  去重
                </Checkbox>

                {/* Alias input */}
                <Input
                  value={field.alias}
                  onChange={(e) => updateAggField(field.id, { alias: e.target.value })}
                  size="small"
                  placeholder="结果别名"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${field.alias.trim() ? TOKEN.borderMid : TOKEN.textError}`,
                    color: TOKEN.textPrimary,
                    borderRadius: TOKEN.radius,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Section 2: 分组显示 ────────────────────────────────────────────── */}
      <Section
        icon={<GroupOutlined />}
        title="分组显示"
        right={
          <Switch
            checked={groupByEnabled}
            onChange={setGroupByEnabled}
            size="small"
            style={groupByEnabled ? { background: TOKEN.primary } : {}}
          />
        }
      >
        {groupByEnabled ? (
          <>
            <Select
              mode="multiple"
              placeholder={
                <span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择分组列</span>
              }
              value={groupByColumns}
              onChange={setGroupByColumns}
              style={selectStyle}
              size="small"
              getPopupContainer={() => document.body}
              className="nodrag"
              popupClassName="nodrag"
              notFoundContent={
                <span style={{ fontSize: 11, color: TOKEN.textMuted }}>
                  {selectedStatCols.length === columns.length
                    ? '所有列已作为统计列'
                    : '无可用列'}
                </span>
              }
            >
              {groupByAvailableCols.map((col) => (
                <Select.Option key={col} value={col}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{col}</span>
                </Select.Option>
              ))}
            </Select>
            <Text
              style={{
                display: 'block',
                marginTop: 6,
                fontSize: 11,
                color: TOKEN.textMuted,
              }}
            >
              分组列将自动包含在结果中
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>开启后可按指定列分组统计</Text>
        )}
      </Section>

      {/* ── Section 3: 结果过滤 ─────────────────────────────────────────────── */}
      <Section icon={<FilterOutlined />} title="结果过滤">
        {havingFilters.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {havingFilters.map((filter) => (
              <div
                key={filter.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 72px 120px 28px',
                  gap: 6,
                  alignItems: 'center',
                  padding: '4px 6px',
                  background: TOKEN.bgRow,
                  borderRadius: TOKEN.radius,
                  border: `1px solid ${TOKEN.borderSubtle}`,
                }}
              >
                {/* Result alias dropdown */}
                <Select
                  value={filter.resultAlias || undefined}
                  onChange={(val: string) =>
                    updateHavingFilter(filter.id, { resultAlias: val })
                  }
                  size="small"
                  placeholder={
                    <span style={{ color: TOKEN.textMuted, fontSize: 11 }}>选择统计结果</span>
                  }
                  getPopupContainer={() => document.body}
                  className="nodrag"
                  popupClassName="nodrag"
                  style={{ width: '100%' }}
                  notFoundContent={
                    <span style={{ fontSize: 11, color: TOKEN.textMuted }}>请先配置统计列</span>
                  }
                >
                  {aliasOptions.map((alias) => (
                    <Select.Option key={alias} value={alias}>
                      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{alias}</span>
                    </Select.Option>
                  ))}
                </Select>

                {/* Operator dropdown */}
                <Select
                  value={filter.operator}
                  onChange={(val: HavingFilter['operator']) =>
                    updateHavingFilter(filter.id, { operator: val })
                  }
                  size="small"
                  getPopupContainer={() => document.body}
                  className="nodrag"
                  popupClassName="nodrag"
                  style={{ width: '100%' }}
                >
                  {OPERATOR_OPTIONS.map((opt) => (
                    <Select.Option key={opt.value} value={opt.value}>
                      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{opt.label}</span>
                    </Select.Option>
                  ))}
                </Select>

                {/* Number input */}
                <InputNumber
                  value={filter.value}
                  onChange={(val) =>
                    updateHavingFilter(filter.id, { value: val ?? 0 })
                  }
                  size="small"
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${TOKEN.borderMid}`,
                    borderRadius: TOKEN.radius,
                  }}
                />

                {/* Delete button */}
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined style={{ fontSize: 11, color: '#cf1322' }} />}
                  onClick={() => removeHavingFilter(filter.id)}
                  style={{ padding: '2px 3px', minWidth: 'unset', height: 22, borderRadius: 4 }}
                />
              </div>
            ))}
          </div>
        )}

        <Button
          type="dashed"
          icon={<PlusOutlined style={{ fontSize: 12 }} />}
          onClick={addHavingFilter}
          style={addBtnStyle}
        >
          添加过滤条件
        </Button>
      </Section>

      {/* ── Section 4: 排序显示 ─────────────────────────────────────────────── */}
      <Section
        icon={<SortAscendingOutlined />}
        title="排序显示"
        right={
          <Switch
            checked={sortEnabled}
            onChange={setSortEnabled}
            size="small"
            style={sortEnabled ? { background: TOKEN.primary } : {}}
          />
        }
      >
        {sortEnabled ? (
          <>
            {sortConfigs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {sortConfigs.map((sort) => (
                  <div
                    key={sort.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px 28px',
                      gap: 6,
                      alignItems: 'center',
                      padding: '4px 6px',
                      background: TOKEN.bgRow,
                      borderRadius: TOKEN.radius,
                      border: `1px solid ${TOKEN.borderSubtle}`,
                    }}
                  >
                    {/* Column dropdown */}
                    <Select
                      value={sort.column || undefined}
                      onChange={(val: string) => updateSortConfig(sort.id, { column: val })}
                      size="small"
                      placeholder={
                        <span style={{ color: TOKEN.textMuted, fontSize: 11 }}>选择排序列</span>
                      }
                      getPopupContainer={() => document.body}
                      className="nodrag"
                      popupClassName="nodrag"
                      style={{ width: '100%' }}
                      notFoundContent={
                        <span style={{ fontSize: 11, color: TOKEN.textMuted }}>
                          请先配置统计列或分组列
                        </span>
                      }
                    >
                      {sortAvailableCols.map((col) => (
                        <Select.Option key={col} value={col}>
                          <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{col}</span>
                        </Select.Option>
                      ))}
                    </Select>

                    {/* Direction select */}
                    <Select
                      value={sort.direction}
                      onChange={(val: 'ASC' | 'DESC') =>
                        updateSortConfig(sort.id, { direction: val })
                      }
                      size="small"
                      getPopupContainer={() => document.body}
                      className="nodrag"
                      popupClassName="nodrag"
                      style={{ width: '100%' }}
                    >
                      <Select.Option value="ASC">
                        <span style={{ fontSize: 12 }}>升序</span>
                      </Select.Option>
                      <Select.Option value="DESC">
                        <span style={{ fontSize: 12 }}>降序</span>
                      </Select.Option>
                    </Select>

                    {/* Delete button */}
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined style={{ fontSize: 11, color: '#cf1322' }} />}
                      onClick={() => removeSortConfig(sort.id)}
                      style={{
                        padding: '2px 3px',
                        minWidth: 'unset',
                        height: 22,
                        borderRadius: 4,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <Button
              type="dashed"
              icon={<PlusOutlined style={{ fontSize: 12 }} />}
              onClick={addSortConfig}
              style={addBtnStyle}
            >
              添加排序项
            </Button>
          </>
        ) : (
          <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>开启后可对统计结果排序</Text>
        )}
      </Section>

      {/* ── Validation errors ──────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: '8px 12px',
            background: 'rgba(255, 77, 79, 0.08)',
            borderRadius: TOKEN.radius,
            border: '1px solid rgba(255, 77, 79, 0.25)',
          }}
        >
          {errors.map((err) => (
            <Text key={err} style={{ display: 'block', fontSize: 12, color: TOKEN.textError }}>
              {err}
            </Text>
          ))}
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
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
              borderColor: 'rgba(255,255,255,0.12)',
              color: TOKEN.textSecondary,
              background: 'rgba(255,255,255,0.03)',
              transition: 'border-color 0.18s ease, color 0.18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKEN.primary;
              e.currentTarget.style.color = TOKEN.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = TOKEN.textSecondary;
            }}
          >
            取消
          </Button>
        </Space>
      </div>
    </Drawer>
  );
};
