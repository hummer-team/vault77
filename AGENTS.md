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

**核心约束:** 禁止硬编码任何颜色值。所有颜色使用 CSS 变量 `var(--vm-*)`。

### 三主题架构
71 个 CSS 变量相同，仅值不同：
- **Light Orange** (`src/theme/themes/lightOrange.ts`) — 浅色背景 + Slate-900 深色文字
- **Orange Dark** (`src/theme/themes/orangeDark.ts`) — 深色背景 + 橙色强调 (#FF6B00)
- **Cyan Dark** (`src/theme/themes/cyanDark.ts`) — 深色背景 + 青色强调 (#00D2FF)

### 常用 CSS 变量速查

| 用途 | 变量名 | 示例值 |
|------|--------|--------|
| 页面背景 | `--vm-layout-bg` | Light: #F9FAFB / Dark: #0B0E14 |
| 主文字 | `--vm-text-primary` | Light: #0F172A / Dark: #fff |
| 辅助文字 | `--vm-text-secondary` | Light: #475569 / Dark: rgba(255,255,255,0.7) |
| 卡片背景 | `--vm-bg-card` | 自动适配主题 |
| 品牌色 | `--vm-primary` | Light: #FF8C00 / Dark: #FF6B00 |
| 表头 | `--vm-table-header-bg` | 深色 |
| 表格文字 | `--vm-table-cell-color` | 自适应文字色 |
| 语义色（错误/成功） | `--vm-color-error/success/warning/info` | 语义定义 |
| 流程图背景 | `--vm-flow-node-bg` | 自适应 |
| ECharts 使用 | `useEChartsTheme()` hook | 详见下方 |

### 新增页面实现步骤

**第 1 步：颜色审查**
- 检查代码中是否有 `#hex`、`rgba()`、颜色名 → 全部改为 `var(--vm-*)`

**第 2 步：组件主题化**
- **页面/容器:** `background: 'var(--vm-layout-bg)', color: 'var(--vm-text-primary)'`
- **卡片/面板:** `background: 'var(--vm-bg-card)', borderColor: 'var(--vm-border-subtle)'`
- **表格:** 使用 `--vm-table-*` 变量（header-bg, cell-color, row-hover-bg）
- **ECharts:** 使用 `useEChartsTheme()` hook（见下文）
- **抽屉:** `background: 'var(--vm-bg-base)', color: 'var(--vm-text-primary)'`
- **输入框:** `background: 'var(--vm-surface-light)', borderColor: 'var(--vm-border-mid)'`

**第 3 步：ECharts 特殊处理**
```typescript
import { useEChartsTheme } from '@/theme/useEChartsTheme';

const ec = useEChartsTheme();
const options = {
  backgroundColor: ec.chartBg,      // ← 替代硬编码
  textStyle: { color: ec.textColor },
};
echarts.init(ref, ec.isDarkTheme ? 'dark' : null);
```

**第 4 步：完整测试**
- [ ] 3 个主题都测试（Light/Orange Dark/Cyan Dark）
- [ ] 所有文字在所有主题下可读
- [ ] 构建通过：`bun run build`

### 关键概念

**Light 主题不透明度反转（关键！）**
Light 主题背景浅，必须使用黑色基础透明度：
```typescript
// Dark 主题
--vm-border-subtle: rgba(255, 255, 255, 0.1);

// Light 主题（必须反转！）
--vm-border-subtle: rgba(0, 0, 0, 0.1);
```

**ECharts Canvas 限制**
Canvas 无法直接读 CSS 变量 → 必须用 `useEChartsTheme()` hook 注入颜色。

**语义颜色**
错误/成功/警告/信息颜色不得自定义，使用 `--vm-color-error/success/warning/info`。

### 常见陷阱
| 问题 | 原因 | 解决 |
|------|------|------|
| 亮色主题文字不可见 | Light 主题 `--vm-text-primary` 应为深色 | 检查 lightOrange.ts |
| 表格在亮色主题无法读 | 背景仍为深色 | 使用 `--vm-table-*` 变量 |
| 图表背景错误 | 硬编码 'dark' 或 'light' | 用 `ec.isDarkTheme ? 'dark' : null` |
| 边框看不见 | 透明度设置不对 | `--vm-border-subtle` 自动处理 |

### 提交前检查清单
```
[ ] 无硬编码颜色（#hex, rgba, 颜色名）
[ ] 所有颜色用 var(--vm-*) 或 useEChartsTheme()
[ ] Light Orange 主题测试通过
[ ] Orange Dark 主题测试通过  
[ ] Cyan Dark 主题测试通过
[ ] ECharts 用 useEChartsTheme() hook
[ ] bun run build 成功
```

---
