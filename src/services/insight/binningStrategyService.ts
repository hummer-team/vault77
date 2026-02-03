/**
 * Auto-Binning Strategy Service
 * Intelligently selects binning strategy based on data distribution characteristics
 */

export interface ColumnStatistics {
  min: number;
  max: number;
  q1: number;
  q3: number;
  rowCount: number;
}

export type BinningStrategyType = 'logarithmic' | 'clipped' | 'linear';

export interface BinningResult {
  strategy: BinningStrategyType;
  sql: string;
  metadata?: {
    binWidth?: number;
    upperFence?: number;
  };
}

export class AutoBinningStrategy {
  private static readonly WIDE_RANGE_THRESHOLD = 10000;
  private static readonly OUTLIER_MULTIPLIER = 2;

  static generate(columnName: string, stats: ColumnStatistics): BinningResult {
    const { min, max, q1, q3, rowCount } = stats;
    const iqr = q3 - q1;
    const upperFence = q3 + 1.5 * iqr;
    const dynamicRange = max / Math.max(min, 1);

    if (dynamicRange > this.WIDE_RANGE_THRESHOLD) {
      console.log(`[AutoBinningStrategy] ${columnName}: LOGARITHMIC (range: ${min.toFixed(2)} - ${max.toFixed(2)})`);
      return {
        strategy: 'logarithmic',
        sql: `pow(10, floor(log10(NULLIF(GREATEST("${columnName}", 1), 0))))`,
      };
    }

    if (max > upperFence * this.OUTLIER_MULTIPLIER) {
      const binWidth = this.calculateOptimalBinWidth(iqr, rowCount);
      console.log(`[AutoBinningStrategy] ${columnName}: CLIPPED (fence: ${upperFence.toFixed(2)}, binWidth: ${binWidth})`);
      return {
        strategy: 'clipped',
        sql: `CASE WHEN "${columnName}" > ${upperFence} THEN ${upperFence} ELSE floor("${columnName}" / ${binWidth}) * ${binWidth} END`,
        metadata: { binWidth, upperFence },
      };
    }

    const binWidth = this.calculateOptimalBinWidth(iqr, rowCount);
    console.log(`[AutoBinningStrategy] ${columnName}: LINEAR (binWidth: ${binWidth})`);
    return {
      strategy: 'linear',
      sql: `floor("${columnName}" / ${binWidth}) * ${binWidth}`,
      metadata: { binWidth },
    };
  }

  private static calculateOptimalBinWidth(iqr: number, rowCount: number): number {
    if (iqr === 0 || rowCount === 0) return 10;
    let width = (2 * iqr) / Math.pow(rowCount, 1 / 3);
    const magnitude = Math.pow(10, Math.floor(Math.log10(width)));
    const normalized = width / magnitude;
    if (normalized <= 2) return magnitude * 2;
    if (normalized <= 5) return magnitude * 5;
    return magnitude * 10;
  }

  static buildQuery(tableName: string, columnName: string, stats: ColumnStatistics, samplingClause: string = ''): string {
    const { sql } = this.generate(columnName, stats);
    const sourceTable = samplingClause 
      ? `(SELECT * FROM ${tableName} ${samplingClause}) as sampled_data`
      : tableName;
    return `SELECT ${sql} as bin, COUNT(*) as count FROM ${sourceTable} WHERE "${columnName}" IS NOT NULL GROUP BY 1 ORDER BY 1`;
  }
}
