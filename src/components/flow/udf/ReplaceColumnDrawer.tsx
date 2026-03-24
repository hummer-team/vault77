/**
 * ReplaceColumnDrawer
 * Configuration drawer for the "替换特定列值" (udf_replace_spec_column_value) operator.
 * UI layout follows design/img/img_33.png.
 */

import React, { useCallback, useEffect, useState } from 'react';
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
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import { getAvailableTables, getTableSchema } from '../../../services/flow/flowService';
import type { ReplaceRule } from '../../../services/flow/types';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

interface ReplaceColumnDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Called when user confirms; returns the configured replacement rules */
  onConfirm: (rules: ReplaceRule[]) => void;
  /** Current rules to pre-populate (e.g., from existing node data) */
  initialRules?: ReplaceRule[];
}

const CONDITION_OPTIONS = [
  { label: '包含', value: 'contains' },
  { label: '全部', value: 'all' },
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
    targetColumn: '',
    conditionType: 'all',
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
}> = ({ icon, label }) => (
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

  // ── Load tables when drawer opens ──────────────────────────────────────────
  useEffect(() => {
    if (!open || !isDBReady) return;

    const load = async () => {
      try {
        const tables = await getAvailableTables(executeQuery);
        setAvailableTables(tables);
      } catch (err) {
        console.error('[ReplaceColumnDrawer] Failed to load tables:', err);
      }
    };
    load();
  }, [open, isDBReady, executeQuery]);

  // ── Sync initialRules when drawer re-opens ─────────────────────────────────
  useEffect(() => {
    if (open) {
      setRules(
        initialRules && initialRules.length > 0 ? initialRules : [createEmptyRule()]
      );
    }
  }, [open, initialRules]);

  // ── Lazy-load columns for a table ──────────────────────────────────────────
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

  // ── Rule mutation helpers ──────────────────────────────────────────────────

  const updateRule = useCallback((id: string, patch: Partial<ReplaceRule>) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
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
    onConfirm(rules);
  }, [rules, onConfirm]);

  // ============================================================================
  // Render helpers
  // ============================================================================

  const renderRuleRow = (rule: ReplaceRule, index: number) => {
    const columns = tableColumns[rule.sourceTable] ?? [];
    const isHovered = hoveredRowId === rule.id;

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
          background: isHovered ? TOKEN.bgRowHover : TOKEN.bgRow,
          borderRadius: TOKEN.radius,
          border: `1px solid ${isHovered ? TOKEN.borderPrimary : TOKEN.borderSubtle}`,
          transition: 'background 0.18s ease, border-color 0.18s ease',
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

        {/* Data source */}
        <Select
          placeholder={
            <span style={{ color: TOKEN.textMuted, fontSize: 12 }}>选择数据源</span>
          }
          value={rule.sourceTable || undefined}
          onChange={(val) => {
            updateRule(rule.id, { sourceTable: val, targetColumn: '' });
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

        {/* Target column */}
        <Select
          placeholder={
            <span style={{ color: TOKEN.textMuted, fontSize: 12 }}>
              {rule.sourceTable ? '选择列' : '—'}
            </span>
          }
          value={rule.targetColumn || undefined}
          onChange={(val) => updateRule(rule.id, { targetColumn: val })}
          style={{ width: '100%' }}
          className="nodrag"
          getPopupContainer={() => document.body}
          popupClassName="nodrag"
          size="small"
          disabled={!rule.sourceTable}
          suffixIcon={
            <ColumnWidthOutlined
              style={{
                color: rule.sourceTable ? TOKEN.textSecondary : TOKEN.textMuted,
                fontSize: 10,
              }}
            />
          }
        >
          {columns.map((col) => (
            <Select.Option key={col} value={col}>
              <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{col}</span>
            </Select.Option>
          ))}
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

        {/* Original value */}
        <Input
          placeholder="原始值"
          value={rule.originalValue}
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
            <HeaderCell icon={<DatabaseOutlined />} label="数据源" />
            <HeaderCell icon={<ColumnWidthOutlined />} label="目标列" />
            <HeaderCell icon={<FilterOutlined />} label="条件" />
            <HeaderCell icon={<EditOutlined />} label="原值" />
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
