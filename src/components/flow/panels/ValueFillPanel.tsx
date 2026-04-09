/**
 * Value Fill Panel Component
 * Right-side panel for filling placeholder values before execution
 * Displays placeholders with field type hints (e.g., date picker for date fields)
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Drawer, Form, Input, DatePicker, Button, Space, Tag, Tooltip, Alert } from 'antd';
import { InfoCircleOutlined, PlayCircleOutlined, CloseOutlined } from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { ConditionDefinitionNodeData, ConditionItem, FieldType } from '../../../services/flow/types';
import { FIELD_TYPE_ICONS } from '../../../services/flow/constants';
import dayjs from 'dayjs';

interface ValueFillPanelProps {
  open: boolean;
  onClose: () => void;
  onExecute: () => void;
}

interface PlaceholderInfo {
  placeholder: string;
  field: string;
  fieldType: FieldType;
  tableName: string;
  refId: string;
}

// Get input component based on field type
const getInputComponent = (fieldType: FieldType, placeholder: string) => {
  const iconConfig = FIELD_TYPE_ICONS[fieldType] || FIELD_TYPE_ICONS.UNKNOWN;

  switch (fieldType) {
    case 'DATE':
    case 'TIMESTAMP':
      return (
        <DatePicker
          style={{ width: '100%' }}
          placeholder={`Enter ${placeholder}`}
          showTime={fieldType === 'TIMESTAMP'}
        />
      );
    default:
      return (
        <Input.TextArea
          rows={3}
          placeholder={`Enter ${placeholder} (${iconConfig.icon} ${fieldType.toLowerCase()})`}
          style={{ resize: 'vertical' }}
        />
      );
  }
};

// Convert value to appropriate type
const convertValue = (value: unknown, fieldType: FieldType): unknown => {
  if (value === undefined || value === null || value === '') {
    return null;
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
}) => {
  const [form] = Form.useForm();
  const nodes = useFlowStore((state) => state.nodes);
  const setPlaceholderValue = useFlowStore((state) => state.setPlaceholderValue);
  const getAllPlaceholderValues = useFlowStore((state) => state.getAllPlaceholderValues);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Collect all placeholders from condition definition nodes
  const placeholders = useMemo<PlaceholderInfo[]>(() => {
    const result: PlaceholderInfo[] = [];

    nodes.forEach((node) => {
      if (node.type === 'conditionDefinition') {
        const data = node.data as ConditionDefinitionNodeData;
        data.conditions.forEach((condition: ConditionItem) => {
          result.push({
            placeholder: condition.placeholder,
            field: condition.field,
            fieldType: condition.valueType,
            tableName: data.tableName,
            refId: data.refId,
          });
        });
      }
    });

    return result;
  }, [nodes]);

  // Check if all placeholders have values
  const existingValues = useMemo(() => getAllPlaceholderValues(), [getAllPlaceholderValues]);

  // Initialize form values when panel opens
  React.useEffect(() => {
    if (open) {
      const initialValues: Record<string, unknown> = {};
      placeholders.forEach((p) => {
        const existingValue = existingValues[p.placeholder];
        if (existingValue !== undefined) {
          // Convert string dates back to dayjs for date pickers
          if ((p.fieldType === 'DATE' || p.fieldType === 'TIMESTAMP') && typeof existingValue === 'string') {
            initialValues[p.placeholder] = dayjs(existingValue);
          } else {
            initialValues[p.placeholder] = existingValue;
          }
        }
      });
      form.setFieldsValue(initialValues);
      setValidationErrors({});
    }
  }, [open, placeholders, existingValues, form]);

  // Validate all values before execution
  const validateAllValues = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    const values = form.getFieldsValue();

    placeholders.forEach((p) => {
      const value = values[p.placeholder];
      if (value === undefined || value === null || value === '') {
        errors[p.placeholder] = `Please fill in ${p.placeholder}`;
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form, placeholders]);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    console.log('[ValueFillPanel] Submit clicked');
    if (!validateAllValues()) {
      console.log('[ValueFillPanel] Validation failed');
      return;
    }

    const values = form.getFieldsValue();
    console.log('[ValueFillPanel] Form values:', values);

    // Convert and save all values
    placeholders.forEach((p) => {
      const convertedValue = convertValue(values[p.placeholder], p.fieldType);
      setPlaceholderValue(p.placeholder, convertedValue);
      console.log(`[ValueFillPanel] Set ${p.placeholder} = ${convertedValue}`);
    });

    // Use setTimeout to ensure state updates are flushed before executing
    console.log('[ValueFillPanel] Calling onExecute() after state flush');
    setTimeout(() => {
      onExecute();
    }, 0);
  }, [form, placeholders, setPlaceholderValue, onExecute, validateAllValues]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    console.log('[ValueFillPanel] Cancel clicked');
    form.resetFields();
    setValidationErrors({});
    onClose();
  }, [form, onClose]);

  // Group placeholders by refId
  const groupedPlaceholders = useMemo(() => {
    const groups: Record<string, PlaceholderInfo[]> = {};
    placeholders.forEach((p) => {
      if (!groups[p.refId]) {
        groups[p.refId] = [];
      }
      groups[p.refId].push(p);
    });
    return groups;
  }, [placeholders]);

  // Check if there are any placeholders
  const hasPlaceholders = placeholders.length > 0;

  return (
    <Drawer
      title={
        <Space>
          <InfoCircleOutlined style={{ color: '#FF6B00' }} />
          <span style={{ color: '#fff', fontWeight: 500 }}>Fill Condition Values</span>
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
          background: '#1a1a1a',
          borderBottom: '1px solid #303030',
        },
        body: {
          background: '#141414',
          padding: '16px',
        },
        mask: {
          background: 'rgba(0, 0, 0, 0.7)',
        },
      }}
      closeIcon={<CloseOutlined style={{ color: '#8c8c8c' }} />}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleCancel}>Cancel</Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleSubmit}
            disabled={!hasPlaceholders}
          >
            Execute
          </Button>
        </div>
      }
    >
      {!hasPlaceholders ? (
        <Alert
          message="No placeholders to fill"
          description="There are no condition definition nodes with placeholders in the flow."
          type="info"
          showIcon
        />
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          {Object.entries(groupedPlaceholders).map(([refId, items]) => (
            <div
              key={refId}
              style={{
                marginBottom: 24,
                padding: 16,
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 8,
                border: '1px solid #303030',
              }}
            >
              {/* Group header */}
              <div style={{ marginBottom: 16 }}>
                <Tag color="purple" style={{ fontSize: 14, fontWeight: 600 }}>
                  {refId}
                </Tag>
                <span style={{ marginLeft: 8, color: '#8c8c8c', fontSize: 12 }}>
                  Table: {items[0]?.tableName}
                </span>
              </div>

              {/* Placeholder inputs */}
              {items.map((p) => (
                <Form.Item
                  key={p.placeholder}
                  label={
                    <Space size={4}>
                      <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                        {p.placeholder}
                      </Tag>
                      <Tooltip title={`Field: ${p.field}, Type: ${p.fieldType}`}>
                        <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                          {p.field}
                        </span>
                      </Tooltip>
                    </Space>
                  }
                  name={p.placeholder}
                  validateStatus={validationErrors[p.placeholder] ? 'error' : undefined}
                  help={validationErrors[p.placeholder]}
                  rules={[
                    {
                      required: true,
                      message: `Please fill in ${p.placeholder}`,
                    },
                  ]}
                >
                  {getInputComponent(p.fieldType, p.placeholder)}
                </Form.Item>
              ))}
            </div>
          ))}
        </Form>
      )}
    </Drawer>
  );
};

export default ValueFillPanel;
