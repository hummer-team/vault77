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
