/**
 * DistributionChart Component
 * Displays multi-line histogram charts for numeric columns using ECharts
 */

import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import { Empty } from 'antd';
import type { MultiLineChartData } from '../../types/insight.types';

interface DistributionChartProps {
  data: MultiLineChartData;
  loading?: boolean;
  height?: number;
}

/**
 * Default ECharts color palette
 */
const DEFAULT_COLORS = [
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
  '#ea7ccc',
];

export const DistributionChart: React.FC<DistributionChartProps> = ({
  data,
  loading = false,
  height = 400,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<ECharts | null>(null);

  // Initialize and update chart
  useEffect(() => {
    if (!chartRef.current || loading || !data.xAxis.length) {
      return;
    }

    // Initialize chart if not exists
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current, 'dark');
    }

    const chart = chartInstanceRef.current;

    // Build series data
    const series = data.series.map((s, index) => ({
      name: s.columnName,
      type: 'line' as const,
      data: s.data,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 2,
      },
      itemStyle: {
        color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      },
      emphasis: {
        focus: 'series' as const,
      },
    }));

    // Chart options
    const option: EChartsOption = {
      title: {
        text: 'Distribution Overview',
        textStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 16,
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
          type: 'cross',
          label: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
          },
        },
      },
      legend: {
        data: data.series.map(s => s.columnName),
        top: 40,
        textStyle: {
          color: 'rgba(255, 255, 255, 0.65)',
        },
        type: 'scroll',
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: 80,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: data.xAxis.map(x => x.toFixed(2)),
        boundaryGap: false,
        axisLabel: {
          color: 'rgba(255, 255, 255, 0.65)',
          rotate: 45,
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.2)',
          },
        },
        name: 'Value Range',
        nameTextStyle: {
          color: 'rgba(255, 255, 255, 0.65)',
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
        name: 'Count',
        nameTextStyle: {
          color: 'rgba(255, 255, 255, 0.65)',
        },
      },
      series,
    };

    chart.setOption(option);

    // Handle resize
    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, loading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  if (!data.xAxis.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          description="No numeric columns found"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

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
