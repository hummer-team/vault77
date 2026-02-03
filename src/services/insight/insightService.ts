/**
 * Insight Service
 * SQL query builders and result transformers for insight generation
 * Uses intelligent binning strategies for distribution analysis
 */

import { ColumnInferService } from './columnInferService';
import { AutoBinningStrategy, ColumnStatistics } from './binningStrategyService';
import type {
  InsightConfig,
  ColumnProfile,
  SummaryResult,
  MultiLineChartData,
  CategoricalResult,
  CategoricalValue,
} from '../../types/insight.types';

const MAX_DISTRIBUTION_COLUMNS = 5;
const TOP_N_CATEGORICAL = 20;

export class InsightService {
  private static instance: InsightService;

  private constructor() {}

  public static getInstance(): InsightService {
    if (!InsightService.instance) {
      InsightService.instance = new InsightService();
    }
    return InsightService.instance;
  }

  /**
   * Build insight configuration from table analysis
   * Returns null if no valid columns found for insights
   * @param tableName - Name of the table to analyze
   * @param executeQuery - DuckDB query executor
   * @returns Complete insight configuration or null if no valid columns
   */
  public async buildConfig(
    tableName: string,
    executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
  ): Promise<InsightConfig | null> {
    const columnInfer = ColumnInferService.getInstance();

    // Infer column types
    const columns = await columnInfer.inferColumns(tableName, executeQuery);
    
    if (columns.length === 0) {
      console.warn('[InsightService] No valid columns found, skipping insights');
      return null;
    }

    // Get row count
    const rowCountResult = await executeQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
    const rowCount = rowCountResult.data[0]?.total || 0;

    // Categorize columns
    const numericColumns = columns.filter(c => c.type === 'numeric');
    const categoricalColumns = columns.filter(c => c.type === 'categorical');
    const datetimeColumns = columns.filter(c => c.type === 'datetime');
    const statusColumns = columns.filter(c => c.semanticType === 'status');
    const categoryColumns = columns.filter(c => c.semanticType === 'category');

    // Filter amount-related columns for distribution
    const amountColumns = numericColumns.filter(c => c.semanticType === 'amount');
    
    // Sort numeric columns by importance
    const sortedNumeric = columnInfer.sortColumnsByImportance(amountColumns);
    
    // Check if we have any meaningful columns for insights
    const hasValidColumns = sortedNumeric.length > 0 || statusColumns.length > 0 || categoryColumns.length > 0;
    
    if (!hasValidColumns) {
      console.warn('[InsightService] No amount/status/category columns found, skipping insights');
      return null;
    }

    console.log(`[InsightService] Valid insight columns: ${sortedNumeric.length} amount, ${statusColumns.length} status, ${categoryColumns.length} category`);

    return {
      tableName,
      columns,
      rowCount,
      enableSampling: rowCount > 10000,
      samplingRate: 0.75,
      numericColumns: sortedNumeric,
      categoricalColumns,
      datetimeColumns,
      statusColumns,
      categoryColumns,
    };
  }

  /**
   * Transform column profiles into summary result
   * Filters columns to show only money-related fields (amount, rate, tax, etc.)
   */
  public transformSummaryResult(columns: ColumnProfile[]): SummaryResult {
    const filteredColumns = columns.filter(col => {
      // Exclude columns with specific keywords
      const excludePatterns = [
        /^is[A-Z]/, /是否/, /电话/, /手机/, /联系/, /状态/, /方式/, /type/i, /类型/, /支付/, /no/i, /number/i, /单号/,
        /phone/i, /mobile/i, /contact/i, /status/i
      ];
      if (excludePatterns.some(pattern => pattern.test(col.name))) {
        return false;
      }

      // Exclude text and datetime types
      if (col.type === 'text' || col.type === 'datetime') {
        return false;
      }

      // Only include amount-related columns (money, rate, tax, etc.)
      if (col.semanticType === 'amount') {
        return true;
      }

      return false;
    });

    console.log(`[InsightService] Global Summary filtered: ${filteredColumns.length}/${columns.length} columns`);
    return { columns: filteredColumns };
  }

  /**
   * Generate distribution using intelligent binning strategy
   * Automatically selects optimal binning based on data characteristics
   */
  public async generateDistributions(
    config: InsightConfig,
    executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
  ): Promise<MultiLineChartData> {
    const topColumns = config.numericColumns.slice(0, MAX_DISTRIBUTION_COLUMNS);
    const sampling = config.enableSampling ? `USING SAMPLE ${config.samplingRate * 100}%` : '';

    if (topColumns.length === 0) {
      console.log('[InsightService] No numeric columns found for distribution');
      return { xAxis: [], series: [] };
    }

    console.log(`[InsightService] Generating distributions for ${topColumns.length} columns:`, topColumns.map(c => c.name));

    const allSeries: Array<{ columnName: string; data: number[]; bins: number[] }> = [];
    
    for (const column of topColumns) {
      try {
        // Build column statistics for strategy selection
        const stats: ColumnStatistics = {
          min: column.min as number,
          max: column.max as number,
          // Approximate quartiles from available data
          q1: (column.min as number) + 0.25 * ((column.max as number) - (column.min as number)),
          q3: (column.min as number) + 0.75 * ((column.max as number) - (column.min as number)),
          rowCount: config.rowCount,
        };

        // Generate optimal binning query
        const sql = AutoBinningStrategy.buildQuery(
          config.tableName,
          column.name,
          stats,
          sampling
        );
        
        console.log(`[InsightService] Binning query for ${column.name}:`, sql);
        
        const result = await executeQuery(sql);
        console.log(`[InsightService] Got ${result.data.length} bins for ${column.name}`);
        
        if (result.data && result.data.length > 0) {
          const bins = result.data
            .map(row => ({
              bin: parseFloat(row.bin),
              count: row.count
            }))
            .filter(b => !isNaN(b.bin))
            .sort((a, b) => a.bin - b.bin);
          
          if (bins.length > 0) {
            allSeries.push({
              columnName: column.name,
              data: bins.map(b => b.count),
              bins: bins.map(b => b.bin)
            });
          }
        }
      } catch (error) {
        console.error(`[InsightService] Failed to generate distribution for ${column.name}:`, error);
      }
    }

    console.log(`[InsightService] Successfully generated ${allSeries.length} distributions`);

    const xAxis = allSeries.length > 0 ? allSeries[0].bins : [];
    
    return {
      xAxis,
      series: allSeries.map(s => ({
        columnName: s.columnName,
        data: s.data
      }))
    };
  }

  /**
   * Transform categorical query result
   */
  public transformCategoricalResult(
    columnName: string,
    queryResult: any[]
  ): CategoricalResult {
    const values: CategoricalValue[] = queryResult.map(row => ({
      value: String(row.value),
      count: row.count,
    }));

    return { columnName, values };
  }

  /**
   * Generate categorical results using GROUP BY
   * Optimized: Uses CTE for single sampling + UNION ALL for batch queries
   */
  public async generateCategorical(
    config: InsightConfig,
    executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
  ): Promise<{
    status: CategoricalResult[];
    category: CategoricalResult[];
  }> {
    console.log('[InsightService] Generating categorical data...');
    console.log(`[InsightService] Status columns: ${config.statusColumns.length}`, config.statusColumns.map(c => c.name));
    console.log(`[InsightService] Category columns: ${config.categoryColumns.length}`, config.categoryColumns.map(c => c.name));
    
    const status: CategoricalResult[] = [];
    const category: CategoricalResult[] = [];

    const samplingRate = config.samplingRate * 100;
    
    // Build CTE for sampling (if enabled)
    const cteClause = config.enableSampling 
      ? `WITH sampled_data AS (SELECT * FROM ${config.tableName} USING SAMPLE ${samplingRate}%)`
      : '';
    const sourceTable = config.enableSampling ? 'sampled_data' : config.tableName;
    
    // Batch all status columns into one query using UNION ALL
    if (config.statusColumns.length > 0) {
      const statusQueries = config.statusColumns.map(column => `
        (
          SELECT '${column.name}' as column_name, "${column.name}" as value, COUNT(*) as count 
          FROM ${sourceTable}
          WHERE "${column.name}" IS NOT NULL
          GROUP BY "${column.name}"
          ORDER BY count DESC
          LIMIT 10
        )
      `.trim());

      const batchedStatusSQL = cteClause 
        ? `${cteClause}\n${statusQueries.join('\nUNION ALL\n')}`
        : statusQueries.join('\nUNION ALL\n');
      
      console.log(`[InsightService] Batched status SQL (${config.statusColumns.length} columns):`, batchedStatusSQL);
      
      try {
        const result = await executeQuery(batchedStatusSQL);
        console.log(`[InsightService] Batched status result rows: ${result.data.length}`);
        
        // Group results by column_name
        const groupedResults = new Map<string, any[]>();
        for (const row of result.data) {
          if (!groupedResults.has(row.column_name)) {
            groupedResults.set(row.column_name, []);
          }
          groupedResults.get(row.column_name)!.push({ value: row.value, count: row.count });
        }
        
        // Transform to CategoricalResult
        for (const column of config.statusColumns) {
          const columnData = groupedResults.get(column.name) || [];
          status.push(this.transformCategoricalResult(column.name, columnData));
        }
      } catch (error) {
        console.error(`[InsightService] Failed to generate batched status:`, error);
      }
    }

    // Batch all category columns into one query using UNION ALL
    if (config.categoryColumns.length > 0) {
      const categoryQueries = config.categoryColumns.map(column => `
        (
          SELECT '${column.name}' as column_name, "${column.name}" as value, COUNT(*) as count 
          FROM ${sourceTable}
          WHERE "${column.name}" IS NOT NULL
          GROUP BY "${column.name}"
          ORDER BY count DESC
          LIMIT ${TOP_N_CATEGORICAL}
        )
      `.trim());

      const batchedCategorySQL = cteClause 
        ? `${cteClause}\n${categoryQueries.join('\nUNION ALL\n')}`
        : categoryQueries.join('\nUNION ALL\n');
      
      console.log(`[InsightService] Batched category SQL (${config.categoryColumns.length} columns):`, batchedCategorySQL);
      
      try {
        const result = await executeQuery(batchedCategorySQL);
        console.log(`[InsightService] Batched category result rows: ${result.data.length}`);
        
        // Group results by column_name
        const groupedResults = new Map<string, any[]>();
        for (const row of result.data) {
          if (!groupedResults.has(row.column_name)) {
            groupedResults.set(row.column_name, []);
          }
          groupedResults.get(row.column_name)!.push({ value: row.value, count: row.count });
        }
        
        // Transform to CategoricalResult
        for (const column of config.categoryColumns) {
          const columnData = groupedResults.get(column.name) || [];
          category.push(this.transformCategoricalResult(column.name, columnData));
        }
      } catch (error) {
        console.error(`[InsightService] Failed to generate batched category:`, error);
      }
    }

    console.log(`[InsightService] Generated ${status.length} status + ${category.length} category results`);
    
    return { status, category };
  }
}
