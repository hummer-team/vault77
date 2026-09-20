## 一、项目概览

**Vaultmind** — Chrome Extension 形式的 **Agent-Driven Analytics Workbench**。用户通过可视化流程画布构建分析模板，对 Excel/CSV 数据执行 SQL 分析，并通过 LLM 自然语言进行决策推演。

**技术栈**: TypeScript 5 (Strict) · React 18 · Ant Design 6 · DuckDB-WASM · OpenAI SDK · Zustand 5 · Vite 5 · Chrome MV3

### 技术栈

| 类别 | 技术 |
|------|------|
| 语言 / 运行时 | TypeScript 5 (Strict Mode) · Bun |
| UI | React 18 · Ant Design 6 · ReactFlow |
| 数据引擎 | DuckDB-WASM · Apache Arrow |
| LLM | OpenAI SDK · @mlc-ai/web-llm |
| 状态管理 | Zustand 5 |
| 校验 | Zod 4 · zod-gpt |
| 构建 | Vite 5 · @crxjs/vite-plugin (Chrome MV3) |
| 测试 | `bun test` |

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

## 五、受保护资产（未经明确指令禁止修改）

```
src/workers/duckdb.worker.ts        — DuckDB Worker 核心
src/services/llm/agentExecutor.ts   — Agent 核心执行链
vite.config.ts                      — 构建配置
tsconfig.json / tsconfig.node.json  — TS 编译配置
package.json                        — 依赖变更需人类审批
```
