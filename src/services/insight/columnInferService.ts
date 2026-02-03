/**
 * Column Type Inference Service
 * Analyzes table columns to infer types and semantic meanings
 */

import {
  ColumnProfile,
  ColumnType,
  SemanticType,
} from '../../types/insight.types.ts';

/**
 * Column name patterns for semantic type matching
 * Using flexible boundaries to match both snake_case and CamelCase
 */
const COLUMN_PATTERNS: Record<string, RegExp[]> = {
  amount: [
    /(^|_)(amount|price|cost|fee|revenue|sales|profit|payment|balance|total|subtotal|discount|tax|rate|ratio|percent|percentage|commission|refund|wage|salary|bonus|income|expense)($|_)/i,
    /金额|价格|费用|收入|销售额|利润|支付|余额|总计|小计|折扣|税|汇率|税率|利率|比率|百分比|佣金|退款|工资|奖金/,
  ],
  time: [
    /(^|_)(time|date|timestamp|datetime|created|updated|modified|deleted|year|month|day|hour|minute|second|today|yesterday|tomorrow)($|_)/i,
    /时间|日期|创建|更新|修改|删除|年|月|日|时|分|秒|今天|昨天|明天/,
  ],
  status: [
    /(^|_)(status|state|stage|phase|condition|flag|active|enabled|disabled|approved|rejected|pending|completed|cancelled|finished|processing)($|_)/i,
    /状态|阶段|条件|标志|启用|禁用|已批准|已拒绝|待处理|已完成|已取消|处理中/,
  ],
  category: [
    /(^|_)(category|class|group|segment|tag|label|type|dept|department|region|area|location|level|grade|rank|tier|source|channel|origin|platform|brand|model|version)($|_)/i,
    /分类|类别|组别|标签|类型|部门|区域|地区|位置|等级|级别|层级|来源|渠道|平台|途径|品牌|型号|版本/,
  ],
  id: [
    /_id$|^id$|uuid|guid|key|code|number$|^user.*id$|^member.*id$|^customer.*id$/i,
    /编号|代码$|用户ID|会员ID|客户ID/,
  ],
};

/**
 * Singleton service for column type inference
 */
export class ColumnInferService {
  private static instance: ColumnInferService;

  private constructor() {}

  public static getInstance(): ColumnInferService {
    if (!ColumnInferService.instance) {
      ColumnInferService.instance = new ColumnInferService();
    }
    return ColumnInferService.instance;
  }

  /**
   * Check if column name is valid for SQL usage
   * Reject columns with special characters that cause SQL parsing errors
   */
  private isValidColumnName(columnName: string): boolean {
    // Reject columns with double quotes (DuckDB parsing issues)
    if (columnName.includes('"')) {
      return false;
    }
    
    // Reject columns with only whitespace
    if (!columnName.trim()) {
      return false;
    }
    
    // Reject columns with control characters
    if (/[\x00-\x1F\x7F]/.test(columnName)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Sanitize column name for SQL usage (for aliases only)
   * Removes or escapes special characters that can cause SQL errors
   */
  private sanitizeColumnName(columnName: string): string {
    // Remove double quotes and other problematic characters
    return columnName
      .replace(/"/g, '')  // Remove double quotes
      .replace(/\s+/g, ' ')  // Normalize spaces
      .trim();
  }

  /**
   * Infer column types for all columns in a table
   * Early filtering: Only analyze columns with valid semantic types
   * @param tableName - Name of the table to analyze
   * @param executeQuery - DuckDB query executor
   * @returns Array of column profiles with type information
   */
  public async inferColumns(
    tableName: string,
    executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
  ): Promise<ColumnProfile[]> {
    // Step 1: Get table schema
    const schemaResult = await executeQuery(`DESCRIBE ${tableName}`);
    const rawColumns = schemaResult.data as Array<{ column_name: string; column_type: string }>;
    
    console.log(`[ColumnInferService] Found ${rawColumns.length} columns in ${tableName}`);
    
    // Step 2: Early filtering - validate column names and match semantic types
    const validColumns = rawColumns.filter(col => {
      // Filter 1: Check if column name is valid for SQL (reject special characters)
      if (!this.isValidColumnName(col.column_name)) {
        console.warn(`[ColumnInferService] Skipping column with invalid characters: "${col.column_name}"`);
        return false;
      }
      
      // Filter 2: Check if column has meaningful semantic type
      const semanticType = this.matchSemanticType(col.column_name);
      if (!semanticType) {
        console.log(`[ColumnInferService] Skipping non-business column: "${col.column_name}" (no semantic type)`);
        return false;
      }
      
      // Filter 3: Skip ID columns (they're not useful for insights)
      if (semanticType === 'id') {
        console.log(`[ColumnInferService] Skipping ID column: "${col.column_name}"`);
        return false;
      }
      
      return true;
    });
    
    console.log(`[ColumnInferService] After filtering: ${validColumns.length}/${rawColumns.length} columns remain`);
    
    if (validColumns.length === 0) {
      console.warn('[ColumnInferService] No valid business columns found');
      return [];
    }

    // Step 3: Get row count
    const rowCountResult = await executeQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
    const rowCount = rowCountResult.data[0]?.total || 0;

    // Step 4: Build and execute cardinality query (only for valid columns)
    const cardinalitySQL = this.buildCardinalityQuery(tableName, validColumns);
    const cardinalityResult = await executeQuery(cardinalitySQL);
    const cardinalityRow = cardinalityResult.data[0] || {};

    // Step 5: Build and execute statistics query for numeric columns
    const numericColumns = validColumns.filter(col => this.isNumericType(col.column_type));
    const statsSQL = this.buildStatsQuery(tableName, numericColumns);
    const statsResult = await executeQuery(statsSQL);
    const statsRow = statsResult.data[0] || {};

    // Step 6: Get null rates
    const nullRateSQL = this.buildNullRateQuery(tableName, validColumns);
    const nullRateResult = await executeQuery(nullRateSQL);
    const nullRateRow = nullRateResult.data[0] || {};

    // Step 7: Combine all data into column profiles
    const profiles: ColumnProfile[] = validColumns.map(col => {
      const sanitizedName = this.sanitizeColumnName(col.column_name);
      const cardinality = cardinalityRow[`${sanitizedName}_card`] || 0;
      const nullRate = nullRateRow[`${sanitizedName}_null`] || 0;

      const type = this.inferType(col.column_type, cardinality, rowCount, col.column_name);
      const semanticType = this.matchSemanticType(col.column_name);

      const profile: ColumnProfile = {
        name: col.column_name,
        duckdbType: col.column_type,
        type,
        semanticType,
        cardinality,
        nullRate,
      };

      // Add statistics for numeric columns
      if (type === 'numeric') {
        profile.min = statsRow[`${sanitizedName}_min`];
        profile.max = statsRow[`${sanitizedName}_max`];
        profile.mean = statsRow[`${sanitizedName}_mean`];
        profile.median = statsRow[`${sanitizedName}_median`];
        profile.stddev = statsRow[`${sanitizedName}_stddev`];
        profile.p50 = statsRow[`${sanitizedName}_p50`];
        profile.p80 = statsRow[`${sanitizedName}_p80`];
        profile.p99 = statsRow[`${sanitizedName}_p99`];
      }

      return profile;
    });

    return profiles;
  }

  /**
   * Build SQL query to get cardinality for all columns in a single query
   * Uses approx_count_distinct for performance
   */
  private buildCardinalityQuery(tableName: string, columns: Array<{ column_name: string }>): string {
    const cardinalitySelects = columns.map(col => {
      const sanitized = this.sanitizeColumnName(col.column_name);
      return `approx_count_distinct("${col.column_name}") as "${sanitized}_card"`;
    });
    return `SELECT ${cardinalitySelects.join(', ')} FROM ${tableName}`;
  }

  /**
   * Build SQL query to get statistics for numeric columns
   */
  private buildStatsQuery(
    tableName: string,
    numericColumns: Array<{ column_name: string }>
  ): string {
    if (numericColumns.length === 0) {
      return 'SELECT 1'; // Dummy query if no numeric columns
    }

    const statsSelects = numericColumns.flatMap(col => {
      const sanitized = this.sanitizeColumnName(col.column_name);
      return [
        `MIN("${col.column_name}") as "${sanitized}_min"`,
        `MAX("${col.column_name}") as "${sanitized}_max"`,
        `AVG("${col.column_name}") as "${sanitized}_mean"`,
        `MEDIAN("${col.column_name}") as "${sanitized}_median"`,
        `STDDEV("${col.column_name}") as "${sanitized}_stddev"`,
        `APPROX_QUANTILE("${col.column_name}", 0.5) as "${sanitized}_p50"`,
        `APPROX_QUANTILE("${col.column_name}", 0.8) as "${sanitized}_p80"`,
        `APPROX_QUANTILE("${col.column_name}", 0.99) as "${sanitized}_p99"`,
      ];
    });

    return `SELECT ${statsSelects.join(', ')} FROM ${tableName}`;
  }

  /**
   * Build SQL query to get null rates for all columns
   */
  private buildNullRateQuery(tableName: string, columns: Array<{ column_name: string }>): string {
    const nullRateSelects = columns.map(col => {
      const sanitized = this.sanitizeColumnName(col.column_name);
      return `(COUNT(*) - COUNT("${col.column_name}")) * 1.0 / COUNT(*) as "${sanitized}_null"`;
    });
    return `SELECT ${nullRateSelects.join(', ')} FROM ${tableName}`;
  }

  /**
   * Check if DuckDB type is numeric
   */
  private isNumericType(duckdbType: string): boolean {
    const numericTypes = ['INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC', 'REAL', 'HUGEINT'];
    return numericTypes.some(t => duckdbType.toUpperCase().includes(t));
  }

  /**
   * Infer column type based on DuckDB type and cardinality
   * @param duckdbType - DuckDB data type
   * @param cardinality - Number of distinct values
   * @param rowCount - Total number of rows
   * @param columnName - Column name for additional filtering (e.g., phone numbers)
   * @returns Inferred column type
   */
  private inferType(
    duckdbType: string,
    cardinality: number,
    rowCount: number,
    columnName: string = ''
  ): ColumnType {
    const typeUpper = duckdbType.toUpperCase();

    // Filter out phone numbers and ID columns from numeric columns
    if (columnName) {
      if (this.isPhoneNumber(columnName) || this.isIdColumn(columnName)) {
        return 'text';
      }
    }

    // Check for datetime types
    if (typeUpper.includes('DATE') || typeUpper.includes('TIME') || typeUpper.includes('TIMESTAMP')) {
      return 'datetime';
    }

    // Check for numeric types
    if (this.isNumericType(duckdbType)) {
      // Low cardinality numeric columns are treated as categorical
      const cardinalityRatio = rowCount > 0 ? cardinality / rowCount : 0;
      if (cardinality <= 20 || cardinalityRatio < 0.05) {
        return 'categorical';
      }
      return 'numeric';
    }

    // Check for text types
    if (typeUpper.includes('VARCHAR') || typeUpper.includes('TEXT') || typeUpper.includes('STRING')) {
      // High cardinality text columns are treated as text
      const cardinalityRatio = rowCount > 0 ? cardinality / rowCount : 0;
      if (cardinalityRatio > 0.9) {
        return 'text';
      }
      return 'categorical';
    }

    // Default to text for unknown types
    return 'text';
  }

  /**
   * Check if column name suggests it's a phone number
   */
  private isPhoneNumber(columnName: string): boolean {
    const phonePatterns = [
      /phone$/i, /mobile$/i, /tel$/i, /telephone$/i,
      /^.*电话.*$/, /^.*手机.*$/, /^.*联系方式$/
    ];
    return phonePatterns.some(pattern => pattern.test(columnName));
  }

  /**
   * Check if column name suggests it's an ID column
   */
  private isIdColumn(columnName: string): boolean {
    return COLUMN_PATTERNS.id.some(pattern => pattern.test(columnName));
  }

  /**
   * Match semantic type from column name patterns
   * Priority order: status > category > amount > time > id
   */
  private matchSemanticType(columnName: string): SemanticType {
    // Define priority order
    const priorityOrder: (keyof typeof COLUMN_PATTERNS)[] = [
      'status',     // Highest priority
      'category',
      'amount',
      'time',
      'id',
    ];

    // Check patterns in priority order
    for (const semanticType of priorityOrder) {
      const patterns = COLUMN_PATTERNS[semanticType];
      for (const pattern of patterns) {
        if (pattern.test(columnName)) {
          return semanticType as SemanticType;
        }
      }
    }

    return null;
  }

  /**
   * Sort columns by importance for visualization
   * Columns with semantic types are prioritized, then by cardinality
   */
  public sortColumnsByImportance(columns: ColumnProfile[]): ColumnProfile[] {
    return [...columns].sort((a, b) => {
      // Semantic type columns come first
      if (a.semanticType && !b.semanticType) return -1;
      if (!a.semanticType && b.semanticType) return 1;

      // Within same semantic type priority, sort by cardinality (higher = more important)
      return b.cardinality - a.cardinality;
    });
  }
}
