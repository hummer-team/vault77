/**
 * Context Builder for Insight Action
 * Builds semantic context for LLM analysis by extracting table metadata
 * and mapping feature columns to business descriptions
 */

import type { InsightContext, TableMetadata } from '../../types/insight-action.types';

/**
 * Query execution function type
 * Compatible with DuckDBService.executeQuery signature
 */
type QueryExecutor = (sql: string) => Promise<{ data: any[]; schema?: any[] }>;

/**
 * Column name patterns for semantic type matching
 * Reused from columnInferService for consistency
 * 
 * IMPORTANT: Pattern order matters! More specific patterns should come first
 * to avoid being shadowed by broader patterns.
 */
export const COLUMN_PATTERNS: Record<string, RegExp[]> = {
  amount: [
    /(^|_)(amount|price|cost|fee|revenue|sales|profit|payment|balance|total|subtotal|discount|tax|rate|ratio|percent|percentage|commission|refund|wage|salary|bonus|income|expense)($|_)/i,
    /金额|价格|费用|收入|销售额|利润|支付|余额|总计|小计|折扣|税|汇率|税率|利率|比率|百分比|佣金|退款|工资|奖金/,
  ],
  quantity: [
    /(^|_)(quantity|qty|count|num|number|volume|stock|inventory)($|_)/i,
    /数量|库存|存货/,
  ],
  category: [
    /(^|_)(category|class|group|segment|tag|label|type|dept|department|region|area|location)($|_)/i,
    /类别|组别|标签|类型|部门|区域|地区|位置/,
  ],
  time: [
    /(^|_)(time|date|timestamp|datetime|created|updated|modified|deleted|year|month|day|hour|minute|second)($|_)/i,
    /时间|日期|创建|更新|修改|删除|年|月|日|时|分|秒/,
  ],
  status: [
    /(^|_)(status|state|stage|phase|condition|flag|active|enabled|disabled|approved|rejected|pending|completed|cancelled|finished|processing)($|_)/i,
    /状态|阶段|条件|标志|启用|禁用|已批准|已拒绝|待处理|已完成|已取消|处理中/,
  ],
  customer: [
    /(^|_)(customer|client|user|member|buyer|purchaser)($|_)/i,
    /客户|用户|会员|买家|购买者/,
  ],
  product: [
    /(^|_)(product|item|goods|sku|commodity)($|_)/i,
    /商品|产品|货品|物品/,
  ],
  address: [
    /(^|_)(address|location|province|city|district|street|zip|postal)($|_)/i,
    /地址|位置|省|市|区|街道|邮编/,
  ],
  order: [
    /(^|_)(order)($|_)/i,
    /订单/,
  ],
  id: [
    /_id$|^id$|uuid|guid|key|code|number$/i,
    /编号|代码$/,
  ],
};

/**
 * Feature descriptions for business context
 */
const FEATURE_DESCRIPTIONS: Record<string, string> = {
  amount: '金额相关字段（单位：元）',
  quantity: '数量相关字段',
  time: '时间相关字段',
  status: '状态标识字段',
  category: '分类/类别字段',
  customer: '客户标识字段',
  product: '商品标识字段',
  address: '地址相关字段',
  order: '订单标识字段',
  id: '唯一标识字段',
};

/**
 * Build insight context for LLM analysis
 * @param tableName DuckDB table name
 * @param featureColumns Feature columns for analysis
 * @param executeQuery Query execution function
 * @returns Complete insight context
/**
 * Build insight context from DuckDB metadata
 * @param executeQuery Query execution function (e.g., duckDBService.executeQuery)
 * @param tableName DuckDB table name
 * @returns Complete insight context
 */
export async function buildInsightContext(
  executeQuery: QueryExecutor,
  tableName: string
): Promise<InsightContext> {
  // Step 1: Get table metadata from DuckDB information_schema
  const tableMetadata = await fetchTableMetadata(tableName, executeQuery);
  
  // Step 2: Extract numeric columns as feature columns
  const featureColumns = tableMetadata.columns
    .filter(col => col.type.includes('INT') || col.type.includes('DOUBLE') || col.type.includes('DECIMAL'))
    .map(col => col.name);
  
  // Step 3: Map feature columns to business descriptions
  const featureDefinitions = mapFeatureDefinitions(featureColumns);
  
  return {
    algorithmType: 'anomaly',
    tableMetadata,
    featureDefinitions,
    businessDomain: 'ecommerce', // Currently fixed to ecommerce
  };
}

/**
 * Fetch table metadata from DuckDB
 * @param tableName DuckDB table name
 * @param executeQuery Query execution function
 * @returns Table metadata
 */
async function fetchTableMetadata(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema?: any[] }>
): Promise<TableMetadata> {
  // Query 1: Get row count
  const countQuery = `SELECT COUNT(*) as row_count FROM "${tableName}"`;
  const countResult = await executeQuery(countQuery);
  const rowCount = countResult.data[0]?.row_count || 0;
  
  // Query 2: Get column schema from information_schema
  const schemaQuery = `
    SELECT 
      column_name,
      data_type,
      is_nullable
    FROM information_schema.columns
    WHERE table_name = '${tableName}'
    ORDER BY ordinal_position
  `;
  const schemaResult = await executeQuery(schemaQuery);
  
  const columns = schemaResult.data.map((row: any) => ({
    name: row.column_name,
    type: row.data_type,
    nullable: row.is_nullable === 'YES',
  }));
  
  return {
    tableName,
    rowCount,
    columnCount: columns.length,
    columns,
  };
}

/**
 * Map feature columns to business descriptions
 * @param featureColumns Feature column names
 * @returns Map of column name to business description
 */
function mapFeatureDefinitions(featureColumns: string[]): Record<string, string> {
  const definitions: Record<string, string> = {};
  
  for (const col of featureColumns) {
    // Try to match column name with semantic patterns
    const semanticType = matchSemanticType(col);
    
    if (semanticType) {
      definitions[col] = FEATURE_DESCRIPTIONS[semanticType] || `特征: ${col}`;
    } else {
      // Fallback: use column name as description
      definitions[col] = `数值特征: ${col}`;
    }
  }
  
  return definitions;
}

/**
 * Match column name to semantic type using patterns
 * @param columnName Column name to match
 * @returns Semantic type or null if no match
 */
function matchSemanticType(columnName: string): string | null {
  for (const [semanticType, patterns] of Object.entries(COLUMN_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(columnName)) {
        return semanticType;
      }
    }
  }
  return null;
}

/**
 * Export for testing
 */
export const __testing__ = {
  fetchTableMetadata,
  mapFeatureDefinitions,
  matchSemanticType,
};
