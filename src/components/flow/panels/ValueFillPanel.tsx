/**
 * Value Fill Panel Component
 * Right-side drawer for filling placeholder values before execution.
 * Groups placeholders by condition node (refId) with field-type-aware inputs.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Drawer, Form, Input, DatePicker, Button, Space, Tag, Tooltip, Alert, Typography } from 'antd';
import { PlayCircleOutlined, CloseOutlined, FilterOutlined, EyeOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { ConditionGroupDefinitionNodeData, ConditionItem, FieldType } from '../../../services/flow/types';
import { FIELD_TYPE_ICONS, SQL_OPERATORS } from '../../../services/flow/constants';
import dayjs from 'dayjs';

const { Text } = Typography;

// Flat map of all operator labels for lookup
const OPERATOR_LABEL_MAP: Record<string, string> = Object.values(SQL_OPERATORS)
  .flat()
  .reduce<Record<string, string>>((acc, op) => { acc[op.value] = op.label; return acc; }, {});

interface ValueFillPanelProps {
  open: boolean;
  onClose: () => void;
  /** Returns success/error so the panel can stay open and display errors on failure. */
  onExecute: () => Promise<{ success: boolean; error?: string }>;
  /** Returns the estimated row count for the current configuration, or null on failure. */
  onPreview: () => Promise<number | null>;
}

interface PlaceholderInfo {
  placeholder: string;
  field: string;
  operator: string;
  fieldType: FieldType;
  tableName: string;
  refId: string;
  groupDisplayName?: string; // User-friendly display name, e.g., "条件组_1"
}

// Get input component based on field type
const getInputComponent = (fieldType: FieldType, placeholder: string, operator?: string) => {
  const iconConfig = FIELD_TYPE_ICONS[fieldType] || FIELD_TYPE_ICONS.UNKNOWN;
  const isInList = operator === 'IN' || operator === 'NOT IN';

  switch (fieldType) {
    case 'DATE':
    case 'TIMESTAMP':
      return (
        <DatePicker
          style={{ width: '100%' }}
          placeholder={`请选择 ${placeholder}`}
          showTime={fieldType === 'TIMESTAMP'}
        />
      );
    default:
      return (
        <Input.TextArea
          rows={isInList ? 3 : 2}
          placeholder={
            isInList
              ? `请输入 ${placeholder}，每行或每个英文逗号 , 中文逗号 ， 分号 ; ； 均可分隔多个值\n如：1,2,3`
              : `请输入 ${placeholder}（${iconConfig.icon} ${fieldType.toLowerCase()}）`
          }
          style={{ resize: 'vertical' }}
        />
      );
  }
};

// Convert value to appropriate type
// For IN / NOT IN, keep the raw string so the strategy can split it properly.
const IN_LIST_OPERATORS = new Set(['IN', 'NOT IN']);

const convertValue = (value: unknown, fieldType: FieldType, operator?: string): unknown => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (operator && IN_LIST_OPERATORS.has(operator)) {
    return String(value);
  }

  switch (fieldType) {
    case 'DATE':
    case 'TIMESTAMP':
      if (dayjs.isDayjs(value)) {
        return fieldType === 'DATE' ? value.format('YYYY-MM-DD') : value.format('YYYY-MM-DD HH:mm:ss');
      }
      return value;
    case 'INTEGER':
    case 'BIGINT':
    case 'SMALLINT':
    case 'TINYINT':
      return parseInt(String(value), 10);
    case 'DECIMAL':
    case 'NUMERIC':
    case 'REAL':
    case 'DOUBLE':
      return parseFloat(String(value));
    case 'BOOLEAN':
      return Boolean(value);
    default:
      return String(value);
  }
};

export const ValueFillPanel: React.FC<ValueFillPanelProps> = ({
  open,
  onClose,
  onExecute,
  onPreview,
}) => {
  const [form] = Form.useForm();
  const nodes = useFlowStore((state) => state.nodes);
  const setPlaceholderValue = useFlowStore((state) => state.setPlaceholderValue);
  const getAllPlaceholderValues = useFlowStore((state) => state.getAllPlaceholderValues);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  // Collect all placeholders from condition definition nodes
  const NO_VALUE_OPERATORS = new Set(['IS NULL', 'IS NOT NULL']);
  const placeholders = useMemo<PlaceholderInfo[]>(() => {
    const result: PlaceholderInfo[] = [];
    nodes.forEach((node) => {
      if (node.type === 'conditionGroupDefinition') {
        const data = node.data as ConditionGroupDefinitionNodeData;
        data.conditions.forEach((condition: ConditionItem) => {
          if (NO_VALUE_OPERATORS.has(condition.operator)) return;
          result.push({
            placeholder: condition.placeholder,
            field: condition.field,
            operator: condition.operator,
            fieldType: condition.valueType,
            tableName: data.tableName,
            refId: data.refId,
            groupDisplayName: data.groupDisplayName,
          });
        });
      }
    });
    return result;
  }, [nodes]);

  const existingValues = useMemo(() => getAllPlaceholderValues(), [getAllPlaceholderValues]);

  // Initialize form values when panel opens
  React.useEffect(() => {
    if (open) {
      const initialValues: Record<string, unknown> = {};
      placeholders.forEach((p) => {
        const existingValue = existingValues[p.placeholder];
        if (existingValue !== undefined) {
          if ((p.fieldType === 'DATE' || p.fieldType === 'TIMESTAMP') && typeof existingValue === 'string') {
            initialValues[p.placeholder] = dayjs(existingValue);
          } else {
            initialValues[p.placeholder] = existingValue;
          }
        }
      });
      form.setFieldsValue(initialValues);
      setValidationErrors({});
      setExecError(null);
      setPreviewCount(null);
      setPreviewFailed(false);
    }
  }, [open, placeholders, existingValues, form]);

  // Validate all values before execution / preview
  const validateAllValues = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    const values = form.getFieldsValue();
    placeholders.forEach((p) => {
      const value = values[p.placeholder];
      if (value === undefined || value === null || value === '') {
        errors[p.placeholder] = `请填写此参数`;
      }
    });
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form, placeholders]);

  /** Save current form values into the Zustand store so strategies can read them. */
  const saveCurrentValues = useCallback(() => {
    const values = form.getFieldsValue();
    placeholders.forEach((p) => {
      const convertedValue = convertValue(values[p.placeholder], p.fieldType, p.operator);
      setPlaceholderValue(p.placeholder, convertedValue);
    });
  }, [form, placeholders, setPlaceholderValue]);

  // Handle form submission (execute)
  const handleSubmit = useCallback(async () => {
    if (!validateAllValues()) return;
    setIsExecuting(true);
    setExecError(null);
    saveCurrentValues();
    // Small tick to let Zustand writes propagate before strategy reads
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const result = await onExecute();
    setIsExecuting(false);
    if (!result.success && result.error) {
      setExecError(result.error);
    }
  }, [validateAllValues, saveCurrentValues, onExecute]);

  // Handle preview — save values, run COUNT(*), display result
  const handlePreview = useCallback(async () => {
    if (!validateAllValues()) return;
    setIsPreviewing(true);
    setPreviewCount(null);
    setPreviewFailed(false);
    setExecError(null);
    saveCurrentValues();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const count = await onPreview();
    setIsPreviewing(false);
    if (count === null) {
      setPreviewFailed(true);
    } else {
      setPreviewCount(count);
    }
  }, [validateAllValues, saveCurrentValues, onPreview]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    form.resetFields();
    setValidationErrors({});
    setExecError(null);
    setPreviewCount(null);
    setPreviewFailed(false);
    onClose();
  }, [form, onClose]);

  // Group placeholders by refId
  const groupedPlaceholders = useMemo(() => {
    const groups: Record<string, PlaceholderInfo[]> = {};
    placeholders.forEach((p) => {
      if (!groups[p.refId]) groups[p.refId] = [];
      groups[p.refId].push(p);
    });
    return groups;
  }, [placeholders]);

  const hasPlaceholders = placeholders.length > 0;

  return (
    <Drawer
      title={
        <Space>
          <PlayCircleOutlined style={{ color: 'var(--vm-primary)' }} />
          <span style={{ color: 'var(--vm-text-primary)', fontWeight: 600 }}>执行参数</span>
        </Space>
      }
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      maskClosable={true}
      closable={true}
      destroyOnClose={false}
      keyboard={true}
      styles={{
        header: {
          background: 'var(--vm-bg-card)',
          borderBottom: `1px solid var(--vm-border-subtle)`,
        },
        body: {
          background: 'var(--vm-bg-base)',
          padding: '16px',
        },
        mask: {
          background: 'rgba(0, 0, 0, 0.45)',
        },
      }}
      closeIcon={<CloseOutlined style={{ color: 'var(--vm-text-helper)' }} />}
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Preview result — shown above buttons */}
          {previewCount !== null && (
            <div style={{
              padding: '6px 12px',
              background: 'var(--vm-primary-light)',
              border: '1px solid var(--vm-primary-border)',
              borderRadius: 6,
              textAlign: 'center',
            }}>
              <span style={{ color: 'var(--vm-text-helper)', fontSize: 12 }}>🫧预计影响: </span>
              <span style={{ color: 'var(--vm-primary)', fontWeight: 700, fontSize: 16 }}>{previewCount.toLocaleString()}</span>
              <span style={{ color: 'var(--vm-text-helper)', fontSize: 12 }}> 行数据</span>
            </div>
          )}
          {previewFailed && (
            <div style={{
              padding: '6px 12px',
              background: 'var(--vm-flow-error-light)',
              border: '1px solid var(--vm-flow-error-light)',
              borderRadius: 6,
              textAlign: 'center',
              color: 'var(--vm-color-error)',
              fontSize: 12,
            }}>
              预览失败，请检查配置
            </div>
          )}
          {/* Error message from execution */}
          {execError && (
            <Alert
              type="error"
              message={execError}
              showIcon
              style={{ fontSize: 12 }}
            />
          )}
          {/* Action buttons: 执行 | 预览 | 取消 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleSubmit}
              loading={isExecuting}
              disabled={!hasPlaceholders || isPreviewing}
            >
              执行
            </Button>
            <Button
              icon={<EyeOutlined />}
              onClick={handlePreview}
              loading={isPreviewing}
              disabled={!hasPlaceholders || isExecuting}
            >
              预览
            </Button>
            <Button onClick={handleCancel} disabled={isExecuting || isPreviewing}>
              取消
            </Button>
          </div>
        </div>
      }
    >
      {!hasPlaceholders ? (
        <Alert
          message="无需填写参数"
          description="当前流程没有条件定义节点，可直接执行。"
          type="info"
          showIcon
        />
      ) : (
        <>
          <div style={{ marginBottom: 16, color: 'var(--vm-text-helper)', fontSize: 12 }}>
            请填写以下条件值后执行分析
          </div>
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            {Object.entries(groupedPlaceholders).map(([refId, items]) => (
              <div
                key={refId}
                style={{
                  marginBottom: 20,
                  padding: 16,
                  background: 'var(--vm-surface-lighter)',
                  borderRadius: 8,
                  border: `1px solid var(--vm-primary-border)`,
                }}
              >
                {/* Group header */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 8 }}>
                  <FilterOutlined style={{ color: 'var(--vm-flow-purple)', fontSize: 13 }} />
                  <Tag color="purple" style={{ fontWeight: 600, margin: 0 }}>{items[0]?.groupDisplayName || refId}</Tag>
                  <Text style={{ color: 'var(--vm-text-helper)', fontSize: 11 }}>
                    {items[0]?.tableName}
                  </Text>
                </div>

                {/* Placeholder inputs */}
                {items.map((p) => {
                  const operatorLabel = OPERATOR_LABEL_MAP[p.operator] ?? p.operator;
                  return (
                    <Form.Item
                      key={p.placeholder}
                      label={
                        <Space size={6}>
                          <Text style={{ color: 'var(--vm-text-light)', fontSize: 13 }}>{p.field}</Text>
                          <Tag
                            style={{
                              fontSize: 11,
                              padding: '0 6px',
                              background: 'var(--vm-primary-light)',
                              border: `1px solid var(--vm-primary-border)`,
                              color: 'var(--vm-primary)',
                            }}
                          >
                            {operatorLabel}
                          </Tag>
                          <Tooltip title={`占位符：${p.placeholder} · 类型：${p.fieldType}`}>
                            <Text style={{ color: 'var(--vm-border-mid)', fontSize: 11, fontFamily: 'monospace' }}>
                              {p.placeholder}
                            </Text>
                          </Tooltip>
                        </Space>
                      }
                      name={p.placeholder}
                      validateStatus={validationErrors[p.placeholder] ? 'error' : undefined}
                      help={validationErrors[p.placeholder]}
                      rules={[{ required: true, message: '请填写此参数' }]}
                    >
                      {getInputComponent(p.fieldType, p.field, p.operator)}
                    </Form.Item>
                  );
                })}
              </div>
            ))}
          </Form>
        </>
      )}
    </Drawer>
  );
};

export default ValueFillPanel;
