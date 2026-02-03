/**
 * CategoricalChart Component
 * Displays categorical data as pie charts (status) or bar charts (category)
 */

import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import { Empty, Row, Col } from 'antd';
import type { CategoricalResult } from '../../types/insight.types';

interface CategoricalChartProps {
  statusColumns: CategoricalResult[];
  categoryColumns: CategoricalResult[];
  loading?: boolean;
  height?: number;
}

/**
 * Render a single pie chart for status column
 */
const PieChart: React.FC<{ data: CategoricalResult; height: number }> = ({ data, height }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || !data.values.length) {
      return;
    }

    // Initialize chart
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current, 'dark');
    }

    const chart = chartInstanceRef.current;

    // Helper function to truncate long labels
    const truncateLabel = (label: string, maxLength: number = 10): string => {
      if (label.length <= maxLength) {
        return label;
      }
      return label.substring(0, maxLength) + '...';
    };

    const option: EChartsOption = {
      title: {
        text: data.columnName,
        textStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 14,
          fontWeight: 'normal',
        },
        left: 'center',
        top: 10,
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        textStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
        },
        // Show full label in tooltip (even if truncated in legend)
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'middle',
        textStyle: {
          color: 'rgba(255, 255, 255, 0.65)',
        },
        // Truncate long legend labels
        formatter: (name: string) => truncateLabel(name, 10),
        tooltip: {
          show: true,
        },
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['40%', '55%'],
          data: data.values.map(v => ({
            name: v.value,
            value: v.count,
          })),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          label: {
            color: 'rgba(255, 255, 255, 0.65)',
            // Truncate labels in pie chart segments
            formatter: (params: any) => truncateLabel(params.name, 10),
          },
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, height]);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height,
        background: 'rgba(255, 255, 255, 0.04)',
        borderRadius: '4px',
      }}
    />
  );
};

/**
 * Render a single bar chart for category column
 */
const BarChart: React.FC<{ data: CategoricalResult; height: number }> = ({ data, height }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || !data.values.length) {
      return;
    }

    // Initialize chart
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current, 'dark');
    }

    const chart = chartInstanceRef.current;

    // Helper function to truncate long labels
    const truncateLabel = (label: string, maxLength: number = 10): string => {
      if (label.length <= maxLength) {
        return label;
      }
      return label.substring(0, maxLength) + '...';
    };

    const option: EChartsOption = {
      title: {
        text: data.columnName,
        textStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 14,
          fontWeight: 'normal',
        },
        left: 'center',
        top: 10,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        textStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
        },
        axisPointer: {
          type: 'shadow',
        },
        // Show full label in tooltip
        formatter: (params: any) => {
          if (Array.isArray(params) && params.length > 0) {
            const param = params[0];
            return `${param.name}: ${param.value}`;
          }
          return '';
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: 50,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: data.values.map(v => v.value),
        axisLabel: {
          color: 'rgba(255, 255, 255, 0.65)',
          rotate: 45,
          interval: 0,
          // Truncate long x-axis labels
          formatter: (value: string) => truncateLabel(value, 10),
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.2)',
          },
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: 'rgba(255, 255, 255, 0.65)',
          formatter: (value: number) => {
            if (value >= 1000) {
              return `${(value / 1000).toFixed(1)}k`;
            }
            return String(value);
          },
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.2)',
          },
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.1)',
          },
        },
      },
      series: [
        {
          type: 'bar',
          data: data.values.map(v => v.count),
          itemStyle: {
            color: '#5470c6',
          },
          emphasis: {
            itemStyle: {
              color: '#91cc75',
            },
          },
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, height]);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height,
        background: 'rgba(255, 255, 255, 0.04)',
        borderRadius: '4px',
      }}
    />
  );
};

/**
 * Main categorical charts component
 */
export const CategoricalChart: React.FC<CategoricalChartProps> = ({
  statusColumns,
  categoryColumns,
  height = 350,
}) => {
  const hasData = statusColumns.length > 0 || categoryColumns.length > 0;

  if (!hasData) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          description="No status or category columns found"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        {/* Status columns (pie charts) */}
        {statusColumns.map(col => (
          <Col key={`status-${col.columnName}`} xs={24} sm={12} md={12} lg={12} xl={12}>
            <div style={{ marginBottom: 8 }}>
              <h4 style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: 12, margin: 0 }}>
                Status Distribution
              </h4>
            </div>
            <PieChart data={col} height={height} />
          </Col>
        ))}

        {/* Category columns (bar charts) */}
        {categoryColumns.map(col => (
          <Col key={`category-${col.columnName}`} xs={24} sm={12} md={12} lg={12} xl={12}>
            <div style={{ marginBottom: 8 }}>
              <h4 style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: 12, margin: 0 }}>
                Category Distribution (Top 20)
              </h4>
            </div>
            <BarChart data={col} height={height} />
          </Col>
        ))}
      </Row>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(CategoricalChart);
