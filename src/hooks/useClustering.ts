/**
 * useClustering Hook
 * React hook for managing customer clustering state and execution
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { analyzeCustomerClustering } from '../services/clustering/clusteringService';
import type {
  ClusteringAnalysisInput,
  ClusteringAnalysisOutput,
} from '../types/clustering.types';
import { DEFAULT_K_VALUE } from '../constants/clustering.constants';

// ============================================================================
// Hook State Types
// ============================================================================

export type ClusteringStatus = 'idle' | 'clustering' | 'success' | 'error';

export interface UseClusteringState {
  status: ClusteringStatus;
  result: ClusteringAnalysisOutput | null;
  error: string | null;
  isClustering: boolean;
  currentKValue: number;
}

export interface UseClusteringActions {
  performClustering: (input: ClusteringAnalysisInput) => Promise<void>;
  adjustKValue: (k: number, previousInput: ClusteringAnalysisInput) => Promise<void>;
  reset: () => void;
  exportClusters: () => string;
}

export type UseClusteringReturn = UseClusteringState & UseClusteringActions;

// ============================================================================
// Simple Cache Implementation
// ============================================================================

interface CacheEntry {
  result: ClusteringAnalysisOutput;
  timestamp: number;
}

const clusteringCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(tableName: string, k: number): string {
  return `${tableName}_k${k}`;
}

function getCachedResult(tableName: string, k: number): ClusteringAnalysisOutput | null {
  const key = getCacheKey(tableName, k);
  const entry = clusteringCache.get(key);
  
  if (!entry) return null;
  
  const isExpired = Date.now() - entry.timestamp > CACHE_TTL;
  if (isExpired) {
    clusteringCache.delete(key);
    return null;
  }
  
  return entry.result;
}

function setCachedResult(tableName: string, k: number, result: ClusteringAnalysisOutput): void {
  const key = getCacheKey(tableName, k);
  clusteringCache.set(key, {
    result,
    timestamp: Date.now(),
  });
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for customer clustering
 * @param executeQuery DuckDB query executor function
 * @returns State and actions for clustering
 */
export function useClustering(
  executeQuery: (sql: string) => Promise<{ data: any[]; schema?: any[] }>
): UseClusteringReturn {
  // State
  const [status, setStatus] = useState<ClusteringStatus>('idle');
  const [result, setResult] = useState<ClusteringAnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentKValue, setCurrentKValue] = useState<number>(DEFAULT_K_VALUE);

  // Ref to track if component is mounted
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // Worker cleanup is handled by service layer
    };
  }, []);

  /**
   * Execute customer clustering
   */
  const performClustering = useCallback(
    async (input: ClusteringAnalysisInput) => {
      if (!isMountedRef.current) return;

      const k = input.nClusters || DEFAULT_K_VALUE;
      
      // Check cache first
      const cached = getCachedResult(input.tableName, k);
      if (cached) {
        console.log('[useClustering] Using cached result for K =', k);
        setResult(cached);
        setStatus('success');
        setCurrentKValue(k);
        return;
      }

      console.log('[useClustering] Starting clustering analysis:', input);
      setStatus('clustering');
      setError(null);

      try {
        // Call service layer
        const analysisResult = await analyzeCustomerClustering(input, executeQuery);

        // Update state if still mounted
        if (isMountedRef.current) {
          setResult(analysisResult);
          setStatus('success');
          setCurrentKValue(analysisResult.metadata.nClusters);
          
          // Cache result
          setCachedResult(input.tableName, analysisResult.metadata.nClusters, analysisResult);
          
          console.log('[useClustering] Clustering successful:', {
            totalCustomers: analysisResult.totalCustomers,
            numClusters: analysisResult.clusters.length,
            gpuUsed: analysisResult.metadata.gpuUsed,
            durationMs: analysisResult.metadata.durationMs,
          });
        }
      } catch (err) {
        console.error('[useClustering] Clustering failed:', err);
        
        // Update state if still mounted
        if (isMountedRef.current) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
          setError(errorMessage);
          setStatus('error');
        }
      }
    },
    [executeQuery]
  );

  /**
   * Adjust K value and re-run clustering
   */
  const adjustKValue = useCallback(
    async (k: number, previousInput: ClusteringAnalysisInput) => {
      if (!isMountedRef.current) return;
      
      // Validate K value
      if (k < 2 || k > 10) {
        console.error('[useClustering] Invalid K value:', k);
        setError(`Invalid K value: ${k}. Must be between 2 and 10.`);
        return;
      }

      console.log('[useClustering] Adjusting K value to:', k);
      
      // Re-run clustering with new K value, preserving other input params
      await performClustering({
        ...previousInput,
        nClusters: k,
      });
    },
    [performClustering]
  );

  /**
   * Reset hook state to initial values
   */
  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
    setCurrentKValue(DEFAULT_K_VALUE);
  }, []);

  /**
   * Export cluster assignments as CSV
   * @returns CSV string with header: customer_id,cluster_id,recency,frequency,monetary
   */
  const exportClusters = useCallback((): string => {
    if (!result) {
      console.warn('[useClustering] No result to export');
      return '';
    }
    
    // CSV header
    const header = 'customer_id,cluster_id,recency,frequency,monetary\n';
    
    // CSV rows
    const rows = result.customers.map(c => 
      `${c.customerId},${c.clusterId},${c.recency},${c.frequency},${c.monetary}`
    ).join('\n');
    
    return header + rows;
  }, [result]);

  // Return state and actions
  return {
    status,
    result,
    error,
    isClustering: status === 'clustering',
    currentKValue,
    performClustering,
    adjustKValue,
    reset,
    exportClusters,
  };
}
