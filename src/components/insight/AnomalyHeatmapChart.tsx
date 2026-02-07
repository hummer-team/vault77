/**
 * Anomaly Heatmap Chart
 * Visualizes feature correlation patterns for anomalies
 * Shows anomaly rate distribution across binned feature ranges
 */

import React, { useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import type { AnomalyRecord } from '../../types/anomaly.types';

export interface AnomalyHeatmapChartProps {
  data: AnomalyRecord[];
  feature1: string;    // First feature name (X axis)
  feature2: string;    // Second feature name (Y axis)
  bins?: number;       // Number of bins per axis, default 10
  height?: number;     // Chart height in pixels, default 400
}

export const AnomalyHeatmapChart: React.FC<AnomalyHeatmapChartProps> = ({
  data,
  feature1,
  feature2,
  bins = 10,
  height = 400,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Calculate heatmap data (anomaly rate per bin)
  const heatmapData = useMemo(() => {
    if (data.length === 0) return { matrix: [], xLabels: [], yLabels: [], maxRate: 0 };

    // Extract feature values
    const f1Values = data.map(r => r.features[feature1]).filter(v => typeof v === 'number');
    const f2Values = data.map(r => r.features[feature2]).filter(v => typeof v === 'number');

    if (f1Values.length === 0 || f2Values.length === 0) {
      return { matrix: [], xLabels: [], yLabels: [], maxRate: 0 };
    }

    // Calculate ranges
    const f1Min = Math.min(...f1Values);
    const f1Max = Math.max(...f1Values);
    const f2Min = Math.min(...f2Values);
    const f2Max = Math.max(...f2Values);

    const f1Step = (f1Max - f1Min) / bins;
    const f2Step = (f2Max - f2Min) / bins;

    // Initialize bins matrix
    const matrix: number[][] = Array(bins).fill(0).map(() => Array(bins).fill(0));
    const counts: number[][] = Array(bins).fill(0).map(() => Array(bins).fill(0));

    // Populate bins
    data.forEach(record => {
      const f1Val = record.features[feature1];
      const f2Val = record.features[feature2];
      
      if (typeof f1Val !== 'number' || typeof f2Val !== 'number') return;

      // Calculate bin indices
      let f1Bin = Math.floor((f1Val - f1Min) / f1Step);
      let f2Bin = Math.floor((f2Val - f2Min) / f2Step);

      // Handle edge case (value == max)
      if (f1Bin >= bins) f1Bin = bins - 1;
      if (f2Bin >= bins) f2Bin = bins - 1;

      counts[f2Bin][f1Bin]++;
      if (record.isAbnormal) {
        matrix[f2Bin][f1Bin]++;
      }
    });

    // Calculate anomaly rates
    let maxRate = 0;
    for (let i = 0; i < bins; i++) {
      for (let j = 0; j < bins; j++) {
        if (counts[i][j] > 0) {
          matrix[i][j] = matrix[i][j] / counts[i][j];
          maxRate = Math.max(maxRate, matrix[i][j]);
        }
      }
    }

    // Generate labels
    const xLabels = Array(bins).fill(0).map((_, i) => {
      const val = f1Min + (i + 0.5) * f1Step;
      return val.toFixed(0);
    });
    const yLabels = Array(bins).fill(0).map((_, i) => {
      const val = f2Min + (i + 0.5) * f2Step;
      return val.toFixed(0);
    });

    return { matrix, xLabels, yLabels, maxRate };
  }, [data, feature1, feature2, bins]);

  useEffect(() => {
    if (!chartRef.current || heatmapData.matrix.length === 0) return;

    // Initialize or get chart instance
    const chartInstance = chartInstanceRef.current || echarts.init(chartRef.current, 'dark');
    chartInstanceRef.current = chartInstance;

    // Flatten matrix for ECharts
    const flatData: [number, number, number][] = [];
    for (let i = 0; i < heatmapData.matrix.length; i++) {
      for (let j = 0; j < heatmapData.matrix[i].length; j++) {
        flatData.push([j, i, heatmapData.matrix[i][j]]);
      }
    }

    // Chart options
    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderColor: '#777',
        textStyle: { color: '#fff' },
        formatter: (params: any) => {
          const [x, y, rate] = params.value;
          return `
            <strong>${feature1}:</strong> ${heatmapData.xLabels[x]}<br/>
            <strong>${feature2}:</strong> ${heatmapData.yLabels[y]}<br/>
            <strong>Anomaly Rate:</strong> ${(rate * 100).toFixed(1)}%
          `;
        },
      },
      grid: {
        left: '15%',
        right: '10%',
        bottom: '15%',
        top: '5%',
      },
      xAxis: {
        type: 'category',
        data: heatmapData.xLabels,
        name: feature1,
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 12,
        },
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
        axisLabel: { 
          color: 'rgba(255, 255, 255, 0.65)',
          rotate: 45,
        },
        splitArea: { show: true },
      },
      yAxis: {
        type: 'category',
        data: heatmapData.yLabels,
        name: feature2,
        nameLocation: 'middle',
        nameGap: 60,
        nameTextStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 12,
        },
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
        axisLabel: { color: 'rgba(255, 255, 255, 0.65)' },
        splitArea: { show: true },
      },
      visualMap: {
        min: 0,
        max: Math.max(heatmapData.maxRate, 0.1),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        textStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
        },
        inRange: {
          color: ['#50a3ba', '#eac736', '#d94e5d'],
        },
      },
      series: [
        {
          name: 'Anomaly Rate',
          type: 'heatmap',
          data: flatData,
          emphasis: {
            itemStyle: {
              borderColor: '#fff',
              borderWidth: 1,
            },
          },
        },
      ],
    };

    chartInstance.setOption(option);

    // Handle resize
    const handleResize = () => {
      chartInstance.resize();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [heatmapData, feature1, feature2]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  if (data.length === 0 || heatmapData.matrix.length === 0) {
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
