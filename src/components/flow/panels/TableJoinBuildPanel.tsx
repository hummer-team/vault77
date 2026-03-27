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
import { getTableSchema, getTableFields } from '../../../services/flow/flowService';
import type {
  FlowNode,
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
  orange: '#FF6B00',
  orangeHover: '#FF8533',
  orangeDim: 'rgba(255, 107, 0, 0.15)',
  orangeBorder: 'rgba(255, 107, 0, 0.4)',
  textPrimary: '#e8e8f0',
  textSecondary: '#8888a0',
  textDisabled: '#55556a',
  logic: '#d4890a',
  logicBg: 'rgba(212, 136, 6, 0.2)',
  logicBorder: 'rgba(212, 136, 6, 0.5)',
  danger: '#ff4d4f',
  dangerDim: 'rgba(255, 77, 79, 0.12)',
};

// ─── Constants ───────────────────────────────────────────────────────────────

const JOIN_TYPE_OPTIONS: { label: string; value: JoinType }[] = [
  { label: '内连', value: JoinType.INNER },
  { label: '左连', value: JoinType.LEFT },
  { label: '右连', value: JoinType.RIGHT },
];

const JOIN_TYPE_DESC: Record<JoinType, string> = {
  [JoinType.INNER]: '只保留两张表中都能匹配上的记录',
  [JoinType.LEFT]: '保留左表所有记录，右表匹配不上的用空值填充',
  [JoinType.RIGHT]: '保留右表所有记录，左表匹配不上的用空值填充',
  [JoinType.CROSS]: '两张表所有记录组合（笛卡尔积）',
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

function getTableFields(nodes: FlowNode[], tableName: string): string[] {
  const tableNode = nodes.find(
    (n) => n.type === 'table' && (n.data as TableNodeData).tableName === tableName
  );
  if (!tableNode) return [];
  return ((tableNode.data as TableNodeData).fields ?? []).map((f) => f.name);
}

/** Build a plain-language description of the join */
function buildAutoDescription(
  sourceTable: string,
  targetTable: string,
  joinType: JoinType,
  conditions: JoinConditionRow[]
): string {
  const typeName = JOIN_TYPE_OPTIONS.find((o) => o.value === joinType)?.label ?? '内连';
  const typeDesc = JOIN_TYPE_DESC[joinType] ?? '';

  if (!conditions.length || (!conditions[0].leftField && !conditions[0].rightField)) {
    return `将 ${sourceTable} 与 ${targetTable} 进行${typeName}——${typeDesc}。`;
  }

  const condParts = conditions
    .filter((c) => c.leftField && c.rightField)
    .map((c, i) => {
      const logic = i > 0 && c.logic ? ` ${c.logic} ` : '';
      return `${logic}当 ${c.leftField} ${c.operator} ${c.rightField}`;
    })
    .join('');

  if (!condParts) {
    return `将 ${sourceTable} 与 ${targetTable} 进行${typeName}——${typeDesc}。`;
  }

  return `将 ${sourceTable} 与 ${targetTable} 进行${typeName}：${condParts}时合并记录。${typeDesc}。`;
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
  }, [joinPanelEdgeId, joinType, sourceTableName, targetTableName, conditions, autoDescription, order, updateEdge, closeJoinPanel]);

  const handleCancel = useCallback(() => closeJoinPanel(), [closeJoinPanel]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
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
        mask: { background: 'rgba(0,0,0,0.55)' },
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
            color: '#fff',
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
      <SectionLabel>主表 / 关联表</SectionLabel>
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
      <SectionLabel>关系说明</SectionLabel>
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
      <SectionLabel>关联条件</SectionLabel>

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
              onUpdate={updateCondition}
              onAdd={addCondition}
              onRemove={removeCondition}
            />
          </React.Fragment>
        ))}
      </div>

      {/* ── Action buttons (flush below conditions, no extra layer) ── */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button
          type="primary"
          onClick={handleConfirm}
          data-testid="btn-confirm"
          style={{ background: T.orange, borderColor: T.orange, fontWeight: 600, minWidth: 80 }}
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
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212, 136, 6, 0.35)';
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
      `${cond.leftField} 字段类型${fieldTypeLabel(left.type)}` +
      `跟 ${cond.rightField} 字段类型${fieldTypeLabel(right.type)}不匹配，不能关联`
    );
  }, [cond.leftField, cond.rightField, sourceFieldObjects, targetFieldObjects]);

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
            placeholder="字段"
            onChange={(v) => onUpdate(cond.id, { leftField: v })}
            style={{ width: '100%' }}
            status={typeError ? 'warning' : undefined}
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
            placeholder="字段"
            onChange={(v) => onUpdate(cond.id, { rightField: v })}
            style={{ width: '100%' }}
            status={typeError ? 'warning' : undefined}
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

        {/* Type-mismatch warning — left-aligned with the fields grid */}
        {typeError && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 4,
            marginTop: 4,
            color: '#FF8C00',
            fontSize: 11,
            lineHeight: 1.4,
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
            <span>{typeError}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TableJoinBuildPanel;
