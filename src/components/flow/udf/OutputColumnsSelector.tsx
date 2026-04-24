/**
 * OutputColumnsSelector
 * Shared "结果显示" column selector used by all UDF configuration drawers.
 * Lets the user choose which columns appear in the query output; empty = show all.
 */

import React from 'react';
import { Select, Typography } from 'antd';
import { TableOutlined, CheckOutlined } from '@ant-design/icons';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

export interface OutputColumnsSelectorProps {
  /** All available columns to choose from */
  columns: string[];
  /** Currently selected columns (empty = show all) */
  value: string[];
  onChange: (cols: string[]) => void;
}

export const OutputColumnsSelector: React.FC<OutputColumnsSelectorProps> = ({
  columns,
  value,
  onChange,
}) => (
  <div
    style={{
      padding: '10px 12px',
      background: 'var(--vm-surface-hover-light)',
      borderRadius: 6,
      border: `1px solid ${TOKEN.borderSubtle}`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
      <Text style={{ fontSize: 11, color: TOKEN.textMuted }}>
        （不选则显示全部列）
      </Text>
    </div>
    <Select
      mode="multiple"
      menuItemSelectedIcon={null}
      placeholder={<span style={{ color: TOKEN.textMuted, fontSize: 12 }}>全部</span>}
      value={value}
      onChange={onChange}
      style={{ width: '100%' }}
      className="nodrag"
      getPopupContainer={() => document.body}
      popupClassName="nodrag"
      size="small"
      maxTagCount={0}
      maxTagPlaceholder={() => {
        if (value.length === 0) return null;
        return (
          <span style={{ fontSize: 11, color: TOKEN.textPrimary }}>
            {value[0]}
            {value.length > 1 && (
              <span style={{ color: TOKEN.primary, fontWeight: 600, marginLeft: 3 }}>
                +{value.length - 1}
              </span>
            )}
          </span>
        );
      }}
      allowClear
      onClear={() => onChange([])}
      notFoundContent={
        <span style={{ fontSize: 11, color: TOKEN.textMuted }}>暂无可选列</span>
      }
    >
      {columns.map((col) => {
        const isSelected = value.includes(col);
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
  </div>
);

export default OutputColumnsSelector;
