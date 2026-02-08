/**
 * Customer Clustering Scatter Chart
 * Visualizes customer clusters in RFM space
 * X-axis: Recency (days), Y-axis: Monetary (amount), Size: Frequency (purchases)
 */

import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import type { CustomerClusterRecord, ClusterMetadata } from '../../types/clustering.types';
import { TOP_N_PER_CLUSTER } from '../../constants/clustering.constants';
import { CustomerContextMenu } from './CustomerContextMenu';

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

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    customerId: string;
  }>({ visible: false, x: 0, y: 0, customerId: '' });

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
        z: 99999,  // Ensure tooltip is on top of all other elements
        appendToBody: true,  // Append to body to avoid z-index stacking issues
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
            <div style="padding: 4px 0;">
              <div style="color: #ffa940; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #444; padding-bottom: 4px;">
                📍 Individual Customer
              </div>
              <strong>Customer ID:</strong> ${customerId}<br/>
              <strong>${xAxis}:</strong> ${formatValue(val0, xAxis === 'recency' ? 0 : 1, '', xAxis === 'recency' ? ' days' : '')}<br/>
              <strong>${yAxis}:</strong> ${formatValue(val1, yAxis === 'monetary' ? 0 : 1, yAxis === 'monetary' ? '¥' : '', yAxis === 'frequency' ? ' times' : '')}<br/>
              <strong>${sizeBy}:</strong> ${formatValue(val2, sizeBy === 'monetary' ? 0 : 1, sizeBy === 'monetary' ? '¥' : '', sizeBy === 'frequency' ? ' times' : '')}<br/>
              ${cluster ? `
              <div style="color: #52c41a; font-weight: bold; margin-top: 8px; margin-bottom: 4px; border-bottom: 1px solid #444; padding-bottom: 4px;">
                📊 Cluster Information
              </div>
              <strong>Cluster:</strong> ${params.seriesName}<br/>
              <strong>Total Customers:</strong> ${cluster.customerCount.toLocaleString()}<br/>
              <strong>Avg Recency:</strong> ${cluster.avgRecency.toFixed(0)} days<br/>
              <strong>Avg Monetary:</strong> ¥${cluster.avgMonetary.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}<br/>
              <div style="color: #888; font-size: 11px; margin-top: 6px;">
                💡 Click to highlight this cluster in radar chart
              </div>
              ` : ''}
            </div>
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

    // Handle right-click on data points to show context menu
    // Use native DOM event listener on chart container
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      
      // 先关闭已有菜单（如果有的话）
      setContextMenu({ visible: false, x: 0, y: 0, customerId: '' });
      
      // Get chart container bounds
      const chartDom = chartRef.current;
      if (!chartDom) return;
      
      const rect = chartDom.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      
      console.log('[ScatterChart] Native contextmenu event:', {
        offsetX,
        offsetY,
        pageX: event.pageX,
        pageY: event.pageY,
        clientX: event.clientX,
        clientY: event.clientY
      });
      
      // Find which data point was clicked
      let foundCustomerId: string | null = null;
      let foundSeriesName: string | null = null;
      let minDistance = Infinity;
      let debugPoints: any[] = [];
      
      // Iterate through series to find the clicked point
      series.forEach((seriesItem: any, seriesIdx: number) => {
        const data = seriesItem.data;
        
        data.forEach((dataPoint: any, dataIndex: number) => {
          try {
            // Convert data coordinates to pixel coordinates
            const pixelPoint: any = chartInstance.convertToPixel({ seriesIndex: seriesIdx }, dataPoint);
            
            if (pixelPoint && Array.isArray(pixelPoint) && pixelPoint.length >= 2) {
              // Calculate distance
              const dx = pixelPoint[0] - offsetX;
              const dy = pixelPoint[1] - offsetY;
              const distance = Math.sqrt(dx * dx + dy * dy);
              
              // Track min distance for debugging
              if (distance < minDistance) {
                minDistance = distance;
              }
              
              // Store first few points for debugging
              if (debugPoints.length < 5) {
                debugPoints.push({
                  seriesName: seriesItem.name,
                  customerId: seriesItem._customerIds?.[dataIndex],
                  pixelPoint: [pixelPoint[0], pixelPoint[1]],
                  clickPoint: [offsetX, offsetY],
                  distance: distance.toFixed(2)
                });
              }
            
              // If click is within 30px of a point, consider it clicked (increased threshold)
              if (distance < 30 && !foundCustomerId) {
                foundCustomerId = seriesItem._customerIds?.[dataIndex];
                foundSeriesName = seriesItem.name;
                console.log('[ScatterChart] Found clicked point:', {
                  seriesName: foundSeriesName,
                  customerId: foundCustomerId,
                  distance: distance.toFixed(2),
                  pixelPoint,
                  clickPoint: [offsetX, offsetY]
                });
              }
            }
          } catch (err) {
            // Ignore conversion errors
          }
        });
      });
      
      if (foundCustomerId) {
        console.log('[ScatterChart] Setting context menu state...');
        // 使用setTimeout确保先关闭旧菜单，再打开新菜单
        setTimeout(() => {
          setContextMenu({
            visible: true,
            x: offsetX,  // 使用相对于图表容器的坐标
            y: offsetY,
            customerId: String(foundCustomerId),
          });
          console.log('[ScatterChart] Context menu state set with offset coords:', { offsetX, offsetY });
        }, 50);
      } else {
        console.log('[ScatterChart] No customer point found near click', {
          minDistance: minDistance.toFixed(2),
          threshold: 30,
          samplePoints: debugPoints
        });
      }
    };
    
    // Add native contextmenu listener to chart DOM
    const chartDom = chartRef.current;
    if (chartDom) {
      chartDom.addEventListener('contextmenu', handleContextMenu);
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
      // Remove native contextmenu listener
      const chartDom = chartRef.current;
      if (chartDom) {
        chartDom.removeEventListener('contextmenu', handleContextMenu);
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

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={chartRef} style={{ width: '100%', height }} />
      
      <CustomerContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        customerId={contextMenu.customerId}
        onClose={() => setContextMenu({ ...contextMenu, visible: false })}
        // onViewDetails 和 onCompare 保持 undefined (禁用状态)
      />
    </div>
  );
};
