/**
 * SummaryTable Component
 * Displays global summary statistics for all columns in a table format
 */

import React from 'react';
import { Table } from 'antd';
import type { ColumnType as AntdColumnType } from 'antd/es/table';
import type { ColumnProfile } from '../../types/insight.types';

interface SummaryTableProps {
  columns: ColumnProfile[];
  loading?: boolean;
}

/**
 * Format number with 2 decimal places
 */
const formatNumber = (value: number | undefined): string => {
  if (value === undefined || value === null) return '-';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

/**
 * Format percentage (0-1 to 0%-100%)
 */
const formatPercentage = (value: number | undefined): string => {
  if (value === undefined || value === null) return '-';
  return `${(value * 100).toFixed(1)}%`;
};

export const SummaryTable: React.FC<SummaryTableProps> = ({ columns, loading = false }) => {
  const tableColumns: AntdColumnType<ColumnProfile>[] = [
    {
      title: 'Column Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string) => (
        <strong style={{ color: 'rgba(255, 255, 255, 0.85)' }}>{name}</strong>
      ),
    },
    {
      title: 'Unique Values',
      dataIndex: 'cardinality',
      key: 'cardinality',
      width: 100,
      align: 'right',
      // sorter: (a, b) => a.cardinality - b.cardinality,
      render: (cardinality: number) => formatNumber(cardinality),
    },
    {
      title: 'Null Rate',
      dataIndex: 'nullRate',
      key: 'nullRate',
      width: 80,
      align: 'right',
      // sorter: (a, b) => a.nullRate - b.nullRate,
      render: (nullRate: number) => formatPercentage(nullRate),
    },
    {
      title: 'Min',
      dataIndex: 'min',
      key: 'min',
      width: 100,
      align: 'right',
      render: (min: number | string | undefined, record: ColumnProfile) =>
        record.type === 'numeric' ? (
          <span>{formatNumber(Number(min))}</span>
        ) : (
          <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>N/A</span>
        ),
    },
    {
      title: 'Max',
      dataIndex: 'max',
      key: 'max',
      width: 100,
      align: 'right',
      render: (max: number | string | undefined, record: ColumnProfile) =>
        record.type === 'numeric' ? (
          <span>{formatNumber(Number(max))}</span>
        ) : (
          <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>N/A</span>
        ),
    },
    {
      title: 'Mean',
      dataIndex: 'mean',
      key: 'mean',
      width: 100,
      align: 'right',
      render: (mean: number | undefined, record: ColumnProfile) =>
        record.type === 'numeric' ? (
          <span>{formatNumber(mean)}</span>
        ) : (
          <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>N/A</span>
        ),
    },
    {
      title: 'P50',
      dataIndex: 'p50',
      key: 'p50',
      width: 100,
      align: 'right',
      render: (p50: number | undefined, record: ColumnProfile) =>
        record.type === 'numeric' ? (
          <span>{formatNumber(p50)}</span>
        ) : (
          <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>N/A</span>
        ),
    },
    {
      title: 'P80',
      dataIndex: 'p80',
      key: 'p80',
      width: 100,
      align: 'right',
      render: (p80: number | undefined, record: ColumnProfile) =>
        record.type === 'numeric' ? (
          <span>{formatNumber(p80)}</span>
        ) : (
          <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>N/A</span>
        ),
    },
    {
      title: 'P99',
      dataIndex: 'p99',
      key: 'p99',
      width: 100,
      align: 'right',
      render: (p99: number | undefined, record: ColumnProfile) =>
        record.type === 'numeric' ? (
          <span>{formatNumber(p99)}</span>
        ) : (
          <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>N/A</span>
        ),
    },
    {
      title: 'Std Dev',
      dataIndex: 'stddev',
      key: 'stddev',
      width: 100,
      align: 'right',
      render: (stddev: number | undefined, record: ColumnProfile) =>
        record.type === 'numeric' ? (
          <span>{formatNumber(stddev)}</span>
        ) : (
          <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>N/A</span>
        ),
    },
  ];

  return (
    <Table<ColumnProfile>
      columns={tableColumns}
      dataSource={columns}
      rowKey="name"
      loading={loading}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        size: 'small',
      }}
      scroll={{ x: 'max-content', y: 400 }}
      size="small"
    />
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(SummaryTable);
