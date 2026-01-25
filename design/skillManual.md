# User Skill 配置手册

**版本：** v1.0  
**适用版本：** Vaultmind M10.4+  
**最后更新：** 2026-01-25

---

## 📚 目录

1. [功能概述](#1-功能概述)
2. [快速开始](#2-快速开始)
3. [配置入口](#3-配置入口)
4. [Industry（行业）配置](#4-industry行业配置)
5. [Field Mapping（字段映射）](#5-field-mapping字段映射)
6. [Default Filters（默认过滤条件）](#6-default-filters默认过滤条件)
7. [Metrics（自定义指标）](#7-metrics自定义指标)
8. [透明度功能](#8-透明度功能)
9. [常见场景与最佳实践](#9-常见场景与最佳实践)
10. [故障排查与 FAQ](#10-故障排查与-faq)

---

## 1. 功能概述

### 1.1 什么是 User Skill？

**User Skill（用户技能）** 是 Vaultmind 提供的一项高级功能，允许你为每个数据表自定义领域知识和业务规则，从而让 AI 更好地理解你的数据和业务场景。

### 1.2 核心能力

通过配置 User Skill，你可以：

✅ **行业适配** - 选择你的业务领域（电商/金融/零售），AI 自动加载对应的行业知识库  
✅ **字段映射** - 告诉 AI 哪些列是时间、金额、订单ID、用户ID，避免重复澄清  
✅ **默认过滤** - 设置自动过滤条件（如"只看已完成订单"），每次查询自动应用  
✅ **自定义指标** - 定义业务指标（如 GMV、复购率），直接用自然语言查询  

### 1.3 适用场景

| 场景 | 不配置 User Skill | 配置 User Skill |
|------|------------------|----------------|
| **查询趋势** | "需要你补充时间字段" | 自动使用 `下单时间` |
| **计算 GMV** | 需要解释"GMV = SUM(金额)" | 直接说"计算GMV" |
| **过滤数据** | 每次都要说"只看已完成订单" | 自动应用过滤条件 |
| **理解业务** | 通用 SQL 术语 | 使用行业专业术语（如"客单价"） |

---

## 2. 快速开始

### 2.1 五分钟配置指南

**第 1 步：上传数据文件**
1. 在 Workbench 页面点击 "📎 Upload File"
2. 选择你的 Excel 或 CSV 文件
3. 等待文件加载成功（表名自动分配为 `main_table_1`）

**第 2 步：打开配置界面**
1. 点击右上角头像 → Settings
2. 找到 "User Skill Configuration" 区域
3. 点击 "Configure User Skills" 按钮

**第 3 步：选择表并设置行业**
1. 在弹出的对话框中，选择你要配置的表（如 `main_table_1`）
2. 设置 Industry（行业）：
   - E-commerce（电商）
   - Finance（金融）
   - Retail（零售）
   - Custom（自定义）

**第 4 步：配置字段映射（推荐）**
1. 展开 "Industry & Field Mapping" 面板
2. 至少设置 Time Column（时间字段）
3. 根据你的数据设置其他字段（金额、订单ID、用户ID）

**第 5 步：保存并测试**
1. 点击对话框底部的 "Save Configuration" 按钮
2. 回到 Workbench，输入查询：`按天统计订单数趋势`
3. 查看结果 → 展开 "查看AI思考过程" → 确认看到绿色的配置标签

---

## 3. 配置入口

### 3.1 打开配置界面

**方法 1：从 Settings 页面**
1. 点击右上角 **头像图标**
2. 选择 **Settings**
3. 在 "User Skill Configuration" 区域点击 **"Configure User Skills"**

**方法 2：从 Workbench 直接访问**（如果实现了快捷入口）
- 在上传文件后，点击文件标签旁的 ⚙️ 图标

### 3.2 配置界面布局

配置对话框包含以下部分：

```
┌─────────────────────────────────────────┐
│ User Skill Configuration         [ X ]  │
├─────────────────────────────────────────┤
│ Select Table: [main_table_1      ▼]     │
│                                          │
│ ▼ Industry & Field Mapping               │
│   • Industry: [E-commerce  ▼]           │
│   • Field Mapping (Optional)             │
│     - Time Column: [下单时间     ▼]      │
│     - Amount Column: [实付金额   ▼]      │
│     - Order ID Column: [订单ID   ▼]      │
│     - User ID Column: [用户ID    ▼]      │
│                                          │
│ ▼ Default Filters                        │
│   [列表显示已添加的过滤条件]             │
│   [+ Add Filter] 按钮                    │
│                                          │
│ ▼ Metrics                                │
│   系统内置指标 (只读)                    │
│   [列表显示系统指标]                     │
│                                          │
│   Custom Metrics (L0)                   │
│   [列表显示自定义指标]                   │
│   [+ Add Metric] 按钮                    │
│                                          │
│ [Clear Config]  [Save Configuration]    │
└─────────────────────────────────────────┘
```

---

## 4. Industry（行业）配置

### 4.1 为什么要设置 Industry？

设置行业后，系统会：
- 加载该行业的专业术语库（如电商的"GMV"、"客单价"）
- 提供标准指标模板（如电商的6个核心指标）
- 优化 SQL 生成逻辑（如金融场景的合规约束）

### 4.2 支持的行业

| 行业 | 英文标识 | 系统内置指标数量 | 适用场景 |
|------|---------|----------------|---------|
| **电商** | ecommerce | 6 个 | 订单分析、用户行为、商品销售 |
| **金融** | finance | 4 个 | 交易统计、账户分析、风险监控 |
| **零售** | retail | 4 个 | 门店销售、库存管理、会员分析 |
| **自定义** | custom | 2 个（默认） | 其他行业或混合场景 |

### 4.3 配置步骤

1. **选择表**：在 "Select Table" 下拉框中选择你要配置的表
2. **展开面板**：点击 "Industry & Field Mapping" 面板
3. **选择行业**：在 "Industry" 下拉框中选择你的业务领域
4. **查看系统指标**（可选）：
   - 向下滚动到 "Metrics" 面板
   - 展开 "系统内置指标 (System Metrics)" 区域
   - 查看该行业提供的标准指标

### 4.4 行业指标对照表

**E-commerce（电商）：**
- `gmv` - Gross Merchandise Value (总交易额)
- `order_count` - Order Count (订单数)
- `avg_order_value` - Average Order Value (客单价)
- `unique_users` - Unique Users (独立用户数)
- `paid_order_count` - Paid Order Count (支付订单数)
- `conversion_rate` - Conversion Rate (转化率)

**Finance（金融）：**
- `total_amount` - Total Amount (总金额)
- `transaction_count` - Transaction Count (交易笔数)
- `avg_transaction` - Average Transaction (平均交易额)
- `unique_accounts` - Unique Accounts (独立账户数)

**Retail（零售）：**
- `total_sales` - Total Sales (总销售额)
- `transaction_count` - Transaction Count (交易笔数)
- `avg_basket_size` - Average Basket Size (平均客单价)
- `unique_customers` - Unique Customers (独立客户数)

---

## 5. Field Mapping（字段映射）

### 5.1 什么是 Field Mapping？

Field Mapping 告诉 AI 你的数据表中哪些列代表什么业务含义，避免每次查询都需要澄清。

### 5.2 支持的字段类型

| 字段类型 | 英文名称 | 作用 | 示例列名 |
|---------|---------|------|---------|
| **时间列** | Time Column | 用于趋势分析、时间过滤 | `下单时间`、`create_time`、`order_date` |
| **金额列** | Amount Column | 用于求和、平均值计算 | `实付金额`、`amount`、`price` |
| **订单ID列** | Order ID Column | 用于去重、关联查询 | `订单ID`、`order_id`、`order_no` |
| **用户ID列** | User ID Column | 用于用户级统计、去重 | `用户ID`、`user_id`、`customer_id` |

### 5.3 配置步骤

1. **展开 "Industry & Field Mapping" 面板**
2. **依次选择字段**（所有字段都是可选的）：
   - Time Column：从下拉框中选择你的时间字段
   - Amount Column：选择金额字段
   - Order ID Column：选择订单标识字段
   - User ID Column：选择用户标识字段
3. **保存配置**

### 5.4 配置前后对比

**场景：查询"按天统计订单数趋势"**

| 配置状态 | AI 行为 | 用户体验 |
|---------|---------|---------|
| **未配置 Time Column** | 返回澄清卡片："需要你补充时间字段" | ❌ 需要额外交互 |
| **已配置 Time Column** | 自动使用 `下单时间` 生成 SQL | ✅ 一次性得到结果 |

**场景：查询"平均订单金额"**

| 配置状态 | AI 行为 |
|---------|---------|
| **未配置 Amount Column** | 可能猜测错误的列，或要求澄清 |
| **已配置 Amount Column** | 自动使用 `实付金额` 计算 AVG |

### 5.5 最佳实践

✅ **推荐配置：**
- 时间列（Time Column）：**必须配置**（用于趋势分析）
- 金额列（Amount Column）：**强烈推荐**（用于金额统计）
- 订单ID列：如果有订单去重需求，建议配置
- 用户ID列：如果有用户级分析需求，建议配置

❌ **不需要配置：**
- 如果你的数据表没有时间字段（纯静态数据）
- 如果你只做简单的计数统计（COUNT）

---

## 6. Default Filters（默认过滤条件）

### 6.1 什么是 Default Filters？

Default Filters 是自动应用到所有查询的过滤条件，类似于 SQL 的全局 WHERE 子句。

### 6.2 适用场景

- **数据清洗**：过滤掉测试数据、无效数据
- **业务规则**：只统计已完成/已支付的订单
- **时间窗口**：只看最近 30 天的数据
- **权限控制**：只看特定地区/部门的数据（结合行级权限）

### 6.3 支持的操作符

| 操作符 | 英文标识 | 说明 | 示例 |
|-------|---------|------|------|
| **等于** | `=` | 精确匹配 | `status = '已完成'` |
| **不等于** | `!=` | 排除特定值 | `status != '已取消'` |
| **大于** | `>` | 数值/时间比较 | `amount > 100` |
| **大于等于** | `>=` | 数值/时间比较 | `amount >= 0` |
| **小于** | `<` | 数值/时间比较 | `amount < 10000` |
| **小于等于** | `<=` | 数值/时间比较 | `amount <= 5000` |
| **包含于** | `in` | 多值匹配 | `status in ['已完成', '已支付']` |
| **不包含于** | `not_in` | 多值排除 | `status not_in ['测试', '已取消']` |
| **包含** | `contains` | 字符串模糊匹配 | `product_name contains '苹果'` |

### 6.4 配置步骤

**添加普通过滤条件：**
1. 展开 "Default Filters" 面板
2. 点击 **"+ Add Filter"** 按钮
3. 在弹出的对话框中填写：
   - **Column**（列名）：选择要过滤的字段
   - **Operator**（操作符）：选择比较操作符
   - **Value Type**（值类型）：选择 "Literal Value"（字面值）
   - **Value**（值）：输入具体的值（字符串、数字、数组）
4. 点击 "Add" 保存

**添加相对时间过滤条件：**
1. 点击 **"+ Add Filter"** 按钮
2. 填写：
   - **Column**：选择时间字段（如 `下单时间`）
   - **Operator**：选择 `>=`（大于等于）
   - **Value Type**：选择 "Relative Time"（相对时间）
   - **Time Unit**：选择单位（day/week/month/year）
   - **Amount**：输入数量（如 30）
   - **Direction**：选择方向（past=过去，future=未来）
3. 点击 "Add" 保存

### 6.5 示例配置

**示例 1：只看已完成订单**
```yaml
Column: 订单状态
Operator: =
Value: "已完成"
```

**示例 2：只看有效订单（排除测试和取消）**
```yaml
Column: 订单状态
Operator: in
Value: ["已完成", "已支付", "待发货"]
```

**示例 3：只看金额大于 0 的订单**
```yaml
Column: 实付金额
Operator: >
Value: 0
```

**示例 4：只看最近 30 天的数据（相对时间）**
```yaml
Column: 下单时间
Operator: >=
Value Type: Relative Time
  - Time Unit: day
  - Amount: 30
  - Direction: past
```
生成的 SQL：
```sql
CAST(下单时间 AS TIMESTAMP) >= CURRENT_TIMESTAMP - INTERVAL '30 days'
```

### 6.6 编辑和删除

**编辑过滤条件：**
1. 在 Default Filters 列表中找到要编辑的条件
2. 点击右侧的 **✏️ 编辑** 按钮
3. 修改字段后点击 "Update"

**删除过滤条件：**
1. 点击过滤条件右侧的 **🗑️ 删除** 按钮
2. 在确认对话框中点击 "Yes"

### 6.7 注意事项

⚠️ **安全限制：**
- Value 输入框会进行 Zod 校验，阻止 SQL 注入攻击
- 禁止输入 SQL 关键字（如 `DROP`、`DELETE`、`--`）
- 列名只允许字母、数字、下划线、中文字符

⚠️ **性能提示：**
- 过多的过滤条件（> 20 个）可能影响查询性能
- 建议合并相似条件（如多个状态用 `in` 代替多个 `=`）

⚠️ **Digest 限制：**
- 如果配置超过 20 个过滤条件，只有前 5 个会在 "Effective Settings" 中完整显示
- 其余条件仍会生效，但显示为 "+X more filters..."

---

## 7. Metrics（自定义指标）

### 7.1 什么是 Metrics？

Metrics 允许你定义业务指标（KPI），之后可以直接用自然语言查询，而不需要每次都解释计算逻辑。

### 7.2 系统内置指标 vs 自定义指标

**系统内置指标（System Metrics）：**
- 由系统根据 Industry 自动提供
- **只读**，不可编辑
- 显示在 Metrics 面板顶部
- 可以被用户自定义指标覆盖（Override）

**自定义指标（Custom Metrics L0）：**
- 由用户定义的业务指标
- 支持基本聚合函数（count、sum、avg、min、max）
- 可以添加 WHERE 条件
- 如果 key 与系统指标相同，则覆盖系统指标

### 7.3 支持的聚合函数

| 聚合函数 | 英文标识 | 说明 | 是否需要 Column | 示例 |
|---------|---------|------|----------------|------|
| **计数** | count | 统计行数 | ❌ 不需要 | COUNT(*) |
| **去重计数** | count_distinct | 统计唯一值数量 | ✅ 需要 | COUNT(DISTINCT user_id) |
| **求和** | sum | 数值求和 | ✅ 需要 | SUM(amount) |
| **平均值** | avg | 数值平均 | ✅ 需要 | AVG(amount) |
| **最小值** | min | 数值最小值 | ✅ 需要 | MIN(amount) |
| **最大值** | max | 数值最大值 | ✅ 需要 | MAX(amount) |

### 7.4 配置步骤

**添加自定义指标：**
1. 展开 "Metrics" 面板
2. 滚动到 "Custom Metrics (L0)" 区域
3. 点击 **"+ Add Metric"** 按钮
4. 在弹出的对话框中填写：
   - **Metric Key**（指标标识）：英文标识，如 `gmv`、`aov`
   - **Label**（中文名称）：如 "总交易额"、"客单价"
   - **Aggregation**（聚合函数）：选择 count/sum/avg 等
   - **Column**（列名）：选择要聚合的字段（count 除外）
   - **WHERE Conditions**（可选）：添加过滤条件
5. 点击 "Add" 保存

### 7.5 示例配置

**示例 1：GMV（总交易额）= 已完成订单的金额总和**
```yaml
Metric Key: gmv
Label: 总交易额
Aggregation: sum
Column: 实付金额
WHERE:
  - Column: 订单状态
    Operator: =
    Value: "已完成"
```
生成的 SQL：
```sql
SUM(实付金额) WHERE 订单状态 = '已完成'
```

**示例 2：客单价（AOV）= 平均订单金额**
```yaml
Metric Key: aov
Label: 客单价
Aggregation: avg
Column: 实付金额
WHERE: (无)
```
生成的 SQL：
```sql
AVG(实付金额)
```

**示例 3：独立用户数（UV）**
```yaml
Metric Key: uv
Label: 独立用户数
Aggregation: count_distinct
Column: 用户ID
WHERE: (无)
```
生成的 SQL：
```sql
COUNT(DISTINCT 用户ID)
```

**示例 4：大额订单数（金额 > 1000）**
```yaml
Metric Key: high_value_orders
Label: 大额订单数
Aggregation: count
Column: (不需要)
WHERE:
  - Column: 实付金额
    Operator: >
    Value: 1000
```
生成的 SQL：
```sql
COUNT(*) WHERE 实付金额 > 1000
```

### 7.6 使用自定义指标

**配置完成后，你可以直接查询：**

| 查询输入 | 预期结果 |
|---------|---------|
| `计算GMV` | 返回总交易额（应用 WHERE 条件） |
| `最近7天的GMV趋势` | 按天分组统计 GMV |
| `各地区的GMV对比` | 按地区分组统计 GMV |
| `客单价是多少` | 返回 AOV 值 |
| `独立用户数` | 返回 UV 统计 |

### 7.7 Override 系统指标

**场景：** 系统内置的 `gmv` 定义是 `SUM(amount)`，但你的业务规则是只算已支付的订单。

**操作步骤：**
1. 在 Custom Metrics 中添加指标，Key = `gmv`（与系统指标同名）
2. 定义你自己的聚合逻辑和 WHERE 条件
3. 保存配置

**结果：**
- 在 "系统内置指标" 区域，`gmv` 右侧显示橙色 Tag："用户覆盖"
- 查询 "计算GMV" 时，使用你的自定义逻辑

### 7.8 编辑和删除

**编辑指标：**
1. 在 Custom Metrics 列表中找到要编辑的指标
2. 点击右侧的 **✏️ 编辑** 按钮
3. 修改字段后点击 "Update"

**删除指标：**
1. 点击指标右侧的 **🗑️ 删除** 按钮
2. 在确认对话框中点击 "Yes"

### 7.9 注意事项

⚠️ **L0 限制（当前版本）：**
- 仅支持基本聚合函数（count/sum/avg/min/max）
- 不支持窗口函数（如 ROW_NUMBER、RANK）
- 不支持子查询
- 不支持复杂表达式（如 `(amount - cost) / amount`）

⚠️ **安全限制：**
- Metric Key 只允许字母、数字、下划线
- Column 名称会进行 Zod 校验
- WHERE 条件与 Default Filters 规则相同

⚠️ **Digest 限制：**
- 如果定义超过 50 个指标，只有前 8 个会在 "Effective Settings" 中显示
- 其余指标仍可使用，但显示为 "+X more metrics..."

---

## 8. 透明度功能

### 8.1 什么是透明度功能？

透明度功能（Transparency Features）让你清楚看到：
- ✅ AI 使用了哪个 Skill（analysis.v1 / nl2sql.v1）
- ✅ 是否应用了你的 User Skill 配置
- ✅ 具体生效了哪些字段映射、过滤条件、指标定义

### 8.2 查看方式

**在每次查询结果中：**
1. 查询成功后，找到结果卡片
2. 点击 **"查看AI思考过程"** 展开面板
3. 在面板顶部可以看到 **3 行标签**
4. 向下滚动可以看到 **"3. 本次生效配置 (Effective Settings)"**

### 8.3 标签详解

**标签显示位置：** "查看AI思考过程" 面板顶部

**标签 1：[Skill] analysis.v1**
- **颜色：** 蓝色
- **含义：** 本次查询使用的 Skill 类型
- **可能的值：**
  - `analysis.v1` - 智能分析 Skill（带查询分类）
  - `nl2sql.v1` - 传统 NL2SQL Skill

**标签 2：[Industry] ecommerce**
- **颜色：** 绿色
- **含义：** 当前表配置的行业
- **显示条件：** 仅在配置了 Industry 时显示
- **可能的值：** ecommerce / finance / retail / custom

**标签 3：[UserSkill] applied: yes, 534/1200 chars**
- **颜色：** 橙色（已应用）或灰色（未配置）
- **含义：** User Skill 配置状态和 Digest 大小
- **显示格式：**
  - 已应用：`applied: yes, XXX/1200 chars`（XXX 是实际字符数）
  - 未配置：`not configured`

### 8.4 Effective Settings 详解

**显示位置：** "查看AI思考过程" 面板，第 3 步

**内容结构：**
```
3. 本次生效配置 (Effective Settings)
┌─────────────────────────────────────────┐
│ Table: main_table_1                     │
│                                          │
│ Field Mapping:                           │
│   • Time: 下单时间                       │
│   • Amount: 实付金额                     │
│   • OrderId: 订单ID                      │
│   • UserId: 用户ID                       │
│                                          │
│ Default Filters: (3 total)              │
│   • 订单状态 = "已完成"                  │
│   • 实付金额 > 0                         │
│   • 下单时间 >= (relative: 30 days ago) │
│                                          │
│ Metrics: (5 total)                      │
│   • gmv: sum(实付金额)                   │
│   • order_count: count(*)               │
│   • aov: avg(实付金额)                   │
│   • uv: count_distinct(用户ID)          │
│   • high_value_orders: count(*)         │
└─────────────────────────────────────────┘
```

**字段说明：**
- **Table**：当前查询的表名
- **Field Mapping**：显示已配置的 4 个字段映射
  - 如果未配置，显示 "Not configured"
- **Default Filters**：显示前 5 个默认过滤条件
  - 如果超过 5 个，显示 "+X more filters..."
- **Metrics**：显示前 8 个自定义指标
  - 如果超过 8 个，显示 "+X more metrics..."

### 8.5 透明度场景示例

**场景 1：完整配置**
- 输入：`计算GMV`
- 标签显示：
  - [Skill] analysis.v1
  - [Industry] ecommerce
  - [UserSkill] applied: yes, 456/1200 chars
- Effective Settings 显示：
  - Field Mapping、Default Filters、Metrics 都完整显示

**场景 2：无配置**
- 输入：`总共有多少订单`
- 标签显示：
  - [Skill] nl2sql.v1
  - [UserSkill] not configured
- Effective Settings：不显示（因为无配置）

**场景 3：部分配置（仅 Field Mapping）**
- 输入：`按天统计订单数趋势`
- 标签显示：
  - [Skill] analysis.v1
  - [Industry] ecommerce
  - [UserSkill] applied: yes, 123/1200 chars
- Effective Settings 显示：
  - Field Mapping: time=下单时间
  - Default Filters: (不显示，因为无配置)
  - Metrics: (不显示，因为无配置)

---

## 9. 常见场景与最佳实践

### 9.1 电商订单分析

**业务场景：** 分析订单数据，关注 GMV、客单价、用户行为

**推荐配置：**
```yaml
Industry: ecommerce

Field Mapping:
  - Time Column: 下单时间
  - Amount Column: 实付金额
  - Order ID Column: 订单ID
  - User ID Column: 用户ID

Default Filters:
  - 订单状态 in ["已完成", "已支付"]
  - 实付金额 > 0

Metrics:
  - gmv (总交易额): sum(实付金额) where 订单状态='已完成'
  - aov (客单价): avg(实付金额)
  - uv (独立用户数): count_distinct(用户ID)
```

**常用查询：**
- "最近7天的GMV趋势"
- "各地区的客单价对比"
- "独立用户数是多少"

---

### 9.2 金融交易监控

**业务场景：** 监控交易流水，关注交易金额、账户活跃度

**推荐配置：**
```yaml
Industry: finance

Field Mapping:
  - Time Column: 交易时间
  - Amount Column: 交易金额
  - Order ID Column: 交易流水号
  - User ID Column: 账户ID

Default Filters:
  - 交易状态 = "成功"
  - 交易金额 >= 0

Metrics:
  - total_amount (总交易额): sum(交易金额)
  - avg_transaction (平均交易额): avg(交易金额)
  - active_accounts (活跃账户数): count_distinct(账户ID)
```

**常用查询：**
- "今天的总交易额"
- "大额交易数量（>10000）"
- "活跃账户数趋势"

---

### 9.3 零售门店管理

**业务场景：** 分析门店销售数据，关注销售额、客流量

**推荐配置：**
```yaml
Industry: retail

Field Mapping:
  - Time Column: 销售时间
  - Amount Column: 销售金额
  - Order ID Column: 交易单号
  - User ID Column: 会员ID

Default Filters:
  - 交易类型 = "销售"
  - 销售金额 > 0

Metrics:
  - total_sales (总销售额): sum(销售金额)
  - transaction_count (交易笔数): count(*)
  - avg_basket_size (平均客单价): avg(销售金额)
```

**常用查询：**
- "各门店的销售额排名"
- "本周交易笔数趋势"
- "平均客单价是多少"

---

### 9.4 最佳实践总结

✅ **推荐做法：**
1. **先设置 Industry**：让 AI 加载行业知识
2. **必须配置 Time Column**：避免趋势查询时的澄清
3. **优先配置常用指标**：减少重复解释业务逻辑
4. **使用相对时间过滤**：自动适应"最近N天"的查询
5. **定期检查 Digest 大小**：保持在 1200 字符以内

❌ **避免做法：**
1. **不要过度配置**：超过 20 个 Filters 或 50 个 Metrics
2. **不要在 Filter Value 中输入 SQL 代码**：会被 Zod 拦截
3. **不要为静态数据配置时间过滤**：无时间字段时不需要
4. **不要用中文作为 Metric Key**：使用英文标识符

---

## 10. 故障排查与 FAQ

### 10.1 配置未生效

**问题：** 我配置了 Default Filters，但查询结果没有应用过滤条件

**排查步骤：**
1. **检查配置是否保存**：
   - 点击 "Save Configuration" 后是否有成功提示？
   - 重新打开配置界面，检查 Filters 是否还在

2. **检查表名是否正确**：
   - 当前查询的表是 `main_table_1`，配置的也是 `main_table_1` 吗？
   - 如果有多个表，确保配置的是正确的表

3. **查看 Effective Settings**：
   - 展开 "查看AI思考过程"
   - 查看 "3. 本次生效配置" 是否显示你的 Filters
   - 如果没有显示，说明配置未加载

4. **检查 Console 日志**：
   - 打开浏览器开发者工具（F12）
   - 查看 Console 是否有错误日志：
     - `[agentRuntime] Failed to load user skill config`
     - `[filterCompiler] Failed to compile filter`

**解决方案：**
- 清空浏览器缓存（Chrome Storage），重新配置
- 检查 Filter 的 Column 名称是否与数据文件一致（区分大小写）
- 确认 Filter Value 格式正确（字符串用引号，数组用中括号）

---

### 10.2 标签不显示

**问题：** 查询成功，但 "查看AI思考过程" 中没有标签

**排查步骤：**
1. **检查是否展开了面板**：点击 "查看AI思考过程" 才能看到标签
2. **检查 User Skill 是否配置**：
   - 无配置时只显示 `[Skill]` 和 `[UserSkill] not configured`
   - 有配置时才显示 `[Industry]` 和完整的 `[UserSkill]`
3. **检查浏览器版本**：确保 Chrome 版本 >= 120

**解决方案：**
- 如果确认已配置但标签不显示，尝试清除浏览器缓存
- 重新加载 Chrome Extension（chrome://extensions → 点击刷新图标）

---

### 10.3 Digest 超出限制

**问题：** 配置了很多 Filters 和 Metrics，提示 Digest 超过 1200 字符

**排查步骤：**
1. **查看当前 Digest 大小**：
   - 展开 "查看AI思考过程"
   - 查看标签：`[UserSkill] applied: yes, XXX/1200 chars`
   - 如果 XXX > 1200，说明超出限制

2. **检查配置数量**：
   - Default Filters > 20 个？
   - Metrics > 50 个？

**解决方案：**
- **精简 Filters**：合并相似条件（多个 `=` 改为一个 `in`）
- **精简 Metrics**：删除不常用的指标
- **使用系统指标**：尽量用系统内置指标，减少自定义指标数量
- **检查 Column 名称**：过长的中文列名会占用更多字符

**Digest 优化示例：**
```yaml
# 优化前（占用 ~200 字符）
Filters:
  - 订单状态 = "已完成"
  - 订单状态 = "已支付"
  - 订单状态 = "待发货"
  - 订单状态 = "已发货"

# 优化后（占用 ~80 字符）
Filters:
  - 订单状态 in ["已完成", "已支付", "待发货", "已发货"]
```

---

### 10.4 查询仍然触发澄清

**问题：** 我配置了 Time Column，但查询 "按天统计订单数趋势" 仍然要求澄清时间字段

**排查步骤：**
1. **检查 Field Mapping 是否保存**：重新打开配置界面确认
2. **查看 Effective Settings**：
   - 展开 "查看AI思考过程"
   - 查看 "Field Mapping" 是否显示 `time=XXX`
3. **检查查询措辞**：
   - 尝试更明确的查询："按天统计订单数，时间用下单时间"
   - 查看是否仍然澄清

**解决方案：**
- 确保 Time Column 配置的列名与数据文件完全一致
- 如果数据文件中有多个时间字段，在查询中明确指定
- 检查 Skill 是否正确识别（标签是否显示 `analysis.v1`）

---

### 10.5 常见问题（FAQ）

**Q1: User Skill 配置会被其他用户看到吗？**  
A: 不会。User Skill 配置存储在浏览器本地（Chrome Storage），只有你自己能看到。

**Q2: 可以为同一个表配置多套 User Skill 吗？**  
A: 不可以。每个表只能有一套配置。如果需要不同的分析视角，建议上传多个文件。

**Q3: Default Filters 会影响所有查询吗？**  
A: 是的。所有查询都会自动应用 Default Filters，除非你在查询中明确覆盖。

**Q4: Metric Key 可以用中文吗？**  
A: 不建议。Metric Key 用于 Prompt 注入，使用英文标识符更稳定（如 `gmv`、`aov`）。Label 可以用中文。

**Q5: 配置会随着 Chrome Extension 更新而丢失吗？**  
A: 不会。配置存储在 Chrome Storage（sync），只要浏览器账号同步，配置会保留。

**Q6: 可以导出/导入 User Skill 配置吗？**  
A: 当前版本不支持。计划在 M11 中添加导入/导出功能。

**Q7: System Metrics 可以编辑吗？**  
A: 不可以直接编辑。但你可以添加同名的 Custom Metric 来覆盖（Override）。

**Q8: 如何清空某个表的配置？**  
A: 在配置界面底部点击 "Clear Config" 按钮，确认后清空。

**Q9: 相对时间过滤支持哪些单位？**  
A: 支持 day（天）、week（周）、month（月）、year（年）。

**Q10: 为什么我的自定义指标没有出现在查询结果中？**  
A: 检查：
- Metric Key 是否拼写正确（查询时要用这个 key）
- 是否保存了配置
- 查看 Effective Settings 是否显示这个指标

---

## 11. 附录

### 11.1 技术限制

**当前版本（M10.4 + M10.5）的限制：**
- ✅ 支持单表场景（activeTable = 第一个上传的文件）
- ❌ 不支持多表 JOIN（计划 M11 支持）
- ✅ Metrics 仅支持 L0 聚合（count/sum/avg/min/max）
- ❌ 不支持窗口函数、子查询、复杂表达式（计划 M12 支持）
- ✅ Digest 限制 1200 字符（自动裁剪）
- ❌ 不支持配置导入/导出（计划 M11 支持）

### 11.2 字符限制

| 配置项 | 最大数量 | Digest 占用估算 | 超出处理 |
|-------|---------|----------------|---------|
| **Field Mapping** | 4 个字段 | ~50 字符 | 不裁剪（必须保留） |
| **Default Filters** | 建议 ≤ 20 个 | ~20 字符/条 | 只显示前 5 条 |
| **Metrics** | 建议 ≤ 50 个 | ~30 字符/个 | 只显示前 8 个 |
| **总 Digest** | - | ≤ 1200 字符 | 自动裁剪 + 警告 |

### 11.3 性能基准

| 操作 | 目标延迟 | 实测值（参考） |
|------|---------|---------------|
| 打开配置界面 | < 500ms | ~200ms |
| 保存配置 | < 1s | ~300ms |
| 加载配置（查询时） | < 100ms | ~50ms |
| Digest 构建 | < 100ms | ~80ms |
| Query Type Router | < 50ms | ~10ms（keyword path） |

### 11.4 Zod 校验规则

**Column Name（列名）：**
- 允许：字母、数字、下划线、中文字符
- 禁止：SQL 关键字、特殊符号（`'`, `"`, `;`, `--`, `/*`, `*/`）
- 正则：`/^[\w\u4e00-\u9fa5]+$/`

**Metric Key（指标标识）：**
- 允许：字母、数字、下划线
- 禁止：空格、中文、特殊符号
- 正则：`/^[a-zA-Z0-9_]+$/`

**Filter Value（过滤值）：**
- 字符串：最大长度 1000 字符
- 数组：最多 100 个元素
- 相对时间：amount 最大 3650（10 年）

**Metrics 数量：**
- 最多 50 个（Zod 校验）
- 建议 ≤ 20 个（性能考虑）

**Filters 数量：**
- 最多 50 个（Zod 校验）
- 建议 ≤ 20 个（性能考虑）

### 11.5 相关文档

- **M10.4 设计文档：** `design/refactor2.md` 第 5.13.11 节
- **M10.5 验收文档：** `session-state/.../M10.5-acceptance.md`
- **M8 回归测试：** `design/m8-regression.md`
- **Type 定义：** `src/services/llm/skills/types.ts`

---

## 12. 反馈与支持

### 12.1 报告问题

如果你遇到问题，请提供以下信息：
1. 浏览器版本（Chrome 版本号）
2. 数据文件信息（列名、行数）
3. User Skill 配置（截图或 JSON）
4. 查询输入和预期结果
5. Console 日志（打开 F12 → Console）

### 12.2 功能建议

我们欢迎你的建议！常见的需求方向：
- 支持更多行业（healthcare、logistics 等）
- L1 Metrics（窗口函数、复杂表达式）
- 配置模板（一键导入常见场景配置）
- 多表 JOIN 支持
- 协同编辑（团队共享配置）

---

**文档版本：** v1.0  
**创建日期：** 2026-01-25  
**维护者：** Vaultmind Team  
**适用版本：** M10.4 + M10.5  

**祝你使用愉快！🎉**
