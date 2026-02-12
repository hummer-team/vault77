/**
 * Performance Optimizer
 * Handles large datasets and memory management for flow execution
 */

import type { FlowNode } from './types';

/**
 * Memory usage monitor
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private memoryWarnings: string[] = [];

  private constructor() {}

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * Check current memory usage
   * Returns estimated memory usage in MB
   */
  getMemoryUsage(): number {
    if ('memory' in performance && performance.memory) {
      const memory = performance.memory as {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
      return memory.usedJSHeapSize / 1024 / 1024; // Convert to MB
    }
    return 0;
  }

  /**
   * Get memory usage percentage
   */
  getMemoryUsagePercentage(): number {
    if ('memory' in performance && performance.memory) {
      const memory = performance.memory as {
        usedJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
      return (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
    }
    return 0;
  }

  /**
   * Check if memory usage is critical
   */
  isCritical(): boolean {
    return this.getMemoryUsagePercentage() > 90;
  }

  /**
   * Add memory warning
   */
  addWarning(warning: string): void {
    this.memoryWarnings.push(warning);
    console.warn('[MemoryMonitor]', warning);
  }

  /**
   * Get all warnings
   */
  getWarnings(): string[] {
    return this.memoryWarnings;
  }

  /**
   * Clear warnings
   */
  clearWarnings(): void {
    this.memoryWarnings = [];
  }
}

/**
 * Query optimizer for large datasets
 */
export class QueryOptimizer {
  /**
   * Check if query should be optimized for large dataset
   */
  static shouldOptimize(estimatedRows: number): boolean {
    return estimatedRows > 10000;
  }

  /**
   * Add LIMIT clause if missing for safety
   */
  static addSafeLimit(sql: string, defaultLimit: number = 100000): string {
    const upperSql = sql.toUpperCase();

    // Don't add LIMIT if it already exists
    if (upperSql.includes('LIMIT')) {
      return sql;
    }

    // Don't add LIMIT if query has aggregation (GROUP BY, COUNT, etc.)
    if (
      upperSql.includes('GROUP BY') ||
      upperSql.includes('COUNT(') ||
      upperSql.includes('SUM(') ||
      upperSql.includes('AVG(')
    ) {
      return sql;
    }

    return `${sql}\nLIMIT ${defaultLimit}`;
  }

  /**
   * Optimize SELECT clause - remove unnecessary columns
   */
  static optimizeSelectClause(sql: string): string {
    // If SELECT *, suggest replacing with specific columns
    if (sql.includes('SELECT *')) {
      console.warn(
        '[QueryOptimizer] Using SELECT * may impact performance. Consider selecting specific columns.'
      );
    }

    return sql;
  }

  /**
   * Analyze and suggest query optimization
   */
  static analyzeQuery(sql: string): {
    optimized: string;
    suggestions: string[];
  } {
    const suggestions: string[] = [];
    let optimized = sql;

    // Check for SELECT *
    if (sql.includes('SELECT *')) {
      suggestions.push('建议明确指定需要的列，避免使用 SELECT *');
    }

    // Check for missing WHERE clause
    if (!sql.toUpperCase().includes('WHERE') && !sql.toUpperCase().includes('LIMIT')) {
      suggestions.push('建议添加 WHERE 条件或 LIMIT 子句以限制结果集大小');
      optimized = this.addSafeLimit(optimized);
    }

    // Check for multiple JOINs
    const joinCount = (sql.match(/JOIN/gi) || []).length;
    if (joinCount > 2) {
      suggestions.push('多表 JOIN 可能影响性能，建议确保关联字段有适当的索引');
    }

    // Check for OR conditions in WHERE
    if (sql.toUpperCase().includes('WHERE') && sql.includes(' OR ')) {
      suggestions.push('OR 条件可能导致全表扫描，考虑使用 UNION 或 IN 替代');
    }

    return {
      optimized,
      suggestions,
    };
  }

  /**
   * Estimate query complexity score (0-100)
   */
  static estimateComplexity(sql: string): number {
    let score = 0;

    // Base complexity
    score += 10;

    // JOIN complexity
    const joinCount = (sql.match(/JOIN/gi) || []).length;
    score += joinCount * 15;

    // Subquery complexity
    const subqueryCount = (sql.match(/SELECT.*FROM.*SELECT/gi) || []).length;
    score += subqueryCount * 20;

    // WHERE complexity
    const whereConditions = (sql.match(/AND|OR/gi) || []).length;
    score += whereConditions * 5;

    // GROUP BY complexity
    if (sql.toUpperCase().includes('GROUP BY')) {
      score += 10;
    }

    // ORDER BY complexity
    if (sql.toUpperCase().includes('ORDER BY')) {
      score += 5;
    }

    // DISTINCT complexity
    if (sql.toUpperCase().includes('DISTINCT')) {
      score += 10;
    }

    return Math.min(score, 100);
  }
}

/**
 * Batch processor for large datasets
 */
export class BatchProcessor {
  /**
   * Process data in batches to avoid memory overflow
   */
  static async processBatch<T, R>(
    items: T[],
    batchSize: number,
    processor: (batch: T[]) => Promise<R[]>,
    onProgress?: (progress: number) => void
  ): Promise<R[]> {
    const results: R[] = [];
    const totalBatches = Math.ceil(items.length / batchSize);

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processor(batch);
      results.push(...batchResults);

      // Report progress
      if (onProgress) {
        const progress = Math.min(((i + batchSize) / items.length) * 100, 100);
        onProgress(progress);
      }

      // Check memory usage
      const memoryMonitor = MemoryMonitor.getInstance();
      if (memoryMonitor.isCritical()) {
        memoryMonitor.addWarning(
          `Critical memory usage at batch ${Math.floor(i / batchSize) + 1}/${totalBatches}`
        );

        // Force garbage collection if available (in dev/test environments)
        if (global.gc) {
          global.gc();
        }

        // Wait a bit to allow memory cleanup
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Stream process data to avoid loading everything into memory
   */
  static async streamProcess<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    onProgress?: (progress: number) => void
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i++) {
      const result = await processor(items[i]);
      results.push(result);

      // Report progress
      if (onProgress && i % 100 === 0) {
        const progress = ((i + 1) / items.length) * 100;
        onProgress(progress);
      }
    }

    return results;
  }
}

/**
 * Data sampler for preview and testing
 */
export class DataSampler {
  /**
   * Sample data using reservoir sampling algorithm
   * Ensures uniform random sampling from large datasets
   */
  static reservoirSample<T>(data: T[], sampleSize: number): T[] {
    if (data.length <= sampleSize) {
      return data;
    }

    const reservoir: T[] = [];

    // Fill reservoir with first sampleSize elements
    for (let i = 0; i < sampleSize; i++) {
      reservoir.push(data[i]);
    }

    // Replace elements with decreasing probability
    for (let i = sampleSize; i < data.length; i++) {
      const j = Math.floor(Math.random() * (i + 1));
      if (j < sampleSize) {
        reservoir[j] = data[i];
      }
    }

    return reservoir;
  }

  /**
   * Sample data from the beginning (fast but not statistically random)
   */
  static headSample<T>(data: T[], sampleSize: number): T[] {
    return data.slice(0, sampleSize);
  }

  /**
   * Stratified sampling - sample from different segments
   */
  static stratifiedSample<T>(
    data: T[],
    sampleSize: number,
    strata: number = 5
  ): T[] {
    if (data.length <= sampleSize) {
      return data;
    }

    const samples: T[] = [];
    const strataSize = Math.floor(data.length / strata);
    const samplesPerStrata = Math.ceil(sampleSize / strata);

    for (let i = 0; i < strata; i++) {
      const start = i * strataSize;
      const end = Math.min((i + 1) * strataSize, data.length);
      const strataData = data.slice(start, end);

      const strataSamples = this.reservoirSample(strataData, samplesPerStrata);
      samples.push(...strataSamples);
    }

    return samples.slice(0, sampleSize);
  }
}

/**
 * Cache manager for expensive operations
 */
export class CacheManager {
  private static instance: CacheManager;
  private cache: Map<string, { data: any; timestamp: number; size: number }>;
  private maxCacheSize: number = 100 * 1024 * 1024; // 100MB
  private currentCacheSize: number = 0;

  private constructor() {
    this.cache = new Map();
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Estimate size of data in bytes
   */
  private estimateSize(data: any): number {
    const str = JSON.stringify(data);
    return str.length * 2; // 2 bytes per character in UTF-16
  }

  /**
   * Generate cache key from node configuration
   */
  static generateKey(nodes: FlowNode[], sql: string): string {
    return `${JSON.stringify(nodes.map((n) => n.id))}_${sql}`;
  }

  /**
   * Get cached data
   */
  get<T>(key: string): T | null {
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Check if cache is stale (older than 5 minutes)
    const now = Date.now();
    if (now - cached.timestamp > 5 * 60 * 1000) {
      this.delete(key);
      return null;
    }

    return cached.data as T;
  }

  /**
   * Set cached data
   */
  set(key: string, data: any): void {
    const size = this.estimateSize(data);

    // Check if adding this would exceed max cache size
    if (size > this.maxCacheSize) {
      console.warn('[CacheManager] Data too large to cache:', size);
      return;
    }

    // Evict old entries if needed
    while (this.currentCacheSize + size > this.maxCacheSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      size,
    });

    this.currentCacheSize += size;
  }

  /**
   * Delete cached data
   */
  delete(key: string): void {
    const cached = this.cache.get(key);
    if (cached) {
      this.currentCacheSize -= cached.size;
      this.cache.delete(key);
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.currentCacheSize = 0;
  }

  /**
   * Evict oldest cache entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    size: number;
    maxSize: number;
    usage: number;
  } {
    return {
      entries: this.cache.size,
      size: this.currentCacheSize,
      maxSize: this.maxCacheSize,
      usage: (this.currentCacheSize / this.maxCacheSize) * 100,
    };
  }
}

/**
 * Performance profiler
 */
export class PerformanceProfiler {
  private static timers: Map<string, number> = new Map();

  /**
   * Start timer
   */
  static start(label: string): void {
    this.timers.set(label, performance.now());
  }

  /**
   * End timer and return duration
   */
  static end(label: string): number {
    const start = this.timers.get(label);
    if (!start) {
      console.warn(`[PerformanceProfiler] Timer "${label}" not found`);
      return 0;
    }

    const duration = performance.now() - start;
    this.timers.delete(label);

    console.log(`[PerformanceProfiler] ${label}: ${duration.toFixed(2)}ms`);
    return duration;
  }

  /**
   * Measure async function execution time
   */
  static async measure<T>(
    label: string,
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    this.start(label);
    const result = await fn();
    const duration = this.end(label);

    return { result, duration };
  }
}

/**
 * Export all utilities
 */
export const PerformanceUtils = {
  MemoryMonitor,
  QueryOptimizer,
  BatchProcessor,
  DataSampler,
  CacheManager,
  PerformanceProfiler,
};
