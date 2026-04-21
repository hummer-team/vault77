/**
 * ReplaceColumnDrawer
 * Configuration drawer for the "替换特定列值" (udf_replace_spec_column_value) operator.
 * UI layout follows design/img/img_33.png.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Drawer,
  Button,
  Select,
  Input,
  Switch,
  Space,
  Typography,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  RedoOutlined,
  CloseOutlined,
  SwapOutlined,
  DatabaseOutlined,
  ColumnWidthOutlined,
  FilterOutlined,
  EditOutlined,
  CheckOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import { getAvailableTables, getTableSchema } from '../../../services/flow/flowService';
import type { ReplaceRule } from '../../../services/flow/types';
import { resolveColumnConflicts } from '../../../services/flow/strategies/columnRenaming';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

interface ReplaceColumnDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Called when user confirms; returns the configured replacement rules and output columns */
  onConfirm: (rules: ReplaceRule[], outputColumns: string[]) => void;
  /** Current rules to pre-populate (e.g., from existing node data) */
  initialRules?: ReplaceRule[];
  /** Selected output columns to pre-populate; empty = show all */
  initialOutputColumns?: string[];
  /**
   * Upstream configured joined tables derived from the flow canvas.
   * When provided, the drawer's "数据源" and "结果显示" dropdowns are restricted
   * to these tables only (no cache — always reflects the live canvas state).
   * If absent or empty, all available DuckDB tables are shown as fallback.
   */
  joinedTables?: string[];
}

const CONDITION_OPTIONS = [
  { label: '包含', value: 'contains' },
  { label: '全部', value: 'replace_all' },
] as const;

// ============================================================================
// Design tokens (aligned with system global.css + NodeDetailPanel pattern)
// ============================================================================

const TOKEN = {
  bgBase: 'rgba(14, 14, 16, 0.99)',
  bgHeader: 'rgba(22, 20, 18, 0.99)',
  bgSection: 'rgba(255, 255, 255, 0.02)',
  bgRow: 'rgba(255, 255, 255, 0.015)',
  bgRowHover: 'rgba(255, 107, 0, 0.045)',
  bgRowComplete: 'rgba(114, 46, 209, 0.04)',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderMid: 'rgba(255, 255, 255, 0.1)',
  borderPrimary: 'rgba(255, 107, 0, 0.35)',
  borderPurple: 'rgba(114, 46, 209, 0.4)',
  primary: '#FF6B00',
  primaryHover: '#FF8533',
  primaryGlow: 'rgba(255, 107, 0, 0.2)',
  purple: '#722ed1',
  purpleLight: '#b37feb',
  purpleBg: 'rgba(114, 46, 209, 0.12)',
  textPrimary: 'rgba(255, 255, 255, 0.88)',
  textSecondary: 'rgba(255, 255, 255, 0.45)',
  textMuted: 'rgba(255, 255, 255, 0.25)',
  textDanger: '#8c3030',
  success: '#389e0d',
  successLight: 'rgba(56, 158, 13, 0.12)',
  radius: '6px',
  radiusLg: '8px',
};

// ============================================================================
// Helpers
// ============================================================================

function createEmptyRule(): ReplaceRule {
  return {
    id: uuidv4(),
    sourceTable: '',
    targetColumn: [],
    conditionType: 'replace_all',
    conditionValue: '',
    originalValue: '',
    targetValue: '',
    addNewColumn: false,
  };
}

// ============================================================================
// Sub-component: Column header cell
// ============================================================================

const HeaderCell: React.FC<{
  icon?: React.ReactNode;
  label: string;
  width?: number | string;
  required?: boolean;
}> = ({ icon, label, required }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      overflow: 'hidden',
    }}
  >
    {icon && (
      <span style={{ color: TOKEN.textMuted, fontSize: 10, flexShrink: 0 }}>{icon}</span>
    )}
    <Text
      style={{
        fontSize: 10,
        color: TOKEN.textSecondary,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </Text>
    {required && (
      <span style={{ color: TOKEN.primary, fontSize: 10, lineHeight: 1, flexShrink: 0 }}>*</span>
    )}
  </div>
);

// ============================================================================
// Component
// ============================================================================

const ReplaceColumnDrawer: React.FC<ReplaceColumnDrawerProps> = ({
  open,
  onClose,
  onConfirm,
  initialRules,
  initialOutputColumns,
  joinedTables,
}) => {
  const { executeQuery, isDBReady } = useDuckDBContext();

  const [rules, setRules] = useState<ReplaceRule[]>(() =>
    initialRules && initialRules.length > 0 ? initialRules : [createEmptyRule()]
  );

  // Available tables loaded from DuckDB
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  // Per-table column lists: { tableName → column[] }
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>({});
  // Hover state for row highlight
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  // IDs of rows that failed required-field validation
  const [invalidRuleIds, setInvalidRuleIds] = useState<Set<string>>(new Set());
  // Selected output columns (empty = 全部)
  const [outputColumns, setOutputColumns] = useState<string[]>(() =>
    initialOutputColumns && initialOutputColumns.length > 0
      ? initialOutputColumns
      : [...new Set((initialRules ?? []).flatMap((r) => r.targetColumn))]
  );
  // Track previous rule columns for auto-sync (add new / remove gone)
  const prevRuleColumnsRef = useRef<Set<string>>(
    new Set((initialRules ?? []).flatMap((r) => r.targetColumn))
  );

  // ── Load tables when drawer opens ──────────────────────────────────────────
  // `joinedTables` is memoized in the parent and only changes when the canvas
  // join topology changes — so this effect won't thrash on every render.
  // Reset tableColumns on every open/topology-change so stale column data
  // from prior sessions doesn't bleed into a reconfigured join topology.
  useEffect(() => {
    if (!open) return;

    // Clear stale column cache so newly joined tables load fresh column lists
    setTableColumns({});

    if (joinedTables && joinedTables.length > 0) {
      setAvailableTables(joinedTables);
      return;
    }

    if (!isDBReady) return;

    const load = async () => {
      try {
        const tables = await getAvailableTables(executeQuery);
        setAvailableTables(tables);
      } catch (err) {
        console.error('[ReplaceColumnDrawer] Failed to load tables:', err);
      }
    };
    load();
  }, [open, isDBReady, executeQuery, joinedTables]);

  // ── Sync initialRules when drawer re-opens ─────────────────────────────────
  useEffect(() => {
    if (open) {
      setRules(
        initialRules && initialRules.length > 0 ? initialRules : [createEmptyRule()]
      );
      setInvalidRuleIds(new Set());
      const initCols = initialOutputColumns && initialOutputColumns.length > 0
        ? initialOutputColumns
        : [...new Set((initialRules ?? []).flatMap((r) => r.targetColumn))];
      setOutputColumns(initCols);
      prevRuleColumnsRef.current = new Set((initialRules ?? []).flatMap((r) => r.targetColumn));
    }
  }, [open, initialRules, initialOutputColumns]);

  // ── All columns available for output display (resolved for multi-table conflicts) ──
  // Uses ALL joined tables (availableTables), not just those referenced in rules,
  // so the "结果显示" dropdown always shows tb1.col / tb2.col for all joined tables.
  // Also exposes colConflictMap so auto-sync can map raw rule columns to resolved names.
  const { allDisplayableColumns, colConflictMap } = useMemo(() => {
    // Use all available (joined) tables for full conflict resolution
    const tablesWithCols = availableTables
      .filter((t) => tableColumns[t])
      .map((t) => ({ name: t, columns: tableColumns[t] }));

    if (tablesWithCols.length === 0) return { allDisplayableColumns: [], colConflictMap: new Map<string, Map<string, string>>() };
    if (tablesWithCols.length === 1) return { allDisplayableColumns: tablesWithCols[0].columns, colConflictMap: new Map<string, Map<string, string>>() };

    // Multi-table: apply conflict resolution to get the actual aliased column names
    const conflictMap = resolveColumnConflicts(tablesWithCols);
    const cols: string[] = [];
    for (const colMap of conflictMap.values()) {
      for (const alias of colMap.values()) {
        if (!cols.includes(alias)) cols.push(alias);
      }
    }
    return { allDisplayableColumns: cols, colConflictMap: conflictMap };
  }, [availableTables, tableColumns]);

  // ── Auto-sync outputColumns when rules' targetColumns change ───────────────
  useEffect(() => {
    // Resolve raw column names (from rules) to their display names (conflict-resolved)
    const resolveDisplayName = (tableName: string, rawCol: string): string => {
      const tableMap = colConflictMap.get(tableName);
      return tableMap?.get(rawCol) ?? rawCol;
    };

    const newRuleColumns = new Set(
      rules.flatMap((r) =>
        r.targetColumn.filter(Boolean).map((col) => resolveDisplayName(r.sourceTable, col))
      )
    );
    const prev = prevRuleColumnsRef.current;

    setOutputColumns((prevOut) => {
      let next = [...prevOut];
      // Add columns newly appeared in rules (using resolved names)
      for (const col of newRuleColumns) {
        if (!next.includes(col)) next.push(col);
      }
      // Remove columns that left ALL rules (were previously auto-derived)
      const removedFromRules = [...prev].filter((c) => !newRuleColumns.has(c));
      next = next.filter((c) => !removedFromRules.includes(c));
      return next.length !== prevOut.length || removedFromRules.length > 0 ? next : prevOut;
    });

    prevRuleColumnsRef.current = newRuleColumns;
  }, [rules, colConflictMap]);
  const loadColumns = useCallback(
    async (tableName: string) => {
      if (!tableName || tableColumns[tableName]) return;
      try {
        const schema = await getTableSchema(tableName, executeQuery);
        setTableColumns((prev) => ({
          ...prev,
          [tableName]: schema.fields.map((f) => f.name),
        }));
      } catch (err) {
        console.error(`[ReplaceColumnDrawer] Failed to load columns for ${tableName}:`, err);
      }
    },
    [executeQuery, tableColumns]
  );

  // ── Eagerly load columns for ALL available tables when the table list changes ──
  // This ensures resolveColumnConflicts sees all joined tables and produces
  // consistent tb1.col / tb2.col aliases for the "结果显示" dropdown.
  useEffect(() => {
    if (!open || !isDBReady || availableTables.length === 0) return;
    availableTables.forEach((t) => {
      if (!tableColumns[t]) {
        getTableSchema(t, executeQuery)
          .then((schema) => {
            setTableColumns((prev) => ({
              ...prev,
              [t]: schema.fields.map((f) => f.name),
            }));
          })
          .catch((err) => console.error(`[ReplaceColumnDrawer] Eager load failed for ${t}:`, err));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, availableTables, isDBReady]);

  // ── Rule mutation helpers ──────────────────────────────────────────────────

  const updateRule = useCallback((id: string, patch: Partial<ReplaceRule>) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
    // Clear validation error on the row when user fills in any required field
    const requiredKeys: (keyof ReplaceRule)[] = ['sourceTable', 'targetColumn', 'originalValue', 'conditionType'];
    if (requiredKeys.some((k) => k in patch)) {
      setInvalidRuleIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const addRule = useCallback(() => {
    setRules((prev) => [...prev, createEmptyRule()]);
  }, []);

  const removeRule = useCallback((id: string) => {
    setRules((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }, []);

  const resetRule = useCallback((id: string) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...createEmptyRule(), id: r.id, sourceTable: r.sourceTable, targetColumn: r.targetColumn }
          : r
      )
    );
  }, []);

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    // Validate required fields: sourceTable (*), targetColumn (*), originalValue (* unless replace_all)
    const failedIds = rules
      .filter(
        (r) =>
          !r.sourceTable ||
          r.targetColumn.length === 0 ||
          (r.conditionType !== 'replace_all' && !r.originalValue.trim())
      )
      .map((r) => r.id);

    if (failedIds.length > 0) {
      setInvalidRuleIds(new Set(failedIds));
      return;
    }

    setInvalidRuleIds(new Set());
    onConfirm(rules, outputColumns);
  }, [rules, outputColumns, onConfirm]);

  // ============================================================================
  // Render helpers
  // ============================================================================

  const renderRuleRow = (rule: ReplaceRule, index: number) => {
    const columns = tableColumns[rule.sourceTable] ?? [];
    const isHovered = hoveredRowId === rule.id;
    const isInvalid = invalidRuleIds.has(rule.id);

    return (
      <div
        key={rule.id}
        onMouseEnter={() => setHoveredRowId(rule.id)}
        onMouseLeave={() => setHoveredRowId(null)}
        style={{
          display: 'grid',
          gridTemplateColumns: '26px 1fr 104px 104px 92px 92px 56px 44px',
          gap: '5px',
          alignItems: 'center',
          marginBottom: 5,
          padding: '8px 10px',
          background: isInvalid
            ? 'rgba(255, 107, 0, 0.06)'
            : isHovered
            ? TOKEN.bgRowHover
            : TOKEN.bgRow,
          borderRadius: TOKEN.radius,
          border: `1px solid ${
            isInvalid
              ? TOKEN.primary
              : isHovered
              ? TOKEN.borderPrimary
              : TOKEN.borderSubtle
          }`,
          transition: 'background 0.18s ease, border-color 0.18s ease',
          boxShadow: isInvalid ? `0 0 0 1px rgba(255,107,0,0.25)` : undefined,
        }}
      >
        {/* Row number badge */}
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              color: TOKEN.textSecondary,
              fontFamily: 'monospace',
              lineHeight: 1,
              fontWeight: 700,
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </Text>
        </div>

        {/* Data source — required (*) */}
        <Select
          placeholder={
            <span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择数据源</span>
          }
          value={rule.sourceTable || undefined}
          onChange={(val) => {
            updateRule(rule.id, { sourceTable: val, targetColumn: [] });
            loadColumns(val);
          }}
          style={{ width: '100%' }}
          className="nodrag"
          getPopupContainer={() => document.body}
          popupClassName="nodrag"
          size="small"
          suffixIcon={
            <DatabaseOutlined style={{ color: TOKEN.textMuted, fontSize: 10 }} />
          }
        >
          {availableTables.map((t) => (
            <Select.Option key={t} value={t}>
              <Space size={5}>
                <DatabaseOutlined style={{ color: TOKEN.primary, fontSize: 10 }} />
                <span style={{ fontSize: 12 }}>{t}</span>
              </Space>
            </Select.Option>
          ))}
        </Select>

        {/* Target column — multi-select, required (*) */}
        <Select
          mode="multiple"
          menuItemSelectedIcon={null}
          placeholder={
            <span style={{ color: TOKEN.textMuted, fontSize: 12 }}>
              {rule.sourceTable ? '选择列' : '—'}
            </span>
          }
          value={rule.targetColumn}
          onChange={(val: string[]) => updateRule(rule.id, { targetColumn: val })}
          style={{ width: '100%' }}
          className="nodrag"
          getPopupContainer={() => document.body}
          popupClassName="nodrag"
          size="small"
          disabled={!rule.sourceTable}
          maxTagCount={0}
          maxTagPlaceholder={() => {
            const cols = rule.targetColumn;
            if (cols.length === 0) return null;
            return (
              <span style={{ fontSize: 11, color: TOKEN.textPrimary }}>
                {cols[0]}
                {cols.length > 1 && (
                  <span style={{ color: TOKEN.primary, fontWeight: 600, marginLeft: 2 }}>
                    +{cols.length - 1}
                  </span>
                )}
              </span>
            );
          }}
          suffixIcon={
            <ColumnWidthOutlined
              style={{
                color: rule.sourceTable ? TOKEN.textSecondary : TOKEN.textMuted,
                fontSize: 10,
              }}
            />
          }
        >
          {columns.map((col) => {
            const isSelected = rule.targetColumn.includes(col);
            return (
              <Select.Option key={col} value={col}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{col}</span>
                  {isSelected && (
                    <CheckOutlined style={{ fontSize: 11, color: TOKEN.primary, flexShrink: 0 }} />
                  )}
                </div>
              </Select.Option>
            );
          })}
        </Select>

        {/* Condition type */}
        <Select
          value={rule.conditionType}
          onChange={(val) => updateRule(rule.id, { conditionType: val, conditionValue: '' })}
          style={{ width: '100%' }}
          className="nodrag"
          getPopupContainer={() => document.body}
          popupClassName="nodrag"
          size="small"
          suffixIcon={
            <FilterOutlined style={{ color: TOKEN.textMuted, fontSize: 10 }} />
          }
        >
          {CONDITION_OPTIONS.map((opt) => (
            <Select.Option key={opt.value} value={opt.value}>
              <span style={{ fontSize: 12 }}>{opt.label}</span>
            </Select.Option>
          ))}
        </Select>

        {/* Original value — disabled when conditionType is 'replace_all' (entire column overwrite) */}
        <Input
          placeholder="原始值"
          value={rule.originalValue}
          disabled={rule.conditionType === 'replace_all'}
          onChange={(e) => updateRule(rule.id, { originalValue: e.target.value })}
          size="small"
          style={{ fontSize: 12 }}
          prefix={
            <EditOutlined style={{ color: TOKEN.textMuted, fontSize: 9 }} />
          }
        />

        {/* Target value */}
        <Input
          placeholder="替换为"
          value={rule.targetValue}
          onChange={(e) => updateRule(rule.id, { targetValue: e.target.value })}
          size="small"
          style={{ fontSize: 12 }}
          prefix={
            <SwapOutlined style={{ color: rule.targetValue ? TOKEN.primary : TOKEN.textMuted, fontSize: 9 }} />
          }
        />

        {/* Add new column toggle */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <Switch
            checked={rule.addNewColumn}
            onChange={(checked) => updateRule(rule.id, { addNewColumn: checked })}
            size="small"
            style={
              rule.addNewColumn
                ? { background: TOKEN.purple }
                : {}
            }
          />
          <Text
            style={{
              fontSize: 9,
              color: rule.addNewColumn ? TOKEN.purpleLight : TOKEN.textMuted,
              lineHeight: 1,
              letterSpacing: '0.02em',
              transition: 'color 0.18s ease',
            }}
          >
            {rule.addNewColumn ? '新增列' : '覆盖'}
          </Text>
        </div>

        {/* Action buttons: reset + delete */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            opacity: isHovered ? 1 : 0.4,
            transition: 'opacity 0.18s ease',
          }}
        >
          <Tooltip placement="top">
            <Button
              type="text"
              size="small"
              icon={
                <RedoOutlined style={{ fontSize: 11, color: TOKEN.textSecondary }} />
              }
              onClick={() => resetRule(rule.id)}
              style={{
                padding: '2px 3px',
                minWidth: 'unset',
                height: 22,
                borderRadius: 4,
              }}
            />
          </Tooltip>
          <Tooltip placement="top">
            <Button
              type="text"
              size="small"
              icon={
                <DeleteOutlined
                  style={{
                    fontSize: 11,
                    color: rules.length <= 1 ? TOKEN.textMuted : '#cf1322',
                  }}
                />
              }
              onClick={() => removeRule(rule.id)}
              disabled={rules.length <= 1}
              style={{
                padding: '2px 3px',
                minWidth: 'unset',
                height: 22,
                borderRadius: 4,
              }}
            />
          </Tooltip>
        </div>
      </div>
    );
  };

  // ============================================================================
  // Main render
  // ============================================================================

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Icon badge */}
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
            <SwapOutlined style={{ color: TOKEN.primary, fontSize: 14 }} />
          </div>

          {/* Breadcrumb: plain text, no borders */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#fff' }}>数据清洗</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>/</span>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#fff' }}>替换特定列值</span>
          </div>
        </div>
      }
      placement="right"
      width={880}
      open={open}
      onClose={onClose}
      closable
      closeIcon={
        <CloseOutlined
          style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}
        />
      }
      style={{ background: 'transparent' }}
      styles={{
        header: {
          background: TOKEN.bgHeader,
          borderBottom: `1px solid rgba(68, 64, 60, 0.5)`,
          padding: '13px 20px',
          boxShadow: `inset 0 -1px 0 rgba(255, 107, 0, 0.06)`,
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
        borderLeft: `1px solid rgba(68, 64, 60, 0.55)`,
        boxShadow: `-6px 0 32px rgba(0, 0, 0, 0.6), -1px 0 0 rgba(255, 107, 0, 0.07)`,
      }}
    >

      {/* ── Build section ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14 }}>

        {/* Left label */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 36,
            gap: 6,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: TOKEN.textMuted,
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            构建规则
          </Text>
        </div>

        {/* Right: header + rows + add button */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Column headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '26px 1fr 104px 104px 92px 92px 56px 44px',
              gap: '5px',
              marginBottom: 8,
              padding: '7px 10px',
              background: 'rgba(255,255,255,0.025)',
              borderRadius: TOKEN.radius,
              border: `1px solid ${TOKEN.borderSubtle}`,
              borderLeft: `3px solid rgba(255, 107, 0, 0.4)`,
            }}
          >
            <div />
            <HeaderCell icon={<DatabaseOutlined />} label="数据源" required />
            <HeaderCell icon={<ColumnWidthOutlined />} label="目标列" required />
            <HeaderCell icon={<FilterOutlined />} label="条件" />
            <HeaderCell icon={<EditOutlined />} label="原值" required />
            <HeaderCell icon={<SwapOutlined />} label="目标值" />
            <HeaderCell label="新增列" />
            <div />
          </div>

          {/* Rule rows */}
          <div style={{ minHeight: 40 }}>
            {rules.map((rule, index) => renderRuleRow(rule, index))}
          </div>

          {/* Add row button */}
          <Button
            type="dashed"
            icon={<PlusOutlined style={{ fontSize: 12 }} />}
            onClick={addRule}
            style={{
              marginTop: 8,
              width: '100%',
              borderColor: 'rgba(255, 107, 0, 0.2)',
              color: TOKEN.textSecondary,
              background: 'rgba(255, 107, 0, 0.03)',
              height: 32,
              fontSize: 12,
              borderRadius: TOKEN.radius,
              transition: 'all 0.18s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                'rgba(255, 107, 0, 0.5)';
              (e.currentTarget as HTMLButtonElement).style.color = TOKEN.primary;
              (e.currentTarget as HTMLButtonElement).style.background =
                'rgba(255, 107, 0, 0.07)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                'rgba(255, 107, 0, 0.2)';
              (e.currentTarget as HTMLButtonElement).style.color = TOKEN.textSecondary;
              (e.currentTarget as HTMLButtonElement).style.background =
                'rgba(255, 107, 0, 0.03)';
            }}
          >
            添加规则行
          </Button>

          {/* ── Output columns selector ───────────────────────────────── */}
          <div
            style={{
              marginTop: 16,
              padding: '10px 12px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: TOKEN.radius,
              border: `1px solid ${TOKEN.borderSubtle}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <TableOutlined style={{ color: TOKEN.textMuted, fontSize: 11 }} />
              <Text
                style={{
                  fontSize: 11,
                  color: TOKEN.textSecondary,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                结果显示
              </Text>
            </div>
            <Select
              mode="multiple"
              menuItemSelectedIcon={null}
              placeholder={
                <span style={{ color: TOKEN.textMuted, fontSize: 12 }}>全部</span>
              }
              value={outputColumns}
              onChange={(val: string[]) => setOutputColumns(val)}
              style={{ width: '100%' }}
              className="nodrag"
              getPopupContainer={() => document.body}
              popupClassName="nodrag"
              size="small"
              maxTagCount={0}
              maxTagPlaceholder={() => {
                if (outputColumns.length === 0) return null;
                return (
                  <span style={{ fontSize: 11, color: TOKEN.textPrimary }}>
                    {outputColumns[0]}
                    {outputColumns.length > 1 && (
                      <span
                        style={{
                          color: TOKEN.primary,
                          fontWeight: 600,
                          marginLeft: 3,
                        }}
                      >
                        +{outputColumns.length - 1}
                      </span>
                    )}
                  </span>
                );
              }}
              allowClear
              onClear={() => setOutputColumns([])}
              notFoundContent={
                <span style={{ fontSize: 11, color: TOKEN.textMuted }}>
                  请先配置数据源和目标列
                </span>
              }
            >
              {allDisplayableColumns.map((col) => {
                const isSelected = outputColumns.includes(col);
                return (
                  <Select.Option key={col} value={col}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{col}</span>
                      {isSelected && (
                        <CheckOutlined
                          style={{ fontSize: 11, color: TOKEN.primary, flexShrink: 0 }}
                        />
                      )}
                    </div>
                  </Select.Option>
                );
              })}
            </Select>
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 28,
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
            onClick={onClose}
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

export default ReplaceColumnDrawer;
