/**
 * Customer Clustering Scatter Chart
 * Visualizes customer clusters in RFM space
 * X-axis: Recency (days), Y-axis: Monetary (amount), Size: Frequency (purchases)
 */

import React, { useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import type { CustomerClusterRecord, ClusterMetadata } from '../../types/clustering.types';
import { MAX_CUSTOMERS_FOR_SCATTER_PLOT } from '../../constants/clustering.constants';

export interface ClusteringScatterChartProps {
  data: CustomerClusterRecord[];
  clusters: ClusterMetadata[];
  xAxis?: 'recency' | 'frequency';
  yAxis?: 'monetary' | 'frequency';
  sizeBy?: 'frequency' | 'monetary';
  height?: number;
  onClusterClick?: (clusterId: number) => void;
  selectedCluster?: number | null;
}

export const ClusteringScatterChart: React.FC<ClusteringScatterChartProps> = ({
  data,
  clusters,
  xAxis = 'recency',
  yAxis = 'monetary',
  sizeBy = 'frequency',
  height = 400,
  onClusterClick,
  selectedCluster,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Limit data to top N for performance
  const displayData = useMemo(() => {
    return data.slice(0, MAX_CUSTOMERS_FOR_SCATTER_PLOT);
  }, [data]);

  // Color palette for clusters
  const clusterColors = [
    '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
    '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#5470c6',
  ];

  useEffect(() => {
    if (!chartRef.current || displayData.length === 0) return;

    // Dispose previous instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }

    // Initialize chart
    const chartInstance = echarts.init(chartRef.current, 'dark');
    chartInstanceRef.current = chartInstance;

    // Group data by cluster
    const clusterDataMap = new Map<number, Array<[number, number, number, string]>>();
    
    displayData.forEach((customer) => {
      const xValue = customer[xAxis];
      const yValue = customer[yAxis];
      const sizeValue = customer[sizeBy] || 1;
      
      if (!clusterDataMap.has(customer.clusterId)) {
        clusterDataMap.set(customer.clusterId, []);
      }
      
      // [x, y, size, customerId]
      clusterDataMap.get(customer.clusterId)!.push([
        xValue,
        yValue,
        sizeValue,
        customer.customerId,
      ]);
    });

    // Create series for each cluster
    const series = clusters.map((cluster, idx) => {
      const clusterData = clusterDataMap.get(cluster.clusterId) || [];
      const isSelected = selectedCluster === null || selectedCluster === cluster.clusterId;
      
      return {
        name: cluster.label || `Cluster ${cluster.clusterId}`,
        type: 'scatter',
        data: clusterData.map(d => [d[0], d[1], d[2]]),
        symbolSize: (val: number[]) => {
          // Scale size by frequency/monetary (min 5, max 30)
          const sizeVal = val[2];
          const maxSize = Math.max(...clusterData.map(d => d[2]), 1);
          return 5 + (sizeVal / maxSize) * 25;
        },
        itemStyle: {
          color: clusterColors[idx % clusterColors.length],
          opacity: isSelected ? 0.8 : 0.2,
        },
        emphasis: {
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 2,
            opacity: 1,
          },
        },
        // Store customer IDs for tooltip
        _customerIds: clusterData.map(d => d[3]),
      } as any;
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
          const customerId = params.seriesName.includes('Cluster') 
            ? params.data[3] || 'Unknown'
            : 'Unknown';
          const cluster = clusters.find(c => 
            (c.label || `Cluster ${c.clusterId}`) === params.seriesName
          );
          
          return `
            <strong>Customer ID:</strong> ${customerId}<br/>
            <strong>Cluster:</strong> ${params.seriesName}<br/>
            <strong>${xAxis}:</strong> ${params.value[0].toFixed(xAxis === 'recency' ? 0 : 1)}${xAxis === 'recency' ? ' days' : ''}<br/>
            <strong>${yAxis}:</strong> ${yAxis === 'monetary' ? '¥' : ''}${params.value[1].toFixed(yAxis === 'monetary' ? 0 : 1)}${yAxis === 'frequency' ? ' times' : ''}<br/>
            <strong>${sizeBy}:</strong> ${sizeBy === 'monetary' ? '¥' : ''}${params.value[2].toFixed(sizeBy === 'monetary' ? 0 : 1)}${sizeBy === 'frequency' ? ' times' : ''}<br/>
            ${cluster ? `<strong>Cluster Size:</strong> ${cluster.customerCount} customers` : ''}
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
        name: xAxis === 'recency' ? 'Recency (days)' : 'Frequency (purchases)',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 12,
        },
        inverse: xAxis === 'recency', // Lower recency is better
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
        axisLabel: { color: 'rgba(255, 255, 255, 0.65)' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
      },
      yAxis: {
        type: 'value',
        name: yAxis === 'monetary' ? 'Monetary (¥)' : 'Frequency (purchases)',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 12,
        },
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
        axisLabel: { 
          color: 'rgba(255, 255, 255, 0.65)',
          formatter: yAxis === 'monetary' ? '¥{value}' : '{value}',
        },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
      },
      series,
      legend: {
        data: clusters.map(c => c.label || `Cluster ${c.clusterId}`),
        bottom: '5%',
        textStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
        },
        type: 'scroll',
      },
    };

    chartInstance.setOption(option);

    // Handle legend select (cluster filtering)
    if (onClusterClick) {
      chartInstance.on('legendselectchanged', (params: any) => {
        const clusterName = params.name;
        const cluster = clusters.find(c => 
          (c.label || `Cluster ${c.clusterId}`) === clusterName
        );
        if (cluster) {
          onClusterClick(cluster.clusterId);
        }
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
      if (onClusterClick) {
        chartInstance.off('legendselectchanged');
      }
    };
  }, [displayData, clusters, xAxis, yAxis, sizeBy, onClusterClick, selectedCluster]);

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
