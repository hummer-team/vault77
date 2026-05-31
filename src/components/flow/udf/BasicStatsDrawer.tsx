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
  TableNodeData,
} from '../../../services/flow/types';
import { FlowNodeType } from '../../../services/flow/types';
import { useFlowStore } from '../../../stores/flowStore';
import { TOKEN } from '../../../theme';

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

const TIME_TYPES = ['DATE', 'TIMESTAMP', 'DATETIME', 'TIMESTAMPTZ', 'TIMESTAMPNTZ'];

// ============================================================================
// Helpers
// ============================================================================

function isTimeType(columnType?: string): boolean {
  if (!columnType) return false;
  return TIME_TYPES.some((t) => columnType.toUpperCase().includes(t));
}

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
  const nodes = useFlowStore((state) => state.nodes);

  // ── Get column type information ─────────────────────────────────────────────
  const columnTypeMap = useMemo(() => {
    const typeMap: Record<string, string | undefined> = {};
    for (const node of nodes) {
      if (node.type === FlowNodeType.TABLE) {
        const data = node.data as TableNodeData;
        if (data.tableName === tableName) {
          for (const field of data.fields ?? []) {
            typeMap[field.name] = field.type;
          }
          break;
        }
      }
    }
    return typeMap;
  }, [nodes, tableName]);

  // ── Stat columns & agg fields ───────────────────────────────────────────────
  const [selectedStatCols, setSelectedStatCols] = useState<string[]>([]);
  const [aggFields, setAggFields] = useState<AggFieldConfig[]>([]);

  // ── Group-by ────────────────────────────────────────────────────────────────
  const [groupByEnabled, setGroupByEnabled] = useState(false);
  const [groupByColumns, setGroupByColumns] = useState<string[]>([]);
  const [groupByGranularities, setGroupByGranularities] = useState<Record<string, 'year' | 'quarter' | 'month' | 'week' | 'day'>>({});
  const [columnPrecision, setColumnPrecision] = useState<Record<string, number>>({});
  const [columnPrecisionStrategy, setColumnPrecisionStrategy] = useState<Record<string, 'ROUND' | 'TRUNCATE'>>({});

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
      
      // Initialize groupByGranularities: fill missing values with defaults for time columns
      const granularities = initialConfig.groupByGranularities ?? {};
      const completeGranularities = { ...granularities };
      for (const col of initialConfig.groupByColumns) {
        if (completeGranularities[col] === undefined) {
          const colType = columnTypeMap[col];
          if (isTimeType(colType)) {
            completeGranularities[col] = 'month';
          }
        }
      }
      setGroupByGranularities(completeGranularities);
      
      // Initialize columnPrecision: fill missing values with default
      const precision = initialConfig.columnPrecision ?? {};
      const completePrecision = { ...precision };
      for (const field of initialConfig.aggFields) {
        if (completePrecision[field.column] === undefined) {
          completePrecision[field.column] = 4;
        }
      }
      setColumnPrecision(completePrecision);
      
      // Initialize columnPrecisionStrategy: fill missing values with default
      const strategy = initialConfig.columnPrecisionStrategy ?? {};
      const completeStrategy = { ...strategy };
      for (const field of initialConfig.aggFields) {
        if (completeStrategy[field.column] === undefined) {
          completeStrategy[field.column] = 'ROUND';
        }
      }
      setColumnPrecisionStrategy(completeStrategy);
      
      setHavingFilters(initialConfig.havingFilters);
      setSortEnabled(initialConfig.sortConfigs.length > 0);
      setSortConfigs(initialConfig.sortConfigs);
    } else {
      setSelectedStatCols([]);
      setAggFields([]);
      setGroupByEnabled(false);
      setGroupByColumns([]);
      setGroupByGranularities({});
      setColumnPrecision({});
      setColumnPrecisionStrategy({});
      setHavingFilters([]);
      setSortEnabled(false);
      setSortConfigs([]);
    }
  }, [open, initialConfig, columnTypeMap]);

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
      
      // Initialize precision and strategy for new fields
      const newFieldCols = newFields.map((f) => f.column);
      if (newFieldCols.length > 0) {
        setColumnPrecision((prev) => {
          const updated = { ...prev };
          newFieldCols.forEach((col) => {
            if (updated[col] === undefined) {
              updated[col] = 4;
            }
          });
          return updated;
        });
        setColumnPrecisionStrategy((prev) => {
          const updated = { ...prev };
          newFieldCols.forEach((col) => {
            if (updated[col] === undefined) {
              updated[col] = 'ROUND';
            }
          });
          return updated;
        });
      }
      
      return [...retained, ...newFields];
    });
    // Remove group-by columns that were just selected as stat cols
    setGroupByColumns((prev) => prev.filter((c) => !cols.includes(c)));
  }, []);

  const updateAggField = useCallback(
    (id: string, patch: Partial<AggFieldConfig>) => {
      setAggFields((prev) => {
        const field = prev.find((f) => f.id === id);
        if (!field) return prev;

        // Read old alias from live prev state, not from closure
        const oldAlias = field.alias;
        const updated = { ...field, ...patch };

        // Auto-regenerate alias when func changes, unless user already edited it
        if (patch.func && updated.alias === defaultAlias(field.func, field.column)) {
          updated.alias = defaultAlias(patch.func, updated.column);
        }

        const newAlias = updated.alias;

        // Cascade alias → havingFilters and sortConfigs after this update commits
        if (newAlias !== oldAlias) {
          queueMicrotask(() => {
            setHavingFilters((filters) =>
              filters.map((f) =>
                f.resultAlias === oldAlias ? { ...f, resultAlias: newAlias } : f
              )
            );
            setSortConfigs((sorts) =>
              sorts.map((s) =>
                s.column === oldAlias ? { ...s, column: newAlias } : s
              )
            );
          });
        }

        return prev.map((f) => (f.id === id ? updated : f));
      });
    },
    [setHavingFilters, setSortConfigs]
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

    // ── Auto-fill missing granularities for time columns before validation ──
    let finalGranularities = { ...groupByGranularities };
    if (groupByEnabled) {
      for (const col of groupByColumns) {
        const colType = columnTypeMap[col];
        if (isTimeType(colType) && !finalGranularities[col]) {
          finalGranularities[col] = 'month';
        }
      }
    }

    // Validate granularities for time-type groupBy columns
    if (groupByEnabled) {
      for (const col of groupByColumns) {
        const colType = columnTypeMap[col];
        if (isTimeType(colType) && !finalGranularities[col]) {
          errs.push(`分组列 "${col}" 是时间类型，必须选择粒度`);
        }
      }
    }

    // Validate precision for numeric aggregation columns
    for (const field of aggFields) {
      // SUM, AVG, MAX, MIN always require precision to be set
      if (['SUM', 'AVG', 'MAX', 'MIN'].includes(field.func)) {
        if (columnPrecision[field.column] === undefined) {
          errs.push(`聚合列 "${field.column}"(${field.func}) 必须设置精度值`);
        }
      }
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
    // Update state and pass completed granularities to onConfirm
    setGroupByGranularities(finalGranularities);
    onConfirm({
      tableName,
      aggFields,
      groupByColumns: groupByEnabled ? groupByColumns : [],
      groupByGranularities: groupByEnabled ? finalGranularities : {},
      columnPrecision,
      columnPrecisionStrategy,
      havingFilters,
      sortConfigs: sortEnabled ? sortConfigs : [],
    });
  }, [
    aggFields,
    havingFilters,
    groupByEnabled,
    groupByColumns,
    groupByGranularities,
    columnPrecision,
    columnPrecisionStrategy,
    sortEnabled,
    sortConfigs,
    tableName,
    onConfirm,
    columnTypeMap,
  ]);

  // ============================================================================
  // Render
  // ============================================================================

  const addBtnStyle: React.CSSProperties = {
    width: '100%',
    borderColor: 'var(--vm-primary-light)',
    color: TOKEN.textSecondary,
    background: 'var(--vm-primary-light)',
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
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--vm-text-primary)' }}>基础统计分析</span>
          </div>
        </div>
      }
      placement="right"
      width={620}
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
          padding: '22px 26px 28px',
          overflowX: 'hidden',
        },
      }}
      drawerStyle={{
        background: TOKEN.bgBase,
        borderLeft: '1px solid var(--vm-border-mid)',
        boxShadow: 'var(--vm-flow-shadow-drawer)',
      }}
    >
      {/* ── Section 1: Select Statistical Columns ──────────────────────────────────────────── */}
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
          showSearch
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
                gridTemplateColumns: '80px 80px auto 1fr 60px 120px',
                gap: 6,
                padding: '4px 6px',
                background: 'var(--vm-surface-lighter)',
                borderRadius: TOKEN.radius,
              }}
            >
              {(['列名', '统计函数', '去重', '别名', '精度', '策略'] as const).map((label) => (
                <Text
                  key={label}
                  style={{
                    fontSize: 10,
                    color: TOKEN.textSecondary,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    textAlign: label === '别名' ? 'left' : undefined,
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
                  gridTemplateColumns: '80px 80px auto 1fr 60px 120px',
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
                />

                {/* Alias input */}
                <Input
                  value={field.alias}
                  onChange={(e) => updateAggField(field.id, { alias: e.target.value })}
                  size="small"
                  placeholder="结果别名"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    background: 'var(--vm-surface-light)',
                    border: `1px solid ${field.alias.trim() ? TOKEN.borderMid : TOKEN.textError}`,
                    color: TOKEN.textPrimary,
                    borderRadius: TOKEN.radius,
                  }}
                />

                {/* Precision (for SUM, AVG, MAX, MIN) */}
                {['SUM', 'AVG', 'MAX', 'MIN'].includes(field.func) ? (
                  <InputNumber
                    value={columnPrecision[field.column] ?? 4}
                    onChange={(val) => {
                      const finalVal = val === null || val === undefined ? 4 : val;
                      setColumnPrecision((prev) => ({
                        ...prev,
                        [field.column]: finalVal,
                      }));
                    }}
                    min={0}
                    max={10}
                    style={{ width: '100%' }}
                    size="small"
                  />
                ) : (
                  <span style={{ fontSize: 10, color: TOKEN.textMuted }}>-</span>
                )}

                {/* Precision Strategy (for SUM, AVG, MAX, MIN) */}
                {['SUM', 'AVG', 'MAX', 'MIN'].includes(field.func) ? (
                  <Select
                    value={columnPrecisionStrategy[field.column] ?? 'ROUND'}
                    onChange={(val) =>
                      setColumnPrecisionStrategy((prev) => ({
                        ...prev,
                        [field.column]: val,
                      }))
                    }
                    style={{ width: '100%' }}
                    size="small"
                    options={[
                      { label: '四舍五入 (ROUND)', value: 'ROUND' },
                      { label: '截断 (TRUNCATE)', value: 'TRUNCATE' },
                    ]}
                  />
                ) : (
                  <span style={{ fontSize: 10, color: TOKEN.textMuted }}>-</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>


      {/* ── Section 2: Group Display ────────────────────────────────────────────── */}
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
            {/* Group-by Configuration Table */}
            {groupByColumns.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {/* Table Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 140px 140px auto',
                    gap: 6,
                    padding: '4px 6px',
                    background: 'var(--vm-surface-lighter)',
                    borderRadius: TOKEN.radius,
                    marginBottom: 6,
                  }}
                >
                  {(['列名', '类型', '分组粒度', ''] as const).map((label) => (
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

                {/* Table Rows */}
                {groupByColumns.map((col) => {
                  const colType = columnTypeMap[col];
                  const isTimeCol = isTimeType(colType);

                  return (
                    <div
                      key={col}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 140px 140px auto',
                        gap: 6,
                        alignItems: 'center',
                        padding: '4px 6px',
                        background: TOKEN.bgRow,
                        borderRadius: TOKEN.radius,
                        border: `1px solid ${TOKEN.borderSubtle}`,
                        marginBottom: 6,
                      }}
                    >
                      {/* Column name dropdown */}
                      <Select
                        value={col}
                        onChange={(val) => {
                          setGroupByColumns((prev) =>
                            prev.map((c) => (c === col ? val : c))
                          );
                        }}
                        style={{ width: '100%' }}
                        size="small"
                        getPopupContainer={() => document.body}
                        className="nodrag"
                        popupClassName="nodrag"
                        showSearch
                      >
                        {groupByAvailableCols.map((c) => (
                          <Select.Option key={c} value={c}>
                            <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{c}</span>
                          </Select.Option>
                        ))}
                      </Select>

                      {/* Type (read-only) */}
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: TOKEN.textSecondary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {colType ?? 'unknown'}
                      </Text>

                      {/* Granularity dropdown (disabled for non-time columns) */}
                      {isTimeCol ? (
                        <Select
                          value={groupByGranularities[col] ?? 'month'}
                          onChange={(val) =>
                            setGroupByGranularities((prev) => ({
                              ...prev,
                              [col]: val,
                            }))
                          }
                          style={{ width: '100%' }}
                          size="small"
                          getPopupContainer={() => document.body}
                          className="nodrag"
                          popupClassName="nodrag"
                          options={[
                            { label: 'Year', value: 'year' },
                            { label: 'Quarter', value: 'quarter' },
                            { label: 'Month', value: 'month' },
                            { label: 'Week', value: 'week' },
                            { label: 'Day', value: 'day' },
                          ]}
                        />
                      ) : (
                        <Select
                          disabled
                          value={undefined}
                          style={{
                            width: '100%',
                            color: TOKEN.textMuted,
                            opacity: 0.5,
                          }}
                          size="small"
                          placeholder="-"
                        />
                      )}

                      {/* Delete button */}
                      <Button
                        type="text"
                        icon={<DeleteOutlined />}
                        size="small"
                        onClick={() =>
                          setGroupByColumns((prev) => prev.filter((c) => c !== col))
                        }
                        style={{ color: TOKEN.textError }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Group Button */}
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => {
                // Add first available column that's not already in groupByColumns
                const availableCol = groupByAvailableCols.find(
                  (c) => !groupByColumns.includes(c)
                );
                if (availableCol) {
                  setGroupByColumns((prev) => [...prev, availableCol]);
                  
                  // Initialize granularity for time columns
                  const colType = columnTypeMap[availableCol];
                  if (isTimeType(colType)) {
                    setGroupByGranularities((prev) => ({
                      ...prev,
                      [availableCol]: 'month',
                    }));
                  }
                }
              }}
              disabled={groupByAvailableCols.length === 0}
              style={{ width: '100%' }}
            >
              添加分组
            </Button>

            {groupByColumns.length > 0 && (
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
            )}
          </>
        ) : (
          <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>开启后可按指定列分组统计</Text>
        )}
      </Section>

      {/* ── Section 3: Result Filtering ─────────────────────────────────────────────── */}
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
                    background: 'var(--vm-surface-light)',
                    border: `1px solid ${TOKEN.borderMid}`,
                    borderRadius: TOKEN.radius,
                  }}
                />

                {/* Delete button */}
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined style={{ fontSize: 11, color: 'var(--vm-color-error)' }} />}
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

      {/* ── Section 4: Sort Display ─────────────────────────────────────────────── */}
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
                      icon={<DeleteOutlined style={{ fontSize: 11, color: 'var(--vm-color-error)' }} />}
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
            background: 'var(--vm-flow-error-light)',
            borderRadius: TOKEN.radius,
            border: '1px solid var(--vm-flow-error-light)',
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
  );
};
