# Vaultmind — AGENTS.md (Harness Intent Layer)

> **Harness Engineering — Intent 层**
> 定义项目架构意图与模块边界，是 AI 开始工作前的首要上下文。

---

## ⚡ Harness Feedforward 检查（按顺序读取）

| 层 | 文件 | 目的 |
|----|------|------|
| Intent | `AGENTS.md`（本文件）| 项目架构与模块边界 |
| Authority | `.github/instructions/rule.instructions.md` | 工作流、权限约束、禁止行为 |
| Constraints | `.github/copilot-instructions.md` | TypeScript/React 技术规范 |
| Verification | `.github/instructions/codereview.instructions.md` | 交付验收门控 |
| Strategy | `.github/instructions/strategy-pattern-rules.md` | 算子策略模式规则（新增算子必读）|
| Theme | `.github/instructions/theme.instructions.md` | 主题/颜色规范（UI 开发必读）|

> ⛔ **未完成 Feedforward 检查，禁止开始任何代码修改。**

---

## 一、项目概览

**Vaultmind** — Chrome Extension 形式的 **Agent-Driven Analytics Workbench**。用户通过可视化流程画布构建分析模板，对 Excel/CSV 数据执行 SQL 分析，并通过 LLM 自然语言进行决策推演。

**技术栈**: TypeScript 5 (Strict) · React 18 · Ant Design 6 · DuckDB-WASM · OpenAI SDK · Zustand 5 · Vite 5 · Chrome MV3

### 核心架构

```
UI (React + Ant Design)
    ↓
AgentRuntime / AgentExecutor
    ↓
LLM Client (OpenAI) + Skills (nl2sql.v1, analysis.v1)
    ↓
sql_query_tool
    ↓
DuckDB WASM Worker
```

### 业务算子架构

```
FlowCanvas → bizKernelsBuilderStrategies（节点路由）
    ↓
FlowStrategy (interface)
  └── BaseStrategy (abstract)          ← strategies.ts
        ├── [业务分析算子]              ← 继承 BaseStrategy
        └── UdfBaseStrategy (abstract) ← strategies/udfBaseStrategy.ts
              └── [UDF 数据清洗算子]   ← 继承 UdfBaseStrategy
    ↓
DuckDB WASM Worker（design/udf.sql 注册 MACRO）
```

---

## 二、模块职责边界（Hard Boundaries）

| 层级 | 路径 | 职责 | 禁止 |
|------|------|------|------|
| UI | `src/components/`, `src/pages/` | 展示与交互 | 直接调用 DuckDB / fetch |
| Hooks | `src/hooks/` | 状态与副作用桥接 | 包含业务 SQL |
| Services | `src/services/` | 业务逻辑与 LLM 编排 | 直接操作 DOM |
| Workers | `src/workers/` | 重计算隔离 | import React |

---

## 三、关键设计决策（不得推翻）

- **DuckDB** 运行在 Web Worker，主线程只能通过 `postMessage` 通信（COOP/COEP 隔离）
- **全局状态** 统一用 Zustand，禁止用 Context 替代
- **LLM 调用** 统一经过 `AgentExecutor` / `agentRuntime`，禁止组件层直接调用 OpenAI SDK
- **Chrome MV3**：禁止 `eval`、`innerHTML` 赋值、动态脚本注入
- **颜色**：禁止硬编码，一律使用 `var(--vm-*)` CSS 变量，详见 `theme.instructions.md`

---

## 四、目录结构

```
src/
├── components/         # 通用 UI 组件（flow 节点、抽屉、面板）
├── pages/              # 页面级组件（workbench、settings）
├── hooks/              # React Hooks（useDuckDB、useFileParsing 等）
├── services/
│   ├── llm/            # Agent 运行时、Skills、PromptManager
│   ├── flow/           # 算子策略（strategies.ts + strategies/）
│   ├── userSkill/      # User Skill 持久化与校验
│   ├── flags/          # 行业功能开关
│   └── tools/          # LLM 工具（sql_query_tool）
├── workers/            # DuckDB WASM Worker（受保护）
├── theme/              # 三主题定义 + useEChartsTheme hook
├── prompts/            # 行业 system prompt（ecommerce/finance/retail）
└── store/              # Zustand stores

design/                 # 设计文档与 SQL（udf.sql 算子 MACRO 定义）
```

---

## 五、受保护资产（未经明确指令禁止修改）

```
src/workers/duckdb.worker.ts        — DuckDB Worker 核心
src/services/llm/agentExecutor.ts   — Agent 核心执行链
vite.config.ts                      — 构建配置
tsconfig.json / tsconfig.node.json  — TS 编译配置
package.json                        — 依赖变更需人类审批
```

---
