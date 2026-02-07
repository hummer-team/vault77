/**
 * Column Identifier for Anomaly Detection
 * Identifies order ID and feature columns using ORDER entity keywords
 */

/**
 * Order ID column patterns (from intentRecognizer.ts ORDER entity)
 * Includes both Chinese and English patterns for maximum compatibility
 */
const ORDER_ID_PATTERNS = [
  // English patterns
  /order.*id/i,
  /order.*no/i,
  /order.*number/i,
  /order.*code/i,
  /^id$/i,
  /^order$/i,
  /订单编号/,
  /订单号/,
  /订单id/,
  // Common variations
  /ordernumber/i,
  /ordercode/i,
  /order_id/i,
  /order_no/i,
  /order_number/i,
  /order_code/i,
];

/**
 * Numeric feature patterns (amount, quantity, price, etc.)
 */
const NUMERIC_FEATURE_PATTERNS = [
  // Amount/Price patterns
  /amount/i,
  /price/i,
  /cost/i,
  /fee/i,
  /金额/,
  /价格/,
  /费用/,
  // Quantity patterns
  /quantity/i,
  /qty/i,
  /count/i,
  /数量/,
  // Discount patterns
  /discount/i,
  /折扣/,
  // Payment patterns
  /payment/i,
  /pay/i,
  /支付/,
  /实付/,
  // Revenue patterns
  /revenue/i,
  /sales/i,
  /收入/,
  /销售额/,
];

/**
 * Column identification result
 */
export interface ColumnIdentificationResult {
  orderIdColumn: string | null;
  featureColumns: string[];
  allColumns: Array<{ name: string; type: string }>;
}

/**
 * Identify order ID and feature columns for anomaly detection
 * @param tableName DuckDB table name
 * @param executeQuery Query execution function
 * @returns Identification result with order ID and feature columns
 */
export async function identifyAnomalyColumns(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<ColumnIdentificationResult> {
  // Step 1: Get table schema
  const schemaResult = await executeQuery(`DESCRIBE ${tableName}`);
  const allColumns = (schemaResult.data as Array<{ column_name: string; column_type: string }>)
    .map(col => ({
      name: col.column_name,
      type: col.column_type.toUpperCase(),
    }));

  console.log('[AnomalyColumnIdentifier] Schema retrieved:', {
    tableName,
    columnCount: allColumns.length,
    columns: allColumns.map(c => `${c.name}(${c.type})`).join(', '),
  });

  // Step 2: Identify order ID column
  let orderIdColumn: string | null = null;

  // Priority 1: Match patterns (strict matching)
  for (const col of allColumns) {
    for (const pattern of ORDER_ID_PATTERNS) {
      if (pattern.test(col.name)) {
        orderIdColumn = col.name;
        console.log('[AnomalyColumnIdentifier] Order ID column matched by pattern:', {
          column: col.name,
          pattern: pattern.toString(),
        });
        break;
      }
    }
    if (orderIdColumn) break;
  }

  // Priority 2: If no pattern match, use first VARCHAR/TEXT column
  if (!orderIdColumn) {
    const textColumn = allColumns.find(col =>
      col.type.includes('VARCHAR') || col.type.includes('TEXT') || col.type.includes('STRING')
    );
    if (textColumn) {
      orderIdColumn = textColumn.name;
      console.log('[AnomalyColumnIdentifier] Order ID column inferred (first text column):', textColumn.name);
    }
  }

  // Step 3: Identify numeric feature columns
  const numericTypes = ['INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC', 'REAL', 'HUGEINT'];
  
  const numericColumns = allColumns.filter(col =>
    numericTypes.some(type => col.type.includes(type)) &&
    col.name !== orderIdColumn  // Exclude order ID column
  );

  console.log('[AnomalyColumnIdentifier] Numeric columns found:', numericColumns.length);

  // Step 4: Prioritize feature columns by pattern matching
  const rankedFeatures = numericColumns.map(col => {
    let score = 0;
    for (const pattern of NUMERIC_FEATURE_PATTERNS) {
      if (pattern.test(col.name)) {
        score += 1;
      }
    }
    return { name: col.name, score };
  });

  // Sort by score (descending), then alphabetically
  rankedFeatures.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  const featureColumns = rankedFeatures.map(f => f.name);

  console.log('[AnomalyColumnIdentifier] Feature columns ranked:', {
    total: featureColumns.length,
    top3: featureColumns.slice(0, 3),
    scores: rankedFeatures.slice(0, 3).map(f => `${f.name}(${f.score})`),
  });

  return {
    orderIdColumn,
    featureColumns,
    allColumns,
  };
}

/**
 * Validate column identification result
 * @param result Identification result
 * @throws Error if validation fails
 */
export function validateColumnIdentification(result: ColumnIdentificationResult): void {
  if (!result.orderIdColumn) {
    throw new Error(
      'Unable to identify order ID column. Please ensure your data contains a column with "order_id", "order_no", or similar name.'
    );
  }

  if (result.featureColumns.length === 0) {
    throw new Error(
      'No numeric feature columns found. Anomaly detection requires at least one numeric column (e.g., amount, quantity).'
    );
  }

  console.log('[AnomalyColumnIdentifier] Validation passed:', {
    orderIdColumn: result.orderIdColumn,
    featureCount: result.featureColumns.length,
  });
}
