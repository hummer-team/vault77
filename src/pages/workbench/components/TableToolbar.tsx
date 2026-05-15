import React from 'react';
import { Button, Checkbox, Dropdown, Space, Badge, Tooltip } from 'antd';
import {
  EyeOutlined,
  FilterOutlined,
  DownloadOutlined,
  TableOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

interface ColumnDef {
  name: string;
  label?: string;
}

interface TableToolbarProps {
  /** All available columns */
  columns: ColumnDef[];
  /** Names of currently hidden columns */
  hiddenColumns: Set<string>;
  /** Number of active column filters */
  activeFilterCount: number;
  /** Whether export is available */
  canExport: boolean;
  /** Called when a column's visibility is toggled */
  onToggleColumn: (colName: string) => void;
  /** Called to show all columns */
  onShowAll: () => void;
  /** Called to clear all column filters */
  onClearFilters: () => void;
  /** Called to trigger CSV export */
  onExport: () => void;
}

/**
 * Toolbar rendered above the data table.
 * Provides column visibility toggle, filter status badge, and export action.
 * All colors use CSS variables for theme compatibility.
 */
const TableToolbar: React.FC<TableToolbarProps> = ({
  columns,
  hiddenColumns,
  activeFilterCount,
  canExport,
  onToggleColumn,
  onShowAll,
  onClearFilters,
  onExport,
}) => {
  const columnMenuItems: MenuProps['items'] = [
    {
      key: '__show_all',
      label: (
        <span
          style={{ color: 'var(--vm-primary)', fontWeight: 600, fontSize: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            onShowAll();
          }}
        >
          显示全部列
        </span>
      ),
    },
    { type: 'divider' },
    ...columns.map((col) => ({
      key: col.name,
      label: (
        <Checkbox
          checked={!hiddenColumns.has(col.name)}
          onChange={() => onToggleColumn(col.name)}
          style={{ color: 'var(--vm-text-primary)', fontSize: 12 }}
        >
          {col.label ?? col.name}
        </Checkbox>
      ),
    })),
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 0 6px 2px',
        borderBottom: '1px solid var(--vm-border-subtle)',
        marginBottom: 4,
      }}
    >
      {/* Column visibility toggle */}
      <Dropdown
        menu={{ items: columnMenuItems }}
        trigger={['click']}
        overlayStyle={{
          background: 'var(--vm-bg-card)',
          border: '1px solid var(--vm-border-mid)',
          borderRadius: 6,
          minWidth: 160,
        }}
      >
        <Tooltip title="列显隐设置">
          <Button
            size="small"
            type="text"
            icon={<TableOutlined />}
            style={{
              color: hiddenColumns.size > 0 ? 'var(--vm-primary)' : 'var(--vm-text-secondary)',
              fontSize: 12,
            }}
          >
            {hiddenColumns.size > 0 ? `已隐藏 ${hiddenColumns.size} 列` : '列设置'}
          </Button>
        </Tooltip>
      </Dropdown>

      {/* Active filter badge + clear */}
      {activeFilterCount > 0 && (
        <Tooltip title="清除所有列过滤">
          <Badge count={activeFilterCount} size="small" color="var(--vm-primary)">
            <Button
              size="small"
              type="text"
              icon={<FilterOutlined />}
              onClick={onClearFilters}
              style={{ color: 'var(--vm-primary)', fontSize: 12 }}
            >
              过滤中
            </Button>
          </Badge>
        </Tooltip>
      )}

      <Space style={{ marginLeft: 'auto' }}>
        {/* Column visibility indicator */}
        {hiddenColumns.size > 0 && (
          <Button
            size="small"
            type="text"
            icon={<EyeOutlined />}
            onClick={onShowAll}
            style={{ color: 'var(--vm-text-muted)', fontSize: 11 }}
          >
            重置列
          </Button>
        )}

        {/* Export button */}
        <Tooltip title={canExport ? '导出过滤后的 CSV' : '暂无可导出数据'}>
          <Button
            size="small"
            type="text"
            icon={<DownloadOutlined />}
            onClick={onExport}
            disabled={!canExport}
            style={{
              color: canExport ? 'var(--vm-text-secondary)' : 'var(--vm-text-muted)',
              fontSize: 12,
            }}
          >
            导出
          </Button>
        </Tooltip>
      </Space>
    </div>
  );
};

export default TableToolbar;
