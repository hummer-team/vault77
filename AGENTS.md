# Vaultmind — AGENTS.md (Harness Intent Layer)

> **Harness Engineering — Intent 层**
> 本文件定义项目架构意图与模块边界，是 AI 开始工作前的首要上下文。
> 详细变更日志见 `CHANGELOG.md`；工作流约束见 `.github/instructions/rule.instructions.md`。

---

## ⚡ Harness 声明（AI 必须首先读取）

本项目实施 **Harness Engineering** 原则。每次会话开始前，完成 Feedforward 检查：

| 层 | 文件 | 目的 |
|----|------|------|
| Intent | `AGENTS.md`（本文件）| 理解项目架构和模块边界 |
| Planning/Authority | `.github/instructions/rule.instructions.md` | 工作流、权限约束、禁止行为 |
| Constraints | `.github/copilot-instructions.md` | TypeScript/React 技术规范 |
| Verification | `.github/instructions/codereview.instructions.md` | 交付验收门控 |

### 模块职责边界（Hard Boundaries）

| 层级 | 路径 | 职责 | 禁止 |
|------|------|------|------|
| UI | `src/components/`, `src/pages/` | 展示与交互 | 禁止直接调用 DuckDB / fetch |
| Hooks | `src/hooks/` | 状态与副作用桥接 | 禁止包含业务 SQL |
| Services | `src/services/` | 业务逻辑与 LLM 编排 | 禁止直接操作 DOM |
| Workers | `src/workers/` | 重计算隔离 | 禁止 import React |

### 关键设计决策（不得推翻）
- DuckDB 运行在 Web Worker，主线程只能通过 `postMessage` 通信（COOP/COEP 隔离）
- 全局状态统一用 Zustand，禁止用 Context 替代
- LLM 调用统一经过 `AgentExecutor` / `agentRuntime`，禁止组件层直接调用 OpenAI SDK
- Chrome Extension Manifest V3：禁止 `eval`、`innerHTML` 赋值、动态脚本注入
- **主题色切换系统（Theme Switching）：** 所有颜色必须使用 CSS 变量，禁止硬编码颜色值。详见 [主题切换技术原则](#主题切换技术原则)

---

## 一、项目概览

**Vaultmind** 是一个 **Agent-Driven Analytics Workbench**，以 Chrome Extension 形式交付，允许用户通过构建分析流模板分析 Excel/CSV，并通过 LLM 自然语言进行决策推演。

**核心技术架构**:
```
UI (React + Ant Design Dark)
    ↓
useLLMAgent / AgentRuntime
    ↓
LLM Client (OpenAI) + Skills (nl2sql.v1, analysis.v1)
    ↓
Tools (sql_query_tool)
    ↓
DuckDB WASM Worker (In-Browser SQL Engine)
```

**业务算子架构**:
```
FlowCanvas（画布拖拽节点）
    ↓ 节点路由（bizKernelsBuilderStrategies.ts）
FlowStrategy（interface）
    └── BaseStrategy（abstract）          ← strategies.ts
          └── UdfBaseStrategy（abstract） ← strategies/udfBaseStrategy.ts
                ├── UdfReplaceColumnStrategy   — 替换特定列值（udf_replace_spec_column_value）
                ├── UdfUpLowerStrategy         — 大小写转换（udf_up_lower_str）
                ├── UdfFormatNumberStrategy    — 数字精度控制（udf_format_number）
                ├── UdfFlagSpecStrategy        — 数据标记（udf_flag_spec_column）
                └── UdfFormatDateStrategy      — 日期时间格式化（udf_format_date_time）
    ↓ buildSql() → DuckDB MACRO 调用
DuckDB WASM Worker（design/udf.sql 中注册的 MACRO）
```

**业务算子关键约束**：
- 所有 UDF 策略必须继承 `UdfBaseStrategy`（禁止直接 `implements FlowStrategy`）
- 多表关联时，`tbl` 参数为子查询字符串（以 `(` 开头）；单表时为表名字符串
- 条件列引用格式：单表用 `"table"."col"`；多表子查询用 `"table.col"`（点在别名内，MACRO 内部别名为 `__src`）
- `UdfBaseStrategy.buildUdfConditionSql()` 统一处理条件构建与多表列引用重写，禁止在子类中重复实现
- DuckDB JSONPath 语法：使用 `$."key"` 而非 `$["key"]`（后者不被 DuckDB 支持）
- `design/udf.sql` 中的注释不得包含分号（服务层按 `;` 分割语句逐条执行）

**可复用工具函数**：
| 函数 | 文件 | 用途 |
|------|------|------|
| `resolveColumnConflicts(tables)` | `strategies/columnRenaming.ts` | 多表同名列重命名为 `table.col` 格式 |
| `buildJoinSubquery(...)` | `strategies/udfShared.ts` | 构建多表 JOIN 子查询字符串 |
| `buildUdfConditionSql(...)` | `strategies/udfBaseStrategy.ts` | 统一构建 UDF 条件 SQL（含多表列引用重写）|

**技术栈**:
- Language: TypeScript 5.2.2 (Strict Mode) | Runtime: Bun
- Framework: React 18 + Ant Design 6 (Dark Theme)
- Data Engine: DuckDB-WASM + Apache Arrow
- LLM: OpenAI SDK / @mlc-ai/web-llm
- Build: Vite 5 + @crxjs/vite-plugin (Chrome Extension MV3)
- State: Zustand 5 | Validation: Zod 4 + zod-gpt

---

## 二、关键文件速查表

### LLM / Agent 层
| 文件 | 职责 |
|------|------|
| `src/services/llm/agentRuntime.ts` | Agent 运行时核心：Skill 加载 → Query Router → Digest → 执行 → 元数据 |
| `src/services/llm/agentExecutor.ts` | 行业动态选择、行业开关校验、快速失败策略 |
| `src/services/llm/promptManager.ts` | 多行业 Prompt 模板管理，降级到 ecommerce |
| `src/services/llm/rewrite.ts` | 模糊查询检测，触发澄清 |
| `src/services/llm/skills/queryTypeRouter.ts` | 双层路由：Skill 选择 + Query 类型分类（95%+ 准确率，<50ms）|
| `src/services/llm/skills/core/digestBuilder.ts` | Schema/UserSkill/SystemSkillPack Digest 构建（总预算 ~8000 chars）|
| `src/services/llm/skills/core/filterCompiler.ts` | FilterExpr → DuckDB SQL（date_add，非 INTERVAL 减法）|
| `src/services/llm/skills/builtin/analysis.v1.ts` | 分析 Skill（双引号标识符，聚合无 LIMIT）|
| `src/services/tools/duckdbTools.ts` | sql_query_tool + IndustryNotEnabledError |
| `src/services/flags/featureFlags.ts` | 行业功能开关（ecommerce/finance/retail）|
| `src/prompts/{ecommerce,finance,retail}.ts` | 行业 system_prompt + tool_selection_template + suggestions |

### DuckDB / Data 层
| 文件 | 职责 |
|------|------|
| `src/workers/duckdb.worker.ts` | DuckDB WASM Worker（**受保护资产**）|
| `src/services/duckDBService.ts` | DuckDB 操作封装，BigInt 序列化（_normalizeBigIntFields）|
| `src/hooks/useDuckDB.ts` | 主线程 ↔ Worker 通信封装 |
| `src/hooks/useFileParsing.ts` | 文件解析 → DuckDB 注册（sandbox/iframe）|

### UI / Flow Canvas 层
| 文件 | 职责 |
|------|------|
| `src/pages/workbench/index.tsx` | 主界面：状态管理、文件上传、调度 agentRuntime |
| `src/pages/workbench/components/FlowCanvas.tsx` | SQL Flow 可视化画布（ReactFlow），节点路由策略 |
| `src/pages/workbench/components/ResultsDisplay.tsx` | 查询结果 + Skill 元数据标签 + Effective Settings Panel |
| `src/components/flow/nodes/SelectNode.tsx` | 字段选择节点（UDF/Standard 双路由）|
| `src/components/flow/nodes/ConditionDefinitionNode.tsx` | 条件定义节点（动态字段、占位符 {refId}_{index}）|
| `src/components/flow/panels/NodeDetailPanel.tsx` | 右侧详情面板（非 UDF 节点）|
| `src/components/flow/udf/ReplaceColumnDrawer.tsx` | UDF 专用抽屉（替换特定列值）|
| `src/services/flow/bizKernelsBuilderStrategies.ts` | SelectNode 点击路由策略（resolveSelectNodePanelType）|
| `src/components/flow/panels/ValueFillPanel.tsx` | 占位符值填充面板 |
| `src/pages/settings/ProfilePage.tsx` | User Skill 配置 UI |

### User Skill / Schema
| 文件 | 职责 |
|------|------|
| `src/services/userSkill/userSkillService.ts` | User Skill 持久化（chrome.storage.local）|
| `src/services/userSkill/userSkillSchema.ts` | Zod 校验 + SQL 注入防护黑名单 |
| `src/services/llm/skills/types.ts` | User Skill L0 类型定义 |

### 业务算子 / UDF 层
| 文件 | 职责 |
|------|------|
| `design/udf.sql` | 全部 DuckDB MACRO 定义，启动时注册；**JSONPath 用 `$."key"` 语法；注释禁止含 `;`** |
| `src/services/flow/strategies.ts` | `BaseStrategy`（exported abstract）+ `buildWhereClauseWithPlaceholders` |
| `src/services/flow/strategies/udfBaseStrategy.ts` | `UdfBaseStrategy`（所有 UDF 策略的公共抽象基类）|
| `src/services/flow/strategies/udfReplaceColumnStrategy.ts` | 替换特定列值：多表 JOIN + 列冲突重命名 + 条件 SQL |
| `src/services/flow/strategies/udfUpLowerStrategy.ts` | 大小写转换 UDF 策略 |
| `src/services/flow/strategies/udfFormatNumberStrategy.ts` | 数字精度控制 UDF 策略 |
| `src/services/flow/strategies/udfFlagSpecStrategy.ts` | 数据标记 UDF 策略 |
| `src/services/flow/strategies/udfFormatDateStrategy.ts` | 日期时间格式化 UDF 策略 |
| `src/services/flow/strategies/udfShared.ts` | `buildJoinSubquery` / `resolveColumnConflicts` / `escapeSql` 共享工具 |
| `src/services/flow/strategies/columnRenaming.ts` | `resolveColumnConflicts` — 多表同名列重命名算法（可复用）|
| `src/services/duckDBUdfService.ts` | UDF 注册服务：读取 `design/udf.sql`，按 `;` 分割逐条执行 |

---

## 三、受保护资产（未经明确指令禁止修改）

```
src/workers/duckdb.worker.ts        — DuckDB Worker 核心
src/services/llm/agentExecutor.ts   — Agent 核心执行链
vite.config.ts                      — 构建配置
tsconfig.json / tsconfig.node.json  — TS 编译配置
package.json                        — 依赖变更需人类审批
```

---

## 四、主题切换技术原则

### 总体规则（绝对约束）

**禁止硬编码任何颜色值。所有颜色必须使用 CSS 变量引用。**

| 禁止 | 替代方案 |
|------|---------|
| `color: 'white'` | `color: 'var(--vm-text-primary)'` |
| `backgroundColor: '#1f1f1f'` | `backgroundColor: 'var(--vm-bg-base)'` |
| `borderColor: 'rgba(255,255,255,0.1)'` | `borderColor: 'var(--vm-border-subtle)'` |
| `fill: '#FF6B00'` | `fill: 'var(--vm-primary)'` |

### 三主题架构

Vaultmind 支持 3 个完整的视觉主题，**所有主题有相同的 CSS 变量键（71 个），仅值不同**：

| 主题 | 文件 | 背景色 | 文字色 | 强调色 |
|------|------|--------|--------|--------|
| **Light Orange** | `src/theme/themes/lightOrange.ts` | 浅色 (#F9FAFB) | 深色 (Slate-900) | 橙色 (#FF8C00) |
| **Orange Dark** | `src/theme/themes/orangeDark.ts` | 深色 (#0B0E14) | 浅色 (白色) | 橙色 (#FF6B00) |
| **Cyan Dark** | `src/theme/themes/cyanDark.ts` | 深色 (#0B0E14) | 浅色 (白色) | 青色 (#00D2FF) |

### CSS 变量分类（必须使用）

#### 1. 布局颜色
```typescript
--vm-layout-bg           // 页面背景（Light: #F9FAFB, Dark: #0B0E14）
--vm-sider-bg            // 侧边栏（始终保持深色）
--vm-bg-base             // 基础背景（卡片、容器）
--vm-bg-card             // 卡片背景
--vm-bg-header           // 头部背景（表头、抽屉头）
```

#### 2. 文字颜色
```typescript
--vm-text-primary        // 主文字（标题、导航）Light: Slate-900, Dark: 白色
--vm-text-secondary      // 辅助文字（描述、标签）Light: Slate-600, Dark: 白色 70%
--vm-text-muted          // 禁用文字（占位符、提示）Light: Slate-500, Dark: 白色 50%
--vm-text-helper         // 帮助文字
--vm-text-light          // 浅色文字变体
```

#### 3. 边框颜色
```typescript
--vm-border-subtle       // 微妙边框（分割线、网格）
--vm-border-mid          // 中等边框（输入框、卡片）
```

#### 4. 交互颜色
```typescript
--vm-primary             // 品牌色（按钮、链接、高亮）
--vm-surface-light       // 浅层叠加（输入框背景）
--vm-surface-hover       // 悬停状态（hover 时背景）
```

#### 5. 语义颜色
```typescript
--vm-color-error         // 错误（红色）
--vm-color-success       // 成功（绿色）
--vm-color-warning       // 警告（橙色/黄色）
--vm-color-info          // 信息（蓝色）
```

#### 6. 流程图颜色
```typescript
--vm-flow-node-bg        // 节点背景
--vm-flow-canvas-bg      // 画布背景
--vm-flow-shadow-*       // 阴影效果
```

#### 7. 表格颜色
```typescript
--vm-table-header-bg     // 表头背景
--vm-table-header-color  // 表头文字
--vm-table-cell-color    // 表格单元格文字
--vm-table-row-hover-bg  // 行悬停背景
```

### 新增页面/组件的实现清单

新增任何页面或组件时，**必须完整执行以下检查**：

#### ✅ 第 1 步：颜色审查
- [ ] 扫描所有颜色值：`backgroundColor`、`color`、`borderColor`、`fill`、`stroke`、`boxShadow`
- [ ] 确认没有硬编码颜色（#hex、rgba、named colors）
- [ ] 所有颜色都使用 `var(--vm-*)` 形式

#### ✅ 第 2 步：主题兼容性测试
- [ ] Light Orange 主题：背景浅、文字深、可读性强
- [ ] Orange Dark 主题：背景深、文字浅、橙色强调
- [ ] Cyan Dark 主题：背景深、文字浅、青色强调
- [ ] 确认所有主题下文字可读（无白文字在白背景等）

#### ✅ 第 3 步：组件类型检查
根据组件类型使用对应 CSS 变量：

**页面/容器：**
```typescript
<div style={{ background: 'var(--vm-layout-bg)', color: 'var(--vm-text-primary)' }}>
  {/* 内容 */}
</div>
```

**卡片/面板：**
```typescript
<div style={{
  background: 'var(--vm-bg-card)',
  color: 'var(--vm-text-primary)',
  borderColor: 'var(--vm-border-subtle)',
}}>
  {/* 内容 */}
</div>
```

**表格：**
```typescript
<Table
  columns={columns}
  styles={{
    header: { background: 'var(--vm-table-header-bg)' },
  }}
  className="theme-aware-table"
/>
```

**图表（ECharts）：**
```typescript
import { useEChartsTheme } from '@/theme/useEChartsTheme';

const MyChart = () => {
  const ec = useEChartsTheme();
  
  const options = {
    backgroundColor: ec.chartBg,  // 不使用 'transparent'
    textStyle: { color: ec.textColor },
    grid: { borderColor: ec.gridColor },
    // ...
  };
  
  const chart = echarts.init(ref, ec.isDarkTheme ? 'dark' : null);
  // ...
};
```

**抽屉/模态：**
```typescript
<Drawer
  styles={{
    header: { background: 'var(--vm-bg-header)' },
    body: { background: 'var(--vm-bg-base)', color: 'var(--vm-text-primary)' },
  }}
>
  {/* 内容 */}
</Drawer>
```

**表单输入：**
```typescript
<Input
  style={{
    background: 'var(--vm-surface-light)',
    color: 'var(--vm-text-primary)',
    borderColor: 'var(--vm-border-mid)',
  }}
/>
```

#### ✅ 第 4 步：构建验证
```bash
bun run build
# 确认：
# 1. TypeScript 0 errors
# 2. CSS variables all valid
# 3. No hardcoded colors in output
```

#### ✅ 第 5 步：视觉验证
- [ ] 在浏览器打开应用
- [ ] 测试 Light Orange 主题：所有文字深色、背景浅色
- [ ] 测试 Orange Dark 主题：所有文字浅色、背景深色、橙色强调
- [ ] 测试 Cyan Dark 主题：所有文字浅色、背景深色、青色强调
- [ ] 检查没有不可读的元素（文字对比度）

### 特殊情况处理

#### Light 主题的不透明度反转（关键！）
Light Orange 主题**必须使用黑色基础的不透明度**，因为背景是浅色：

```typescript
// ❌ 错误（白色基础，在浅色背景上不可见）
const lightThemeVar = 'rgba(255, 255, 255, 0.1)';  // 浅色透明度

// ✅ 正确（黑色基础，在浅色背景上可见）
const lightThemeVar = 'rgba(0, 0, 0, 0.1)';  // 深色透明度
```

#### ECharts Canvas 限制
ECharts 渲染到 HTML canvas，**无法直接读取 CSS 变量**。必须使用 `useEChartsTheme()` hook：

```typescript
import { useEChartsTheme } from '@/theme/useEChartsTheme';

const ec = useEChartsTheme();
// ec.chartBg      - 图表背景色
// ec.textColor    - 文字颜色
// ec.gridColor    - 网格线颜色
// ec.isDarkTheme  - 是否深色主题
```

#### 语义颜色的使用
功能颜色（错误、成功等）**不得自行定义**，必须使用主题定义的语义颜色：

```typescript
// ❌ 错误
<Alert message="Success" style={{ background: '#52c41a' }} />

// ✅ 正确
<Alert message="Success" style={{ background: 'var(--vm-color-success)' }} />
```

### 常见陷阱及排查

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 亮色主题文字不可见 | 使用 `--vm-text-primary` 但值为白色 | Light 主题中 `--vm-text-primary` = Slate-900（深色） |
| 表格在亮色主题不可读 | 表头/单元格背景仍为深色 | 使用 `--vm-table-*` 变量，不硬编码背景 |
| 图表背景错误 | ECharts 初始化时使用硬编码 'dark' | 动态使用 `ec.isDarkTheme ? 'dark' : null` |
| 边框在深色主题不可见 | 使用白色边框但透明度太低 | `--vm-border-subtle` 自动调整透明度 |
| 按钮在某个主题看不清 | 按钮颜色与背景色接近 | 使用 `--vm-primary` 确保足够对比度 |

### 检查清单（提交前必读）

```
主题切换系统检查清单
═════════════════════════════════════════

[ ] ✅ 已读本技术原则部分
[ ] ✅ 页面中没有硬编码颜色值
[ ] ✅ 所有颜色都使用 CSS var(--vm-*) 形式
[ ] ✅ Light Orange 主题测试通过
[ ] ✅ Orange Dark 主题测试通过
[ ] ✅ Cyan Dark 主题测试通过
[ ] ✅ 所有文字在所有主题下都可读
[ ] ✅ 表格/图表/抽屉都正确主题化
[ ] ✅ ECharts 图表使用 useEChartsTheme() hook
[ ] ✅ 构建成功（bun run build）
[ ] ✅ TypeScript 0 errors
[ ] ✅ 提交前运行了视觉验证

通过所有检查项后，可提交代码。
```

---
