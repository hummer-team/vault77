/**
 * FlowSummary — extracts a business-readable summary from the canvas nodes+edges.
 * Used by ResultsDisplay to show users what their analysis flow does (no SQL).
 */

import {
  FlowNodeType,
  JoinType,
  type FlowNode,
  type FlowEdge,
  type TableNodeData,
  type SelectNodeData,
  type SelectField,
  type ConditionDefinitionNodeData,
  type UdfConfigNodeData,
  type OperatorNodeData,
  type JoinEdgeData,
} from './types';
import { bizKernelService } from '../biz-kernels/bizKernelService';

// ============================================================================
// Types
// ============================================================================

export interface FlowSummaryJoin {
  leftTable: string;
  leftField: string;
  joinTypeLabel: string;
  rightTable: string;
  rightField: string;
}

export interface FlowSummaryConditionItem {
  field: string;
  operator: string;
}

export interface FlowSummaryConditionGroup {
  refId: string;
  tableName: string;
  conditions: FlowSummaryConditionItem[];
}

export interface FlowSummary {
  operatorName: string;
  tables: string[];
  joins: FlowSummaryJoin[];
  /** Empty array means SELECT * (all fields) */
  selectedFields: string[];
  conditions: FlowSummaryConditionGroup[];
  /** Human-readable lines describing UDF configuration */
  udfSummary: string[];
}

// ============================================================================
// Helpers
// ============================================================================

const JOIN_TYPE_LABEL: Record<JoinType, string> = {
  [JoinType.INNER]: '内连接 (INNER JOIN)',
  [JoinType.LEFT]:  '左连接 (LEFT JOIN)',
  [JoinType.RIGHT]: '右连接 (RIGHT JOIN)',
  [JoinType.CROSS]: '交叉连接 (CROSS JOIN)',
};

function joinTypeLabel(t: JoinType): string {
  return JOIN_TYPE_LABEL[t] ?? `${t} JOIN`;
}

function formatField(f: SelectField): string {
  const base = f.tableName ? `${f.tableName}.${f.fieldName}` : f.fieldName;
  if (f.aggregate) return `${f.aggregate}(${base})`;
  if (f.alias && f.alias !== f.fieldName) return `${base} → ${f.alias}`;
  return base;
}

// ============================================================================
// UDF summary builders
// ============================================================================

function buildUdfSummary(udfNode: FlowNode): string[] {
  const d = udfNode.data as UdfConfigNodeData;
  const lines: string[] = [];

  // Replace column value
  if (d.replacementRules?.length) {
    const ruleLines = d.replacementRules.map((r) => {
      const cols = r.targetColumn.join('、');
      if (r.conditionType === 'replace_all') {
        return `整列 [${cols}] 填充为 "${r.targetValue}"`;
      }
      const cond = r.conditionType === 'contains' && r.conditionValue
        ? `当 ${r.conditionValue} 时`
        : '';
      return `[${cols}] ${cond ? cond + ' ' : ''}"${r.originalValue}" → "${r.targetValue}"${r.addNewColumn ? ' (新增列)' : ''}`;
    });
    lines.push(...ruleLines);
  }

  // Uppercase/lowercase
  if (d.upLowerConfig) {
    const { cols, action } = d.upLowerConfig;
    lines.push(`将 [${cols.join('、')}] 转为${action === 'upper' ? '大写' : '小写'}`);
  }

  // Number format
  if (d.formatNumberConfig) {
    const { colsConfig, roundMode } = d.formatNumberConfig;
    const colLines = Object.entries(colsConfig)
      .map(([col, dec]) => `${col} → ${dec} 位小数`);
    const mode = roundMode && roundMode !== 'half_up' ? `（${roundMode}）` : '';
    lines.push(`数字精度${mode}：${colLines.join('，')}`);
  }

  // Flag spec
  if (d.flagSpecConfig) {
    const { flagsConfig } = d.flagSpecConfig;
    for (const [col, rule] of Object.entries(flagsConfig)) {
      const caseParts = rule.cases.map(([cond, label]) => `${cond} → "${label}"`).join('，');
      const elsePart = rule.else != null ? `，否则 → "${rule.else}"` : '';
      lines.push(`标记列 [${col}]：${caseParts}${elsePart}`);
    }
  }

  // Date format
  if (d.formatDateConfig) {
    const cols = Object.keys(d.formatDateConfig.colConfigJson);
    const details = cols.map((col) => {
      const cfg = d.formatDateConfig!.colConfigJson[col];
      const dst = cfg.dstFmt ?? 'datetime';
      return `${col} → ${dst}`;
    });
    lines.push(`日期格式化：${details.join('，')}`);
  }

  return lines;
}

// ============================================================================
// Main builder
// ============================================================================

export function buildFlowSummary(nodes: FlowNode[], edges: FlowEdge[]): FlowSummary {
  // Operator name — prefer displayName from BizKernelMetadata
  const operatorNode = nodes.find((n) => n.type === FlowNodeType.OPERATOR);
  const operatorData = operatorNode?.data as OperatorNodeData | undefined;
  const kernelMeta = operatorData?.kernelName
    ? bizKernelService.getKernelByName(operatorData.kernelName)
    : undefined;
  const operatorName = kernelMeta?.displayName ?? operatorData?.kernelName ?? operatorData?.operatorType ?? '分析流';

  // Tables
  const tableNodes = nodes.filter((n) => n.type === FlowNodeType.TABLE);
  const tables = tableNodes.map((n) => (n.data as TableNodeData).tableName);

  // Joins (edge-based)
  const joins: FlowSummaryJoin[] = edges
    .filter((e) => e.type === 'join')
    .flatMap((e) => {
      const jd = e.data as JoinEdgeData | undefined;
      if (!jd?.configured || !jd.conditions?.length) return [];
      return jd.conditions.map((c) => ({
        leftTable: c.leftTable,
        leftField: c.leftField,
        joinTypeLabel: joinTypeLabel(jd.joinType),
        rightTable: c.rightTable,
        rightField: c.rightField,
      }));
    });

  // Selected fields
  const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
  const selectData = selectNode?.data as SelectNodeData | undefined;
  const selectedFields: string[] =
    !selectData || selectData.selectAll || !selectData.fields?.length
      ? []
      : selectData.fields.map(formatField);

  // Conditions
  const conditionNodes = nodes.filter((n) => n.type === FlowNodeType.CONDITION_DEFINITION);
  const conditions: FlowSummaryConditionGroup[] = conditionNodes.map((n) => {
    const cd = n.data as ConditionDefinitionNodeData;
    return {
      refId: cd.refId,
      tableName: cd.tableName,
      conditions: cd.conditions.map((c) => ({ field: c.field, operator: c.operator })),
    };
  });

  // UDF summary
  const udfNode = nodes.find((n) => n.type === FlowNodeType.UDF_CONFIG);
  const udfSummary = udfNode ? buildUdfSummary(udfNode) : [];

  return { operatorName, tables, joins, selectedFields, conditions, udfSummary };
}
