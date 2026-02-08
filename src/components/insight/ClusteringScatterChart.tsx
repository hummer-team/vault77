/**
 * Customer Clustering Scatter Chart
 * Visualizes customer clusters in RFM space
 * X-axis: Recency (days), Y-axis: Monetary (amount), Size: Frequency (purchases)
 */

import React, { useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import type { CustomerClusterRecord, ClusterMetadata } from '../../types/clustering.types';
import { TOP_N_PER_CLUSTER } from '../../constants/clustering.constants';

export interface ClusteringScatterChartProps {
  data: CustomerClusterRecord[];
  clusters: ClusterMetadata[];
  xAxis?: 'recency' | 'frequency';
  yAxis?: 'monetary' | 'frequency';
  sizeBy?: 'frequency' | 'monetary';
  height?: number;
  onClusterClick?: (clusterId: number) => void;
  selectedCluster?: number | null;
  onDataSampled?: (displayCount: number, totalCount: number) => void;  // Callback for sampling info
}

export const ClusteringScatterChart: React.FC<ClusteringScatterChartProps> = ({
  data,
  clusters,
  xAxis = 'recency',
  yAxis = 'monetary',
  sizeBy = 'frequency',
  height = 400,
  onClusterClick,
  selectedCluster: _selectedCluster,  // Received but not used - scatter chart doesn't highlight selection
  onDataSampled,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const lastDataLengthRef = useRef(0);  // Track data length to detect real changes

  // Memoize data and clusters to prevent unnecessary re-renders
  // Only update when actual content changes, not just reference
  const stableData = useMemo(() => data, [data.length, data[0]?.customerId]);
  const stableClusters = useMemo(() => clusters, [clusters.length, clusters[0]?.clusterId]);

  // Sample data: top N per cluster for performance
  const displayData = useMemo(() => {
    console.log('[ClusteringScatterChart] Computing displayData, input data length:', stableData.length);
    
    // Group by cluster
    const clusterGroups = new Map<number, CustomerClusterRecord[]>();
    stableData.forEach(customer => {
      if (!clusterGroups.has(customer.clusterId)) {
        clusterGroups.set(customer.clusterId, []);
      }
      clusterGroups.get(customer.clusterId)!.push(customer);
    });
    
    console.log('[ClusteringScatterChart] Cluster groups:', Array.from(clusterGroups.entries()).map(([id, customers]) => ({ clusterId: id, count: customers.length })));
    
    // Take top N per cluster (sorted by monetary desc - most valuable customers)
    const sampledData: CustomerClusterRecord[] = [];
    clusterGroups.forEach((customers) => {
      const sorted = customers
        .sort((a, b) => b.monetary - a.monetary)
        .slice(0, TOP_N_PER_CLUSTER);
      sampledData.push(...sorted);
    });
    
    console.log('[ClusteringScatterChart] Sampled data length:', sampledData.length);
    return sampledData;
  }, [data]);  // Only depend on data, NOT onDataSampled

  // Separate effect to notify parent (only when data actually changes)
  useEffect(() => {
    if (data.length !== lastDataLengthRef.current) {
      console.log('[ClusteringScatterChart] Data length changed, notifying parent');
      lastDataLengthRef.current = data.length;
      if (onDataSampled && displayData.length !== data.length) {
        onDataSampled(displayData.length, data.length);
      }
    }
  }, [data.length, displayData.length, onDataSampled]);

  // Color palette for clusters
  const clusterColors = [
    '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
    '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#5470c6',
  ];

  useEffect(() => {
    console.log('[ClusteringScatterChart] useEffect triggered, displayData.length:', displayData.length, 'chartRef.current:', !!chartRef.current);
    
    if (!chartRef.current || displayData.length === 0) {
      console.log('[ClusteringScatterChart] Early return - no chart ref or empty data');
      return;
    }

    console.log('[ClusteringScatterChart] Initializing chart...');

    // Initialize chart only if not exists
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current, 'dark');
    }
    
    const chartInstance = chartInstanceRef.current;

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

    console.log('[ClusteringScatterChart] ClusterDataMap:', Array.from(clusterDataMap.entries()).map(([id, data]) => ({ clusterId: id, points: data.length })));

    // Create series for each cluster
    const series = clusters.map((cluster, idx) => {
      const clusterData = clusterDataMap.get(cluster.clusterId) || [];
      // Scatter chart doesn't need to highlight selected cluster
      // Only radar chart shows the selection
      
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
          opacity: 0.8,  // Fixed opacity, no selection highlight
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
          // Get customer ID from stored array in series
          const seriesIndex = params.seriesIndex;
          const dataIndex = params.dataIndex;
          const seriesData = series[seriesIndex];
          const customerIds = seriesData?._customerIds || [];
          const customerId = customerIds[dataIndex] || 'Unknown';
          
          const cluster = clusters.find(c => 
            (c.label || `Cluster ${c.clusterId}`) === params.seriesName
          );
          
          // Safe value extraction with null checks
          const val0 = params.value?.[0];
          const val1 = params.value?.[1];
          const val2 = params.value?.[2];
          
          const formatValue = (val: any, decimals: number, prefix = '', suffix = '') => {
            return val != null ? `${prefix}${val.toFixed(decimals)}${suffix}` : 'N/A';
          };
          
          return `
            <strong>Customer ID:</strong> ${customerId}<br/>
            <strong>Cluster:</strong> ${params.seriesName}<br/>
            <strong>${xAxis}:</strong> ${formatValue(val0, xAxis === 'recency' ? 0 : 1, '', xAxis === 'recency' ? ' days' : '')}<br/>
            <strong>${yAxis}:</strong> ${formatValue(val1, yAxis === 'monetary' ? 0 : 1, yAxis === 'monetary' ? '¥' : '', yAxis === 'frequency' ? ' times' : '')}<br/>
            <strong>${sizeBy}:</strong> ${formatValue(val2, sizeBy === 'monetary' ? 0 : 1, sizeBy === 'monetary' ? '¥' : '', sizeBy === 'frequency' ? ' times' : '')}<br/>
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
          formatter: (value: number) => {
            // Format large numbers with K/M/B suffix for monetary
            if (yAxis === 'monetary') {
              if (value >= 1e9) {
                return `¥${(value / 1e9).toFixed(1)}B`;
              } else if (value >= 1e6) {
                return `¥${(value / 1e6).toFixed(1)}M`;
              } else if (value >= 1e3) {
                return `¥${(value / 1e3).toFixed(1)}K`;
              } else {
                return `¥${value}`;
              }
            } else {
              return `${value}`;
            }
          },
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

    // Force update series data when selectedCluster changes
    chartInstance.setOption(option, { replaceMerge: ['series'] });

    // Handle click on data points to select cluster
    if (onClusterClick) {
      chartInstance.on('click', (params: any) => {
        console.log('[ScatterChart] Click event:', { 
          componentType: params.componentType, 
          seriesName: params.seriesName 
        });
        
        if (params.componentType === 'series') {
          const clusterName = params.seriesName;
          const cluster = clusters.find(c => 
            (c.label || `Cluster ${c.clusterId}`) === clusterName
          );
          
          console.log('[ScatterChart] Found cluster:', cluster);
          
          if (cluster) {
            console.log('[ScatterChart] Calling onClusterClick with clusterId:', cluster.clusterId);
            onClusterClick(cluster.clusterId);
          }
        }
      });
    }

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
        chartInstance.off('click');
        chartInstance.off('legendselectchanged');
      }
    };
  }, [displayData, stableClusters, xAxis, yAxis, sizeBy, onClusterClick]);
  // Use stableClusters instead of clusters to prevent unnecessary re-renders

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
