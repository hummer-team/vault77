/**
 * useInsight Hook
 * Manages insight generation state and orchestrates service layer
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { CacheService } from '../../services/insight/cacheService';
import { InsightService } from '../../services/insight/insightService';
import type {
  InsightConfig,
  SummaryResult,
  MultiLineChartData,
  CategoricalResult,
} from '../../types/insight.types';

/**
 * Hook options
 */
export interface UseInsightOptions {
  tableName: string;
  autoLoad?: boolean; // Auto-generate insights on mount
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>; // DuckDB query executor
  onNoValidColumns?: () => void; // Callback when no valid columns found
}

/**
 * Hook state
 */
export interface InsightState {
  // Loading states
  loading: boolean;
  loadingSummary: boolean;
  loadingDistribution: boolean;
  loadingCategorical: boolean;

  // Error state
  error: string | null;

  // Data
  config: InsightConfig | null;
  summary: SummaryResult | null;
  distribution: MultiLineChartData | null;
  categorical: {
    status: CategoricalResult[];
    category: CategoricalResult[];
  } | null;

  // Cache info
  cacheHit: {
    summary: boolean;
    distribution: boolean;
    categorical: boolean;
  };
}

/**
 * Hook return value
 */
export interface UseInsightReturn extends InsightState {
  generateInsights: () => Promise<void>;
  clearCache: () => Promise<void>;
  retry: () => Promise<void>;
}

/**
 * Main hook for insight generation
 */
export function useInsight(options: UseInsightOptions): UseInsightReturn {
  const { tableName, autoLoad = true, executeQuery, onNoValidColumns } = options;

  // Services
  const cacheService = CacheService.getInstance();
  const insightService = InsightService.getInstance();

  // Refs for cleanup
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // State
  const [state, setState] = useState<InsightState>({
    loading: false,
    loadingSummary: false,
    loadingDistribution: false,
    loadingCategorical: false,
    error: null,
    config: null,
    summary: null,
    distribution: null,
    categorical: null,
    cacheHit: {
      summary: false,
      distribution: false,
      categorical: false,
    },
  });

  /**
   * Generate global summary with cache support
   */
  const generateSummary = useCallback(
    async (config: InsightConfig): Promise<SummaryResult> => {
      const cacheKey = `${tableName}:summary`;

      // Check cache (but don't fail if cache fails)
      try {
        const cached = await cacheService.get<SummaryResult>(cacheKey);
        if (cached) {
          console.log('[useInsight] Summary cache hit');
          setState(prev => ({
            ...prev,
            cacheHit: { ...prev.cacheHit, summary: true },
          }));
          return cached;
        }
      } catch (error) {
        console.warn('[useInsight] Cache read failed, continuing without cache:', error);
      }

      // Generate summary (columns already inferred in config)
      const summary = insightService.transformSummaryResult(config.columns);

      // Try to cache result (but don't fail if it exceeds quota)
      try {
        await cacheService.set(cacheKey, summary);
      } catch (error) {
        console.warn('[useInsight] Cache write failed (quota exceeded?), continuing:', error);
      }

      return summary;
    },
    [tableName, cacheService, insightService]
  );

  /**
   * Generate distribution charts with cache support
   */
  const generateDistribution = useCallback(
    async (config: InsightConfig): Promise<MultiLineChartData> => {
      const cacheKey = `${tableName}:distribution`;

      // Check cache (but don't fail if cache fails)
      try {
        const cached = await cacheService.get<MultiLineChartData>(cacheKey);
        if (cached) {
          console.log('[useInsight] Distribution cache hit');
          setState(prev => ({
            ...prev,
            cacheHit: { ...prev.cacheHit, distribution: true },
          }));
          return cached;
        }
      } catch (error) {
        console.warn('[useInsight] Cache read failed, continuing without cache:', error);
      }

      // Generate distributions using HISTOGRAM
      const distribution = await insightService.generateDistributions(config, executeQuery);

      // Try to cache result (but don't fail if it exceeds quota)
      try {
        await cacheService.set(cacheKey, distribution);
      } catch (error) {
        console.warn('[useInsight] Cache write failed (quota exceeded?), continuing:', error);
      }

      return distribution;
    },
    [tableName, cacheService, insightService, executeQuery]
  );

  /**
   * Generate categorical charts with cache support
   */
  const generateCategorical = useCallback(
    async (
      config: InsightConfig
    ): Promise<{ status: CategoricalResult[]; category: CategoricalResult[] }> => {
      const cacheKey = `${tableName}:categorical`;

      // Check cache (but don't fail if cache fails)
      try {
        const cached = await cacheService.get<{
          status: CategoricalResult[];
          category: CategoricalResult[];
        }>(cacheKey);
        if (cached) {
          console.log('[useInsight] Categorical cache hit');
          setState(prev => ({
            ...prev,
            cacheHit: { ...prev.cacheHit, categorical: true },
          }));
          return cached;
        }
      } catch (error) {
        console.warn('[useInsight] Cache read failed, continuing without cache:', error);
      }

      // Generate categorical
      const categorical = await insightService.generateCategorical(config, executeQuery);

      // Try to cache result (but don't fail if it exceeds quota)
      try {
        await cacheService.set(cacheKey, categorical);
      } catch (error) {
        console.warn('[useInsight] Cache write failed (quota exceeded?), continuing:', error);
      }

      return categorical;
    },
    [tableName, cacheService, insightService, executeQuery]
  );

  /**
   * Generate all insights
   */
  const generateInsights = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Step 1: Build config (includes column inference)
      console.log('[useInsight] Building insight config for table:', tableName);
      const config = await insightService.buildConfig(tableName, executeQuery);
      
      // Check if config is valid
      if (!config) {
        console.warn('[useInsight] No valid columns for insights, skipping generation');
        const errorMessage = 'No amount/status/category columns found in this dataset. Insights are not available for this data structure.';
        
        setState(prev => ({ 
          ...prev, 
          loading: false,
          error: errorMessage,
        }));
        
        // Notify parent component to navigate back (with delay for user to see error)
        console.log('[useInsight] onNoValidColumns callback exists?', !!onNoValidColumns);
        if (onNoValidColumns) {
          console.log('[useInsight] Scheduling navigation back in 1.5 seconds, callback type:', typeof onNoValidColumns);
          
          // Clear any existing timeout
          if (navigationTimeoutRef.current) {
            console.log('[useInsight] Clearing existing timeout');
            clearTimeout(navigationTimeoutRef.current);
          }
          
          navigationTimeoutRef.current = setTimeout(() => {
            console.log('[useInsight] Timeout fired! Executing navigation callback now');
            try {
              onNoValidColumns();
              console.log('[useInsight] Navigation callback executed successfully');
            } catch (err) {
              console.error('[useInsight] Error executing navigation callback:', err);
            }
            navigationTimeoutRef.current = null;
          }, 1500);
          
          console.log('[useInsight] Timeout scheduled with ID:', navigationTimeoutRef.current);
        } else {
          console.warn('[useInsight] onNoValidColumns callback is not provided!');
        }
        
        return;
      }
      
      setState(prev => ({ ...prev, config }));

      // Step 2: Generate summary
      setState(prev => ({ ...prev, loadingSummary: true }));
      const summary = await generateSummary(config);
      setState(prev => ({ ...prev, summary, loadingSummary: false }));

      // Step 3: Generate distribution (only if numeric columns exist)
      if (config.numericColumns.length > 0) {
        setState(prev => ({ ...prev, loadingDistribution: true }));
        const distribution = await generateDistribution(config);
        setState(prev => ({ ...prev, distribution, loadingDistribution: false }));
      } else {
        console.log('[useInsight] No numeric columns found, skipping distribution');
      }

      // Step 4: Generate categorical (only if status/category columns exist)
      if (config.statusColumns.length > 0 || config.categoryColumns.length > 0) {
        setState(prev => ({ ...prev, loadingCategorical: true }));
        const categorical = await generateCategorical(config);
        setState(prev => ({ ...prev, categorical, loadingCategorical: false }));
      } else {
        console.log('[useInsight] No status/category columns found, skipping categorical');
      }

      console.log('[useInsight] All insights generated successfully');
    } catch (error) {
      console.error('[useInsight] Failed to generate insights:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }));
    } finally {
      setState(prev => ({
        ...prev,
        loading: false,
        loadingSummary: false,
        loadingDistribution: false,
        loadingCategorical: false,
      }));
    }
  }, [
    tableName,
    insightService,
    executeQuery,
    generateSummary,
    generateDistribution,
    generateCategorical,
    onNoValidColumns, // Add this dependency!
  ]);

  /**
   * Clear insight cache for current table
   */
  const clearCache = useCallback(async () => {
    try {
      await cacheService.clear();
      console.log('[useInsight] Cache cleared');

      // Reset cache hit flags
      setState(prev => ({
        ...prev,
        cacheHit: { summary: false, distribution: false, categorical: false },
      }));
    } catch (error) {
      console.error('[useInsight] Failed to clear cache:', error);
    }
  }, [cacheService]);

  /**
   * Retry insight generation
   */
  const retry = useCallback(async () => {
    // Reset state
    setState(prev => ({
      ...prev,
      error: null,
      summary: null,
      distribution: null,
      categorical: null,
      cacheHit: { summary: false, distribution: false, categorical: false },
    }));

    // Regenerate
    await generateInsights();
  }, [generateInsights]);

  /**
   * Reset state when table name changes (e.g., uploading a new file)
   */
  useEffect(() => {
    console.log('[useInsight] Table name changed, resetting state');
    
    // Clear any pending navigation timeout
    if (navigationTimeoutRef.current) {
      console.log('[useInsight] Clearing pending navigation timeout');
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    
    setState({
      loading: false,
      loadingSummary: false,
      loadingDistribution: false,
      loadingCategorical: false,
      error: null,
      config: null,
      summary: null,
      distribution: null,
      categorical: null,
      cacheHit: { summary: false, distribution: false, categorical: false },
    });
  }, [tableName]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        console.log('[useInsight] Component unmounting, clearing timeout');
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Auto-load insights on mount
   */
  useEffect(() => {
    if (autoLoad && tableName) {
      generateInsights();
    }
  }, [autoLoad, tableName, generateInsights]);

  return {
    ...state,
    generateInsights,
    clearCache,
    retry,
  };
}
