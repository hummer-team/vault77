/**
 * TableJoinBuildPanel Component
 * Drawer for building table join relationships.
 * Opens when a user clicks "构建关系" on a table→table join edge.
 * Stores join configuration (type, conditions, description) on the edge data.
 *
 * Design: Dark theme with orange accents matching the canvas color system.
 * Condition rows are connected by a vertical line + AND/OR toggle button.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Input, Select, Typography } from 'antd';
import { ArrowDownOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { useFlowStore } from '../../../stores/flowStore';
import { useDuckDBContext } from '../../../contexts/DuckDBContext';
import { getTableSchema } from '../../../services/flow/flowService';
import type {
  JoinEdgeData,
  JoinConditionRow,
  TableNodeData,
  Field,
} from '../../../services/flow/types';
import { JoinType, FieldType } from '../../../services/flow/types';

const { Text } = Typography;

// ─── Theme tokens ─────────────────────────────────────────────────────────────

const T = {
  bg: '#141418',
  surface: '#1e1e24',
  surfaceRaised: '#26262e',
  border: '#333340',
  orange: 'var(--vm-primary)',
  orangeHover: 'var(--vm-primary-hover)',
  orangeDim: 'var(--vm-primary-light)',
  orangeBorder: 'var(--vm-primary-border)',
  textPrimary: '#e8e8f0',
  textSecondary: '#8888a0',
  textDisabled: '#55556a',
  logic: '#d4890a',
  logicBg: 'var(--vm-flow-warning-light)',
  logicBorder: 'var(--vm-flow-warning-light)',
  danger: '#ff4d4f',
  dangerDim: 'var(--vm-flow-error-light)',
};

// ─── Constants ───────────────────────────────────────────────────────────────

const JOIN_TYPE_OPTIONS: { label: string; value: JoinType }[] = [
  { label: '精确匹配（内连）', value: JoinType.INNER },
  { label: '主表全取（左连）', value: JoinType.LEFT },
  { label: '关联表全取（右连）', value: JoinType.RIGHT },
];

const JOIN_TYPE_DESC: Record<JoinType, string> = {
  [JoinType.INNER]: '只保留两张表都能对上的行（类似 Excel VLOOKUP：找不到就不显示）',
  [JoinType.LEFT]: '完整保留主表所有行，关联表没有对应的列留空（类似 Excel VLOOKUP 找不到时显示空白）',
  [JoinType.RIGHT]: '完整保留关联表所有行，主表没有对应的列留空',
  [JoinType.CROSS]: '两张表所有行两两组合（数据量会急剧增大，请谨慎使用）',
};

const CONDITION_OPERATORS = ['=', '!=', '>', '>=', '<', '<='];

// ─── Field type compatibility ─────────────────────────────────────────────────

const NUMERIC_TYPES = new Set([
  FieldType.INTEGER, FieldType.BIGINT, FieldType.SMALLINT, FieldType.TINYINT,
  FieldType.DECIMAL, FieldType.NUMERIC, FieldType.REAL, FieldType.DOUBLE,
]);
const STRING_TYPES = new Set([FieldType.VARCHAR, FieldType.TEXT, FieldType.CHAR]);
const DATE_TYPES   = new Set([FieldType.DATE, FieldType.TIMESTAMP, FieldType.TIME]);

function areJoinTypesCompatible(a: FieldType, b: FieldType): boolean {
  if (a === b) return true;
  if (NUMERIC_TYPES.has(a) && NUMERIC_TYPES.has(b)) return true;
  if (STRING_TYPES.has(a)  && STRING_TYPES.has(b))  return true;
  if (DATE_TYPES.has(a)    && DATE_TYPES.has(b))     return true;
  return false;
}

const FIELD_TYPE_LABEL: Partial<Record<FieldType, string>> = {
  [FieldType.INTEGER]: '整数', [FieldType.BIGINT]: '长整数',
  [FieldType.SMALLINT]: '短整数', [FieldType.TINYINT]: '微整数',
  [FieldType.DECIMAL]: '小数', [FieldType.NUMERIC]: '数值',
  [FieldType.REAL]: '浮点', [FieldType.DOUBLE]: '双精度',
  [FieldType.VARCHAR]: '字符串', [FieldType.TEXT]: '文本', [FieldType.CHAR]: '字符',
  [FieldType.TIMESTAMP]: '时间戳', [FieldType.DATE]: '日期', [FieldType.TIME]: '时间',
  [FieldType.BOOLEAN]: '布尔', [FieldType.BLOB]: 'BLOB',
  [FieldType.JSON]: 'JSON', [FieldType.UUID]: 'UUID',
};

function fieldTypeLabel(t: FieldType): string {
  return FIELD_TYPE_LABEL[t] ?? t;
}

// CSS injected once to override antd Select border with orange when there is a type error
const JOIN_ERROR_STYLE = `
  .join-cond-error .ant-select-selector {
    border-color: var(--vm-primary) !important;
    box-shadow: none !important;
  }
  .join-cond-error.ant-select-focused .ant-select-selector,
  .join-cond-error.ant-select-open .ant-select-selector {
    border-color: var(--vm-primary) !important;
    box-shadow: 0 0 0 2px var(--vm-primary-light) !important;
  }
`;

const DEFAULT_CONDITION = (): JoinConditionRow => ({
  id: uuidv4(),
  leftTable: '',
  leftField: '',
  operator: '=',
  rightTable: '',
  rightField: '',
  logic: undefined,
});

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Build a plain-language description of the join (business/Excel oriented) */
function buildAutoDescription(
  sourceTable: string,
  targetTable: string,
  joinType: JoinType,
  conditions: JoinConditionRow[]
): string {
  const typeDesc = JOIN_TYPE_DESC[joinType] ?? '';
  const filledConditions = conditions.filter((c) => c.leftField && c.rightField);

  if (!filledConditions.length) {
    return `将「${sourceTable}」与「${targetTable}」进行数据合并。${typeDesc}。`;
  }

  const condParts = filledConditions
    .map((c, i) => {
      const logic = i > 0 && c.logic
        ? `，${c.logic === 'AND' ? '并且' : '或者'}`
        : '';
      return `${logic}「${sourceTable}」的 ${c.leftField} ${c.operator}「${targetTable}」的 ${c.rightField}`;
    })
    .join('');

  return `当 ${condParts} 时，将两张表的行合并在一起。${typeDesc}。`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const TableJoinBuildPanel: React.FC = () => {
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const updateNode = useFlowStore((state) => state.updateNode);
  const joinPanelEdgeId = useFlowStore((state) => state.joinPanelEdgeId);
  const closeJoinPanel = useFlowStore((state) => state.closeJoinPanel);
  const updateEdge = useFlowStore((state) => state.updateEdge);

  // DuckDB for on-demand field loading
  const { executeQuery } = useDuckDBContext();

  // ── Derive edge + table names ──
  const edge = useMemo(
    () => (joinPanelEdgeId ? edges.find((e) => e.id === joinPanelEdgeId) : null),
    [joinPanelEdgeId, edges]
  );

  const existingData = useMemo(
    () => (edge?.data ? (edge.data as JoinEdgeData) : null),
    [edge]
  );

  const sourceTableName = existingData?.sourceTableName ?? '';
  const targetTableName = existingData?.targetTableName ?? '';
  const order = existingData?.order ?? 1;

  // ── Local form state ──
  const [joinType, setJoinType] = useState<JoinType>(JoinType.INNER);
  const [conditions, setConditions] = useState<JoinConditionRow[]>([DEFAULT_CONDITION()]);
  // Validation errors are surfaced only after user clicks 确认
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // ── Field state (loaded from store OR fetched on-demand from DuckDB) ──
  const [sourceFieldObjects, setSourceFieldObjects] = useState<Field[]>([]);
  const [targetFieldObjects, setTargetFieldObjects] = useState<Field[]>([]);

  // Load full Field[] (with type info); prefer store cache, fallback to DuckDB
  const loadFields = useCallback(
    async (tableName: string, setter: (fields: Field[]) => void) => {
      if (!tableName) return;

      // Try store first — node already has Field[] from a previous schema fetch
      const tableNode = nodes.find(
        (n) => n.type === 'table' && (n.data as TableNodeData).tableName === tableName
      );
      const fromStore: Field[] = (tableNode?.data as TableNodeData)?.fields ?? [];
      if (fromStore.length > 0) {
        setter(fromStore);
        return;
      }

      // Fetch from DuckDB
      try {
        const schema = await getTableSchema(tableName, executeQuery);
        setter(schema.fields);

        // Update the node in the store so future opens are instant
        if (tableNode) {
          updateNode(tableNode.id, { fields: schema.fields });
        }
      } catch {
        setter([]);
      }
    },
    [nodes, executeQuery, updateNode]
  );

  // Sync form state and load fields when panel opens
  useEffect(() => {
    if (!joinPanelEdgeId) return;
    setShowValidationErrors(false);

    if (existingData) {
      setJoinType(existingData.joinType ?? JoinType.INNER);
      setConditions(
        existingData.conditions?.length
          ? existingData.conditions
          : [{ ...DEFAULT_CONDITION(), leftTable: sourceTableName, rightTable: targetTableName }]
      );
    } else {
      setJoinType(JoinType.INNER);
      setConditions([
        { ...DEFAULT_CONDITION(), leftTable: sourceTableName, rightTable: targetTableName },
      ]);
    }

    loadFields(sourceTableName, setSourceFieldObjects);
    loadFields(targetTableName, setTargetFieldObjects);
  }, [joinPanelEdgeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generated description
  const autoDescription = useMemo(
    () => buildAutoDescription(sourceTableName, targetTableName, joinType, conditions),
    [sourceTableName, targetTableName, joinType, conditions]
  );

  // Disable confirm when any condition row has a type mismatch
  const hasTypeErrors = useMemo(
    () =>
      conditions.some((cond) => {
        if (!cond.leftField || !cond.rightField) return false;
        const left  = sourceFieldObjects.find((f) => f.name === cond.leftField);
        const right = targetFieldObjects.find((f) => f.name === cond.rightField);
        if (!left || !right) return false;
        return !areJoinTypesCompatible(left.type, right.type);
      }),
    [conditions, sourceFieldObjects, targetFieldObjects]
  );

  // Any condition row missing left or right field
  const hasEmptyConditions = useMemo(
    () => conditions.some((c) => !c.leftField || !c.rightField),
    [conditions]
  );

  // ── Condition mutations ──
  const addCondition = useCallback(() => {
    setConditions((prev) => [
      ...prev,
      { ...DEFAULT_CONDITION(), leftTable: sourceTableName, rightTable: targetTableName, logic: 'AND' },
    ]);
  }, [sourceTableName, targetTableName]);

  const removeCondition = useCallback((id: string) => {
    setConditions((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  }, []);

  const updateCondition = useCallback(
    (id: string, patch: Partial<JoinConditionRow>) => {
      setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    []
  );

  // ── Save / Cancel ──
  const handleConfirm = useCallback(() => {
    if (!joinPanelEdgeId) return;
    if (hasTypeErrors || hasEmptyConditions) {
      setShowValidationErrors(true);
      return;
    }
    setShowValidationErrors(false);
    updateEdge(joinPanelEdgeId, {
      joinType,
      sourceTableName,
      targetTableName,
      conditions,
      description: autoDescription,
      order,
      configured: true,
    } satisfies JoinEdgeData);
    closeJoinPanel();
  }, [joinPanelEdgeId, joinType, sourceTableName, targetTableName, conditions, autoDescription, order, hasTypeErrors, hasEmptyConditions, updateEdge, closeJoinPanel]);

  const handleCancel = useCallback(() => {
    setShowValidationErrors(false);
    closeJoinPanel();
  }, [closeJoinPanel]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
    <style>{JOIN_ERROR_STYLE}</style>
    <Drawer
      title={
        <span style={{ color: T.textPrimary, fontWeight: 600, fontSize: 15 }}>表关联</span>
      }
      open={joinPanelEdgeId !== null}
      onClose={handleCancel}
      size="large"
      placement="right"
      styles={{
        body: { padding: '20px 20px 16px', background: T.bg, overflowY: 'auto' },
        header: {
          background: T.surface,
          borderBottom: `1px solid ${T.border}`,
          padding: '14px 20px',
        },
        mask: { background: 'var(--vm-surface-hover)' },
      }}
    >
      {/* ── 关系组 Header ── */}
      <div
        style={{
          background: T.orangeDim,
          border: `1px solid ${T.orangeBorder}`,
          borderRadius: 6,
          padding: '8px 14px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            background: T.orange,
            color: 'var(--vm-text-primary)',
            borderRadius: 4,
            padding: '1px 7px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          关系组{order}
        </span>
        <span style={{ color: T.textPrimary, fontSize: 13, fontWeight: 500 }}>
          {sourceTableName}
          <span style={{ color: T.textSecondary, margin: '0 6px' }}>→</span>
          {targetTableName}
        </span>
      </div>

      {/* ── 主表 / 关联表 (Visual flow) ── */}
      <SectionLabel>数据表选择</SectionLabel>
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: '14px 16px',
          marginBottom: 16,
        }}
      >
        {/* Source table */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Input
            value={sourceTableName}
            disabled
            style={{ flex: 1, background: T.surfaceRaised, color: T.textPrimary, borderColor: T.border }}
          />
          <span style={{
            background: T.orangeDim, border: `1px solid ${T.orangeBorder}`,
            color: T.orange, borderRadius: 4, padding: '2px 8px',
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            主表
          </span>
        </div>

        {/* Join type selector — centred connecting arrow */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, position: 'relative' }}>
          <div style={{
            position: 'absolute', left: '50%', top: 0,
            transform: 'translateX(-50%)', width: 1, height: '100%', background: T.border, zIndex: 0,
          }} />
          <Select
            value={joinType}
            onChange={setJoinType}
            options={JOIN_TYPE_OPTIONS}
            style={{ width: 130, position: 'relative', zIndex: 1 }}
            suffixIcon={<ArrowDownOutlined style={{ color: T.textSecondary }} />}
          />
        </div>

        {/* Target table */}
        <Input
          value={targetTableName}
          disabled
          style={{ background: T.surfaceRaised, color: T.textPrimary, borderColor: T.border }}
        />
      </div>

      {/* ── 关系说明 (auto-generated, read-only) ── */}
      <SectionLabel>合并说明</SectionLabel>
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderStyle: 'dashed',
          borderRadius: 6,
          padding: '10px 14px',
          marginBottom: 16,
          color: T.textSecondary,
          fontSize: 12,
          lineHeight: 1.7,
        }}
      >
        {autoDescription}
      </div>

      {/* ── 关联条件 ── */}
      <SectionLabel>匹配规则（设置两张表如何对应）</SectionLabel>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 54px 1fr 56px',
        gap: 6,
        padding: '0 0 4px 36px',
      }}>
        <span style={{ color: T.textSecondary, fontSize: 10, textAlign: 'center' }}>
          {sourceTableName || '主表'} · 字段
        </span>
        <span style={{ color: T.textSecondary, fontSize: 10, textAlign: 'center' }}>关系</span>
        <span style={{ color: T.textSecondary, fontSize: 10, textAlign: 'center' }}>
          {targetTableName || '关联表'} · 字段
        </span>
        <span />
      </div>

      {/* Condition rows with AND/OR separators between them */}
      <div>
        {conditions.map((cond, index) => (
          <React.Fragment key={cond.id}>
            {index > 0 && (
              <LogicSeparator
                logic={cond.logic ?? 'AND'}
                onToggle={() => updateCondition(cond.id, { logic: cond.logic === 'AND' ? 'OR' : 'AND' })}
              />
            )}
            <ConditionRow
              cond={cond}
              index={index}
              isLast={index === conditions.length - 1}
              sourceFieldObjects={sourceFieldObjects}
              targetFieldObjects={targetFieldObjects}
              canRemove={conditions.length > 1}
              showValidationErrors={showValidationErrors}
              onUpdate={updateCondition}
              onAdd={addCondition}
              onRemove={removeCondition}
            />
          </React.Fragment>
        ))}
      </div>

      {/* ── Validation summary (shown after confirm attempt) ── */}
      {showValidationErrors && (hasTypeErrors || hasEmptyConditions) && (
        <div style={{
          background: 'var(--vm-primary-light)',
          border: `1px solid ${T.orangeBorder}`,
          borderRadius: 6,
          padding: '8px 12px',
          marginTop: 12,
        }}>
          {hasEmptyConditions && (
            <div style={{ color: T.orange, fontSize: 12, lineHeight: 1.6 }}>
              ⚠ 存在未配置完整的匹配条件，请为每一行选择左右两侧的字段后再确认
            </div>
          )}
          {hasTypeErrors && (
            <div style={{ color: T.orange, fontSize: 12, lineHeight: 1.6 }}>
              ⚠ 存在字段类型不匹配的条件，请重新选择数据类型兼容的字段
            </div>
          )}
        </div>
      )}

      {/* ── Action buttons (flush below conditions, no extra layer) ── */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Button
          type="primary"
          onClick={handleConfirm}
          data-testid="btn-confirm"
          style={{
            background: T.orange,
            borderColor: T.orange,
            fontWeight: 600,
            minWidth: 80,
          }}
        >
          确认
        </Button>
        <Button
          onClick={handleCancel}
          data-testid="btn-cancel"
          style={{ background: 'transparent', borderColor: T.border, color: T.textSecondary, minWidth: 80 }}
        >
          取消
        </Button>
      </div>
    </Drawer>
    </>
  );
};

// ─── SectionLabel ─────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={{
    color: T.textSecondary, fontSize: 11, fontWeight: 600,
    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    display: 'block', marginBottom: 8,
  }}>
    {children}
  </Text>
);

// ─── LogicSeparator ───────────────────────────────────────────────────────────

interface LogicSeparatorProps {
  logic: 'AND' | 'OR';
  onToggle: () => void;
}

const LogicSeparator: React.FC<LogicSeparatorProps> = ({ logic, onToggle }) => (
  <div style={{ display: 'flex', alignItems: 'stretch', height: 26 }}>
    {/* Left connector column — AND/OR badge centered on the vertical line */}
    <div style={{
      width: 32, flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      marginRight: 4,
    }}>
      <div style={{ flex: 1, width: 1, background: T.border }} />
      <button
        onClick={onToggle}
        title="点击切换 AND / OR"
        style={{
          background: T.logicBg,
          border: `1px solid ${T.logicBorder}`,
          borderRadius: 4,
          color: T.logic,
          fontSize: 10,
          fontWeight: 700,
          padding: '1px 4px',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background 0.15s',
          lineHeight: 1.4,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--vm-flow-warning-light)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = T.logicBg;
        }}
      >
        {logic}
      </button>
      <div style={{ flex: 1, width: 1, background: T.border }} />
    </div>
    {/* Right side intentionally empty */}
    <div style={{ flex: 1 }} />
  </div>
);

// ─── ConditionRow sub-component ───────────────────────────────────────────────

interface ConditionRowProps {
  cond: JoinConditionRow;
  index: number;
  isLast: boolean;
  sourceFieldObjects: Field[];
  targetFieldObjects: Field[];
  canRemove: boolean;
  showValidationErrors: boolean;
  onUpdate: (id: string, patch: Partial<JoinConditionRow>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

const ConditionRow: React.FC<ConditionRowProps> = ({
  cond,
  isLast,
  sourceFieldObjects,
  targetFieldObjects,
  canRemove,
  showValidationErrors,
  onUpdate,
  onAdd,
  onRemove,
}) => {
  // Derive name lists for Select options
  const sourceFieldNames = useMemo(
    () => sourceFieldObjects.map((f) => f.name),
    [sourceFieldObjects]
  );
  const targetFieldNames = useMemo(
    () => targetFieldObjects.map((f) => f.name),
    [targetFieldObjects]
  );

  // Type-compatibility check — only fires when both sides are chosen
  const typeError = useMemo<string | null>(() => {
    if (!cond.leftField || !cond.rightField) return null;
    const left  = sourceFieldObjects.find((f) => f.name === cond.leftField);
    const right = targetFieldObjects.find((f) => f.name === cond.rightField);
    if (!left || !right) return null;
    if (areJoinTypesCompatible(left.type, right.type)) return null;
    return (
      `您选择的 ${cond.leftField}（${fieldTypeLabel(left.type)}）` +
      `跟 ${cond.rightField}（${fieldTypeLabel(right.type)}）数据类型不匹配，无法建立关联，请重新选择列进行关联`
    );
  }, [cond.leftField, cond.rightField, sourceFieldObjects, targetFieldObjects]);

  // Empty-field check — only surfaced when parent has triggered validation
  const leftEmpty  = showValidationErrors && !cond.leftField;
  const rightEmpty = showValidationErrors && !cond.rightField;
  const emptyError = (leftEmpty || rightEmpty) && !typeError
    ? '请为该条件行选择左右两侧的关联字段'
    : null;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      {/* Left connector: vertical line to mirror the LogicSeparator's left column */}
      <div style={{
        width: 32, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        marginRight: 4,
      }}>
        {canRemove && <div style={{ flex: 1, width: 1, background: T.border }} />}
      </div>

      {/* Condition fields + optional type-error message */}
      <div style={{ flex: 1 }}>
        {/* Fields grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 54px 1fr 56px',
          gap: 6,
          alignItems: 'center',
        }}>
          {/* Left field */}
          <Select
            value={cond.leftField || undefined}
            placeholder="选择字段"
            onChange={(v) => onUpdate(cond.id, { leftField: v })}
            style={{ width: '100%' }}
            className={typeError || leftEmpty ? 'join-cond-error' : undefined}
            options={sourceFieldNames.map((f) => ({ label: f, value: f }))}
            size="small"
            notFoundContent={
              <span style={{ color: T.textSecondary, fontSize: 11 }}>无字段</span>
            }
          />

          {/* Operator */}
          <Select
            value={cond.operator}
            onChange={(v) => onUpdate(cond.id, { operator: v })}
            style={{ width: '100%' }}
            options={CONDITION_OPERATORS.map((op) => ({ label: op, value: op }))}
            size="small"
          />

          {/* Right field */}
          <Select
            value={cond.rightField || undefined}
            placeholder="选择字段"
            onChange={(v) => onUpdate(cond.id, { rightField: v })}
            style={{ width: '100%' }}
            className={typeError || rightEmpty ? 'join-cond-error' : undefined}
            options={targetFieldNames.map((f) => ({ label: f, value: f }))}
            size="small"
            notFoundContent={
              <span style={{ color: T.textSecondary, fontSize: 11 }}>无字段</span>
            }
          />

          {/* +/- buttons */}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            {isLast && (
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={onAdd}
                title="添加条件"
                style={{ background: T.orange, borderColor: T.orange, width: 24, minWidth: 24, padding: 0 }}
              />
            )}
            <Button
              type="text"
              size="small"
              icon={<MinusOutlined />}
              onClick={() => onRemove(cond.id)}
              disabled={!canRemove}
              title="删除条件"
              style={{
                color: canRemove ? T.danger : T.textDisabled,
                background: canRemove ? T.dangerDim : 'transparent',
                width: 24, minWidth: 24, padding: 0,
              }}
            />
          </div>
        </div>

        {/* Inline error message — type mismatch or empty fields */}
        {(typeError || emptyError) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 54px 1fr 56px',
            gap: 6,
            marginTop: 4,
          }}>
            <div style={{
              gridColumn: '1 / 4',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 4,
              color: T.orange,
              fontSize: 11,
              lineHeight: 1.4,
              fontWeight: 500,
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
              <span>{typeError ?? emptyError}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TableJoinBuildPanel;
