/**
 * Anomaly Scatter Chart
 * Visualizes individual anomalous orders in a scatter plot
 * X-axis: Feature value (e.g., amount), Y-axis: Anomaly score
 */

import React, { useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import type { AnomalyRecord } from '../../types/anomaly.types';
import { MAX_ANOMALIES_FOR_VISUALIZATION } from '../../constants/anomaly.constants';

export interface AnomalyScatterChartProps {
  data: AnomalyRecord[];
  xAxisFeature: string; // Feature name for X axis (e.g., 'amount')
  yAxisLabel?: string;  // Custom Y axis label, default 'Anomaly Score'
  height?: number;      // Chart height in pixels, default 400
  onPointClick?: (record: AnomalyRecord) => void; // Click handler
  totalCount?: number;  // Total anomaly count (for display when data is limited)
}

export const AnomalyScatterChart: React.FC<AnomalyScatterChartProps> = ({
  data,
  xAxisFeature,
  yAxisLabel = 'Anomaly Score',
  height = 400,
  onPointClick,
  // totalCount is for future use (e.g., displaying "Showing X of Y" in tooltip)
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Limit data to top N for performance
  const displayData = useMemo(() => {
    return data.slice(0, MAX_ANOMALIES_FOR_VISUALIZATION);
  }, [data]);

  useEffect(() => {
    if (!chartRef.current || displayData.length === 0) return;

    // Force dispose and recreate chart instance to ensure proper re-rendering
    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }

    // Initialize new chart instance
    const chartInstance = echarts.init(chartRef.current, 'dark');
    chartInstanceRef.current = chartInstance;

    // Prepare data for scatter plot
    // Note: data only contains anomalous orders (filtered by anomalyService)
    // Display limited to top N for performance
    const anomalyData: [number, number][] = [];
    const allRecords: AnomalyRecord[] = [];

    displayData.forEach((record) => {
      const xValue = record.features[xAxisFeature];
      if (typeof xValue !== 'number') return; // Skip if feature not found

      const point: [number, number] = [xValue, record.score];
      anomalyData.push(point);
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
          const record = allRecords[params.dataIndex];
          
          return `
            <strong>Order ID:</strong> ${record.orderId}<br/>
            <strong>${xAxisFeature}:</strong> ${params.value[0].toFixed(2)}<br/>
            <strong>Score:</strong> ${params.value[1].toFixed(3)}<br/>
            <strong>Rank:</strong> #${record.rank ?? 'N/A'}<br/>
            <strong>Status:</strong> <span style="color:#ff4d4f">Anomaly</span>
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
        data: ['Anomalous Orders'],
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
        const record = allRecords[params.dataIndex];
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
  }, [displayData, xAxisFeature, yAxisLabel, onPointClick]);

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
