# Vaultmind — AGENTS.md (Harness Intent Layer)

> **Harness Engineering — Intent 层**
> 定义项目架构意图与模块边界，是 AI 开始工作前的首要上下文。

---

## ⚡ Harness Feedforward 检查（按顺序读取）

| 层 | 文件 | 目的 |
|----|------|------|
| Intent | `AGENTS.md`（本文件）| 项目架构与模块边界 |
| Authority | `.github/instructions/rule.instructions.md` | 工作流、权限约束、禁止行为 |

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
├── main.tsx                    # Chrome Extension 入口
├── background.ts               # Service Worker（MV3 Background）
├── content-script.ts           # Content Script 注入
├── global.css                  # 全局样式 & CSS 变量
├── sandbox.ts                  # 沙箱隔离逻辑
│
├── components/
│   ├── chart/                  # ECharts 图表组件（Container/Widget/ConfigPanel）
│   ├── common/                 # 通用组件（VmDialog 弹窗体系）
│   ├── flow/                   # 流程画布核心（Canvas/节点/边/抽屉/hooks）
│   │   ├── nodes/              # 流程节点组件（DataSource/Merge/Join/UDF 等）
│   │   ├── edges/              # 自定义边（JoinEdge/DeletableEdge）
│   │   ├── udf/                # UDF 算子配置抽屉
│   │   ├── controls/           # 画布工具栏
│   │   ├── hooks/              # useMergeActions / useUpstreamJoinedTables
│   │   └── contexts/           # FlowAttachmentsContext
│   ├── insight/                # 洞察可视化组件（热力图/散点图/雷达图/汇总表）
│   └── layout/                 # 全局布局（AppLayout/Sandbox/ThemeSwitcher）
│
├── pages/
│   ├── workbench/              # 主工作台（ChatPanel/FileDropzone/ResultsDisplay）
│   ├── biz-kernel-market/      # 业务算子市场
│   ├── insight/                # 洞察结果页
│   ├── settings/               # 设置页（Profile）
│   ├── asset-center/           # 资产中心（模板列表）
│   ├── session/                # 会话列表
│   ├── subscription/           # 订阅页
│   └── feedback/               # 反馈抽屉
│
├── hooks/                      # React Hooks（useDuckDB/useFileParsing/useLLMAgent/useAnomaly 等）
│   └── insight/                # useInsight
│
├── services/
│   ├── llm/                    # Agent 核心（AgentExecutor/AgentRuntime/PromptManager）
│   │   ├── skills/             # Skill 体系（builtin/core/entities/router/adapters）
│   │   └── industry/           # 行业 metrics 定义（ecommerce 等）
│   ├── flow/                   # 流程引擎（strategies.ts + strategies/ + validator）
│   │   └── strategies/         # 业务算子策略 + UDF 数据清洗策略
│   ├── insight/                # 洞察服务（聚合/分箱/列推断/上下文构建/报告生成）
│   │   └── strategies/         # 洞察 Action 策略（Anomaly/Clustering）
│   ├── anomaly/                # 异常检测服务
│   ├── clustering/             # 聚类分析服务（含 RFM）
│   ├── rfm/                    # RFM 聚类专项服务
│   ├── biz-kernels/            # 业务算子元数据与检索
│   ├── tools/                  # LLM 工具（duckdbTools/sqlPolicy）
│   ├── flags/                  # 行业功能开关（featureFlags）
│   ├── user-skill/             # User Skill 持久化与校验
│   └── __tests__/              # 服务层测试
│
├── workers/
│   ├── duckdb.worker.ts        # DuckDB WASM Worker（受保护）
│   ├── anomaly.worker.ts       # 异常检测 Worker
│   └── clustering.worker.ts    # 聚类分析 Worker
│
├── stores/                     # Zustand stores（flowStore/kernelPickerStore）
├── theme/                      # 三主题定义 + useEChartsTheme hook
│   └── themes/                 # cyanDark / lightOrange / orangeDark
├── prompts/                    # 行业 system prompt（ecommerce/finance/retail）
│   ├── insight/                # 洞察 Action prompt（anomaly/clustering/regression）
│   └── skills/                 # Skill prompt 模板
├── types/                      # TypeScript 类型定义（anomaly/clustering/insight/workbench）
├── config/                     # Persona 配置（personas/personaSuggestions）
├── constants/                  # 业务常量（anomaly/clustering）
├── contexts/                   # React Context（DuckDBContext）
├── utils/                      # 工具函数（arrow/chart/file/csv/logger/tableAnalytics）
├── status/                     # 应用状态管理（appStatusManager）
└── test/                       # 测试基础设施（setup）
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
