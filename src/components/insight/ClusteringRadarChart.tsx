/**
 * Customer Clustering Radar Chart
 * Visualizes cluster characteristics across multiple dimensions (RFM + optional metrics)
 */

import React, { useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import type { ClusterMetadata } from '../../types/clustering.types';
import { RADAR_DIMENSIONS } from '../../constants/clustering.constants';

export interface ClusteringRadarChartProps {
  clusters: ClusterMetadata[];
  height?: number;
  selectedCluster?: number | null;
}

export const ClusteringRadarChart: React.FC<ClusteringRadarChartProps> = ({
  clusters,
  height = 400,
  selectedCluster,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Determine available dimensions based on data
  const availableDimensions = useMemo(() => {
    return RADAR_DIMENSIONS.filter(dim => {
      // Required dimensions are always included
      if (dim.required) return true;
      
      // Optional dimensions: check if any cluster has non-zero value
      return clusters.some(c => {
        const value = c.radarValues[dim.key];
        return value !== undefined && value !== null && value > 0;
      });
    });
  }, [clusters]);

  // Compute global max for each dimension (for normalization)
  const dimensionMaxValues = useMemo(() => {
    const maxValues: Record<string, number> = {};
    
    availableDimensions.forEach(dim => {
      const values = clusters
        .map(c => c.radarValues[dim.key] || 0)
        .filter(v => !isNaN(v));
      
      maxValues[dim.key] = values.length > 0 ? Math.max(...values) : 1;
    });
    
    return maxValues;
  }, [clusters, availableDimensions]);

  // Color palette for clusters
  const clusterColors = [
    '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
    '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#5470c6',
  ];

  useEffect(() => {
    console.log('[RadarChart] useEffect triggered, selectedCluster:', selectedCluster);
    console.log('[RadarChart] Clusters radarValues:', clusters.map(c => ({
      clusterId: c.clusterId,
      label: c.label,
      radarValues: c.radarValues
    })));
    console.log('[RadarChart] DimensionMaxValues:', dimensionMaxValues);
    
    if (!chartRef.current || clusters.length === 0 || availableDimensions.length === 0) return;

    // Initialize chart only if not exists
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current, 'dark');
    }
    
    const chartInstance = chartInstanceRef.current;

    // Prepare radar indicator (dimensions)
    const indicator = availableDimensions.map(dim => ({
      name: dim.name,
      max: dimensionMaxValues[dim.key] || 1,
    }));

    // Prepare series - each cluster is a separate series
    const series = clusters.map((cluster, idx) => {
      const isSelected = selectedCluster === null || selectedCluster === cluster.clusterId;
      console.log('[RadarChart] Cluster', cluster.clusterId, ':', { 
        isSelected, 
        lineWidth: isSelected ? 3 : 1,
        lineOpacity: isSelected ? 1 : 0.15, 
        areaOpacity: isSelected ? 0.4 : 0.02 
      });
      
      // Extract values for each dimension
      const values = availableDimensions.map(dim => {
        const rawValue = cluster.radarValues[dim.key] || 0;
        
        // Inverted dimensions: flip the value for better visualization
        // E.g., lower recency is better → show as higher on radar
        if (dim.inverted) {
          const maxValue = dimensionMaxValues[dim.key];
          const invertedValue = maxValue - rawValue;
          console.log(`[RadarChart] Cluster ${cluster.clusterId} dim ${dim.key}: raw=${rawValue}, max=${maxValue}, inverted=${invertedValue}`);
          return invertedValue;
        }
        
        console.log(`[RadarChart] Cluster ${cluster.clusterId} dim ${dim.key}: value=${rawValue}`);
        return rawValue;
      });
      
      console.log(`[RadarChart] Cluster ${cluster.clusterId} final values:`, values);
      
      return {
        name: cluster.label || `Cluster ${cluster.clusterId}`,
        type: 'radar' as const,
        symbol: 'circle',
        symbolSize: isSelected ? 6 : 4,
        data: [{
          value: values,
          name: cluster.label || `Cluster ${cluster.clusterId}`,
        }],
        itemStyle: {
          color: clusterColors[idx % clusterColors.length],
        },
        lineStyle: {
          width: isSelected ? 4 : 1,  // More extreme difference
          opacity: isSelected ? 1 : 0.1,  // More extreme difference
          type: 'solid' as const,
        },
        areaStyle: {
          opacity: isSelected ? 0.5 : 0.01,  // More extreme difference
        },
        emphasis: {
          focus: 'series' as const,
          lineStyle: {
            width: 5,
          },
          areaStyle: {
            opacity: 0.7,
          },
        },
        z: isSelected ? 10 : 1,  // Selected cluster on top
      };
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
          const cluster = clusters[params.seriesIndex];  // Changed from dataIndex to seriesIndex
          const lines = availableDimensions.map((dim) => {
            const realValue = cluster.radarValues[dim.key];
            
            // Safe value formatting with null check
            if (realValue == null) {
              return `<strong>${dim.name}:</strong> N/A`;
            }
            
            let displayValue = '';
            if (dim.key === 'recency') {
              displayValue = `${realValue.toFixed(0)} days`;
            } else if (dim.key === 'monetary') {
              displayValue = `¥${realValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
            } else if (dim.key === 'frequency') {
              displayValue = `${realValue.toFixed(1)} times`;
            } else if (dim.key === 'aov') {
              displayValue = `¥${realValue.toFixed(0)}`;
            } else {
              displayValue = realValue.toFixed(2);
            }
            
            return `<strong>${dim.name}:</strong> ${displayValue}`;
          });
          
          return `
            <strong>${params.name}</strong><br/>
            <strong>Customers:</strong> ${cluster.customerCount}<br/>
            ${lines.join('<br/>')}
          `;
        },
      },
      legend: {
        data: clusters.map(c => c.label || `Cluster ${c.clusterId}`),
        bottom: '5%',
        textStyle: {
          color: 'rgba(255, 255, 255, 0.85)',
        },
        type: 'scroll',
      },
      radar: {
        indicator,
        center: ['50%', '50%'],
        radius: '60%',
        axisName: {
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 12,
        },
        splitArea: {
          areaStyle: {
            color: [
              'rgba(255, 255, 255, 0.02)',
              'rgba(255, 255, 255, 0.04)',
            ],
          },
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.2)',
          },
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.2)',
          },
        },
      },
      series,  // Multiple series, one per cluster
    };

    console.log('[RadarChart] Setting option with series count:', series.length);
    console.log('[RadarChart] Series styles:', series.map(s => ({
      name: s.name,
      lineStyle: s.lineStyle,
      areaStyle: s.areaStyle,
      z: s.z
    })));

    // Use replaceMerge instead of notMerge for better incremental update
    chartInstance.setOption(option, { replaceMerge: ['series'] });
    
    console.log('[RadarChart] Option set complete');

    // Handle resize
    const handleResize = () => {
      chartInstance.resize();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [clusters, availableDimensions, dimensionMaxValues, selectedCluster]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  if (clusters.length === 0) {
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
