/**
 * ArbitrageAnalyzeStrategy
 *
 * Builds multi-CTE DuckDB SQL for fn_ecom_arbitrage_analyze (价格套利分析).
 * Detects risk orders by combining four independent rule categories:
 *   1. Margin rules   — negative/low gross margin detection
 *   2. Discount rules — extreme/abnormal discount detection
 *   3. Price deviation rules — product/category benchmark price deviation
 *   4. Coupon anomaly rules — coupon stacking anomaly
 * Plus a fifth category:
 *   5. Arbitrage rules — scalper/reseller behavioral pattern detection
 *
 * SQL CTE structure (13 CTEs + final SELECT):
 *   dq     → dirty data marking (invalid amounts → 'dirty')
 *   bm     → base metrics (actual_payment, discount_rate, gross_margin, margin_rate, is_non_promotion, is_clearance)
 *   skp    → SKU 30d base price via per-row self-join lookback
 *   cbp    → Category 7d base price via per-row self-join lookback
 *   cad    → Category avg discount rate 30d via per-row self-join lookback
 *   hs     → Hourly stats for spike detection (batch_avg or same_hour_avg method)
 *   hoc    → Hourly order count per SKU (1h sliding window per row)
 *   uds    → User daily SKU order count
 *   acl    → Address cluster (distinct users per addr_prefix+SKU in 2h window)
 *   dcl    → Device cluster (distinct accounts per device+SKU in 2h window)
 *   en     → Enriched: joins all above + computes price_deviation
 *   sc     → Score components: all per-dimension scores + evidence/tag arrays
 *   totals → Final score aggregation: basic_risk_score + arbitrage_score → risk_score (capped 100)
 *
 * Optional field handling:
 *   Unmapped optional fields (sku_id, category_id, order_time_ms, user_id, device_id,
 *   receiver_addr, activity_*) are emitted as NULL::TYPE in the bm CTE.
 *   All downstream CTEs filter on IS NOT NULL, so NULL fields naturally disable
 *   dependent computations without special-casing.
 *
 * Rule toggles:
 *   Each rule category can be disabled via ruleToggles. Disabled categories
 *   emit `0` scores and `[]::VARCHAR[]` tag arrays.
 *   clearanceMarginExempt adds `NOT is_clearance AND` guard to margin rules.
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
  type ArbitrageAnalyzeConfig,
  type ArbitrageFieldMapping,
  type ArbitrageAutoFieldMapping,
  type ArbitrageThresholds,
  type ArbitrageDetectionConfig,
  type ArbitrageRuleToggles,
} from '../types';

// ---------------------------------------------------------------------------
// Time constants (milliseconds)
// ---------------------------------------------------------------------------
const MS_HOUR       = 3_600_000;
const MS_TWO_HOURS  = 7_200_000;
const MS_DAY        = 86_400_000;
const MS_DAYS_7     = 604_800_000;
const MS_DAYS_30    = 2_592_000_000;

// ---------------------------------------------------------------------------
// Module-level helper utilities
// ---------------------------------------------------------------------------

/**
 * Returns a typed SQL expression for an optional column.
 * When `col` is defined, emits `CAST("col" AS type)`.
 * When `col` is undefined, emits `NULL::type` so downstream NULLs propagate naturally.
 */
function colOrNull(col: string | undefined, castType: string = 'VARCHAR'): string {
  return col ? `CAST("${col}" AS ${castType})` : `NULL::${castType}`;
}

/** Score component output from each rule builder. */
interface RuleSql {
  /** SQL expression evaluating to an integer score */
  scoreExpr: string;
  /** SQL expression evaluating to VARCHAR[] tag array */
  tagsExpr: string;
  /** Column alias for the score in the sc CTE */
  scoreAlias: string;
  /** Column alias for the tags in the sc CTE */
  tagsAlias: string;
}

// ---------------------------------------------------------------------------
// Individual rule builders
// ---------------------------------------------------------------------------

/**
 * Builds margin rule SQL (Rule Group 1).
 * Abnormal gross margin → basic_risk_score contribution.
 */
function buildMarginRuleSql(t: ArbitrageThresholds, rt: ArbitrageRuleToggles): RuleSql {
  const guard = rt.clearanceMarginExempt ? 'NOT is_clearance AND ' : '';
  if (!rt.marginRules) {
    return {
      scoreExpr: '0',
      tagsExpr: '[]::VARCHAR[]',
      scoreAlias: 'margin_score',
      tagsAlias: 'margin_tags',
    };
  }
  return {
    scoreExpr: [
      `(`,
      `  CASE WHEN ${guard}gross_margin < 0 THEN 30 ELSE 0 END`,
      `  + CASE WHEN ${guard}gross_margin < 0 AND is_non_promotion AND discount_rate < 0.7 THEN 10 ELSE 0 END`,
      `  + CASE WHEN ${guard}gross_margin >= 0 AND margin_rate < ${t.lowMarginRate} THEN 15 ELSE 0 END`,
      `)`,
    ].join('\n'),
    tagsExpr: [
      `list_filter([`,
      `  CASE WHEN ${guard}gross_margin < 0 THEN '异常毛利' ELSE NULL END,`,
      `  CASE WHEN ${guard}gross_margin < 0 AND is_non_promotion AND discount_rate < 0.7 THEN '高风险负毛利' ELSE NULL END,`,
      `  CASE WHEN ${guard}gross_margin >= 0 AND margin_rate < ${t.lowMarginRate} THEN '低毛利' ELSE NULL END`,
      `], x -> x IS NOT NULL)`,
    ].join('\n'),
    scoreAlias: 'margin_score',
    tagsAlias: 'margin_tags',
  };
}

/**
 * Builds discount anomaly rule SQL (Rule Group 2).
 */
function buildDiscountRuleSql(t: ArbitrageThresholds, rt: ArbitrageRuleToggles): RuleSql {
  if (!rt.discountRules) {
    return {
      scoreExpr: '0',
      tagsExpr: '[]::VARCHAR[]',
      scoreAlias: 'discount_score',
      tagsAlias: 'discount_tags',
    };
  }
  return {
    scoreExpr: [
      `(`,
      `  CASE WHEN category_avg_discount_rate IS NOT NULL`,
      `       AND discount_rate < category_avg_discount_rate * 0.5 THEN 25 ELSE 0 END`,
      `  + CASE WHEN is_non_promotion AND discount_rate < ${t.extremeDiscountRate} THEN 20 ELSE 0 END`,
      `)`,
    ].join('\n'),
    tagsExpr: [
      `list_filter([`,
      `  CASE WHEN category_avg_discount_rate IS NOT NULL`,
      `       AND discount_rate < category_avg_discount_rate * 0.5 THEN '异常折扣' ELSE NULL END,`,
      `  CASE WHEN is_non_promotion AND discount_rate < ${t.extremeDiscountRate} THEN '非活动异常折扣' ELSE NULL END`,
      `], x -> x IS NOT NULL)`,
    ].join('\n'),
    scoreAlias: 'discount_score',
    tagsAlias: 'discount_tags',
  };
}

/**
 * Builds price deviation rule SQL (Rule Group 3).
 */
function buildPriceDeviationRuleSql(t: ArbitrageThresholds, rt: ArbitrageRuleToggles): RuleSql {
  if (!rt.priceDeviationRules) {
    return {
      scoreExpr: '0',
      tagsExpr: '[]::VARCHAR[]',
      scoreAlias: 'deviation_score',
      tagsAlias: 'deviation_tags',
    };
  }
  return {
    scoreExpr: [
      `(`,
      `  CASE WHEN price_deviation_30d IS NOT NULL AND price_deviation_30d < -${t.productDeviationRate} THEN 25 ELSE 0 END`,
      `  + CASE WHEN price_deviation_category IS NOT NULL AND price_deviation_category < -${t.categoryDeviationRate} THEN 20 ELSE 0 END`,
      `  + CASE WHEN NOT is_clearance AND actual_payment < cost THEN 35 ELSE 0 END`,
      `)`,
    ].join('\n'),
    tagsExpr: [
      `list_filter([`,
      `  CASE WHEN price_deviation_30d IS NOT NULL AND price_deviation_30d < -${t.productDeviationRate} THEN '商品价格严重偏离' ELSE NULL END,`,
      `  CASE WHEN price_deviation_category IS NOT NULL AND price_deviation_category < -${t.categoryDeviationRate} THEN '类目价格严重偏离' ELSE NULL END,`,
      `  CASE WHEN NOT is_clearance AND actual_payment < cost THEN '活动定价错误' ELSE NULL END`,
      `], x -> x IS NOT NULL)`,
    ].join('\n'),
    scoreAlias: 'deviation_score',
    tagsAlias: 'deviation_tags',
  };
}

/**
 * Builds coupon anomaly rule SQL (Rule Group 4).
 */
function buildCouponAnomalyRuleSql(t: ArbitrageThresholds, rt: ArbitrageRuleToggles): RuleSql {
  if (!rt.couponAnomalyRules) {
    return {
      scoreExpr: '0',
      tagsExpr: '[]::VARCHAR[]',
      scoreAlias: 'coupon_score',
      tagsAlias: 'coupon_tags',
    };
  }
  return {
    scoreExpr: [
      `CASE WHEN coupon_amount > 0 AND (`,
      `  actual_payment < cost * ${t.couponCostRatio}`,
      `  OR (discount_rate < ${t.couponDiscountRate} AND is_non_promotion)`,
      `) THEN 20 ELSE 0 END`,
    ].join('\n'),
    tagsExpr: [
      `list_filter([`,
      `  CASE WHEN coupon_amount > 0 AND (`,
      `    actual_payment < cost * ${t.couponCostRatio}`,
      `    OR (discount_rate < ${t.couponDiscountRate} AND is_non_promotion)`,
      `  ) THEN '优惠券叠加异常' ELSE NULL END`,
      `], x -> x IS NOT NULL)`,
    ].join('\n'),
    scoreAlias: 'coupon_score',
    tagsAlias: 'coupon_tags',
  };
}

// ---------------------------------------------------------------------------
// Main strategy class
// ---------------------------------------------------------------------------

export class ArbitrageAnalyzeStrategy extends BaseStrategy {
  readonly type = OperatorType.ARBITRAGE_ANALYZE;
  readonly name = '价格套利分析';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  // ─── CTE builders ──────────────────────────────────────────────────────────

  private buildDataQualityCTE(tableName: string, fm: ArbitrageFieldMapping): string {
    return [
      `dq AS (`,
      `  SELECT *,`,
      `    CASE`,
      `      WHEN TRY_CAST("${fm.amountCol}" AS DOUBLE) IS NULL`,
      `        OR TRY_CAST("${fm.amountCol}" AS DOUBLE) <= 0       THEN 'dirty'`,
      `      WHEN TRY_CAST("${fm.costCol}" AS DOUBLE) IS NULL`,
      `        OR TRY_CAST("${fm.costCol}" AS DOUBLE) < 0          THEN 'dirty'`,
      `      WHEN TRY_CAST("${fm.couponAmountCol}" AS DOUBLE) IS NULL THEN 'dirty'`,
      `      ELSE 'normal'`,
      `    END AS data_quality_flag`,
      `  FROM "${tableName}"`,
      `)`,
    ].join('\n');
  }

  private buildBaseMetricsCTE(fm: ArbitrageFieldMapping, auto: ArbitrageAutoFieldMapping | undefined): string {
    const a = auto ?? {};
    const skuExpr   = colOrNull(a.skuIdCol);
    const catExpr   = colOrNull(a.categoryIdCol);
    const timeExpr  = colOrNull(a.orderTimeCol, 'BIGINT');
    const actIdExpr = colOrNull(a.activityIdCol);
    const actTypeExpr = colOrNull(a.activityTypeCol);
    const actStartExpr = colOrNull(a.activityStartCol, 'BIGINT');
    const actEndExpr   = colOrNull(a.activityEndCol, 'BIGINT');
    const userExpr   = colOrNull(a.userIdCol);
    const devExpr    = colOrNull(a.deviceIdCol);
    const addrExpr   = colOrNull(a.receiverAddrCol);

    // is_non_promotion: TRUE when no activity OR activity type = 'normal'
    const nonPromoExpr = a.activityIdCol
      ? `CASE WHEN ${actIdExpr} IS NULL OR ${actTypeExpr} = 'normal' THEN TRUE ELSE FALSE END`
      : `TRUE`;
    const clearanceExpr = a.activityTypeCol
      ? `CASE WHEN ${actTypeExpr} = 'clearance' THEN TRUE ELSE FALSE END`
      : `FALSE`;

    const amt   = `TRY_CAST("${fm.amountCol}" AS DOUBLE)`;
    const cost  = `TRY_CAST("${fm.costCol}" AS DOUBLE)`;
    const cpn   = `TRY_CAST("${fm.couponAmountCol}" AS DOUBLE)`;

    return [
      `bm AS (`,
      `  SELECT`,
      `    CAST("${fm.orderIdCol}" AS VARCHAR) AS order_id,`,
      `    ${amt} AS amount,`,
      `    ${cost} AS cost,`,
      `    ${cpn} AS coupon_amount,`,
      `    ${skuExpr} AS sku_id,`,
      `    ${catExpr} AS category_id,`,
      `    ${timeExpr} AS order_time_ms,`,
      `    ${actIdExpr} AS activity_id,`,
      `    ${actTypeExpr} AS activity_type,`,
      `    ${actStartExpr} AS activity_start_ms,`,
      `    ${actEndExpr} AS activity_end_ms,`,
      `    ${userExpr} AS user_id,`,
      `    ${devExpr} AS device_id,`,
      `    ${addrExpr} AS receiver_addr,`,
      `    data_quality_flag,`,
      `    -- actual_payment = amount - coupon_amount`,
      `    CASE WHEN data_quality_flag = 'normal'`,
      `      THEN ${amt} - ${cpn} END AS actual_payment,`,
      `    -- discount_rate = actual_payment / amount`,
      `    CASE WHEN data_quality_flag = 'normal' AND ${amt} > 0`,
      `      THEN (${amt} - ${cpn}) / ${amt} ELSE 0.0 END AS discount_rate,`,
      `    -- gross_margin = actual_payment - cost`,
      `    CASE WHEN data_quality_flag = 'normal'`,
      `      THEN (${amt} - ${cpn}) - ${cost} END AS gross_margin,`,
      `    -- margin_rate = gross_margin / actual_payment`,
      `    CASE WHEN data_quality_flag = 'normal' AND (${amt} - ${cpn}) > 0`,
      `      THEN ((${amt} - ${cpn}) - ${cost}) / (${amt} - ${cpn})`,
      `      ELSE -1.0 END AS margin_rate,`,
      `    ${nonPromoExpr} AS is_non_promotion,`,
      `    ${clearanceExpr} AS is_clearance`,
      `  FROM dq`,
      `)`,
    ].join('\n');
  }

  /** SKU 30-day base price: per-row self-join lookback */
  private buildSkuBasePriceCTE(): string {
    return [
      `skp AS (`,
      `  SELECT o.order_id, AVG(h.actual_payment) AS sku_base_price_30d`,
      `  FROM bm o`,
      `  LEFT JOIN bm h ON`,
      `    h.sku_id = o.sku_id AND h.sku_id IS NOT NULL`,
      `    AND h.is_non_promotion AND h.data_quality_flag = 'normal'`,
      `    AND h.order_time_ms IS NOT NULL AND o.order_time_ms IS NOT NULL`,
      `    AND h.order_time_ms < o.order_time_ms`,
      `    AND h.order_time_ms >= o.order_time_ms - ${MS_DAYS_30}`,
      `  WHERE o.sku_id IS NOT NULL AND o.order_time_ms IS NOT NULL`,
      `  GROUP BY o.order_id`,
      `)`,
    ].join('\n');
  }

  /** Category 7-day base price: per-row self-join lookback */
  private buildCategoryBasePriceCTE(): string {
    return [
      `cbp AS (`,
      `  SELECT o.order_id, AVG(h.actual_payment) AS category_base_price_7d`,
      `  FROM bm o`,
      `  LEFT JOIN bm h ON`,
      `    h.category_id = o.category_id AND h.category_id IS NOT NULL`,
      `    AND h.is_non_promotion AND h.data_quality_flag = 'normal'`,
      `    AND h.order_time_ms IS NOT NULL AND o.order_time_ms IS NOT NULL`,
      `    AND h.order_time_ms < o.order_time_ms`,
      `    AND h.order_time_ms >= o.order_time_ms - ${MS_DAYS_7}`,
      `  WHERE o.category_id IS NOT NULL AND o.order_time_ms IS NOT NULL`,
      `  GROUP BY o.order_id`,
      `)`,
    ].join('\n');
  }

  /** Category average discount rate 30-day per-row lookback */
  private buildCategoryAvgDiscountCTE(): string {
    return [
      `cad AS (`,
      `  SELECT o.order_id, AVG(h.discount_rate) AS category_avg_discount_rate`,
      `  FROM bm o`,
      `  LEFT JOIN bm h ON`,
      `    h.category_id = o.category_id AND h.category_id IS NOT NULL`,
      `    AND h.is_non_promotion AND h.data_quality_flag = 'normal'`,
      `    AND h.amount > 0`,
      `    AND h.order_time_ms IS NOT NULL AND o.order_time_ms IS NOT NULL`,
      `    AND h.order_time_ms < o.order_time_ms`,
      `    AND h.order_time_ms >= o.order_time_ms - ${MS_DAYS_30}`,
      `  WHERE o.category_id IS NOT NULL AND o.order_time_ms IS NOT NULL`,
      `  GROUP BY o.order_id`,
      `)`,
    ].join('\n');
  }

  /**
   * Hourly stats CTE for spike detection baseline.
   * Method 'batch_avg': total orders / distinct hours = avg hourly orders per SKU.
   * Method 'same_hour_avg': avg orders per (sku, hour_of_day) slot.
   */
  private buildHourlyStatsCTE(method: 'batch_avg' | 'same_hour_avg'): string {
    if (method === 'batch_avg') {
      return [
        `hs AS (`,
        `  SELECT`,
        `    sku_id,`,
        `    CAST(COUNT(*) AS DOUBLE)`,
        `    / NULLIF(CAST(COUNT(DISTINCT CAST(order_time_ms / ${MS_HOUR} AS BIGINT)) AS DOUBLE), 0)`,
        `      AS avg_hourly_orders`,
        `  FROM bm`,
        `  WHERE sku_id IS NOT NULL AND order_time_ms IS NOT NULL AND data_quality_flag = 'normal'`,
        `  GROUP BY sku_id`,
        `)`,
      ].join('\n');
    }
    // same_hour_avg: compute per (sku, hour_of_day) then average across days
    return [
      `hs AS (`,
      `  SELECT sku_id, hour_of_day,`,
      `    AVG(CAST(hourly_count AS DOUBLE)) AS avg_hourly_orders`,
      `  FROM (`,
      `    SELECT`,
      `      sku_id,`,
      `      CAST(order_time_ms / ${MS_HOUR} AS BIGINT) % 24           AS hour_of_day,`,
      `      CAST(order_time_ms / ${MS_HOUR} AS BIGINT)                AS hour_bucket,`,
      `      COUNT(*) AS hourly_count`,
      `    FROM bm`,
      `    WHERE sku_id IS NOT NULL AND order_time_ms IS NOT NULL AND data_quality_flag = 'normal'`,
      `    GROUP BY sku_id,`,
      `      CAST(order_time_ms / ${MS_HOUR} AS BIGINT) % 24,`,
      `      CAST(order_time_ms / ${MS_HOUR} AS BIGINT)`,
      `  ) hourly_buckets`,
      `  GROUP BY sku_id, hour_of_day`,
      `)`,
    ].join('\n');
  }

  /** Per-order SKU count in a 1-hour sliding window */
  private buildHourlyOrderCountCTE(): string {
    return [
      `hoc AS (`,
      `  SELECT o.order_id, COUNT(h.order_id) AS hourly_sku_count`,
      `  FROM bm o`,
      `  LEFT JOIN bm h ON`,
      `    h.sku_id = o.sku_id AND h.sku_id IS NOT NULL`,
      `    AND h.order_time_ms IS NOT NULL AND o.order_time_ms IS NOT NULL`,
      `    AND h.order_time_ms >= o.order_time_ms`,
      `    AND h.order_time_ms < o.order_time_ms + ${MS_HOUR}`,
      `  WHERE o.sku_id IS NOT NULL AND o.order_time_ms IS NOT NULL`,
      `  GROUP BY o.order_id`,
      `)`,
    ].join('\n');
  }

  /** User daily same-SKU order count */
  private buildUserDailySkuCTE(): string {
    return [
      `uds AS (`,
      `  SELECT`,
      `    user_id, sku_id,`,
      `    CAST(order_time_ms / ${MS_DAY} AS BIGINT) AS day_bucket,`,
      `    COUNT(*) AS daily_count`,
      `  FROM bm`,
      `  WHERE user_id IS NOT NULL AND sku_id IS NOT NULL`,
      `    AND order_time_ms IS NOT NULL AND data_quality_flag = 'normal'`,
      `  GROUP BY user_id, sku_id, CAST(order_time_ms / ${MS_DAY} AS BIGINT)`,
      `)`,
    ].join('\n');
  }

  /** Address cluster: distinct users with same address prefix ordering same SKU in 2h */
  private buildAddrClusterCTE(prefixLen: number): string {
    return [
      `acl AS (`,
      `  SELECT`,
      `    LEFT(receiver_addr, ${prefixLen}) AS addr_prefix,`,
      `    sku_id,`,
      `    CAST(order_time_ms / ${MS_TWO_HOURS} AS BIGINT) AS two_hour_bucket,`,
      `    COUNT(DISTINCT user_id) AS distinct_users`,
      `  FROM bm`,
      `  WHERE receiver_addr IS NOT NULL AND sku_id IS NOT NULL`,
      `    AND order_time_ms IS NOT NULL AND data_quality_flag = 'normal'`,
      `  GROUP BY LEFT(receiver_addr, ${prefixLen}), sku_id,`,
      `    CAST(order_time_ms / ${MS_TWO_HOURS} AS BIGINT)`,
      `)`,
    ].join('\n');
  }

  /** Device cluster: distinct accounts per device ordering same SKU in 2h */
  private buildDeviceClusterCTE(): string {
    return [
      `dcl AS (`,
      `  SELECT`,
      `    device_id, sku_id,`,
      `    CAST(order_time_ms / ${MS_TWO_HOURS} AS BIGINT) AS two_hour_bucket,`,
      `    COUNT(DISTINCT user_id) AS distinct_accounts`,
      `  FROM bm`,
      `  WHERE device_id IS NOT NULL AND sku_id IS NOT NULL`,
      `    AND order_time_ms IS NOT NULL AND data_quality_flag = 'normal'`,
      `  GROUP BY device_id, sku_id, CAST(order_time_ms / ${MS_TWO_HOURS} AS BIGINT)`,
      `)`,
    ].join('\n');
  }

  /**
   * Enriched CTE: joins all dimension CTEs back to bm and computes price deviations.
   * - price_deviation_30d: deviation from SKU 30d base price
   * - price_deviation_category: deviation from category 7d base price
   * - price_deviation: LEAST of the two available deviations (NULL if neither available)
   */
  private buildEnrichedCTE(method: 'batch_avg' | 'same_hour_avg', prefixLen: number): string {
    const hsJoin = method === 'same_hour_avg'
      ? `bm.sku_id = hs.sku_id AND hs.hour_of_day = CAST(bm.order_time_ms / ${MS_HOUR} AS BIGINT) % 24`
      : `bm.sku_id = hs.sku_id`;

    return [
      `en AS (`,
      `  SELECT bm.*,`,
      `    skp.sku_base_price_30d,`,
      `    cbp.category_base_price_7d,`,
      `    cad.category_avg_discount_rate,`,
      `    -- price_deviation_30d: negative means below historical baseline`,
      `    CASE WHEN skp.sku_base_price_30d > 0`,
      `      THEN (bm.actual_payment - skp.sku_base_price_30d) / skp.sku_base_price_30d`,
      `    END AS price_deviation_30d,`,
      `    CASE WHEN cbp.category_base_price_7d > 0`,
      `      THEN (bm.actual_payment - cbp.category_base_price_7d) / cbp.category_base_price_7d`,
      `    END AS price_deviation_category,`,
      `    -- combined: LEAST of available deviations (most severe)`,
      `    COALESCE(`,
      `      CASE WHEN skp.sku_base_price_30d > 0 AND cbp.category_base_price_7d > 0`,
      `        THEN LEAST(`,
      `          (bm.actual_payment - skp.sku_base_price_30d) / skp.sku_base_price_30d,`,
      `          (bm.actual_payment - cbp.category_base_price_7d) / cbp.category_base_price_7d`,
      `        )`,
      `      END,`,
      `      CASE WHEN skp.sku_base_price_30d > 0`,
      `        THEN (bm.actual_payment - skp.sku_base_price_30d) / skp.sku_base_price_30d`,
      `      END,`,
      `      CASE WHEN cbp.category_base_price_7d > 0`,
      `        THEN (bm.actual_payment - cbp.category_base_price_7d) / cbp.category_base_price_7d`,
      `      END`,
      `    ) AS price_deviation,`,
      `    hoc.hourly_sku_count,`,
      `    hs.avg_hourly_orders,`,
      `    uds.daily_count AS user_daily_sku_count,`,
      `    acl.distinct_users AS addr_cluster_users,`,
      `    dcl.distinct_accounts AS device_cluster_accounts`,
      `  FROM bm`,
      `  LEFT JOIN skp ON bm.order_id = skp.order_id`,
      `  LEFT JOIN cbp ON bm.order_id = cbp.order_id`,
      `  LEFT JOIN cad ON bm.order_id = cad.order_id`,
      `  LEFT JOIN hoc ON bm.order_id = hoc.order_id`,
      `  LEFT JOIN hs ON ${hsJoin}`,
      `  LEFT JOIN uds ON bm.user_id = uds.user_id AND bm.sku_id = uds.sku_id`,
      `    AND CAST(bm.order_time_ms / ${MS_DAY} AS BIGINT) = uds.day_bucket`,
      `  LEFT JOIN acl ON LEFT(bm.receiver_addr, ${prefixLen}) = acl.addr_prefix`,
      `    AND bm.sku_id = acl.sku_id`,
      `    AND CAST(bm.order_time_ms / ${MS_TWO_HOURS} AS BIGINT) = acl.two_hour_bucket`,
      `  LEFT JOIN dcl ON bm.device_id = dcl.device_id AND bm.sku_id = dcl.sku_id`,
      `    AND CAST(bm.order_time_ms / ${MS_TWO_HOURS} AS BIGINT) = dcl.two_hour_bucket`,
      `)`,
    ].join('\n');
  }

  /**
   * Score components CTE: applies all rule groups and emits per-dimension scores + tag arrays.
   * Arbitrage rules (Rule Group 5) are also computed here to keep all scoring in one place.
   * NULL propagation naturally disables rules when dependent optional fields were not mapped.
   */
  private buildScoreCTE(t: ArbitrageThresholds, rt: ArbitrageRuleToggles, arb: ArbitrageDetectionConfig): string {
    const margin   = buildMarginRuleSql(t, rt);
    const discount = buildDiscountRuleSql(t, rt);
    const deviation = buildPriceDeviationRuleSql(t, rt);
    const coupon   = buildCouponAnomalyRuleSql(t, rt);
    const { hourlySpikeMult: mult, purchaseLimit, addressClusterThreshold: addrThresh, deviceAccountThreshold: devThresh } = arb;

    // Arbitrage score expressions (disabled when ruleToggles.arbitrageRules = false)
    const arbEnabled = rt.arbitrageRules;
    const arbTimeScore  = arbEnabled ? `CASE WHEN is_non_promotion AND hourly_sku_count IS NOT NULL AND avg_hourly_orders IS NOT NULL AND hourly_sku_count > avg_hourly_orders * ${mult} THEN 20 ELSE 0 END` : '0';
    const arbUserScore  = arbEnabled ? `CASE WHEN user_daily_sku_count IS NOT NULL AND user_daily_sku_count > ${purchaseLimit} THEN 25 ELSE 0 END` : '0';
    const arbUserDisc   = arbEnabled ? `CASE WHEN user_daily_sku_count IS NOT NULL AND user_daily_sku_count > 3 AND sku_base_price_30d IS NOT NULL AND actual_payment < sku_base_price_30d * 0.8 THEN 30 ELSE 0 END` : '0';
    const arbAddrScore  = arbEnabled ? `CASE WHEN addr_cluster_users IS NOT NULL AND addr_cluster_users > ${addrThresh} THEN 30 ELSE 0 END` : '0';
    const arbDevScore   = arbEnabled ? `CASE WHEN device_cluster_accounts IS NOT NULL AND device_cluster_accounts > ${devThresh} THEN 25 ELSE 0 END` : '0';

    // Evidence conditions mirror the same NULL guards as their score counterparts to ensure
    // consistent behavior when optional fields are absent (NULL comparisons → no false positives).
    const arbTimEvid = arbEnabled ? `CASE WHEN is_non_promotion AND hourly_sku_count IS NOT NULL AND avg_hourly_orders IS NOT NULL AND hourly_sku_count > avg_hourly_orders * ${mult} THEN '1h内同SKU订单量异常突增' ELSE NULL END` : 'NULL';
    const arbUserEvid = arbEnabled ? `CASE WHEN user_daily_sku_count IS NOT NULL AND user_daily_sku_count > ${purchaseLimit} THEN CONCAT('用户单日同SKU下单', CAST(user_daily_sku_count AS VARCHAR), '次') ELSE NULL END` : 'NULL';
    const arbDiscEvid = arbEnabled ? `CASE WHEN user_daily_sku_count IS NOT NULL AND user_daily_sku_count > 3 AND sku_base_price_30d IS NOT NULL AND actual_payment IS NOT NULL AND actual_payment < sku_base_price_30d * 0.8 THEN '批量低价套利' ELSE NULL END` : 'NULL';
    const arbAddrEvid = arbEnabled ? `CASE WHEN addr_cluster_users IS NOT NULL AND addr_cluster_users > ${addrThresh} THEN CONCAT('同地址2h内', CAST(addr_cluster_users AS VARCHAR), '用户批量下单') ELSE NULL END` : 'NULL';
    const arbDevEvid  = arbEnabled ? `CASE WHEN device_cluster_accounts IS NOT NULL AND device_cluster_accounts > ${devThresh} THEN CONCAT('同设备2h内', CAST(device_cluster_accounts AS VARCHAR), '账号下单') ELSE NULL END` : 'NULL';

    return [
      `sc AS (`,
      `  SELECT en.*,`,
      `    -- Rule Group 1: Margin rules`,
      `    (${margin.scoreExpr}) AS ${margin.scoreAlias},`,
      `    (${margin.tagsExpr}) AS ${margin.tagsAlias},`,
      `    -- Rule Group 2: Discount rules`,
      `    (${discount.scoreExpr}) AS ${discount.scoreAlias},`,
      `    (${discount.tagsExpr}) AS ${discount.tagsAlias},`,
      `    -- Rule Group 3: Price deviation rules`,
      `    (${deviation.scoreExpr}) AS ${deviation.scoreAlias},`,
      `    (${deviation.tagsExpr}) AS ${deviation.tagsAlias},`,
      `    -- Rule Group 4: Coupon anomaly rules`,
      `    (${coupon.scoreExpr}) AS ${coupon.scoreAlias},`,
      `    (${coupon.tagsExpr}) AS ${coupon.tagsAlias},`,
      `    -- Rule Group 5: Arbitrage behavioral rules (independent computation)`,
      `    (${arbTimeScore}) AS arb_time_score,`,
      `    (${arbUserScore}) AS arb_user_score,`,
      `    (${arbUserDisc}) AS arb_user_disc_score,`,
      `    (${arbAddrScore}) AS arb_addr_score,`,
      `    (${arbDevScore}) AS arb_dev_score,`,
      `    -- Arbitrage evidence list`,
      `    list_filter([`,
      `      ${arbTimEvid},`,
      `      ${arbUserEvid},`,
      `      ${arbDiscEvid},`,
      `      ${arbAddrEvid},`,
      `      ${arbDevEvid}`,
      `    ], x -> x IS NOT NULL) AS arbitrage_evidence_list`,
      `  FROM en`,
      `)`,
    ].join('\n');
  }

  /**
   * Totals CTE: sums component scores into basic_risk_score + arbitrage_score → risk_score.
   * References sc aliases — no duplication of expressions needed.
   */
  private buildTotalsCTE(): string {
    return [
      `totals AS (`,
      `  SELECT sc.*,`,
      `    (margin_score + discount_score + deviation_score + coupon_score) AS basic_risk_score,`,
      `    (arb_time_score + arb_user_score + arb_user_disc_score + arb_addr_score + arb_dev_score) AS arbitrage_score,`,
      `    LEAST(`,
      `      margin_score + discount_score + deviation_score + coupon_score`,
      `      + arb_time_score + arb_user_score + arb_user_disc_score + arb_addr_score + arb_dev_score,`,
      `      100`,
      `    ) AS risk_score`,
      `  FROM sc`,
      `)`,
    ].join('\n');
  }

  /**
   * Final SELECT: computes risk_level + risk_type + arbitrage_evidence from totals aliases.
   * arbitrage_label is appended to risk_type only when arbitrage_score >= 40.
   */
  private buildFinalSelect(): string {
    return [
      `SELECT`,
      `  order_id,`,
      `  actual_payment,`,
      `  discount_rate,`,
      `  gross_margin,`,
      `  margin_rate,`,
      `  price_deviation,`,
      `  price_deviation_30d,`,
      `  price_deviation_category,`,
      `  basic_risk_score,`,
      `  arbitrage_score,`,
      `  risk_score,`,
      `  CASE`,
      `    WHEN risk_score >= 80 THEN '严重'`,
      `    WHEN risk_score >= 60 THEN '高'`,
      `    WHEN risk_score >= 40 THEN '中'`,
      `    ELSE '低'`,
      `  END AS risk_level,`,
      `  -- risk_type: basic tags + optional arbitrage label`,
      `  to_json(list_cat(`,
      `    list_cat(`,
      `      list_cat(COALESCE(margin_tags, []), COALESCE(discount_tags, [])),`,
      `      list_cat(COALESCE(deviation_tags, []), COALESCE(coupon_tags, []))`,
      `    ),`,
      `    CASE WHEN arbitrage_score >= 80 THEN ['严重恶意套利']`,
      `         WHEN arbitrage_score >= 60 THEN ['黄牛囤货套利']`,
      `         WHEN arbitrage_score >= 40 THEN ['疑似套利']`,
      `         ELSE [] END`,
      `  ))::VARCHAR AS risk_type,`,
      `  to_json(arbitrage_evidence_list)::VARCHAR AS arbitrage_evidence,`,
      `  data_quality_flag`,
      `FROM totals`,
    ].join('\n');
  }

  // ─── Public interface ───────────────────────────────────────────────────────

  buildSql(nodes: FlowNode[], _edges: FlowEdge[]): string {
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableName = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';

    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { arbitrageAnalyzeConfig?: ArbitrageAnalyzeConfig } | undefined)
      ?.arbitrageAnalyzeConfig;

    if (!cfg || !tableName) {
      console.warn(`[${this.name}.buildSql] config missing — falling back to SELECT *`);
      return `SELECT *\nFROM "${tableName}"`;
    }

    const { fieldMapping: fm, autoFieldMapping: auto, thresholds: t, arbitrage: arb, ruleToggles: rt } = cfg;

    const ctes = [
      this.buildDataQualityCTE(tableName, fm),
      this.buildBaseMetricsCTE(fm, auto),
      this.buildSkuBasePriceCTE(),
      this.buildCategoryBasePriceCTE(),
      this.buildCategoryAvgDiscountCTE(),
      this.buildHourlyStatsCTE(arb.hourlySpikeMethod),
      this.buildHourlyOrderCountCTE(),
      this.buildUserDailySkuCTE(),
      this.buildAddrClusterCTE(arb.addressPrefixLength),
      this.buildDeviceClusterCTE(),
      this.buildEnrichedCTE(arb.hourlySpikeMethod, arb.addressPrefixLength),
      this.buildScoreCTE(t, rt, arb),
      this.buildTotalsCTE(),
    ];

    const sql = `WITH\n${ctes.join(',\n')}\n${this.buildFinalSelect()}`;
    console.log(`[${this.name}.buildSql] generated SQL (${sql.length} chars)`);
    return sql;
  }

  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    const rows = Array.isArray(queryResult?.data) ? queryResult.data : [];
    const schema = Array.isArray(queryResult?.schema) ? queryResult.schema : [];

    const totalOrders  = rows.length;
    const riskOrders   = rows.filter((r) => (r as Record<string, unknown>)['risk_score'] as number > 0).length;
    const highRisk     = rows.filter((r) => ['严重', '高'].includes((r as Record<string, unknown>)['risk_level'] as string)).length;
    const dirtyOrders  = rows.filter((r) => (r as Record<string, unknown>)['data_quality_flag'] === 'dirty').length;

    return {
      type: OperatorType.ARBITRAGE_ANALYZE,
      sql: '',
      data: rows as any[],
      schema: schema as any[],
      insights: [
        `共分析 ${totalOrders} 条订单`,
        `风险订单 ${riskOrders} 条（${((riskOrders / Math.max(totalOrders, 1)) * 100).toFixed(1)}%）`,
        `高/严重风险 ${highRisk} 条`,
        ...(dirtyOrders > 0 ? [`数据质量问题订单 ${dirtyOrders} 条（已标记 dirty，不参与评分）`] : []),
      ],
    };
  }
}
