import React, { useState, useRef } from 'react';
import { Card, Empty, Typography, Table, Tag, Space, Divider, Spin, Alert, Button, Collapse, Avatar, Popconfirm, Tooltip, message, Tabs, Input, Select, InputNumber, Checkbox, DatePicker } from 'antd';
import { LikeOutlined, DislikeOutlined, RedoOutlined, LikeFilled, DeleteOutlined, EditOutlined, CopyOutlined, DownloadOutlined, FileExcelOutlined, DownOutlined, UpOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table'; // Import ColumnsType for better typing
import { Attachment } from '../../../types/workbench.types';
import { exportTableToCsv } from '../../../utils/fileUtils.ts';
import type { FlowSummary } from '../../../services/flow/flowSummary';
import type { OperatorDisplayConfig, ColumnFormatterSpec, OperatorInsightsData, TabConfig } from '../../../services/flow/types';
import ResultInsightsPanel from './ResultInsightsPanel';
import {
  applyAdvancedColumnFilter,
  getDistinctColumnValues,
  isFilterStateActive,
  type AdvancedColumnFilterState,
  type ColumnFilterKind,
} from '../../../utils/resultsTableFiltersUtils';
import dayjs from 'dayjs';
import { TOKEN } from '../../../theme';

// --- M6: Clarification helpers ---
const parseClarifyingQuestions = (errorText: string): string[] => {
  const lines = errorText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const questions: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[-*]\s+/, '').trim();
    if (!cleaned) continue;
    if (/^Need clarification[:：]?$/i.test(cleaned) || /^需要你补充信息[:：]?$/i.test(cleaned)) continue;
    questions.push(cleaned);
  }
  return questions;
};

const buildQuickRepliesFromQuestion = (question: string): string[] => {
  // Minimal heuristic: detect common time-range clarification.
  if (/最近.*(时间|一段时间|范围)/.test(question) || /(7天|30天|90天)/.test(question)) {
    return ['最近7天', '最近30天', '最近90天'];
  }
  return [];
};

const { Paragraph } = Typography;

interface ResultsDisplayProps {
  query: string;
  status: 'analyzing' | 'resultsReady';
  data: any[] | { error: string } | null;
  schema: any[] | null;
  thinkingSteps: { 
    tool: string; 
    params: any; 
    thought?: string;
    // M10.5: Skill execution metadata
    skillName?: string;
    industry?: string;
    userSkillApplied?: boolean;
    userSkillDigestChars?: number;
    activeTable?: string;
    // Flow builder: human-readable summary
    flowSummary?: FlowSummary;
    // Phase 1: Display config for data-driven rendering
    displayConfig?: OperatorDisplayConfig;
    // M10.5 Phase 3: Effective settings
    effectiveSettings?: {
      tableName: string;
      fieldMapping?: {
        timeColumn?: string;
        amountColumn?: string;
        orderIdColumn?: string;
        userIdColumn?: string;
      };
      defaultFilters?: Array<{
        column: string;
        op: string;
        value: unknown;
      }>;
      metrics?: Record<string, {
        label: string;
        aggregation: string;
        column?: string;
      }>;
    };
  } | null;
  onUpvote: (query: string) => void;
  onDownvote: (query: string) => void;
  onRetry: (query: string) => void;
  onDelete: () => void;
  llmDurationMs?: number;    // <-- 新增：LLM 耗时（毫秒）
  queryDurationMs?: number;  // <-- 新增：查询耗时（毫秒）
  onEditQuery: (query: string) => void;
  onCopyQuery: (query: string) => void;
  // attachments snapshot for this record
  attachments?: Attachment[];
  // Structured insights data — passed to InsightsPanel (rendered above the data table)
  insightsData?: OperatorInsightsData;
}

// 将毫秒转为秒字符串，如 "耗时 1.2s"
const formatDurationSeconds = (ms?: number): string | null => {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const seconds = ms / 1000;
  if (seconds < 1) return `耗时 ${seconds.toFixed(2)}s`;
  return `耗时 ${seconds.toFixed(1)}s`;
};

// ============================================================================
// Data formatter for ColumnFormatterSpec
// ============================================================================

/**
 * Apply a formatter spec to a value, returning React element or string
 */
const applyFormatter = (value: any, spec: ColumnFormatterSpec): React.ReactNode => {
  if (value == null || value === '' || value === undefined) {
    return '-';
  }

  switch (spec.type) {
    case 'ratio_to_fold': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      if (Math.abs(num - 1.0) < 0.0001) return '无折扣';
      const precision = spec.precision ?? 1;
      const fold = (num * 10).toFixed(precision);
      return `${fold}折`;
    }

    case 'percent_signed': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const precision = spec.precision ?? 1;
      const percent = (num * 100).toFixed(precision);
      const sign = num < 0 ? '' : '+';
      const label = num < 0 ? (spec.labelNegative ?? '（亏损）') : '';
      return `${sign}${percent}%${label}`;
    }

    case 'currency_signed': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const unit = spec.unit ?? '';
      const precision = spec.precision ?? 2;
      const formatted = num.toFixed(precision);
      const sign = num < 0 ? '' : '+';
      const label = num < 0 ? '（亏损）' : '';
      return `${sign}${formatted}${unit}${label}`;
    }

    case 'percent_deviation': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const precision = spec.precision ?? 1;
      const percent = Math.abs(num * 100).toFixed(precision);
      const direction = num < 0 ? '低' : '高';
      const prefix = spec.prefix ?? '';
      return `${prefix}${direction}${percent}%`;
    }

    case 'json_tag_badges': {
      let tags: string[] = [];
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          tags = Array.isArray(parsed) ? parsed : [value];
        } catch {
          tags = [value];
        }
      } else if (Array.isArray(value)) {
        tags = value;
      } else {
        tags = [String(value)];
      }

      const priorityTags = spec.priorityTags ?? [];
      // Sort: priority tags first, then others
      const sorted = [
        ...tags.filter(t => priorityTags.includes(t)),
        ...tags.filter(t => !priorityTags.includes(t)),
      ];

      return (
        <Space size="small" wrap>
          {sorted.map((tag, idx) => (
            <Tag key={idx} color="blue">
              {tag}
            </Tag>
          ))}
        </Space>
      );
    }

    case 'duration_days': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const unit = spec.unit ?? '天';
      if (num === 0) return '首次购买';
      return `${num.toFixed(0)}${unit}`;
    }

    case 'risk_badge': {
      const textValue = String(value);
      const colorMap: Record<string, string> = {
        '严重': 'red',
        '高': 'orange',
        '中': 'gold',
        '低': 'green',
      };
      const color = colorMap[textValue] || 'default';
      return <Tag color={color}>{textValue}</Tag>;
    }

    default:
      return String(value);
  }
};

const LIST_STYLE: React.CSSProperties = {
  margin: '6px 0 0 0',
  paddingLeft: 20,
  color: 'var(--vm-text-secondary)',
  fontSize: 13,
  lineHeight: '1.8',
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  color: TOKEN.textSecondary,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  marginBottom: 4,
  marginTop: 12,
};

const FlowSummaryPanel: React.FC<{ summary: FlowSummary }> = ({ summary }) => {
  const { operatorName, tables, joins, selectedFields, conditions, udfSummary } = summary;

  return (
    <div>
      <Typography.Text strong>2. 分析流配置</Typography.Text>
      <div style={{
        marginTop: 8,
        background: TOKEN.bgSection,
        border: `1px solid ${TOKEN.borderSubtle}`,
        borderRadius: 6,
        padding: '12px 16px',
      }}>
        {/* Operator */}
        <div style={SECTION_TITLE_STYLE}>使用算子</div>
        <ul style={LIST_STYLE}>
          <li>{operatorName}</li>
        </ul>

        {/* Tables */}
        {tables.length > 0 && (
          <>
            <div style={SECTION_TITLE_STYLE}>数据来源</div>
            <ul style={LIST_STYLE}>
              {tables.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </>
        )}

        {/* Joins */}
        {joins.length > 0 && (
          <>
            <div style={SECTION_TITLE_STYLE}>关联关系</div>
            <ul style={LIST_STYLE}>
              {joins.map((j, i) => (
                <li key={i}>
                  {j.leftTable}<strong style={{ color: 'var(--vm-text-primary)' }}>.</strong>{j.leftField}
                  {' '}<Tag color="geekblue" style={{ fontSize: 11, padding: '0 5px' }}>{j.joinTypeLabel}</Tag>{' '}
                  {j.rightTable}<strong style={{ color: 'var(--vm-text-primary)' }}>.</strong>{j.rightField}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Selected fields */}
        {selectedFields.length > 0 && (
          <>
            <div style={SECTION_TITLE_STYLE}>查询字段</div>
            <ul style={LIST_STYLE}>
              {selectedFields.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </>
        )}

        {/* Conditions */}
        {conditions.length > 0 && (
          <>
            <div style={SECTION_TITLE_STYLE}>筛选条件</div>
            <ul style={LIST_STYLE}>
              {conditions.map((cg) => (
                <li key={cg.refId}>
                  <span style={{ color: 'var(--vm-flow-warning)', fontWeight: 600 }}>{cg.refId}</span>
                  {cg.tableName ? <span style={{ color: TOKEN.textSecondary }}> · {cg.tableName}</span> : null}
                  {cg.conditions.length > 0 && (
                    <ul style={{ ...LIST_STYLE, marginTop: 2 }}>
                      {cg.conditions.map((c, ci) => (
                        <li key={ci}>{c.field} {c.operator}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* UDF config summary */}
        {udfSummary.length > 0 && (
          <>
            <div style={SECTION_TITLE_STYLE}>算子配置</div>
            <ul style={LIST_STYLE}>
              {udfSummary.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

const ThinkingSteps: React.FC<{ 
  steps: { 
    tool: string; 
    params: any; 
    thought?: string;
    // M10.5: Skill execution metadata
    skillName?: string;
    industry?: string;
    userSkillApplied?: boolean;
    userSkillDigestChars?: number;
    activeTable?: string;
    // Flow builder: human-readable summary
    flowSummary?: FlowSummary;
    // M10.5 Phase 3: Effective settings
    effectiveSettings?: {
      tableName: string;
      fieldMapping?: {
        timeColumn?: string;
        amountColumn?: string;
        orderIdColumn?: string;
        userIdColumn?: string;
      };
      defaultFilters?: Array<{
        column: string;
        op: string;
        value: unknown;
      }>;
      metrics?: Record<string, {
        label: string;
        aggregation: string;
        column?: string;
      }>;
    };
  }; 
  llmDurationMs?: number;
}> = ({ steps, llmDurationMs }) => {
  const llmDurationLabel = formatDurationSeconds(llmDurationMs);

  // M10.5 Phase 2: Render skill metadata tags
  const renderSkillMetadataTags = () => {
    const { skillName, industry, userSkillApplied, userSkillDigestChars } = steps;
    
    // Don't render if no metadata available
    if (!skillName && !industry && userSkillApplied === undefined) {
      return null;
    }

    const tags: React.ReactNode[] = [];

    // [Skill] tag - always show if skillName exists
    if (skillName) {
      tags.push(
        <Tag key="skill" color="blue" style={{ marginBottom: 0 }}>
          Skill: {skillName}
        </Tag>
      );
    }

    // [Industry] tag - only show if industry exists
    if (industry) {
      tags.push(
        <Tag key="industry" color="green" style={{ marginBottom: 0 }}>
          Industry: {industry}
        </Tag>
      );
    }

    // [UserSkill] tag - always show with applied/not configured status
    if (userSkillApplied === true && userSkillDigestChars !== undefined) {
      tags.push(
        <Tag key="userskill" color="orange" style={{ marginBottom: 0 }}>
          UserSkill: applied, {userSkillDigestChars}/1200 chars
        </Tag>
      );
    } else if (userSkillApplied === false) {
      tags.push(
        <Tag key="userskill" color="default" style={{ marginBottom: 0 }}>
          UserSkill: not configured
        </Tag>
      );
    }

    return (
      <div style={{ marginBottom: 12 }}>
        <Space size={[4, 4]} wrap>
          {tags}
        </Space>
      </div>
    );
  };

  // M10.5 Phase 3: Render effective settings (user skill configuration used)
  const renderEffectiveSettings = () => {
    const { effectiveSettings } = steps;
    
    if (!effectiveSettings) {
      return null;
    }

    const { tableName, fieldMapping, defaultFilters, metrics } = effectiveSettings;

    return (
      <div>
        <Typography.Text strong>3. 本次生效配置 (Effective Settings)</Typography.Text>
        <div style={{ 
          marginTop: '8px', 
          padding: '12px',
          background: TOKEN.bgSection,
          border: `1px solid ${TOKEN.borderSubtle}`,
          borderRadius: 4,
        }}>
          <Space direction="vertical" style={{ width: '100%', gap: '8px' }}>
            {/* Table Name */}
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Table:</Typography.Text>
              <Typography.Text style={{ marginLeft: 8 }}>{tableName}</Typography.Text>
            </div>

            {/* Field Mapping */}
            {fieldMapping && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Field Mapping:</Typography.Text>
                <div style={{ marginLeft: 16, marginTop: 4 }}>
                  {fieldMapping.timeColumn && (
                    <div><Typography.Text style={{ fontSize: 12 }}>• Time: {fieldMapping.timeColumn}</Typography.Text></div>
                  )}
                  {fieldMapping.amountColumn && (
                    <div><Typography.Text style={{ fontSize: 12 }}>• Amount: {fieldMapping.amountColumn}</Typography.Text></div>
                  )}
                  {fieldMapping.orderIdColumn && (
                    <div><Typography.Text style={{ fontSize: 12 }}>• OrderId: {fieldMapping.orderIdColumn}</Typography.Text></div>
                  )}
                  {fieldMapping.userIdColumn && (
                    <div><Typography.Text style={{ fontSize: 12 }}>• UserId: {fieldMapping.userIdColumn}</Typography.Text></div>
                  )}
                  {!fieldMapping.timeColumn && !fieldMapping.amountColumn && !fieldMapping.orderIdColumn && !fieldMapping.userIdColumn && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Not configured</Typography.Text>
                  )}
                </div>
              </div>
            )}

            {/* Default Filters */}
            {defaultFilters && defaultFilters.length > 0 && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Default Filters: ({defaultFilters.length} total)
                </Typography.Text>
                <div style={{ marginLeft: 16, marginTop: 4 }}>
                  {defaultFilters.slice(0, 5).map((filter, idx) => (
                    <div key={idx}>
                      <Typography.Text style={{ fontSize: 12 }}>
                        • {filter.column} {filter.op} {JSON.stringify(filter.value)}
                      </Typography.Text>
                    </div>
                  ))}
                  {defaultFilters.length > 5 && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      +{defaultFilters.length - 5} more filters...
                    </Typography.Text>
                  )}
                </div>
              </div>
            )}

            {/* Metrics */}
            {metrics && Object.keys(metrics).length > 0 && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Metrics: ({Object.keys(metrics).length} total)
                </Typography.Text>
                <div style={{ marginLeft: 16, marginTop: 4 }}>
                  {Object.entries(metrics).slice(0, 8).map(([key, metric]) => (
                    <div key={key}>
                      <Typography.Text style={{ fontSize: 12 }}>
                        • {key}: {metric.aggregation}({metric.column || '*'})
                      </Typography.Text>
                    </div>
                  ))}
                  {Object.keys(metrics).length > 8 && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      +{Object.keys(metrics).length - 8} more metrics...
                    </Typography.Text>
                  )}
                </div>
              </div>
            )}
          </Space>
        </div>
      </div>
    );
  };

  return (
    <Collapse ghost style={{ margin: '0 -24px' }}>
      <Collapse.Panel
        header={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>查看AI思考过程</span>
            {llmDurationLabel && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {llmDurationLabel}
              </Typography.Text>
            )}
          </div>
        }
        key="1"
      >
        <div style={{ padding: '16px 24px 0 24px' }}>
          <Space direction="vertical" style={{ width: '100%', gap: '16px' }}>
            {/* M10.5 Phase 2: Skill metadata tags */}
            {renderSkillMetadataTags()}

            {steps.thought && (
              <Space align="start">
                <Avatar src="/icons/icon-128.png" size={24} />
                <Typography.Text style={{ color: 'var(--vm-text-secondary)' }}>{steps.thought}</Typography.Text>
              </Space>
            )}

            <div>
              <Typography.Text strong>1. 决定调用工具</Typography.Text>
              <div style={{ marginTop: '4px' }}>
                <Tag color="blue">{steps.tool}</Tag>
              </div>
            </div>

            {/* Flow builder: show business-readable summary instead of raw SQL */}
            {steps.tool === 'flow_builder' && steps.flowSummary ? (
              <FlowSummaryPanel summary={steps.flowSummary} />
            ) : steps.tool !== 'flow_builder' ? (
              <div>
                <Typography.Text strong>2. 准备了以下参数</Typography.Text>
                <pre style={{
                  background: TOKEN.bgSection,
                  border: `1px solid ${TOKEN.borderSubtle}`,
                  padding: '8px 12px',
                  borderRadius: 4,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  marginTop: '4px'
                }}>
                  <code>{JSON.stringify(steps.params, null, 2)}</code>
                </pre>
              </div>
            ) : null}
            
            {/* M10.5 Phase 3: Effective Settings */}
            {renderEffectiveSettings()}
          </Space>
        </div>
      </Collapse.Panel>
    </Collapse>
  );
};

// Helper to format Date into UTC 'YYYY-MM-DD HH:mm:ss'
const formatDateToUTCString = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
};

// Helper function to format TIMESTAMP values
const formatTimestamp = (value: any): string => {
  if (value instanceof Date) {
    return formatDateToUTCString(value);
  }
  // If it's an ISO-like string (ends with Z or contains 'T'), parse it and show UTC
  if (typeof value === 'string' && (/^\d{4}-\d{2}-\d{2}T/.test(value) || value.endsWith('Z'))) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return formatDateToUTCString(d);
  }
  // Attempt to parse if it's a string that looks like a date
  if (typeof value === 'string' && !isNaN(Date.parse(value))) {
    const d = new Date(value);
    return formatDateToUTCString(d);
  }
  // If it's a number, attempt to detect seconds/milliseconds/microseconds
  if (typeof value === 'number') {
    let ms = value;
    if (value > 1e14) {
      // assume microseconds -> convert to ms
      ms = Math.floor(value / 1000);
    } else if (value > 1e12) {
      // likely milliseconds; use as-is
      ms = value;
    } else if (value > 1e9) {
      // likely seconds -> convert to ms
      ms = value * 1000;
    } else {
      // fallback: treat as ms
      ms = value;
    }

    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return formatDateToUTCString(d);
    }
    return String(value);
  }
  return String(value);
};

/**
 * Builds a safe schema array for rendering/export.
 *
 * If backend schema is missing or invalid, this falls back to inferring columns
 * from the first row of data.
 */
const buildSafeSchema = (schema: unknown, data: unknown): Array<{ name: string; type: string }> => {
  if (Array.isArray(schema)) {
    const normalized = schema
      .map((col: unknown) => {
        if (typeof col === 'object' && col !== null) {
          const c = col as { name?: unknown; type?: unknown };
          const name = typeof c.name === 'string' ? c.name : '';
          const type = typeof c.type === 'string' ? c.type : 'unknown';
          return name ? { name, type } : null;
        }
        return null;
      })
      .filter((x): x is { name: string; type: string } => x !== null);

    if (normalized.length > 0) return normalized;
  }

  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
    const keys = Object.keys(data[0] as Record<string, unknown>);
    return keys.map((k) => ({ name: k, type: 'unknown' }));
  }

  return [];
};

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ query, status, data, schema, thinkingSteps, onUpvote, onDownvote, onRetry, onDelete, llmDurationMs, queryDurationMs, onEditQuery, onCopyQuery, attachments, insightsData }) => {
  const [voted, setVoted] = useState<'up' | null>(null);
  const [queryExpanded, setQueryExpanded] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState('0');
  const [columnFilters, setColumnFilters] = useState<Record<string, AdvancedColumnFilterState>>({});
  // Draft state: edited in dropdown but not yet applied to table
  const [pendingColumnFilters, setPendingColumnFilters] = useState<Record<string, AdvancedColumnFilterState>>({});
  // Ref to latest filtered table data — used by export handler
  const filteredDataRef = useRef<Record<string, unknown>[]>([]);
  const queryDurationLabel = formatDurationSeconds(queryDurationMs);
  const llmDurationLabel = formatDurationSeconds(llmDurationMs);

  const handleUpvoteClick = () => {
    setVoted('up');
    onUpvote(query);
  };

  const safeSchema = buildSafeSchema(schema, data);

  const canExport =
    status === 'resultsReady' &&
    safeSchema.length > 0 &&
    !!data &&
    Array.isArray(data) &&
    data.length > 0 &&
    !(typeof data === 'object' && 'error' in (data as any));

  const handleExportClick = () => {
    if (!canExport || !Array.isArray(data)) {
      message.warning('暂无可导出的数据');
      return;
    }
    // Export uses filtered data captured in ref (reflects active filters)
    const exportData = filteredDataRef.current.length > 0
      ? filteredDataRef.current
      : (data as Record<string, unknown>[]);
    try {
      exportTableToCsv({
        data: exportData as any[],
        schema: safeSchema,
      });
    } catch (e) {
      console.error('Failed to export CSV:', e);
      message.error('导出失败，请稍后重试');
    }
  };

  const renderContent = () => {
    const iconStyle = { fontSize: '16px', color: 'var(--vm-text-muted)', transition: 'all 0.2s' };
    const commonActions = (
      <div style={{ padding: '2px 0' }}>
        <Space size="small">
          <Tooltip title="有用">
            <Button
              type="text"
              icon={voted === 'up'
                ? <LikeFilled style={{ ...iconStyle, color: 'var(--vm-primary)' }} />
                : <LikeOutlined style={iconStyle} />
              }
              onClick={handleUpvoteClick}
              className="hover:bg-orange-500/15"
            />
          </Tooltip>
          <Tooltip title="没用">
            <Button
              type="text"
              icon={<DislikeOutlined style={iconStyle} />}
              onClick={() => onDownvote(query)}
              className="hover:bg-red-500/15"
            />
          </Tooltip>
          <Tooltip title="重试">
            <Button
              type="text"
              icon={<RedoOutlined style={iconStyle} />}
              onClick={() => onRetry(query)}
              className="hover:bg-amber-500/15"
            />
          </Tooltip>
          <Tooltip title={canExport ? "导出CSV" : "暂无可导出数据"}>
            <Button
              type="text"
              icon={<DownloadOutlined style={iconStyle} />}
              onClick={handleExportClick}
              disabled={!canExport}
              className="hover:bg-green-500/15"
            />
          </Tooltip>
          <Popconfirm
            title="您确定要删除此条记录吗？"
            onConfirm={onDelete}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                icon={<DeleteOutlined style={{ ...iconStyle, color: 'var(--vm-text-error)' }} />}
                danger
                className="hover:bg-red-500/15"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      </div>
    );

    // 公共的 Card 标题：左侧为 Markdown 渲染的 Query，右侧是编辑/复制按钮（右上角对齐）
    const renderCardTitle = () => {
      const QUERY_PREVIEW_LENGTH = 200;
      const shouldTruncate = query.length > QUERY_PREVIEW_LENGTH;
      const displayQuery = queryExpanded || !shouldTruncate 
        ? query 
        : query.slice(0, QUERY_PREVIEW_LENGTH) + '...';

      return (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ 
                fontFamily: 'Fira Code, monospace',
                fontSize: '14px',
                lineHeight: '1.6',
                color: 'var(--vm-bg-section)',
              }}>
                <span style={{ 
                  color: 'var(--vm-text-primary)',
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                }}>Query:</span>{' '}
                <span style={{ 
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--vm-text-primary)'
                }}>{displayQuery}</span>
              </div>
              {shouldTruncate && (
                <Button
                  type="link"
                  size="small"
                  icon={queryExpanded ? <UpOutlined /> : <DownOutlined />}
                  onClick={() => setQueryExpanded(!queryExpanded)}
                  style={{
                    padding: 0,
                    height: 'auto',
                    color: 'var(--vm-primary)',
                    fontSize: '12px',
                    alignSelf: 'flex-start',
                  }}
                >
                  {queryExpanded ? '收起' : '展开全部'}
                </Button>
              )}
            </div>
          </div>
          <Space
            size="small"
            style={{
              flexShrink: 0,
              alignSelf: 'flex-start',
            }}
          >
            <Tooltip title="编辑查询">
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditQuery(query);
                }}
                style={{
                  color: 'var(--vm-text-muted)',
                  transition: 'all 0.2s',
                }}
                className="hover:text-orange hover:bg-orange-500/10"
              />
            </Tooltip>
            <Tooltip title="复制查询">
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyQuery(query);
                }}
                style={{
                  color: 'var(--vm-text-muted)',
                  transition: 'all 0.2s',
                }}
                className="hover:text-orange hover:bg-orange-500/10"
              />
            </Tooltip>
          </Space>
        </div>
      );
    };

    // 每条记录专属附件展示，靠近 Query 区域
    const renderAttachmentsInline = () => {
      if (!attachments || attachments.length === 0) return null;

      // 简单聚合：按 file.name + sheetName 展示
      return (
        <div style={{ marginTop: 8 }}>
          <Space size={[4, 4]} wrap>
            {attachments.map((att) => {
              const label = att.sheetName
                ? `${att.file.name} (${att.sheetName})`
                : att.file.name;
              return (
                <Tag
                  key={att.id}
                  icon={<FileExcelOutlined />}
                  color="default"
                  style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  <Tooltip title={label}>{label}</Tooltip>
                </Tag>
              );
            })}
          </Space>
        </div>
      );
    };

    const renderThinkingPanel = (): React.ReactNode => {
      // Always render the header so that LLM timing is always visible.
      if (thinkingSteps) {
        return <ThinkingSteps steps={thinkingSteps} llmDurationMs={llmDurationMs} />;
      }

      // Even without thinkingSteps, show fallback with timing
      return (
        <Collapse ghost style={{ margin: '0 -24px' }}>
          <Collapse.Panel
            header={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>查看AI思考过程</span>
                {llmDurationLabel && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {llmDurationLabel}
                  </Typography.Text>
                )}
              </div>
            }
            key="1"
          >
            <Typography.Text type="secondary">
              本次未展示详细思考步骤（可能因澄清/策略拒绝/执行失败提前结束）。
            </Typography.Text>
          </Collapse.Panel>
        </Collapse>
      );
    };

    if (status === 'analyzing') {
      return (
        <Card
          title={renderCardTitle()}
          style={{ 
            background: 'linear-gradient(135deg, var(--vm-bg-dark) 0%, var(--vm-bg-card) 100%)',
            border: '1px solid var(--vm-accent-orange-border)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--vm-accent-orange-border-light)',
          }}
          headStyle={{
            borderBottom: '1px solid var(--vm-accent-orange-border-light)',
            background: 'var(--vm-bg-section)',
          }}
        >
          {/* 附件展示区域放在 Query 下方 */}
          {renderAttachmentsInline()}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '150px' }}>
            <Spin tip="AI 正在分析中..." size="large" />
          </div>
        </Card>
      );
    }

    if (status === 'resultsReady') {
      const cardProps = {
        title: renderCardTitle(),
        style: { 
          background: 'linear-gradient(135deg, var(--vm-bg-dark) 0%, var(--vm-bg-card) 100%)',
          border: '1px solid var(--vm-accent-orange-border)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--vm-accent-orange-border-light)',
        },
        bodyStyle: { 
          padding: '0 24px 16px 24px',
          background: 'transparent',
        },
        headStyle: {
          borderBottom: '1px solid var(--vm-accent-orange-border-light)',
          background: 'var(--vm-bg-section)',
        },
      };

      const commonContent = (
        <Space direction="vertical" style={{ width: '100%' }}>
          {renderAttachmentsInline()}
          {renderThinkingPanel()}
          <Divider style={{ borderColor: 'var(--vm-accent-orange-border)', margin: '0' }} />
          <div
            style={{
              paddingTop: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
            }}>
              <div style={{
                width: 3,
                height: 20,
                background: 'linear-gradient(180deg, #F97316 0%, #FB923C 100%)',
                borderRadius: 2,
              }} />
              <Typography.Text style={{ 
                margin: 0,
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--vm-text-primary)',
                fontFamily: 'Fira Sans, sans-serif',
              }}>
                分析结果
              </Typography.Text>
            </div>
            {queryDurationLabel && (
              <Tag 
                color="orange" 
                style={{ 
                  fontSize: 11,
                  fontFamily: 'Fira Code, monospace',
                  background: 'var(--vm-accent-orange-subtle)',
                  border: '1px solid var(--vm-accent-orange-border-strong)',
                  color: 'var(--vm-primary)',
                }}
              >
                {queryDurationLabel}
              </Tag>
            )}
          </div>
        </Space>
      );

      // Handle error data
      if (data && typeof data === 'object' && 'error' in data) {
        const errText = String((data as { error: unknown }).error ?? '');
        const isClarification = /Need clarification/i.test(errText) || /需要你补充信息/.test(errText);
        const clarifyingQuestions: string[] = isClarification ? parseClarifyingQuestions(errText) : [];
        const quickReplies: string[] =
          clarifyingQuestions.length > 0 ? buildQuickRepliesFromQuestion(clarifyingQuestions[0] ?? '') : [];

        return (
          <Card {...cardProps}>
            {commonContent}

            <Alert
              message={isClarification ? '需要你补充信息' : '抱歉，我无法理解您的指令'}
              description={errText}
              type={isClarification ? 'warning' : 'error'}
              showIcon
              style={{ marginTop: '12px' }}
            />

            {isClarification && clarifyingQuestions.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Typography.Text type="secondary">你可以直接点选一个选项来补全问题：</Typography.Text>
                <ul style={{ marginTop: 8, marginBottom: 8, paddingLeft: 18 }}>
                  {clarifyingQuestions.map((q: string) => (
                    <li key={q} style={{ color: TOKEN.textPrimary }}>
                      {q}
                    </li>
                  ))}
                </ul>

                {quickReplies.length > 0 && (
                  <Space wrap size={[8, 8]}>
                    {quickReplies.map((reply: string) => (
                      <Button
                        key={reply}
                        size="small"
                        onClick={() => {
                          onEditQuery(`${query} ${reply}`);
                        }}
                      >
                        {reply}
                      </Button>
                    ))}
                  </Space>
                )}
              </div>
            )}

            <Paragraph type="secondary" style={{ marginTop: '16px' }}>
              你也可以直接在输入框中补充更具体的条件（例如：时间范围、日期字段、筛选条件），然后再提交。
            </Paragraph>
          </Card>
        );
      }

      // Ensure data is an array and schema is present
      const actualData = data as any[];
      if (!actualData || actualData.length === 0 || safeSchema.length === 0) {
        // If the operator produced insights data, show it even with no table rows (no Table rendered)
        if (insightsData) {
          return (
            <Card {...cardProps}>
              {commonContent}
              <ResultInsightsPanel insightsData={insightsData} />
            </Card>
          );
        }
        return (
          <Card {...cardProps}>
            {commonContent}
            <Empty description="分析完成，但没有返回结果。" style={{ marginTop: '16px' }} />
            <Paragraph type="secondary" style={{ marginTop: '16px' }}>
              请尝试调整您的指令，例如更具体地描述您想要的数据或分析类型。
            </Paragraph>
          </Card>
        );
      }

      // Construct columns using schema information
      const displayConfig = thinkingSteps?.displayConfig;
      const columnFormatters = displayConfig?.columnFormatters ?? {};
      const columnTooltips = displayConfig?.columnTooltips ?? {};

      const getColumnFilterKind = (typeStr: string, formatter?: ColumnFormatterSpec): ColumnFilterKind => {
        if (formatter?.type === 'risk_badge') return 'enum';
        if (typeStr.includes('boolean')) return 'boolean';
        if (/double|float|decimal|real|int|bigint|numeric/.test(typeStr)) return 'number';
        if (/timestamp|date|time/.test(typeStr)) return 'date';
        return 'text';
      };

      const getDefaultOperator = (kind: ColumnFilterKind): AdvancedColumnFilterState['operator'] => {
        if (kind === 'number') return 'between';
        if (kind === 'date') return 'between';
        if (kind === 'boolean' || kind === 'enum') return 'in';
        return 'contains';
      };

      const tableDataSource = actualData.map((row: any, rowIndex: number) => ({
        ...row,
        key: `row-${rowIndex}`,
      }));

      const distinctValuesByColumn = safeSchema.reduce<Record<string, string[]>>((acc, col) => {
        acc[col.name] = getDistinctColumnValues(tableDataSource, col.name);
        return acc;
      }, {});

      const makeAdvancedFilterDropdown = (colName: string, kind: ColumnFilterKind) => ({
        filterDropdown: ({ confirm }: any) => {
          // Read draft state; fallback to applied state; fallback to default
          const current = pendingColumnFilters[colName] ?? columnFilters[colName] ?? { operator: getDefaultOperator(kind) };
          const operatorOptions: Array<{ value: AdvancedColumnFilterState['operator']; label: string }> = kind === 'number'
            ? [
                { value: 'between', label: '范围 (Between)' },
                { value: 'equals', label: '=' },
                { value: 'notEquals', label: '≠' },
                { value: 'gt', label: '>' },
                { value: 'gte', label: '≥' },
                { value: 'lt', label: '<' },
                { value: 'lte', label: '≤' },
                { value: 'blank', label: '为空' },
                { value: 'notBlank', label: '不为空' },
              ]
            : kind === 'date'
            ? [
                { value: 'between', label: '日期范围' },
                { value: 'on', label: '等于日期' },
                { value: 'before', label: '早于日期' },
                { value: 'after', label: '晚于日期' },
                { value: 'last7', label: '最近 7 天' },
                { value: 'last30', label: '最近 30 天' },
                { value: 'last90', label: '最近 90 天' },
                { value: 'blank', label: '为空' },
                { value: 'notBlank', label: '不为空' },
              ]
            : kind === 'boolean' || kind === 'enum'
            ? [
                { value: 'in', label: '值选择' },
                { value: 'blank', label: '为空' },
                { value: 'notBlank', label: '不为空' },
              ]
            : [
                { value: 'contains', label: '包含' },
                { value: 'notContains', label: '不包含' },
                { value: 'equals', label: '等于' },
                { value: 'notEquals', label: '不等于' },
                { value: 'startsWith', label: '前缀匹配' },
                { value: 'endsWith', label: '后缀匹配' },
                { value: 'in', label: '值选择' },
                { value: 'blank', label: '为空' },
                { value: 'notBlank', label: '不为空' },
              ];

          const shouldShowSingleInput = !['in', 'blank', 'notBlank', 'last7', 'last30', 'last90'].includes(current.operator);
          const shouldShowRangeInput = current.operator === 'between';
          const shouldShowMultiValue = current.operator === 'in';
          const canUseNumericInput = kind === 'number';
          const canUseDatePicker = kind === 'date';

          // Updates draft only — does NOT affect the table until "应用" is clicked
          const updateDraft = (next: Partial<AdvancedColumnFilterState>) => {
            setPendingColumnFilters((prev) => ({
              ...prev,
              [colName]: { ...current, ...next },
            }));
          };

          // Commit draft → applied state, then close the dropdown
          const applyFilter = () => {
            const draft = pendingColumnFilters[colName] ?? current;
            if (!isFilterStateActive(draft)) {
              // Draft not active → clear applied filter
              setColumnFilters((prev) => {
                const { [colName]: _omitted, ...rest } = prev;
                return rest;
              });
            } else {
              setColumnFilters((prev) => ({ ...prev, [colName]: draft }));
            }
            confirm();
          };

          // Clear both draft and applied for this column
          const resetFilter = () => {
            setPendingColumnFilters((prev) => {
              const { [colName]: _omitted, ...rest } = prev;
              return rest;
            });
            setColumnFilters((prev) => {
              const { [colName]: _omitted, ...rest } = prev;
              return rest;
            });
            confirm();
          };

          const selectOptions = distinctValuesByColumn[colName].map((v) => ({ label: v, value: v }));

          return (
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260 }}>
              <Select
                size="small"
                value={current.operator}
                options={operatorOptions}
                onChange={(value) => {
                  // Operator change resets value inputs in the draft
                  setPendingColumnFilters((prev) => ({
                    ...prev,
                    [colName]: { operator: value as AdvancedColumnFilterState['operator'] },
                  }));
                }}
              />

              {shouldShowMultiValue && (
                <Checkbox.Group
                  options={selectOptions}
                  value={Array.isArray(current.values) ? current.values.map(String) : []}
                  onChange={(values) => updateDraft({ values: values.map(String), value: undefined, valueTo: undefined })}
                />
              )}

              {shouldShowRangeInput && (
                <Space direction={canUseDatePicker ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
                  {canUseNumericInput ? (
                    <>
                      <InputNumber
                        size="small"
                        value={typeof current.value === 'number' ? current.value : undefined}
                        onChange={(value) => updateDraft({ value: value ?? undefined })}
                        placeholder="起始"
                      />
                      <InputNumber
                        size="small"
                        value={typeof current.valueTo === 'number' ? current.valueTo : undefined}
                        onChange={(value) => updateDraft({ valueTo: value ?? undefined })}
                        placeholder="结束"
                      />
                    </>
                  ) : canUseDatePicker ? (
                    // Date range: use RangePicker for better UX
                    <DatePicker.RangePicker
                      size="small"
                      style={{ width: '100%' }}
                      value={[
                        current.value ? dayjs(String(current.value)) : null,
                        current.valueTo ? dayjs(String(current.valueTo)) : null,
                      ]}
                      onChange={(dates) => updateDraft({
                        value: dates?.[0]?.format('YYYY-MM-DD') ?? undefined,
                        valueTo: dates?.[1]?.format('YYYY-MM-DD') ?? undefined,
                      })}
                    />
                  ) : (
                    <>
                      <Input
                        size="small"
                        value={String(current.value ?? '')}
                        onChange={(e) => updateDraft({ value: e.target.value })}
                        placeholder="起始值"
                      />
                      <Input
                        size="small"
                        value={String(current.valueTo ?? '')}
                        onChange={(e) => updateDraft({ valueTo: e.target.value })}
                        placeholder="结束值"
                      />
                    </>
                  )}
                </Space>
              )}

              {!shouldShowRangeInput && shouldShowSingleInput && (
                canUseNumericInput ? (
                  <InputNumber
                    size="small"
                    style={{ width: '100%' }}
                    value={typeof current.value === 'number' ? current.value : undefined}
                    onChange={(value) => updateDraft({ value: value ?? undefined, valueTo: undefined })}
                    placeholder="输入数值"
                  />
                ) : canUseDatePicker ? (
                  // Single date: use DatePicker
                  <DatePicker
                    size="small"
                    style={{ width: '100%' }}
                    value={current.value ? dayjs(String(current.value)) : null}
                    onChange={(date) => updateDraft({ value: date?.format('YYYY-MM-DD') ?? undefined, valueTo: undefined })}
                  />
                ) : (
                  <Input
                    size="small"
                    value={String(current.value ?? '')}
                    onChange={(e) => updateDraft({ value: e.target.value, valueTo: undefined })}
                    placeholder={`搜索 ${colName}`}
                  />
                )
              )}

              <Space>
                <Button type="primary" size="small" onClick={applyFilter} icon={<SearchOutlined />}>
                  应用
                </Button>
                <Button size="small" onClick={resetFilter}>
                  重置
                </Button>
              </Space>
            </div>
          );
        },
        filterIcon: () => (
          // Filter icon color reflects APPLIED state (not draft)
          <SearchOutlined
            style={{ color: isFilterStateActive(columnFilters[colName]) ? 'var(--vm-primary)' : undefined }}
          />
        ),
      });

      const tableColumns: ColumnsType<any> = safeSchema.map((col) => {
        let renderFunction;
        const typeStr = String(col.type || '').toLowerCase();
        const colName = col.name;

        // Column type classification
        const isNumericCol = /double|float|decimal|real|int|bigint|numeric/.test(typeStr);
        const isDateCol = /timestamp|date|time/.test(typeStr);

        // Sorter: numeric > date (ISO string) > string localeCompare
        const sorter = isNumericCol
          ? (a: any, b: any) => {
              const av = Number(a[colName] ?? 0);
              const bv = Number(b[colName] ?? 0);
              return av - bv;
            }
          : isDateCol
          ? (a: any, b: any) => String(a[colName] ?? '').localeCompare(String(b[colName] ?? ''))
          : (a: any, b: any) => String(a[colName] ?? '').localeCompare(String(b[colName] ?? ''));

        // Check if there's a custom formatter for this column
        const customFormatter = columnFormatters[colName];
        if (customFormatter) {
          renderFunction = (text: any) => applyFormatter(text, customFormatter);
        } else if (typeStr.includes('timestamp') || typeStr.includes('date') || typeStr.includes('time')) {
          // Default timestamp formatting
          renderFunction = (text: any) => formatTimestamp(text);
        } else if (typeStr.includes('boolean')) {
          // Default boolean formatting
          renderFunction = (text: any) => (typeof text === 'boolean' ? (text ? 'True' : 'False') : String(text));
        }
        // Add more type-specific render functions here as needed (e.g., DECIMAL, DATE, TIME)

        const headerTooltip = columnTooltips[colName];
        const headerTitle = headerTooltip ? (
          <Tooltip title={headerTooltip}>{colName}</Tooltip>
        ) : (
          colName
        );

        const filterKind = getColumnFilterKind(typeStr, customFormatter);
        const advancedFilter = makeAdvancedFilterDropdown(colName, filterKind);

        return {
          title: headerTitle,
          dataIndex: colName,
          key: colName,
          render: renderFunction,
          sorter,
          sortDirections: ['ascend', 'descend'] as const,
          ...advancedFilter,
          onHeaderCell: () => ({
            style: {
              background: 'var(--vm-bg-base)',
              color: 'var(--vm-primary)',
              fontWeight: 600,
              fontFamily: 'Fira Sans, sans-serif',
              fontSize: '13px',
              borderBottom: '2px solid var(--vm-accent-orange-border-strong)',
            },
          }),
          onCell: (record: any) => {
            const rowColorizer = displayConfig?.rowColorizer;
            let cellBg: string | undefined;
            if (rowColorizer) {
              const fieldValue = record[rowColorizer.field];
              const colorConfig = rowColorizer.colorMap?.[String(fieldValue)];
              if (colorConfig?.bg) cellBg = colorConfig.bg;
            }
            return {
              style: {
                fontFamily: 'Fira Code, monospace',
                fontSize: '12px',
                ...(cellBg ? { background: cellBg } : {}),
              },
            };
          },
        };
      });

      // Data is already an array of objects, just need to add a key for Ant Design Table
      // (tableDataSource is defined above near distinctValuesByColumn)

      // Apply default sorting if configured
      const sortedTableDataSource = (() => {
        const defaultSort = displayConfig?.defaultSort;
        if (!defaultSort) return tableDataSource;
        
        const sorted = [...tableDataSource].sort((a, b) => {
          const aVal = a[defaultSort.column];
          const bVal = b[defaultSort.column];
          
          // Handle null/undefined values
          if (aVal == null && bVal == null) return 0;
          if (aVal == null) return 1;
          if (bVal == null) return -1;
          
          // Numeric comparison if both are numbers
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return defaultSort.order === 'ascend' ? aVal - bVal : bVal - aVal;
          }
          
          // String comparison
          const aStr = String(aVal);
          const bStr = String(bVal);
          const cmp = aStr.localeCompare(bStr);
          return defaultSort.order === 'ascend' ? cmp : -cmp;
        });
        
        return sorted;
      })();

      // Apply active tab filtering
      const activeTabs: TabConfig[] | undefined = displayConfig?.tabs;
      const tabFilteredData = (() => {
        if (!activeTabs || activeTabKey === '0') return sortedTableDataSource;
        const tab = activeTabs[Number(activeTabKey)];
        if (!tab?.filterField) return sortedTableDataSource;
        return sortedTableDataSource.filter((row) => row[tab.filterField!] === tab.filterValue);
      })();

      // Apply active column filters (client-side, driven by columnFilters state)
      const columnFilteredData = Object.keys(columnFilters).length === 0
        ? tabFilteredData
        : tabFilteredData.filter((row) =>
            Object.entries(columnFilters).every(([colName, filterState]) => {
              if (!isFilterStateActive(filterState)) return true;
              const colTypeStr = String(safeSchema.find((c) => c.name === colName)?.type || '').toLowerCase();
              const colFormatter = columnFormatters[colName];
              const kind = getColumnFilterKind(colTypeStr, colFormatter);
              return applyAdvancedColumnFilter(row[colName], filterState, kind);
            }),
          );

      // Keep ref in sync so export handler can access latest filtered data
      filteredDataRef.current = columnFilteredData;

      const tableElement = (
        <Table
          dataSource={columnFilteredData}
          columns={tableColumns}
          pagination={{
            defaultPageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            style: {
              marginTop: 16,
            },
          }}
          size="small"
          scroll={{ x: 'max-content' }}
          style={{
            marginTop: activeTabs ? 0 : 16,
          }}
          className="data-analysis-table"
          rowClassName={(_, index) => index % 2 === 0 ? 'table-row-even' : 'table-row-odd'}
        />
      );

      return (
        <Card {...cardProps}>
          {commonContent}
          {/* Operator insights panel rendered above the data table */}
          {insightsData && <ResultInsightsPanel insightsData={insightsData} />}
          {activeTabs ? (
            <Tabs
              activeKey={activeTabKey}
              onChange={setActiveTabKey}
              style={{ marginTop: 8 }}
              items={activeTabs.map((tab, i) => ({
                key: String(i),
                label: tab.label,
                children: tableElement,
              }))}
            />
          ) : tableElement}
          <style>{`
            .data-analysis-table .ant-table {
              background: transparent;
            }
            .data-analysis-table .ant-table-thead > tr > th {
              background: var(--vm-table-header-bg) !important;
              color: var(--vm-table-header-color) !important;
              border-bottom: 1px solid var(--vm-primary-border) !important;
            }
            .data-analysis-table .ant-table-tbody > tr.table-row-even > td {
              background: transparent;
              color: var(--vm-table-cell-color) !important;
            }
            .data-analysis-table .ant-table-tbody > tr.table-row-odd > td {
              background: var(--vm-table-row-even-bg);
              color: var(--vm-table-cell-color) !important;
            }
            .data-analysis-table .ant-table-tbody > tr:hover > td {
              background: var(--vm-table-row-hover-bg) !important;
            }
            .data-analysis-table .ant-table-cell {
              border-bottom: 1px solid var(--vm-table-cell-border);
              color: var(--vm-table-cell-color) !important;
            }
            .data-analysis-table .ant-pagination-item {
              background: transparent;
              border-color: var(--vm-border-subtle);
            }
            .data-analysis-table .ant-pagination-item a {
              color: var(--vm-text-primary);
            }
            .data-analysis-table .ant-pagination-item-active {
              background: var(--vm-primary-light);
              border-color: var(--vm-primary-border);
            }
            .data-analysis-table .ant-pagination-item-active a {
              color: var(--vm-primary);
            }
          `}</style>
          {/* Action buttons aligned with pagination */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid var(--vm-border-subtle)',
            }}
          >
            {commonActions}
          </div>
        </Card>
      );
    }

    return null;
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      {renderContent()}
    </div>
  );
};

export default ResultsDisplay;
