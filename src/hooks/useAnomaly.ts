/**
 * useAnomaly Hook
 * React hook for managing anomaly detection state and execution
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { analyzeAnomalies, cleanup as cleanupWorker } from '../services/anomaly/anomalyService';
import type {
  AnomalyAnalysisInput,
  AnomalyAnalysisOutput,
} from '../types/anomaly.types';

// ============================================================================
// Hook State Types
// ============================================================================

export type AnomalyStatus = 'idle' | 'detecting' | 'success' | 'error';

export interface UseAnomalyState {
  status: AnomalyStatus;
  result: AnomalyAnalysisOutput | null;
  error: string | null;
  isDetecting: boolean;
}

export interface UseAnomalyActions {
  detectAnomalies: (input: AnomalyAnalysisInput) => Promise<void>;
  reset: () => void;
}

export type UseAnomalyReturn = UseAnomalyState & UseAnomalyActions;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for anomaly detection
 * @param executeQuery DuckDB query executor function
 * @returns State and actions for anomaly detection
 */
export function useAnomaly(
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): UseAnomalyReturn {
  // State
  const [status, setStatus] = useState<AnomalyStatus>('idle');
  const [result, setResult] = useState<AnomalyAnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref to track if component is mounted
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanupWorker(); // Terminate worker
    };
  }, []);

  /**
   * Execute anomaly detection
   */
  const detectAnomalies = useCallback(
    async (input: AnomalyAnalysisInput) => {
      if (!isMountedRef.current) return;

      console.log('[useAnomaly] Starting anomaly detection:', input);
      setStatus('detecting');
      setError(null);

      try {
        // Call service layer
        const analysisResult = await analyzeAnomalies(input, executeQuery);

        // Update state if still mounted
        if (isMountedRef.current) {
          setResult(analysisResult);
          setStatus('success');
          console.log('[useAnomaly] Detection successful:', {
            anomalyCount: analysisResult.anomalyCount,
            anomalyRate: (analysisResult.anomalyRate * 100).toFixed(2) + '%',
          });
        }
      } catch (err) {
        console.error('[useAnomaly] Detection failed:', err);
        
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
   * Reset hook state to initial values
   */
  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  // Return state and actions
  return {
    status,
    result,
    error,
    isDetecting: status === 'detecting',
    detectAnomalies,
    reset,
  };
}
