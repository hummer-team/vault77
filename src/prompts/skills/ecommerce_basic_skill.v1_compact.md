# E-commerce Skill Pack (v1 - Compact)

## Terminology Mapping

| User Term | Column Names | 中文 |
|-----------|--------------|------|
| Order ID | order_id, id | 订单编号 |
| User | user_id, customer_id | 用户ID |
| Amount | amount, price, total_amount | 金额 |
| Time | order_date, created_at | 下单时间 |
| Status | status, order_status | 状态 |

## Common Metrics

**GMV**: `SUM(amount) WHERE status IN ('completed', 'shipped')`
**AOV**: `AVG(amount)`
**Order Count**: `COUNT(*)`
**Unique Users**: `COUNT(DISTINCT user_id)`

## Analysis Patterns

**KPI**: Single aggregate value (GMV, order count)
**Trend**: `GROUP BY DATE_TRUNC('day', order_date)`
**Distribution**: `GROUP BY category ORDER BY revenue DESC`
**Top-N**: `LIMIT 10 with ranking`

## SQL Rules

- Always use LIMIT (default 500)
- Read-only queries only
- Table whitelist: `main_table_*`
- Time filters: `CAST(col AS TIMESTAMP)` + `INTERVAL`
- DuckDB syntax: `DATE_TRUNC`, `CURRENT_DATE`

## Output

Summary: {value} {metric} {time_range}
- Key insight 1
- Key insight 2

Assumptions:
- Column mappings used
- Filters applied
