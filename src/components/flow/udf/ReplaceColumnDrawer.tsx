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
  Tag,
  Typography,
  Divider,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  RedoOutlined,
  CloseOutlined,
  SwapOutlined,
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
    const isComplete = Boolean(rule.sourceTable && rule.targetColumn && rule.originalValue && rule.targetValue);

    return (
      <div
        key={rule.id}
        onMouseEnter={() => setHoveredRowId(rule.id)}
        onMouseLeave={() => setHoveredRowId(null)}
        style={{
          display: 'grid',
          gridTemplateColumns: '28px 140px 118px 118px 98px 98px 58px 52px',
          gap: '6px',
          alignItems: 'center',
          marginBottom: 6,
          padding: '7px 10px',
          background: isHovered
            ? 'rgba(255, 107, 0, 0.04)'
            : 'rgba(255, 255, 255, 0.02)',
          borderRadius: 6,
          border: `1px solid ${isHovered ? 'rgba(255, 107, 0, 0.25)' : isComplete ? '#2a2a2a' : '#1f1f1f'}`,
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        {/* Row number badge */}
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid #303030',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Text style={{ fontSize: 10, color: '#595959', fontFamily: 'monospace', lineHeight: 1 }}>
            {String(index + 1).padStart(2, '0')}
          </Text>
        </div>

        {/* Data source */}
        <Select
          placeholder="选择数据源"
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
        >
          {availableTables.map((t) => (
            <Select.Option key={t} value={t}>
              {t}
            </Select.Option>
          ))}
        </Select>

        {/* Target column */}
        <Select
          placeholder={rule.sourceTable ? '选择列' : '—'}
          value={rule.targetColumn || undefined}
          onChange={(val) => updateRule(rule.id, { targetColumn: val })}
          style={{ width: '100%' }}
          className="nodrag"
          getPopupContainer={() => document.body}
          popupClassName="nodrag"
          size="small"
          disabled={!rule.sourceTable}
        >
          {columns.map((col) => (
            <Select.Option key={col} value={col}>
              {col}
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
        >
          {CONDITION_OPTIONS.map((opt) => (
            <Select.Option key={opt.value} value={opt.value}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>

        {/* Original value */}
        <Input
          placeholder="原值"
          value={rule.originalValue}
          onChange={(e) => updateRule(rule.id, { originalValue: e.target.value })}
          size="small"
        />

        {/* Target value */}
        <Input
          placeholder="目标值"
          value={rule.targetValue}
          onChange={(e) => updateRule(rule.id, { targetValue: e.target.value })}
          size="small"
        />

        {/* Add new column toggle */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Text style={{ fontSize: 10, color: rule.addNewColumn ? '#FF6B00' : '#595959', lineHeight: 1 }}>
            {rule.addNewColumn ? '新增' : '覆盖'}
          </Text>
          <Switch
            checked={rule.addNewColumn}
            onChange={(checked) => updateRule(rule.id, { addNewColumn: checked })}
            size="small"
          />
        </div>

        {/* Action buttons: reset + delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tooltip title="重置此行">
            <Button
              type="text"
              size="small"
              icon={<RedoOutlined style={{ fontSize: 12, color: '#595959' }} />}
              onClick={() => resetRule(rule.id)}
              style={{ padding: '2px 4px', minWidth: 'unset' }}
            />
          </Tooltip>
          <Tooltip title="删除此行">
            <Button
              type="text"
              size="small"
              icon={
                <DeleteOutlined
                  style={{ fontSize: 12, color: rules.length <= 1 ? '#303030' : '#8c3030' }}
                />
              }
              onClick={() => removeRule(rule.id)}
              disabled={rules.length <= 1}
              style={{ padding: '2px 4px', minWidth: 'unset' }}
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
        <Space size={8}>
          <SwapOutlined style={{ color: '#FF6B00', fontSize: 15 }} />
          {/* Category tag */}
          <Tag
            style={{
              fontSize: 12,
              padding: '2px 10px',
              background: 'rgba(114, 46, 209, 0.15)',
              color: '#b37feb',
              border: '1px solid rgba(114, 46, 209, 0.4)',
              borderRadius: 3,
              margin: 0,
            }}
          >
            数据清洗算子
          </Tag>
          {/* Breadcrumb separator */}
          <span style={{ color: '#434343', fontSize: 14, lineHeight: 1 }}>/</span>
          {/* Operator unit tag — same style */}
          <Tag
            style={{
              fontSize: 12,
              padding: '2px 10px',
              background: 'rgba(114, 46, 209, 0.15)',
              color: '#b37feb',
              border: '1px solid rgba(114, 46, 209, 0.4)',
              borderRadius: 3,
              margin: 0,
            }}
          >
            替换特定列
          </Tag>
        </Space>
      }
      placement="right"
      width={860}
      open={open}
      onClose={onClose}
      closable
      closeIcon={<CloseOutlined style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }} />}
      style={{ background: 'transparent' }}
      styles={{
        header: {
          background: 'rgba(28, 25, 23, 0.98)',
          borderBottom: '1px solid rgba(68, 64, 60, 0.6)',
          padding: '16px 20px',
        },
        body: {
          background: 'rgba(20, 20, 20, 0.98)',
          padding: '24px 28px',
          overflowX: 'hidden',
        },
        mask: {
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(2px)',
        },
      }}
      drawerStyle={{
        background: 'rgba(20, 20, 20, 0.98)',
        borderLeft: '1px solid rgba(68, 64, 60, 0.6)',
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.5), -1px 0 0 rgba(255, 107, 0, 0.08)',
      }}
    >
      {/* Operator unit section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 20,
          gap: 14,
          padding: '10px 14px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: 6,
          border: '1px solid #242424',
          borderLeft: '3px solid #FF6B00',
        }}
      >
        <Text style={{ fontSize: 13, color: '#8c8c8c', minWidth: 52 }}>算子单元</Text>
        <Tag
          style={{
            fontSize: 13,
            padding: '3px 14px',
            background: 'rgba(114, 46, 209, 0.12)',
            color: '#b37feb',
            border: '1px solid rgba(114, 46, 209, 0.35)',
            borderRadius: 4,
            fontWeight: 500,
          }}
        >
          替换特定值
        </Tag>
        <Text style={{ fontSize: 12, color: '#595959', marginLeft: 'auto' }}>
          共 {rules.length} 条规则
        </Text>
      </div>

      <Divider style={{ margin: '0 0 20px', borderColor: '#242424' }} />

      {/* Build operation section */}
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Left label */}
        <Text
          style={{
            fontSize: 13,
            color: '#8c8c8c',
            minWidth: 52,
            paddingTop: 6,
            letterSpacing: '0.02em',
          }}
        >
          构建
        </Text>

        {/* Right: header + rows + add button */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Column headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 140px 118px 118px 98px 98px 58px 52px',
              gap: '6px',
              marginBottom: 6,
              padding: '6px 10px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              borderLeft: '3px solid rgba(255, 107, 0, 0.3)',
            }}
          >
            {['', '数据源', '目标列', '条件', '原值', '目标值', '新增列', ''].map(
              (header, idx) => (
                <Text
                  key={idx}
                  style={{
                    fontSize: 11,
                    color: '#8c8c8c',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  {header}
                </Text>
              )
            )}
          </div>

          {/* Rule rows */}
          {rules.map((rule, index) => renderRuleRow(rule, index))}

          {/* Add row button */}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addRule}
            style={{
              marginTop: 10,
              width: '100%',
              borderColor: '#383838',
              color: '#8c8c8c',
              background: 'rgba(255,255,255,0.02)',
              height: 32,
              fontSize: 13,
            }}
          >
            添加规则行
          </Button>
        </div>
      </div>

      {/* Footer: confirm / cancel */}
      <div
        style={{
          marginTop: 32,
          paddingTop: 20,
          borderTop: '1px solid #242424',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Space size={10}>
          <Button
            type="primary"
            size="middle"
            onClick={handleConfirm}
            style={{ minWidth: 88 }}
          >
            确认
          </Button>
          <Button
            size="middle"
            onClick={onClose}
            style={{
              minWidth: 72,
              borderColor: '#303030',
              color: '#8c8c8c',
              background: 'transparent',
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
