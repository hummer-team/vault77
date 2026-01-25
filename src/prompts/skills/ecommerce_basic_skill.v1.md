# E-commerce Basic Skill Pack (v1)

## Industry Context

This skill pack provides domain knowledge for e-commerce data analysis. It helps the AI agent understand common e-commerce terminology, business metrics, and analysis patterns.

## Common E-commerce Terminology

### Order Status Lifecycle
- **pending**: Order created but payment not yet confirmed
- **payment_pending**: Awaiting payment confirmation
- **processing**: Payment confirmed, preparing for shipment
- **shipped**: Order dispatched to customer
- **delivered**: Order successfully delivered
- **completed**: Order fulfilled and confirmed by customer
- **cancelled**: Order cancelled before shipment
- **refunded**: Order refunded after delivery

### Key Fields Mapping

When user mentions these terms, map to corresponding column names:

| User Term | Common Column Names | Alternative Names |
|-----------|---------------------|-------------------|
| Order ID | order_id, id, order_number | 订单编号 |
| User/Customer | user_id, customer_id, buyer_id | 用户ID, 客户ID |
| Amount/Price | amount, price, total_amount, order_value | 金额, 价格, 订单金额 |
| Quantity | quantity, qty, item_count | 数量 |
| Time/Date | order_date, created_at, order_time, timestamp | 下单时间, 创建时间 |
| Product | product_id, sku, item_id | 商品ID, SKU |
| Category | category, product_category | 类别, 商品类别 |
| Status | status, order_status, state | 状态, 订单状态 |

**Chinese Term Support**: The system fully supports Chinese column names (e.g., "订单编号", "用户ID", "下单时间").

## Common E-commerce Metrics

### Revenue Metrics
- **GMV (Gross Merchandise Value)**: Total value of orders (usually includes completed orders only)
  - Calculation: `SUM(amount) WHERE status IN ('completed', 'shipped', 'delivered')`
- **AOV (Average Order Value)**: Average revenue per order
  - Calculation: `AVG(amount)` or `SUM(amount) / COUNT(*)`
- **Total Revenue**: Sum of all order amounts

### Customer Metrics
- **Unique Users**: Count of distinct customers
  - Calculation: `COUNT(DISTINCT user_id)`
- **New Users**: Users placing their first order in a time period
- **Repeat Purchase Rate**: Percentage of users who ordered more than once
- **Customer Lifetime Value (CLV)**: Total value of orders per customer

### Order Metrics
- **Order Count**: Total number of orders
- **Completed Order Count**: Orders with status = 'completed'
- **Cancellation Rate**: Cancelled orders / Total orders
- **Refund Rate**: Refunded orders / Total orders
- **Average Items per Order**: Average quantity per order

## Common Analysis Patterns

### 1. KPI (Key Performance Indicator)
**User Intent**: "How much is the GMV?", "What's the total order count?"

**Approach**:
- Identify the target metric (GMV, order count, unique users, etc.)
- Apply default filters if configured (e.g., status IN ('completed'))
- Return a single aggregate value with clear summary

**Example SQL Template**:
```sql
SELECT 
  SUM(amount) AS gmv,
  COUNT(*) AS order_count,
  COUNT(DISTINCT user_id) AS unique_users
FROM {table_name}
WHERE status IN ('completed', 'shipped', 'delivered')
```

### 2. Trend Analysis
**User Intent**: "Show me daily order trends", "Revenue by month"

**Approach**:
- Identify time column (order_date, created_at)
- Group by time unit (day, week, month)
- Calculate metrics over time
- Order by time ascending

**Example SQL Template**:
```sql
SELECT 
  DATE_TRUNC('day', order_date) AS date,
  COUNT(*) AS order_count,
  SUM(amount) AS revenue
FROM {table_name}
WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY date
ORDER BY date ASC
```

### 3. Distribution / Breakdown
**User Intent**: "Orders by category", "Revenue distribution by product"

**Approach**:
- Identify dimension column (category, product_id, status)
- Group by dimension
- Calculate metrics per group
- Order by metric descending (show top contributors first)

**Example SQL Template**:
```sql
SELECT 
  category,
  COUNT(*) AS order_count,
  SUM(amount) AS revenue,
  ROUND(SUM(amount) * 100.0 / SUM(SUM(amount)) OVER (), 2) AS revenue_pct
FROM {table_name}
GROUP BY category
ORDER BY revenue DESC
LIMIT 10
```

### 4. Top-N / Ranking
**User Intent**: "Top 10 products by sales", "Best selling categories"

**Approach**:
- Identify ranking dimension (product, category, user)
- Calculate ranking metric (sales, order count)
- Order descending and limit to N
- Include ranking number if needed

**Example SQL Template**:
```sql
SELECT 
  product_id,
  COUNT(*) AS order_count,
  SUM(amount) AS total_sales,
  ROW_NUMBER() OVER (ORDER BY SUM(amount) DESC) AS rank
FROM {table_name}
GROUP BY product_id
ORDER BY total_sales DESC
LIMIT 10
```

### 5. Comparison
**User Intent**: "Compare this month vs last month", "Year-over-year growth"

**Approach**:
- Identify comparison periods
- Calculate metrics for each period
- Show absolute values and percentage change
- Use CTEs or window functions for clarity

**Example SQL Template**:
```sql
WITH current_month AS (
  SELECT SUM(amount) AS revenue
  FROM {table_name}
  WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE)
),
last_month AS (
  SELECT SUM(amount) AS revenue
  FROM {table_name}
  WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
    AND order_date < DATE_TRUNC('month', CURRENT_DATE)
)
SELECT 
  current_month.revenue AS current_revenue,
  last_month.revenue AS last_revenue,
  ROUND((current_month.revenue - last_month.revenue) * 100.0 / last_month.revenue, 2) AS growth_pct
FROM current_month, last_month
```

## SQL Best Practices

### DuckDB-Specific Syntax
- Use `DATE_TRUNC('day'|'week'|'month', column)` for time grouping
- Use `INTERVAL '30 days'` for relative time filters
- Use `CURRENT_DATE` or `CURRENT_TIMESTAMP` for current time
- Cast timestamps: `CAST(column AS TIMESTAMP)` to avoid timezone issues
- Window functions: `SUM(x) OVER (PARTITION BY y ORDER BY z)`

### Safety Constraints
- **Always use LIMIT**: Default to LIMIT 500 if user doesn't specify
- **Read-only queries**: Never generate INSERT/UPDATE/DELETE/DROP/ALTER
- **Table whitelist**: Only query tables matching pattern `main_table_*`
- **Column validation**: Verify columns exist in schema before querying

## Output Structure

### Summary Format
Always provide a clear, business-friendly summary:

```
Summary: {metric_value} {metric_name} {time_range}
- Key insight 1
- Key insight 2
- Recommendation (if applicable)
```

**Example**:
```
Summary: GMV is $1,234,567 in the last 30 days
- 15,432 total orders with average order value of $80
- Top category: Electronics (35% of revenue)
- Recommendation: Consider promotional campaigns for low-performing categories
```

### Assumptions
If you make assumptions (e.g., which column to use for "amount"), state them clearly:

```
Assumptions:
- Using "order_date" column for time filtering
- Filtering to status IN ('completed', 'shipped', 'delivered')
- Amount includes all order values without tax adjustment
```

## Clarification Triggers

When to ask for clarification (NEED_CLARIFICATION):

1. **Missing time column**: User asks for trend but no time column found
2. **Ambiguous field mapping**: Multiple columns could match user intent
3. **Missing required fields**: User asks for metric that requires unavailable column
4. **Unclear time range**: User says "recently" without specifying period

## Version History

- **v1 (2026-01-25)**: Initial e-commerce skill pack
  - Basic terminology mapping
  - Core metrics definitions
  - 5 common analysis patterns
  - DuckDB best practices
