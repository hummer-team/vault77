/**
 * Anomaly Scatter Chart
 * Visualizes individual anomalous orders in a scatter plot
 * X-axis: Feature value (e.g., amount), Y-axis: Anomaly score
 */

import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { AnomalyRecord } from '../../types/anomaly.types';

export interface AnomalyScatterChartProps {
  data: AnomalyRecord[];
  xAxisFeature: string; // Feature name for X axis (e.g., 'amount')
  yAxisLabel?: string;  // Custom Y axis label, default 'Anomaly Score'
  height?: number;      // Chart height in pixels, default 400
  onPointClick?: (record: AnomalyRecord) => void; // Click handler
}

export const AnomalyScatterChart: React.FC<AnomalyScatterChartProps> = ({
  data,
  xAxisFeature,
  yAxisLabel = 'Anomaly Score',
  height = 400,
  onPointClick,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    // Initialize or get chart instance
    const chartInstance = chartInstanceRef.current || echarts.init(chartRef.current, 'dark');
    chartInstanceRef.current = chartInstance;

    // Prepare data for scatter plot
    const normalData: [number, number][] = [];
    const anomalyData: [number, number][] = [];
    const allRecords: AnomalyRecord[] = [];

    data.forEach((record) => {
      const xValue = record.features[xAxisFeature];
      if (typeof xValue !== 'number') return; // Skip if feature not found

      const point: [number, number] = [xValue, record.score];
      
      if (record.isAbnormal) {
        anomalyData.push(point);
      } else {
        normalData.push(point);
      }
      
      allRecords.push(record);
    });

    // Chart options
    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderColor: '#777',
        textStyle: { color: '#fff' },
        formatter: (params: any) => {
          const index = params.seriesIndex === 0 
            ? params.dataIndex 
            : normalData.length + params.dataIndex;
          const record = allRecords[index];
          
          return `
            <strong>Order ID:</strong> ${record.orderId}<br/>
            <strong>${xAxisFeature}:</strong> ${params.value[0].toFixed(2)}<br/>
            <strong>Score:</strong> ${params.value[1].toFixed(3)}<br/>
            <strong>Status:</strong> ${record.isAbnormal ? '<span style="color:#ff4d4f">Anomaly</span>' : '<span style="color:#52c41a">Normal</span>'}
          `;
        },
      },
      grid: {
        left: '10%',
        right: '5%',
        bottom: '15%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: xAxisFeature,
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 12,
        },
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
        axisLabel: { color: 'rgba(255, 255, 255, 0.65)' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
      },
      yAxis: {
        type: 'value',
        name: yAxisLabel,
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 12,
        },
        max: 1,
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
        axisLabel: { color: 'rgba(255, 255, 255, 0.65)' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
      },
      series: [
        {
          name: 'Normal Orders',
          type: 'scatter',
          data: normalData,
          symbolSize: 6,
          itemStyle: {
            color: '#52c41a',
            opacity: 0.6,
          },
          emphasis: {
            itemStyle: {
              color: '#95de64',
              borderColor: '#52c41a',
              borderWidth: 2,
            },
          },
        },
        {
          name: 'Anomalous Orders',
          type: 'scatter',
          data: anomalyData,
          symbolSize: 8,
          itemStyle: {
            color: '#ff4d4f',
            opacity: 0.8,
          },
          emphasis: {
            itemStyle: {
              color: '#ff7875',
              borderColor: '#ff4d4f',
              borderWidth: 2,
            },
          },
        },
      ],
      legend: {
        data: ['Normal Orders', 'Anomalous Orders'],
        bottom: '5%',
        textStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
        },
      },
    };

    chartInstance.setOption(option);

    // Handle click events
    if (onPointClick) {
      chartInstance.on('click', (params: any) => {
        const index = params.seriesIndex === 0 
          ? params.dataIndex 
          : normalData.length + params.dataIndex;
        const record = allRecords[index];
        onPointClick(record);
      });
    }

    // Handle resize
    const handleResize = () => {
      chartInstance.resize();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (onPointClick) {
        chartInstance.off('click');
      }
    };
  }, [data, xAxisFeature, yAxisLabel, onPointClick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  if (data.length === 0) {
    return (
      <div style={{ 
        height, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: 'rgba(255, 255, 255, 0.45)',
      }}>
        No data to display
      </div>
    );
  }

  return <div ref={chartRef} style={{ width: '100%', height }} />;
};
