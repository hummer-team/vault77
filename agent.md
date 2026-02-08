# Vaultmind — agent.md 说明

本文档面向开发者和维护者，介绍 Vaultmind 项目中与 LLM Agent、DuckDB worker、工具（tools）及相关 hook/service 的架构、运行方式、扩展点与调试建议。

---

## 📋 目录导航

1. [项目概览](#一项目概览)
2. [快速开始](#二快速开始-3-分钟上手)
3. [M10 系列重构](#三m10-系列重构重要)
4. [总体架构](#四总体架构概览)
5. [关键文件与职责](#五关键文件与职责)
6. [Agent 执行流](#六agent-执行流详细)
7. [环境配置](#七环境配置清单)
8. [Chrome Extension 调试](#八chrome-extension-调试指南)
9. [错误处理](#九错误处理与常见问题)
10. [扩展开发](#十扩展点如何添加-prompt--tool--worker)
11. [FAQ 常见问题](#十一faq-常见问题)
12. [项目规范](#十二项目技术规范)
13. [参考文件列表](#十三参考文件列表)

---

## 更新日志

- **2026-02-08**: 
  - **客户聚类分析功能**: 集成基于RFM的K-Means聚类分析，支持GPU加速（40x性能提升）、自动列检测、动态K值调整（2-10）、双图表可视化（散点图+雷达图）、LLM业务洞察生成、CSV导出功能。核心模块包括：聚类服务（clusteringService）、RFM特征工程（rfmColumnDetector + rfmSqlGenerator）、Web Worker（clustering.worker）、可视化组件（ScatterChart + RadarChart + ErrorBoundary + Skeleton）、策略模式（ClusteringActionStrategy）、React Hook（useClustering）。完成21个单元测试，代码量~3,400行。
  - **右键菜单功能**: 为聚类散点图添加右键上下文菜单，支持查看客户详情和与分群平均对比（当前禁用，预留扩展）。使用原生DOM事件监听、position: absolute定位、边界检测、渐变背景和蓝色hover效果。组件代码~180行，遵循TypeScript最佳实践和英文注释规范。
  - 文档结构重构，新增目录导航、快速开始、环境配置清单、Chrome Extension 调试指南、FAQ 章节，整合 rule.md 工作流规范。
- **2026-01-29**: 完成 M10.6 (Multi-Industry Refactoring & M8 Regression Fixes)，实现多行业动态支持、行业功能开关、修复 7 个回归测试问题 + 1 个 BigInt 序列化问题。
- **2026-01-25**: 完成 M10.4 (Skill System Integration) 和 M10.5 (Transparency Enhancement)，新增 User Skill L0 配置系统、Query Router、透明度标签和设置面板。
- **2026-01-15**: 本文档基于当前代码仓库自动生成，已阅读并引用了 repository 中的关键文件。

---

## 一、项目概览

### TL;DR

**Vaultmind** 是一个 **Agent-Driven Analytics Workbench**，以 Chrome Extension 形式交付，允许用户通过自然语言进行数据分析。

**核心技术架构**:
```
UI (React + Ant Design)
    ↓
useLLMAgent / AgentRuntime
    ↓
LLM Client (OpenAI) + Skills (nl2sql.v1, analysis.v1)
    ↓
Tools (sql_query_tool)
    ↓
DuckDB WASM Worker (In-Browser SQL Engine)
```

**主要入口文件**:
- `src/services/llm/*` - Agent 运行时、Prompt 管理、Skills 系统
- `src/services/tools/*` - 工具注册表（SQL 查询工具）
- `src/workers/duckdb.worker.ts` - DuckDB WASM Worker
- `src/hooks/*` - React Hooks（useLLMAgent, useDuckDB, useFileParsing）
- `src/pages/workbench/*` - 主界面（Workbench, ChatPanel, ResultsDisplay）

**技术栈版本** (package.json v0.2.0):
- **Language**: TypeScript 5.2.2 (Strict Mode)
- **Runtime**: Bun (首选), Node.js 18+ (兼容)
- **Framework**: React 18.2.0 + React DOM 18.2.0
- **UI Library**: Ant Design 6.1.3 (Dark Theme)
- **Data Engine**: DuckDB-WASM 1.33.1-dev16.0 + Apache Arrow 21.1.0
- **LLM**: OpenAI 6.15.0 / @mlc-ai/web-llm 0.2.80
- **Build Tool**: Vite 5.2.0 + @crxjs/vite-plugin 2.3.0 (Chrome Extension)
- **Validation**: Zod 4.3.2 + zod-gpt 0.16.0
- **State**: Zustand 5.0.9
- **Visualization**: ECharts 6.0.0
- **File Processing**: ExcelJS 4.4.0, PapaParse 5.5.3, JSZip 3.10.1

---

## 二、快速开始 (3 分钟上手)

### 步骤 1: 安装依赖

```bash
# 克隆仓库（示例）
cd /path/to/vaultmind

# 安装 Bun (如未安装)
curl -fsSL https://bun.sh/install | bash

# 安装项目依赖
bun install
```

### 步骤 2: 配置环境变量

```bash
# 设置 LLM 配置（在 shell 中设置或创建 .env 文件）
export VITE_LLM_PROVIDER="openai"
export VITE_LLM_API_KEY="sk-your-api-key-here"
export VITE_LLM_API_URL="https://api.openai.com/v1"
export VITE_LLM_MODEL_NAME="gpt-4"
export VITE_LLM_MOCK="false"  # 开发时可设为 "true" 使用 mock 数据
```

### 步骤 3: 构建 Chrome Extension

```bash
# 开发模式（持续监听文件变化）
bun run dev

# 生产构建
bun run build
```

### 步骤 4: 加载到 Chrome

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目的 `dist/` 目录
5. 打开任意网页，点击浏览器右上角的 Vaultmind 图标
6. 在侧边栏中上传 CSV/Excel 文件，开始分析！

### 步骤 5: 验证安装

**测试用例 A - 基础查询**:
- **输入**: 上传包含订单数据的 CSV 文件
- **操作**: 在聊天框输入 "总共有多少订单？"
- **预期结果**: 返回订单总数，显示 SQL 查询和结果表格

**测试用例 B - 趋势分析**:
- **输入**: "按天统计订单数趋势"
- **预期结果**: 返回按天聚合的订单数，显示 SQL、数据表格和图表

---

## 三、M10 系列重构（重要）

### M10.6：Multi-Industry Refactoring & M8 Regression Fixes

**完成日期**: 2026-01-29  
**目标**: 消除硬编码的电商特定逻辑，实现真正的多行业动态支持；修复 M8 回归测试中发现的 7 个关键问题。

**核心功能**:

1. **多行业动态支持**
   - **Prompt 模板扩展**: 新增 `src/prompts/finance.ts` 和 `src/prompts/retail.ts`，与 `ecommerce.ts` 结构一致
   - **动态 Role 选择**: `AgentExecutor` 从硬编码 `role='ecommerce'` 改为从 `options?.industry` 动态获取
   - **行业特定领域术语**: `queryTypeRouter.ts` 中的 `DOMAIN_TERMS` 按行业分组（ecommerce/finance/retail/general）
   - **Prompt 降级策略**: `PromptManager` 在找不到指定行业 Prompt 时自动降级到 'ecommerce'

2. **行业功能开关** (`src/services/flags/featureFlags.ts`)
   - **功能标志**: `enableEcommerce` (默认 true), `enableFinance` (默认 false), `enableRetail` (默认 false)
   - **强校验**: `AgentExecutor.execute()` 入口处验证行业是否启用，未启用则快速失败
   - **友好错误**: 自定义 `IndustryNotEnabledError` 类，提示用户可用的行业列表
   - **辅助函数**: `isIndustryEnabled()`, `getEnabledIndustries()`, `INDUSTRY_FLAG_MAP`

3. **路由整合** (`src/services/llm/skills/queryTypeRouter.ts`)
   - **合并冗余**: 将 `router.ts` (skill 级别路由) 合并到 `queryTypeRouter.ts`（查询类型分类）
   - **统一入口**: `resolveSkill()` 和 `resolveSkillId()` 函数处理 skill-level 路由
   - **国际化**: 所有中文注释翻译为英文（Query Types、Keyword Rules、Domain Terms）

4. **M8 回归测试修复** (7 个核心问题)

   **P0 - 关键修复**:
   - **U2: 反引号转义** - DuckDB 不识别反引号，改用双引号包裹中文列名
     - 文件: `analysis.v1.ts::safeQuoteIdent()`
     - 修改: `` '`' + name + '`' `` → `'"' + name + '"'`
   
   - **U4: SQL 注入防护** - Zod schema 添加黑名单关键词检测
     - 文件: `userSkillSchema.ts::literalValueSchema`
     - 新增: `SQL_INJECTION_KEYWORDS` 黑名单 (DROP, DELETE, UPDATE, etc.)
   
   - **U8: INTERVAL 语法** - DuckDB 不支持 `TIMESTAMP - INTERVAL`
     - 文件: `filterCompiler.ts::compileRelativeTime()`
     - 修改: `CURRENT_TIMESTAMP - INTERVAL 'X unit'` → `date_add(CURRENT_TIMESTAMP, -INTERVAL 'X unit')`

   **P1 - 高优先级修复**:
   - **Case 12/16: 聚合查询 LIMIT** - `COUNT(*)` 等聚合查询不应添加 LIMIT
     - 文件: `analysis.v1.ts::buildSqlByQueryType()`
     - 逻辑: `kpi_single`, `distribution` 移除 LIMIT；`kpi_grouped`, `trend_time` 保留 LIMIT
   
   - **Case 15: 澄清流程** - 增强模糊时间检测规则
     - 文件: `rewrite.ts::rewriteQuery()`
     - 新增: Prompt 规则检测 "最近一段时间"、"近期"、"一段时间" 等模糊表达
   
   - **Case 9: 标签显示** - UI fallback 已存在，后端问题移至 P2
     - 文件: `ResultsDisplay.tsx::renderThinkingPanel()`
     - 状态: UI 已有降级展示，LLM 自拒场景的 metadata 记录需独立任务

5. **BigInt 序列化修复** (新增问题)
   - **问题**: DuckDB 的 `COUNT(*)`, `SUM()` 返回 `BIGINT`，JavaScript 中为 `BigInt` (如 `2137n`)
   - **根因**: `JSON.stringify()` 无法序列化 BigInt，导致数据传输到 UI 时丢失字段
   - **解决**: 新增 `DuckDBService._normalizeBigIntFields()` 方法
     - 文件: `duckDBService.ts::executeQuery()`
     - 逻辑: 递归遍历数据，将所有 `bigint` 类型转换为 `number`
     - 调用时机: `_normalizeTimeFields()` 之后
   - **影响**: 修复 "按天统计订单数趋势" UI 只显示 `day` 列、缺失 `total_count` 列的问题

**技术实现**:

- **行业隔离**:
  - Prompt 模板按行业分文件存储 (`prompts/{industry}.ts`)
  - PromptManager 维护 `promptSets` 注册表：`{ ecommerce, finance, retail }`
  - QueryTypeRouter 的领域术语按行业分组，避免跨行业干扰

- **向后兼容**:
  - 默认行业为 'ecommerce'（未指定时）
  - 功能开关默认启用 ecommerce，关闭其他行业
  - Prompt 降级策略确保找不到行业模板时不会崩溃

- **错误处理**:
  - 行业校验在 AgentExecutor 入口处执行（fail-fast）
  - 发送 `agent.error` 和 `agent.run.end` 事件，包含错误分类
  - `IndustryNotEnabledError` 提供友好的错误消息和建议

**完成度统计**:

- **代码审计**: 从 64% (首次) → 97% (修复后)
- **测试用例**: 47+ 单元测试通过（22 queryTypeRouter + 11 promptManager + 14 analysis.v1）
- **回归测试**: 7/8 问题修复（1 个文档任务）
- **构建状态**: ✅ TypeScript 无错误，ESLint 预存在错误未增加

**关键文件**:
- `src/prompts/finance.ts`, `src/prompts/retail.ts` - 新增行业 Prompt 模板
- `src/services/llm/promptManager.ts` - 注册多行业 Prompt，添加降级逻辑
- `src/services/llm/agentExecutor.ts` - 动态行业选择，入口处行业校验
- `src/services/llm/skills/queryTypeRouter.ts` - 领域术语分组，路由整合，国际化
- `src/services/flags/featureFlags.ts` - 行业功能开关，校验辅助函数
- `src/services/tools/duckdbTools.ts` - `IndustryNotEnabledError` 自定义错误类
- `src/services/llm/agentEvents.ts` - 扩展 `AgentErrorCategory` 枚举
- `src/services/duckDBService.ts` - BigInt 序列化修复
- `src/services/llm/skills/builtin/analysis.v1.ts` - 反引号转义、聚合 LIMIT 修复
- `src/services/userSkill/userSkillSchema.ts` - SQL 注入防护
- `src/services/llm/skills/core/filterCompiler.ts` - INTERVAL 语法修复
- `src/services/llm/rewrite.ts` - 模糊时间澄清规则

**测试建议**:
1. ✅ **U2**: "按天统计订单数趋势" → SQL 使用双引号 `"下单时间"`
2. ✅ **U4**: 保存 Filter Value = `a'); DROP TABLE` → Zod 拒绝
3. ✅ **U8**: 配置 "过去 30 天" → SQL 使用 `date_add()`
4. ✅ **Case 12**: "总共有多少订单" → SQL 无 `LIMIT 500`
5. ✅ **Case 15**: "最近一段时间的订单" → 澄清卡片
6. ✅ **Case 16**: "显示 top 10 订单" → `LIMIT 10`
7. ✅ **BigInt**: "按天统计订单数趋势" → UI 显示 `day` 和 `total_count` 列
8. ✅ **多行业**: 切换 Industry 配置 → Prompt 和领域术语动态切换
9. ✅ **功能开关**: 尝试使用未启用行业 → 友好错误提示

**遗留问题** (P2):
- **Case U4-B**: 测试用例与 UI 不一致（接受当前下拉框设计）
- **Case 13**: 补充测试文档
- **Case 9 Backend**: LLM 自拒场景不记录 metadata（需独立任务）

**文档**:
- `design/m8-regression.md`: M10.4 + M10.5 回归测试用例（16 个）
- Session checkpoints: `checkpoints/001-multi-industry-refactoring-and.md` (重构审计)
- Session checkpoints: `checkpoints/002-m8-regression-fixes.md` (回归修复)

---

### M10.4：Skill System Integration + User Skill L0

**完成日期**: 2026-01-24  
**目标**: 实现用户自定义表配置（L0 级别），允许业务用户在无需编程的情况下配置字段映射、默认过滤条件、自定义指标。

**核心功能**:

1. **User Skill Configuration System**
   - 用户可在 Settings → Profile 页面配置 User Skill
   - 支持配置项：Industry（行业）、Field Mapping（字段映射）、Default Filters（默认过滤条件）、Custom Metrics（自定义指标）
   - 配置存储在 Chrome Storage 中，按 session 维度隔离

2. **Query Type Router**（`src/services/llm/skills/router.ts`）
   - 关键字路由：快速识别 CRUD 操作（增删改查）和简单统计查询
   - 准确率 95%+，平均响应时间 < 50ms
   - 降级策略：复杂查询自动切换到 `analysis.v1` Skill

3. **Dynamic Prompt Building**（`src/services/llm/skills/core/digestBuilder.ts`）
   - Schema Digest（4000 chars）：表结构摘要
   - User Skill Digest（1200 chars）：用户配置摘要
   - System Skill Pack（2000 chars）：系统内置技能包
   - 总预算控制：~8000 chars，支持自动截断

4. **Runtime Execution Flow**（`src/services/llm/agentRuntime.ts`）
   - 查询开始前加载 User Skill Config
   - 通过 Query Router 选择合适的 Skill
   - 构建包含用户配置的增强 Prompt
   - 执行 Skill 并收集元数据

**技术约束**:
- L0 Metrics：仅支持基础聚合（count, count_distinct, sum, avg, min, max）
- 单表限制：当前仅支持单表配置（activeTable = attachments[0].tableName）
- 字段校验：通过 Zod schema 强制执行字段名、SQL 关键字安全检查

**关键文件**:
- `src/services/llm/skills/types.ts`：User Skill L0 类型定义
- `src/services/llm/skills/router.ts`：Query Type Router 实现
- `src/services/llm/skills/core/digestBuilder.ts`：Prompt Digest 构建器
- `src/services/llm/agentRuntime.ts`：Agent 运行时（集成 User Skill）
- `src/services/userSkill/userSkillService.ts`：User Skill 持久化服务
- `src/pages/settings/ProfilePage.tsx`：User Skill 配置 UI

---

### M10.5：Transparency & Explainability Enhancement

**完成日期**: 2026-01-25  
**目标**: 让 AI 的技能使用、用户配置应用、分析推理过程对用户可见，增强信任和可调试性。

**核心功能**:

1. **Skill Metadata Tags**（`ResultsDisplay.tsx`）
   - **Skill Tag** (蓝色)：显示使用的技能名称（如 `analysis.v1`）
   - **Industry Tag** (绿色)：显示生效的行业配置（如 `ecommerce`）
   - **UserSkill Tag** (橙色/灰色)：显示用户配置状态
     - 已配置：`用户配置已应用，XXX/1200 字符`
     - 未配置：`未配置` (灰色)

2. **Effective Settings Panel**（`ResultsDisplay.tsx`）
   - 展示本次查询生效的完整配置：
     - **Table Name**：当前分析的表名
     - **Field Mapping**：用户配置的字段映射（Time/Amount/OrderID/UserID）
     - **Default Filters (Top-5)**：生效的前 5 个默认过滤条件，超出自动折叠
     - **Metrics (Top-8)**：生效的前 8 个自定义指标，超出自动折叠
   - 自动处理边界情况：无配置时不显示对应区块

3. **System Metrics Display**（`ProfilePage.tsx`）
   - 在 Metrics Panel 展示当前行业的系统内置指标
   - 支持 Override 检测：用户自定义指标与系统指标同名时显示橙色 `用户覆盖` 标签
   - 行业指标数量：
     - `ecommerce`: 6 个（GMV、订单量、客单价等）
     - `finance`: 4 个（交易金额、交易笔数等）
     - `retail`: 4 个（销售额、销售量等）
     - `default`: 2 个（总计数、总金额）

4. **Metadata Collection & Flow**（`agentRuntime.ts` → `index.tsx` → `ResultsDisplay.tsx`）
   - agentRuntime 在查询执行时计算 5 个元数据字段：
     - `skillName`: 使用的技能名称
     - `industry`: 生效的行业
     - `userSkillApplied`: 用户配置是否应用
     - `userSkillDigestChars`: 用户配置 Digest 字符数
     - `activeTable`: 当前分析的表名
   - 元数据随 AgentRunResult 传递到前端，最终在 ThinkingSteps 中展示

**技术实现**:
- 所有元数据字段为可选（optional），保持向后兼容
- effectiveSettings 从 tableConfig 实时构建，不存储
- System Metrics 当前硬编码（M11+ 将支持动态加载）
- 所有边界情况已处理（无配置、部分配置、空列表）

**文档**:
- `design/m8-regression.md`：M10.4 + M10.5 回归测试用例（16 个测试用例）
- `design/skillManual.md`：User Skill 配置操作手册（972 行，面向终端用户）

---

## 四、总体架构概览
- 组件（高层次）
  - 前端 UI（React 页面/组件）：`src/pages/workbench` 下的 Workbench、ChatPanel、FileDropzone、ResultsDisplay 等。
  - Hook 层：`src/hooks/useLLMAgent.ts`（对外的 Agent API 层）、`src/hooks/useDuckDB.ts`（与 DuckDB worker 协作）、`src/hooks/useFileParsing.ts`（文件解析与上传）等。
  - LLM 服务层（Agent 逻辑）:
    - `src/services/llm/llmClient.ts`：LLM API 客户端（目前使用官方 `openai` npm 包）。
    - `src/services/llm/promptManager.ts`（**M10.6 更新**）：管理多行业 prompt 模板（ecommerce/finance/retail），提供降级策略。
    - `src/services/llm/agentRuntime.ts`（**M10.4 新增**）：Agent 运行时——整合 User Skill Config 加载、Query Router、Skill 执行、元数据收集，替代原 `agentExecutor.ts`。
    - `src/services/llm/agentExecutor.ts`（**M10.6 更新**）：从硬编码 `role='ecommerce'` 改为动态获取 `options?.industry`，新增行业开关校验。
    - `src/services/llm/rewrite.ts`（**M10.6 更新**）：增强模糊时间检测规则（"最近一段时间"、"近期" 等触发澄清）。
  - Prompts（**M10.6 扩展**）:
    - `src/prompts/ecommerce.ts`：电商行业 Prompt 模板（原有）。
    - `src/prompts/finance.ts`（**M10.6 新增**）：金融行业 Prompt 模板（系统提示词、工具选择模板、示例问题）。
    - `src/prompts/retail.ts`（**M10.6 新增**）：零售行业 Prompt 模板（系统提示词、工具选择模板、示例问题）。
  - Skills & Tools:
    - **Skill 动态路由**: `src/services/llm/skills/queryTypeRouter.ts`（**M10.6 重命名 & 整合**）合并了原 `router.ts` 的 skill-level 路由和 query-type 分类逻辑，新增行业特定领域术语分组，所有注释国际化。**M10.4 新增关键字路由，准确率 95%+，< 50ms 响应**。
    - **Skill 注册表**: `src/services/llm/skills/registry.ts` 维护了一个所有可用 `Skill` 的映射表。
    - **Skill 类型定义**: `src/services/llm/skills/types.ts`（**M10.4 新增**）定义了 User Skill L0 类型（FilterExpr、MetricDefinition、TableSkillConfig、UserSkillConfig）。
    - **Digest Builder**: `src/services/llm/skills/core/digestBuilder.ts`（**M10.4 新增**）构建 Schema Digest、User Skill Digest、System Skill Pack，用于增强 Prompt。
    - **Filter Compiler**: `src/services/llm/skills/core/filterCompiler.ts`（**M10.6 更新**）：修复 INTERVAL 语法，使用 `date_add()` 函数替代 `TIMESTAMP - INTERVAL`。
    - **Analysis Skill**: `src/services/llm/skills/builtin/analysis.v1.ts`（**M10.6 更新**）：修复反引号转义（改用双引号）、移除聚合查询的不必要 LIMIT。
    - **工具实现**: `src/services/tools/duckdbTools.ts`（**M10.6 更新**）：新增 `IndustryNotEnabledError` 自定义错误类。
  - Feature Flags（**M10.6 新增**）:
    - `src/services/flags/featureFlags.ts`：行业功能开关系统（enableEcommerce/Finance/Retail），提供校验辅助函数（isIndustryEnabled, getEnabledIndustries）。
  - Worker：`src/workers/duckdb.worker.ts`（DuckDB WASM worker，负责初始化 DuckDB、加载文件缓冲区、执行 SQL）。
  - DuckDB Service（**M10.6 更新**）:
    - `src/services/duckDBService.ts`：新增 `_normalizeBigIntFields()` 方法，解决 BigInt 序列化问题（COUNT(*) 等聚合函数返回值）。
  - User Skill 服务（**M10.4 新增**）:
    - `src/services/userSkill/userSkillService.ts`：负责 User Skill Config 在 Chrome Storage 中的持久化和加载。
    - `src/services/userSkill/userSkillSchema.ts`（**M10.6 更新**）：新增 SQL 注入防护黑名单（DROP, DELETE, UPDATE 等关键词）。
  - Agent Events（**M10.6 更新**）:
    - `src/services/llm/agentEvents.ts`：扩展 `AgentErrorCategory` 枚举，新增 `'INDUSTRY_NOT_ENABLED'` 类型。
  - 其他：`src/services/settingsService.ts`、`src/services/storageService.ts`、`src/status/appStatusManager.ts` 等。

---

## 五、关键文件与职责（逐项）
- Hooks
  - `src/hooks/useLLMAgent.ts`：项目中暴露给组件的 Agent hook（目前是占位/封装层，具体逻辑在 `AgentExecutor`）。
  - `src/hooks/useDuckDB.ts`：封装 DuckDB 初始化、表创建、executeQuery、dropTable 等逻辑（Workbench 通过它与 DB 交互）。
  - `src/hooks/useFileParsing.ts`：负责把用户上传的文件读取为 buffer，并通过 sandbox/iframe 把文件注册到 DuckDB（见 `loadFileInDuckDB`）。

- LLM 相关服务
  - `src/services/llm/llmClient.ts`
    - 使用 `openai` 官方客户端构建 LLM 客户端实例。
    - 类型：LLMConfig (provider, apiKey, baseURL, modelName, mockEnabled?)。
    - 注意：构造时会把 apiKey、baseURL 带入；浏览器模式允许 dangerouslyAllowBrowser。
  - `src/services/llm/promptManager.ts`（**M10.6 更新**）
    - 管理多行业 prompt 模板，注册表包含 `ecommerce`, `finance`, `retail` 三个行业。
    - `getToolSelectionPrompt(industry, userInput, tableSchema)` 根据 industry 选择对应的 Prompt 模板。
    - **降级策略**：找不到指定行业的 Prompt 时自动降级到 'ecommerce'，确保系统稳定运行。
  - `src/prompts/ecommerce.ts`, `src/prompts/finance.ts`, `src/prompts/retail.ts`（**M10.6 新增后两者**）
    - 每个文件定义一个行业的完整 Prompt 模板，包含：
      - `system_prompt`：系统提示词，定义 AI 角色和专业领域
      - `tool_selection_prompt_template`：工具选择模板（ReAct 模式）
      - `suggestions`：示例问题列表（用于 UI 快捷输入）
    - 结构统一，便于扩展新行业。
  - `src/services/llm/agentRuntime.ts`（**M10.4 新增，替代 agentExecutor**）
    - Agent 运行时核心：
      - **Phase 1 - User Skill Loading**: 从 Chrome Storage 加载当前 session 的 User Skill Config。
      - **Phase 2 - Query Router**: 通过 `resolveSkill(userInput, industry)` 选择合适的 Skill（`nl2sql.v1` 或 `analysis.v1`），**M10.6 更新**传入 industry 参数支持领域术语过滤。
      - **Phase 3 - Digest Building**: 构建 Schema Digest、User Skill Digest、System Skill Pack，增强 Prompt。
      - **Phase 4 - Skill Execution**: 调用选中的 Skill，传入增强后的 context（包含 userSkillDigest）。
      - **Phase 5 - Metadata Collection**: 收集 5 个元数据字段（skillName、industry、userSkillApplied、userSkillDigestChars、activeTable）和 effectiveSettings。
      - **M10.6 注意**：BigInt 序列化处理已移至 `DuckDBService._normalizeBigIntFields()`，agentRuntime 不再需要 `_sanitizeBigInts`。
      - 返回 `AgentRunResult` 包含结果数据、元数据、thinking steps。
  - `src/services/llm/agentExecutor.ts`（**M10.6 重大更新**）
    - **动态行业选择**：从 `options?.industry` 动态获取行业，默认 'ecommerce'（移除硬编码 `role='ecommerce'`）。
    - **行业开关校验**：在 `execute()` 入口处调用 `isIndustryEnabled(industry)` 验证行业是否启用。
    - **快速失败策略**：未启用的行业直接抛出 `IndustryNotEnabledError`，包含友好错误消息。
    - **事件发送**：发送 `agent.error` 和 `agent.run.end` 事件，错误分类为 `'INDUSTRY_NOT_ENABLED'`。

- Tools
  - `src/services/tools/duckdbTools.ts`（**M10.6 更新**）
    - 当前实现了 `sql_query_tool`，这是一个通用 SQL 执行器，签名为 `(executeQuery, {query}) => Promise<any>`。
    - **新增**: `IndustryNotEnabledError` 自定义错误类（lines 22-42），用于行业未启用时返回友好错误消息。
    - 错误消息包含：当前请求的行业、可用行业列表、建议操作。
    - `tools` 注册表用于在 AgentExecutor 中根据工具名查找实现。
    - `toolSchemas` 为工具声明 JSON Schema，用于在向 LLM 请求时把工具能力声明给 LLM（在调用 openai.chat.completions.create 时传入）。

- Feature Flags（**M10.6 新增**）
  - `src/services/flags/featureFlags.ts`
    - **功能标志接口**: `FeatureFlags` 扩展了 3 个行业开关（enableEcommerce, enableFinance, enableRetail）。
    - **默认配置**: `DEFAULT_FEATURE_FLAGS` 定义默认值（ecommerce: true, finance: false, retail: false）。
    - **行业映射**: `INDUSTRY_FLAG_MAP` 将行业名称映射到功能标志键（'ecommerce' → 'enableEcommerce'）。
    - **辅助函数**:
      - `isIndustryEnabled(industry: string): boolean` - 检查行业是否启用
      - `getEnabledIndustries(): string[]` - 获取所有已启用的行业列表
    - **使用场景**: AgentExecutor 在入口处校验行业，UI 可用于行业选择下拉框。

- Skills（**M10.6 更新**）
  - `src/services/llm/skills/queryTypeRouter.ts`（**M10.6 重命名 & 整合**，原 `router.ts` 已删除）
    - **双层路由**:
      - **Skill-level 路由**: `resolveSkillId()` 和 `resolveSkill()` 根据用户输入选择 `nl2sql.v1` 或 `analysis.v1`。
      - **Query-type 分类**: `classifyQueryType()` 将查询分类为 7 种类型（kpi_single, kpi_grouped, trend_time, distribution, comparison, topn, clarification_needed）。
    - **行业特定领域术语**: `DOMAIN_TERMS_BY_INDUSTRY` 按行业分组（ecommerce/finance/retail/general），避免跨行业术语干扰。
    - **国际化**: 所有中文注释翻译为英文（Query Types、Keyword Rules、Domain Terms、Inline Comments）。
    - **性能**: 关键字路由准确率 95%+，平均响应时间 < 50ms。
  - `src/services/llm/skills/core/filterCompiler.ts`（**M10.6 更新**）
    - **INTERVAL 语法修复**: 将 `CURRENT_TIMESTAMP - INTERVAL 'X unit'` 改为 `date_add(CURRENT_TIMESTAMP, -INTERVAL 'X unit')`。
    - **兼容性**: DuckDB 不支持 `TIMESTAMP - INTERVAL` 减法，必须使用 `date_add()` 或 `date_sub()` 函数。
    - **影响范围**: 相对时间过滤（"过去 30 天"、"最近 7 天" 等）。
  - `src/services/llm/skills/builtin/analysis.v1.ts`（**M10.6 更新**）
    - **反引号转义修复**: `safeQuoteIdent()` 从 `` '`' + name + '`' `` 改为 `'"' + name + '"'`（DuckDB 兼容）。
    - **聚合查询 LIMIT 优化**: 
      - `kpi_single` (COUNT(*)) 和 `distribution` (AVG/STDDEV/MIN/MAX) 移除 LIMIT（单行结果）。
      - `kpi_grouped` 和 `trend_time` 保留 LIMIT（多行结果，需分页）。
    - **行业参数传递**: `classifyQueryType()` 调用时传入 `industry` 参数，支持行业特定领域术语过滤。

- DuckDB Service（**M10.6 更新**）
  - `src/services/duckDBService.ts`
    - **BigInt 序列化修复**: 新增 `_normalizeBigIntFields(data: any[]): void` 方法（lines 302-363）。
    - **问题根因**: DuckDB 的 `COUNT(*)`, `SUM()` 等聚合函数返回 `BIGINT` 类型，在 JavaScript 中为 `BigInt` (如 `2137n`)，`JSON.stringify()` 无法序列化。
    - **解决方案**: 递归遍历数据，将所有 `bigint` 类型转换为 `number`（安全范围：Number.MAX_SAFE_INTEGER = 9 千万亿）。
    - **调用时机**: `executeQuery()` 中，在 `_normalizeTimeFields()` 之后、返回结果之前调用。
    - **影响**: 修复 "按天统计订单数趋势" UI 只显示 `day` 列、缺失 `total_count` 列的问题。

- User Skill（**M10.6 更新**）
  - `src/services/userSkill/userSkillSchema.ts`
    - **SQL 注入防护**: 新增 `SQL_INJECTION_KEYWORDS` 黑名单（lines 9-23）。
    - **黑名单内容**: `['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE', 'SCRIPT', '--', '/*', '*/', ';', 'xp_', 'sp_']`。
    - **校验逻辑**: `literalValueSchema` 中使用 `validateNoSqlInjection()` 函数检测字符串和数组元素。
    - **错误消息**: "Filter value contains forbidden SQL keywords (DROP, DELETE, etc.)"。
    - **保护范围**: 所有 FilterExpr 的 value 字段（默认过滤条件、Metric WHERE 子句）。

- Agent Events（**M10.6 更新**）
  - `src/services/llm/agentEvents.ts`
    - **错误分类扩展**: `AgentErrorCategory` 枚举新增 `'INDUSTRY_NOT_ENABLED'` 类型。
    - **事件流**: AgentExecutor 在行业未启用时发送：
      - `agent.error` - 携带错误详情和分类
      - `agent.run.end` - 标记查询结束，状态为失败

- Rewrite（**M10.6 更新**）
  - `src/services/llm/rewrite.ts`
    - **模糊时间检测**: Prompt 新增规则检测模糊时间表达（"最近一段时间"、"近期"、"一段时间"、"recently"）。
    - **澄清触发**: 检测到模糊时间时设置 `needClarification=true`，要求用户明确时间范围。
    - **改进用户体验**: 减少无效查询，提升结果准确性。

- Worker
  - `src/workers/duckdb.worker.ts`
    - 负责接收消息（DUCKDB_INIT, LOAD_FILE, DUCKDB_LOAD_DATA, DUCKDB_EXECUTE_QUERY 等），并通过 `DuckDBService` 执行相应操作。
    - 初始化时会使用 `@duckdb/duckdb-wasm` 的 bundle 选择逻辑，并手动创建 core worker（`new Worker(bundle.mainWorker, { type: 'module' })`），然后把 worker 传给 `DuckDBService.initialize(bundle, coreWorker)`。
    - 在 worker 中对错误与成功会回应 `${type}_ERROR` / `${type}_SUCCESS` 消息，主线程需要按协议处理这些消息。

- 前端页面/组件
  - `src/pages/workbench/index.tsx`（Workbench）
    - 负责：管理 UI 状态（initializing, parsing, fileLoaded, analyzing 等）、初始化 DuckDB/sandbox、文件上传、调度 `agentRuntime`（**M10.4 更新**）并展示结果。
    - 从 `import.meta.env` 读取 LLM 相关配置：
      - VITE_LLM_PROVIDER, VITE_LLM_API_KEY, VITE_LLM_API_URL, VITE_LLM_MODEL_NAME, VITE_LLM_MOCK
    - File 上传后会将文件放到 `main_table_{n}`（例如：`main_table_1`）并通过 `PromptManager.getSuggestions('ecommerce')` 获取预设建议。
    - **M10.5 更新**：扩展 `AnalysisRecord.thinkingSteps` 类型，包含元数据（skillName、industry、userSkillApplied 等）和 effectiveSettings。
  - `src/pages/workbench/components/ChatPanel.tsx`
    - UI 层：消息输入、文件上传（通过 antd Upload beforeUpload 调用 Workbench 的 onFileUpload）、显示 suggestions 与 attachments。
  - `src/pages/workbench/components/ResultsDisplay.tsx`（**M10.5 新增透明度功能**）
    - 展示查询结果和分析过程。
    - **新增功能**：
      - `renderSkillMetadataTags()`：渲染 3 个元数据标签（Skill/Industry/UserSkill）。
      - `renderEffectiveSettings()`：渲染 Effective Settings Panel（Table/Field Mapping/Filters/Metrics）。
      - 自动折叠长列表（Filters > 5, Metrics > 8）。
  - `src/pages/settings/ProfilePage.tsx`（**M10.4 新增 User Skill 配置，M10.5 新增 System Metrics 显示**）
    - User Skill 配置界面，包含 4 个配置区块：
      - **Industry Selection**：选择行业（ecommerce/finance/retail/custom）。
      - **Field Mapping**：配置字段映射（Time/Amount/OrderID/UserID）。
      - **Default Filters**：配置默认过滤条件（支持 9 种操作符）。
      - **Custom Metrics**：配置自定义指标（支持 6 种聚合函数）。
    - **M10.5 新增**：System Metrics 显示区块，展示当前行业的系统内置指标，支持 Override 检测。

四、运行 / 构建（快速开始）
- 前提
  - 本项目使用 Bun 作为首选运行/构建工具（建议使用 Bun LTS）。Bun 与 package.json 脚本兼容，生产/开发脚本名与 `package.json` 保持一致。
- Bun 安装（macOS / zsh）
  - 推荐（官方一行安装脚本）：`curl -fsSL https://bun.sh/install | bash`（安装脚本会把 `~/.bun/bin` 加入 PATH，重启 shell 或 `source ~/.zshrc` 后生效）。  
  - 可选（Homebrew，如可用）：`brew install bun`。
- 依赖与常用命令（与 `package.json` 对应）
  - 安装依赖：`bun install`（与 npm/yarn 等价）。  
  - 开发：`bun run dev`（启动 Vite 开发服务器）。  
  - 构建：`bun run build`（通常会先运行 tsc 再 vite build，参见 package.json）。  
  - 预览：`bun run preview`。  
  - lint：`bun run lint`。
- 示例：在 macOS / zsh 下启动开发（示例）
  - 在 shell 中先设置环境变量（示例）：`export VITE_LLM_MOCK=true`；`export VITE_LLM_API_KEY="<your-key>"`  

- 备注
  - 若环境中同时存在 node/npm，Bun 能兼容大多数 package.json 脚本，但注意原生模块或特定 bundler 插件的兼容性（遇到问题时参考 Bun 官方文档或切换到 npm/yarn 进行回退测试）。

LLM 模型约束与 Skills 声明
- 目的与概览  
  - 该节说明在向 LLM 提示与解析工具调用时的“技能（skills）声明”格式与必需的安全/格式约束，及如何在代码层面（`PromptManager` / `AgentExecutor` / `LlmClient`）落地这些约束，避免数据泄露或危险操作。

- Skills（技能）声明 格式（最小字段）
  - 格式说明（JSON object / 文档化模板）：每个 skill 至少包含：
    - `name`：技能标识（字符串），例如 `sql_query_tool`。  
    - `description`：简短描述（字符串）。  
    - `input_schema`：输入参数 JSON Schema（描述必需字段与类型）。  
    - `output_schema`：输出结果 JSON Schema（便于 LLM 按结构返回）。  
    - `permissions`：权限/约束（例如 `read_only: true` / `allowed_tables: ["main_table_*"]`）。  
    - `callable_tools`：技能可调用的下级工具列表（若适用）。  
    - `example`：简短示例（调用示例 + 期望输出）。
  - 简短示例（文档化，不是代码块）：
    - `name`: "sql_query_tool"  
    - `description`: "在沙箱 DuckDB 中对用户上传的数据执行只读 SQL 查询并返回 rows + schema"  
    - `input_schema`: `{ query: string }`  
    - `output_schema`: `{ data: [{...}], schema: [{column_name:string,column_type:string}], row_count:number }`  
    - `permissions`: `{ read_only: true, allowed_tables: ["main_table_*"], max_rows: 500 }`  
    - `example`: `{"query":"SELECT name, price FROM main_table_1 WHERE price > 100 LIMIT 10"}`

- 强制约束（必读）
  1. 响应格式（必需）  
     - LLM 必须返回可解析的 JSON（或符合指定 `output_schema` 的结构），并包含标准字段，如 `action.tool`、`action.args`、`thought`（用于可审计的决策说明）。例如，最终应包含 `{"action":{"tool":"sql_query_tool","args":{...}},"thought":"...解释...","confidence":0.8}`。  
  2. Token / 长度限制  
     - 在 prompt 中对 LLM 明确约束最大 token 或最大字符长度，且在 `LlmClient` 层设置超时与最大 token（model-level）。文档中建议默认限制（例如：`max_tokens` 设定为模型上限的安全子集，视模型而定）。  
  3. 禁止行为（硬禁）  
     - 严禁尝试进行任意网络访问、外部 API 调用、系统命令执行或未授权的文件读写。LLM 在决策/响应中不得包含任何凭证或明确的密钥。  
  4. SQL 执行安全约束（强制）  
     - 默认只允许只读查询（SELECT）。对任何包含 `INSERT`/`UPDATE`/`DELETE`/`DROP`/`ALTER`/`CREATE`/`ATTACH`/`DETACH` 等关键字的 SQL，Agent 必须拒绝或要求二次确认并记录审计。  
     - 仅允许访问表白名单（例如仅以 `main_table_` 前缀命名的表）。  
     - 强制 `max_rows` 上限（例如 500），如果请求未包含 `LIMIT`，在执行前由 `AgentExecutor` 插入或拒绝。  
     - 建议在执行前做语法/安全预检（如简单关键字黑名单与表名白名单校验）。  
  5. 网络 / 文件系统访问约束  
     - Agent 在任何情况下不得允许 LLM 直接发起网络请求或访问宿主文件系统；所有需要外部数据的操作必须通过明确定义的工具（Tool）并经过审查。  
  6. 错误与确认策略  
     - 若 LLM 返回无法解析或不合规的 action（格式错误 / 非白名单表 / 非只读 SQL），`AgentExecutor` 必须：拒绝执行并返回可读的错误消息；对于模糊或潜在危险的请求，应回问用户二次确认（通过新增 prompt step）并记录原因。  
     - 建议在响应中包含 `thought`（Agent 推理）与 `confidence` 字段以便人工审查。

- 在代码中如何实现这些约束（高优先级建议与位置）
  1. `PromptManager`（文件：`src/services/llm/promptManager.ts`）  
     - 在构造 prompt 时把“强制约束”作为 system message 的一部分传给 LLM（例如：“严格返回 JSON，禁止访问网络或文件系统，SQL 只能为只读 SELECT，表白名单：main_table_*，若需要更高权限必须要求用户确认”）。  
     - 在向 LLM 提供工具能力时（tools / function schemas），确保传入的 `toolSchemas` 包含 `permissions`（如 read_only、allowed_tables、max_rows）以便模型选择时可见。  
     - 在模板中明确要求 LLM 返回 `action`、`args`、`thought` 字段并遵循 `output_schema`。  
  2. `AgentExecutor`（文件：`src/services/llm/agentExecutor.ts`）  
     - 在解析到 LLM 的工具调用前，先做“工具调用白名单”与“参数校验”（验证 `toolName` 在 `tools` 注册表中）。  
     - 对 SQL 类参数执行严格的预检：- 确认只含允许的关键词（通过关键字黑名单检测 DDL/DML）；- 校验所有表名是否匹配白名单模式（例如 /^main_table_/）；- 如果 `SELECT` 未包含 `LIMIT`，自动添加 `LIMIT {max_rows}` 或拒绝并要求说明。  
     - 若检测到高风险操作（非只读、访问非白名单表），不要直接执行，应返回错误或触发“需要用户确认”的流程（返回给前端一个明确的交互提示）。  
     - 在执行工具返回结果后，再做一次输出结构校验，确保符合 `output_schema`（否则视为失败并记录原始 LLM 内容用于审计）。  
     - 使用 `_sanitizeBigInts` 等现有工具对结果进行净化，保障前端序列化安全。  
  3. `LlmClient`（文件：`src/services/llm/llmClient.ts`）  
     - 在创建请求时设置合理的超时与 `max_tokens`（或模型限制参数），并支持 `AbortSignal` 用于用户取消。  
     - 将 `dangerouslyAllowBrowser`、`baseURL` 等敏感配置在文档中明确说明，并通过环境变量管理（`VITE_LLM_API_KEY` / `VITE_LLM_API_URL` / `VITE_LLM_MODEL_NAME` / `VITE_LLM_MOCK`）。  
  4. 额外建议（跨文件）  
     - 在 `src/services/tools/duckdbTools.ts` 的工具 schema 中补充 `permissions` 字段，并在 AgentExecutor 中读取并强制执行。  
     - 增加“预检/审计”钩子：每次 Agent 执行前后，把 LLM 原始响应、解析的 action、执行的 SQL（如有）、返回结果与时间戳写入日志/审计表（或前端可下载的审计文件）。  
     - 使用 `llmConfig.mockEnabled` 做开发环境回归测试与 E2E 测试（文档提示如何启用）。

- 建议的文档更新点（供开发者实际修改代码时参考）
  - `src/services/llm/promptManager.ts`：在 `getToolSelectionPrompt` 中注入“强制约束”system text；把 `tools` schema 权限以参数传入。  
  - `src/services/llm/agentExecutor.ts`：增加 `_preflightValidateToolCall(toolName, args)` helper（检查白名单、关键字、LIMIT、permissions），以及在解析 tool_call 后调用该函数。  
  - `src/services/llm/LlmClient.ts`：把 `chatCompletions` 调用中 `max_tokens`、`timeout` 的推荐位置与示例写在注释中，确保调用方可传 `signal` 取消请求。

---

## 六、Agent 执行流（详细）- M10.4 更新版

- **1. 用户在 UI（ChatPanel）输入请求并提交（或选择 suggestion）。**

- **2. Workbench 的 `handleStartAnalysis` 收集上下文（已上传的文件名列表、table 名称等），并确保 `agentRuntime` 已就绪（依赖 isDBReady、executeQuery）。**

- **3. `agentRuntime.execute(userInput, attachments)`**（**M10.4 新增完整流程**）：

   **Phase 1: User Skill Loading**
   - 调用 `userSkillService.loadUserSkill(sessionId)` 从 Chrome Storage 加载当前 session 的用户配置。
   - 如果无配置或加载失败，设置 `userSkillConfig = null`（降级到默认行为）。

   **Phase 2: Query Router**
   - 调用 `resolveSkill(userInput)` 通过 Skill Router 选择合适的 Skill：
     - **关键字路由**（优先）：检测 CRUD 操作关键字（增删改查、统计、对比、排行等）→ 选择 `nl2sql.v1`。
     - **功能开关路由**（降级）：复杂查询或未命中关键字 → 选择 `analysis.v1`。
   - 准确率 95%+，响应时间 < 50ms。

   **Phase 3: Schema & Digest Building**
   - 调用 `_getAllTableSchemas()`：查询 `information_schema.tables`（表名以 `main_table_%` 前缀），若为空则回退到 `DESCRIBE main_table`。
   - 动态导入 `digestBuilder.ts`：
     - `buildSchemaDigest(allTableSchemas)` → 生成 Schema Digest（最大 4000 chars）。
     - `buildUserSkillDigest(userSkillConfig)` → 生成 User Skill Digest（最大 1200 chars）。
     - `buildSystemSkillPack(industry)` → 生成 System Skill Pack（最大 2000 chars）。
   - 三个 Digest 合并后作为 `context.userSkillDigest` 传入 Skill。

   **Phase 4: Skill Execution**
   - 调用选中的 Skill：
     - `await skillImpl.execute({ userInput, executeQuery, allTableSchemas, userSkillDigest })`
   - Skill 内部会：
     - 使用增强后的 Prompt（包含 Schema Digest + User Skill Digest + System Skill Pack）。
     - 调用 LLM（若 `llmConfig.mockEnabled` 为 true，则返回 mock response）。
     - 解析 LLM 返回信息：优先读取 `message.tool_calls`（function 调用）；若没有，则尝试把 `message.content` 当做 JSON 来解析 action/tool 调用。
     - 根据解析到的工具调用（例如 `sql_query_tool`），从 `tools` 注册表中找到对应实现并调用（传入 `executeQuery` 与参数）。
     - 对工具返回结果做 BigInt 转字符串处理，返回 `SkillRunResult`。

   **Phase 5: Metadata Collection（M10.5 新增）**
   - 计算 5 个元数据字段：
     - `skillName`: 使用的 Skill 名称（如 `analysis.v1`）。
     - `industry`: 从 `userSkillConfig.industry` 提取。
     - `userSkillApplied`: `userSkillConfig !== null`。
     - `userSkillDigestChars`: `userSkillDigest.length`。
     - `activeTable`: `attachments[0]?.tableName ?? 'main_table_1'`（**单表限制**）。
   - 构建 `effectiveSettings`（从 `userSkillConfig.tableConfigs[activeTable]` 提取）：
     - `tableName`: 当前表名。
     - `fieldMapping`: 字段映射配置。
     - `defaultFilters`: 默认过滤条件列表。
     - `metrics`: 自定义指标列表。
   - 返回 `AgentRunResult`：
     - `status`: SUCCESS / CANCELLED / NEED_CLARIFICATION。
     - `result`: Skill 执行结果（SQL、data、schema、thought）。
     - `metadata`: 5 个元数据字段。
     - `effectiveSettings`: 生效的配置快照。

- **4. Workbench 接收 `AgentRunResult`，更新 UI 并传递元数据到 `ResultsDisplay` 组件。**

- **5. ResultsDisplay 渲染透明度信息（M10.5）**：
   - `renderSkillMetadataTags()`：展示 Skill/Industry/UserSkill 3 个标签。
   - `renderEffectiveSettings()`：展示 Table Name、Field Mapping、Default Filters（Top-5）、Metrics（Top-8）。

---

## 七、环境配置清单

### 必需环境变量

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `VITE_LLM_PROVIDER` | LLM 提供商 | `"openai"` / `"webllm"` | `"openai"` |
| `VITE_LLM_API_KEY` | LLM API 密钥 | `"sk-xxxxx"` | - |
| `VITE_LLM_API_URL` | LLM API 端点 | `"https://api.openai.com/v1"` | `"https://api.openai.com/v1"` |
| `VITE_LLM_MODEL_NAME` | 模型名称 | `"gpt-4"` / `"gpt-3.5-turbo"` | `"gpt-4"` |
| `VITE_LLM_MOCK` | 是否启用 Mock 模式 | `"true"` / `"false"` | `"false"` |

### 可选环境变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `VITE_ENABLE_DEBUG` | 开启调试日志 | `"true"` |
| `VITE_MAX_FILE_SIZE` | 文件上传大小限制 (bytes) | `52428800` (50MB) |
| `VITE_DEFAULT_INDUSTRY` | 默认行业 | `"ecommerce"` / `"finance"` / `"retail"` |

### 设置方式

**方法 1: Shell 环境变量**
```bash
export VITE_LLM_API_KEY="sk-xxxxx"
export VITE_LLM_MOCK="false"
bun run dev
```

**方法 2: .env 文件** (推荐)
```bash
# 在项目根目录创建 .env 文件
cat > .env << EOF
VITE_LLM_PROVIDER=openai
VITE_LLM_API_KEY=sk-xxxxx
VITE_LLM_API_URL=https://api.openai.com/v1
VITE_LLM_MODEL_NAME=gpt-4
VITE_LLM_MOCK=false
EOF

# Vite 会自动加载 .env 文件
bun run dev
```

**注意事项**:
- ⚠️ `.env` 文件应添加到 `.gitignore`，避免泄露密钥
- ⚠️ `VITE_` 前缀是必需的（Vite 环境变量约定）
- ⚠️ Mock 模式 (`VITE_LLM_MOCK=true`) 用于开发调试，不调用真实 LLM

---

## 八、Chrome Extension 调试指南

### 8.1 加载和更新扩展

**首次加载**:
1. 运行 `bun run build` 生成 `dist/` 目录
2. Chrome 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"，选择 `dist/` 目录

**热更新**:
- **开发模式**: 运行 `bun run dev`，Vite 会监听文件变化并自动重新构建
- **手动刷新**: 修改代码后，在 `chrome://extensions/` 点击扩展的"刷新"按钮
- **Service Worker 重启**: 修改 `background.ts` 后，点击 Service Worker 的 "reload"

### 8.2 调试技巧

**调试 Side Panel (UI)**:
1. 打开扩展侧边栏
2. 在侧边栏任意位置右键 → "检查"
3. 打开 Chrome DevTools，可查看：
   - Console 日志（UI 层日志）
   - Network 请求（LLM API 调用）
   - React DevTools（组件树和状态）

**调试 Service Worker (background.ts)**:
1. 访问 `chrome://extensions/`
2. 找到 Vaultmind 扩展
3. 点击 "Service Worker" 链接（蓝色）
4. 打开 Service Worker DevTools，查看后台任务日志

**调试 Web Worker (duckdb.worker.ts)**:
1. 在 Side Panel DevTools 中
2. 切换到 "Sources" 标签页
3. 展开左侧 "Threads" 部分
4. 选择 `duckdb.worker.ts`，可设置断点
5. Console 中查看 Worker 日志（`[DB Worker]` 前缀）

**调试 Content Script**:
1. 打开注入了 content-script 的网页
2. 右键网页 → "检查"
3. Console 中筛选来自 content-script 的日志

### 8.3 常见调试场景

**场景 1: LLM 调用失败**
- 检查 Side Panel DevTools → Network → 筛选 `/chat/completions`
- 查看请求 Headers（API Key 是否正确）
- 查看响应状态码（401: 认证失败，429: 限流）

**场景 2: DuckDB 查询错误**
- 检查 Console 日志，搜索 `[DB Worker]`
- 查看 Worker DevTools 的 Console
- 检查 SQL 语句是否合法（双引号、LIMIT、关键字）

**场景 3: 文件上传失败**
- 检查 Console 错误信息
- 确认文件格式（CSV/Excel）和大小限制
- 检查 `useFileParsing.ts` 的 `loadFileInDuckDB` 逻辑

**场景 4: 界面渲染异常**
- React DevTools → 检查组件 props 和 state
- Console 中查看 React 错误边界捕获的异常
- 检查 Ant Design 组件的 API 调用是否正确

### 8.4 性能分析

**分析 Bundle 大小**:
```bash
bun run build
# 查看 dist/ 目录，关注大文件（如 duckdb-eh.wasm 34MB）
```

**分析运行时性能**:
1. DevTools → Performance 标签页
2. 点击录制按钮，执行操作（如上传文件、运行查询）
3. 停止录制，分析火焰图：
   - 长任务（Long Tasks）: 主线程阻塞 > 50ms
   - Worker 通信：`postMessage` / `onmessage` 耗时

**内存泄漏检测**:
1. DevTools → Memory 标签页
2. 选择 "Heap snapshot"
3. 执行多次查询操作
4. 对比快照，查找未释放的对象（如 DuckDB 连接、Arrow 表）

---

## 九、错误处理与常见问题
- LLM 错误
  - 401/403：检查 `VITE_LLM_API_KEY` 与 `VITE_LLM_API_URL`。
  - 超时/限流：检查 LlmClient 的超时/重试策略（当前客户端直接使用 `openai` 包，超时需在调用方外部管理）。
- Worker/ DuckDB 错误
  - DuckDB 初始化失败：查看 `src/workers/duckdb.worker.ts` 中的初始化日志（worker 会打印详细错误）。常见原因：bundle 资源 URL 不正确或 CORS 问题。
  - "Missing resources for DUCKDB_INIT"：说明前端没有正确传递 bundle 资源给 worker。检查 sandbox/iframe（`src/components/layout/Sandbox.tsx` 或负责注入资源的代码）。
  - 文件加载失败（LOAD_FILE）：确认 `fileName`, `buffer`, `tableName` 都已被发送。
  - BigInt 序列化问题：AgentExecutor 提供了 `_sanitizeBigInts`，会把 BigInt 转为字符串以避免 JSON 序列化错误。
- 类型/构建错误
  - 若遇到 TS 类型错误或编译失败：检查 `tsconfig.json` 与 `vite.config.ts` 中 worker/alias 设置（例如 `apache-arrow` 的别名）。

---

## 十、扩展点（如何添加 prompt / tool / worker）
- 添加新的 prompt
  1. 在 `src/prompts/` 下新建文件，例如 `finance.ts`，导出符合 `PromptTemplate` 结构（system_prompt, tool_selection_prompt_template, suggestions）。
  2. 在 `src/services/llm/promptManager.ts` 中把新的 prompt 集合注册到 `promptSets`。
  3. 在 UI 或 AgentExecutor 中以 role 名称调用 `PromptManager.getToolSelectionPrompt('finance', userInput, tableSchema)`。

- 添加新的 tool（示例：CSVImportTool）
  1. 在 `src/services/tools/` 新建 `CSVImportTool.ts`，实现类似 `sql_query_tool` 的函数签名（`(executeQuery, params) => Promise<any>`）。
  2. 在 `src/services/tools/duckdbTools.ts` 中把该工具添加到 `tools` 注册表，并在 `toolSchemas` 中补充 JSON Schema（供 LLM 在构造 prompts 时了解工具参数）。
  3. 若该工具需要在 worker 中处理（例如大文件解析），则实现 `src/workers/csv.worker.ts` 并在前端通过 `useWorker` 或相应的 loader 调用，并在 worker/主线程间定义好消息协议（类似 `LOAD_FILE` / `DUCKDB_EXECUTE_QUERY`）。
  4. 在 `AgentExecutor` 中无需修改主要逻辑（只要工具已在注册表中），LLM 只需返回 action 指定新的 tool 名称。

八、调试建议与排查流程
- 开发时先启用 mock：设置 env VITE_LLM_MOCK=true 可避免频繁调用真实 LLM 并便于调试 tool 调用解析路径。
- Worker 调试：在 `src/workers/duckdb.worker.ts` 中已有 console.log（例如 '[DB Worker] ...'），在浏览器 DevTools -> Workers 中查看日志与消息交互。
- 捕获 Agent 决策点日志：在 `AgentExecutor` 中关键点（构造 prompt、收到 LLM 响应、解析 tool_call、调用工具前后）都有 console.log，可据此定位问题。
- 复现步骤：准备一个小 CSV（含少量行），上传到 UI，使用一个预设问题（见 `src/prompts/ecommerce.ts` 中 suggestions），观察 Workbench、Worker 和 Network 面板的交互。

九、快速示例
- 启动开发环境并开启 mock：
  1. 在 shell 中设置环境变量（macOS / zsh 示例）并运行 dev：
     - export VITE_LLM_MOCK=true
     - export VITE_LLM_API_KEY="<your-key>"
     - bun run dev

- 新增 Prompt（概要）
  - 文件：`src/prompts/finance.ts`
  - 在 `PromptManager` 注册： promptSets['finance'] = financePrompts
  - 使用：AgentExecutor/Workbench 调用 `getToolSelectionPrompt('finance', userInput, tableSchema)`。

十、参考文件列表（仓库中关键文件）

### 核心运行时
- `src/services/llm/agentRuntime.ts`（**M10.4 新增**，替代 agentExecutor）
- `src/services/llm/agentExecutor.ts`（已废弃）
- `src/services/llm/LlmClient.ts`
- `src/services/llm/promptManager.ts`

### Skills 系统（**M10.4 新增**）
- `src/services/llm/skills/types.ts`（User Skill L0 类型定义）
- `src/services/llm/skills/router.ts`（Query Type Router）
- `src/services/llm/skills/registry.ts`（Skill 注册表）
- `src/services/llm/skills/core/digestBuilder.ts`（Prompt Digest 构建器）
- `src/services/llm/skills/impl/nl2sql.ts`（NL2SQL Skill 实现）
- `src/services/llm/skills/impl/analysis.ts`（Analysis Skill 实现）

### User Skill 服务（**M10.4 新增**）
- `src/services/userSkill/userSkillService.ts`（User Skill 持久化服务）

### 工具
- `src/services/tools/duckdbTools.ts`

### Hooks
- `src/hooks/useLLMAgent.ts`
- `src/hooks/useDuckDB.ts`
- `src/hooks/useFileParsing.ts`
- `src/hooks/useClustering.ts`（**2026-02-08 新增**，客户聚类分析 Hook）

### Worker
- `src/workers/duckdb.worker.ts`
- `src/workers/clustering.worker.ts`（**2026-02-08 新增**，K-Means 聚类 Web Worker）
- `src/services/duckDBService.ts`

### 前端页面
- `src/pages/workbench/index.tsx`（**M10.4/M10.5 更新**）
- `src/pages/workbench/components/ChatPanel.tsx`
- `src/pages/workbench/components/ResultsDisplay.tsx`（**M10.5 新增透明度功能**）
- `src/pages/settings/ProfilePage.tsx`（**M10.4 新增 User Skill 配置，M10.5 新增 System Metrics**）
- `src/pages/insight/index.tsx`（**2026-02-08 更新**，集成客户聚类可视化）

### 数据分析模块（**2026-02-08 新增**）
#### 异常检测（Anomaly Detection）
- `src/services/anomaly/anomalyService.ts`（孤立森林算法服务）
- `src/workers/anomaly.worker.ts`（异常检测 Web Worker）
- `src/components/insight/AnomalyScatterChart.tsx`（异常值散点图）
- `src/components/insight/AnomalyHeatmapChart.tsx`（异常值热力图）
- `src/hooks/useAnomaly.ts`（异常检测 React Hook）

#### 客户聚类（Customer Clustering）
- **核心服务**：
  - `src/services/clustering/clusteringService.ts`（聚类分析服务，313行）
  - `src/services/clustering/rfmColumnDetector.ts`（RFM列自动检测，179行）
  - `src/services/clustering/rfmSqlGenerator.ts`（RFM SQL生成器，211行）
- **Worker**：
  - `src/workers/clustering.worker.ts`（K-Means WASM调用，172行）
- **类型定义**：
  - `src/types/clustering.types.ts`（完整类型系统，219行）
  - `src/constants/clustering.constants.ts`（配置常量，180行）
- **可视化组件**：
  - `src/components/insight/ClusteringScatterChart.tsx`（客户分布散点图，233行）
  - `src/components/insight/ClusteringRadarChart.tsx`（簇特征雷达图，206行）
  - `src/components/insight/ClusteringErrorBoundary.tsx`（错误边界，115行）
  - `src/components/insight/ClusteringSkeleton.tsx`（骨架屏，103行）
- **业务逻辑**：
  - `src/services/insight/strategies/ClusteringActionStrategy.ts`（策略模式，95行）
  - `src/prompts/insight/clustering-action.ts`（LLM Prompt模板，298行）
- **React Hook**：
  - `src/hooks/useClustering.ts`（状态管理 + 缓存，224行）
- **工具函数**：
  - `src/services/utils/arrowUtils.ts`（Arrow IPC序列化，201行）

#### Insight 通用模块
- `src/services/insight/contextBuilder.ts`（上下文构建器）
- `src/services/insight/aggregator.ts`（数据聚合器，支持异常+聚类）
- `src/services/insight/insightActionService.ts`（LLM洞察服务）
- `src/services/insight/strategies/index.ts`（策略注册表）
- `src/types/insight-action.types.ts`（Insight通用类型）

### Prompts
- `src/prompts/ecommerce.ts`
- `src/prompts/insight/anomaly-action.ts`（异常检测Prompt）
- `src/prompts/insight/clustering-action.ts`（**2026-02-08 新增**，客户聚类Prompt）

### 配置
- `package.json`
- `vite.config.ts`
- `tsconfig.json`

### 文档（**M10.4/M10.5 新增**）
- `design/refactor2.md`（M10 系列设计文档）
- `design/m8-regression.md`（M10.4 + M10.5 回归测试用例）
- `design/skillManual.md`（User Skill 配置操作手册）

---

---

## 十一、FAQ 常见问题

### Q1: 为什么构建后的 dist/ 目录很大（> 40MB）？

**A**: 主要原因是 DuckDB WASM 引擎（`duckdb-eh.wasm` ~34MB）。这是浏览器内 SQL 引擎的代价，但带来了以下优势：
- ✅ 数据不离开浏览器，隐私安全
- ✅ 支持复杂 SQL 查询（JOIN、聚合、窗口函数）
- ✅ 高性能（接近原生 SQLite）

**优化建议**:
- 生产环境使用 CDN 托管 WASM 文件
- 延迟加载（仅在需要时初始化 DuckDB）

---

### Q2: Mock 模式下 LLM 返回什么数据？

**A**: 当 `VITE_LLM_MOCK=true` 时，LLM Client 会返回预定义的 mock 响应（见 `src/services/llm/llmClient.ts`）：
```json
{
  "action": {
    "tool": "sql_query_tool",
    "args": { "query": "SELECT COUNT(*) as total FROM main_table_1" }
  },
  "thought": "Mock response for testing"
}
```

**用途**: 开发环境快速调试，避免频繁调用真实 LLM（节省 API 配额和时间）。

---

### Q3: 为什么 DuckDB 查询中使用双引号 `"column"` 而不是反引号 `` `column` ``？

**A**: DuckDB 的 SQL 方言要求使用双引号包裹标识符（表名、列名），反引号会导致语法错误。

**示例**:
```sql
-- ✅ 正确 (DuckDB)
SELECT "下单时间", "订单金额" FROM "main_table_1"

-- ❌ 错误 (MySQL 风格)
SELECT `下单时间`, `订单金额` FROM `main_table_1`
```

**相关修复**: M10.6 中 `safeQuoteIdent()` 已从反引号改为双引号。

---

### Q4: 如何新增一个行业（如 Healthcare）？

**步骤**:
1. 创建 `src/prompts/healthcare.ts`，参考 `ecommerce.ts` 结构
2. 在 `src/services/llm/promptManager.ts` 中注册：
   ```typescript
   import healthcarePrompts from '../../prompts/healthcare.ts';
   const promptSets = {
     ecommerce: ecommercePrompts,
     finance: financePrompts,
     retail: retailPrompts,
     healthcare: healthcarePrompts,  // 新增
   };
   ```
3. 在 `src/services/flags/featureFlags.ts` 中添加功能开关：
   ```typescript
   export interface FeatureFlags {
     enableHealthcare?: boolean;  // 新增
   }
   export const DEFAULT_FEATURE_FLAGS = {
     enableHealthcare: true,  // 默认启用
   };
   ```
4. 在 `src/services/llm/skills/queryTypeRouter.ts` 的 `DOMAIN_TERMS_BY_INDUSTRY` 添加行业术语
5. 构建并测试

---

### Q5: 如何限制上传文件大小？

**A**: 在 `src/hooks/useFileParsing.ts` 的 `handleFileUpload` 中添加校验：

```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

if (file.size > MAX_FILE_SIZE) {
  throw new Error(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
}
```

**前端提示**: 在 `ChatPanel.tsx` 的 Upload 组件中添加 `beforeUpload` 钩子。

---

### Q6: BigInt 序列化错误 `Cannot serialize BigInt` 怎么解决？

**A**: M10.6 已修复此问题（`DuckDBService._normalizeBigIntFields()`）。如果仍遇到，确保：
1. 使用最新代码（包含 M10.6 修复）
2. 检查 `duckDBService.ts` 中 `executeQuery` 是否调用了 `_normalizeBigIntFields`
3. 确认 DuckDB 聚合函数返回的 BigInt 被正确转换为 `number`

---

### Q7: 为什么查询结果只显示 500 行？

**A**: 出于性能考虑，系统默认限制查询结果最多 500 行（`LIMIT 500`）。

**修改方式**:
- 在 `src/services/llm/skills/builtin/analysis.v1.ts` 中搜索 `LIMIT 500`
- 修改为目标值（如 `LIMIT 1000`）
- **注意**: 过大的结果集会导致浏览器内存压力

---

### Q8: 如何调试 Skill 选择逻辑？

**A**: 在 `src/services/llm/skills/queryTypeRouter.ts` 的 `resolveSkill()` 中添加日志：

```typescript
export function resolveSkill(userInput: string, industry?: string): string {
  console.log('[Router] Input:', userInput, 'Industry:', industry);
  const skillId = resolveSkillId(userInput);
  console.log('[Router] Selected Skill:', skillId);
  return skillId;
}
```

**查看日志**: DevTools Console → 筛选 `[Router]`

---

### Q9: User Skill 配置保存在哪里？

**A**: 保存在 **Chrome Storage** (chrome.storage.local)，按 session 维度隔离。

**查看存储**:
1. DevTools → Application 标签页
2. 左侧 Storage → Extension Storage → Vaultmind
3. 查看键 `userSkill_{sessionId}`

**清空配置**: 在 Settings → Profile 页面点击"重置配置"或手动删除 Chrome Storage 键。

---

### Q10: 如何禁用某个行业（如 Finance）？

**A**: 在 `src/services/flags/featureFlags.ts` 中设置：

```typescript
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableEcommerce: true,
  enableFinance: false,  // 禁用金融行业
  enableRetail: true,
};
```

**效果**: 用户尝试使用 Finance 行业时会收到友好错误提示："Industry 'finance' is not enabled. Available: ecommerce, retail"

---

## 十二、项目技术规范（Coding Standards）

> 本节是项目的强制工程规范汇总（来源：`.github/copilot-instructions.md` + 本项目 Chrome Extension 运行形态）。
> 之后所有新增/修改代码应优先遵循本节；若与系统级约束冲突，以系统约束为准。

### 1) 技术栈与运行环境

- **Language**: TypeScript 5.x+（strict 模式）
- **Runtime**: **Bun**（本项目构建/运行命令以 `bun run ...` 为准）
- **UI**: React 18 + TSX
- **UI Library**: Ant Design (antd)
- **Data Engine**: DuckDB-Wasm + Apache Arrow
- **Build Tooling**: Vite + `@crxjs/vite-plugin`
- **Testing**: Vitest

### 2) 类型安全（必须遵守）

- **禁止使用 `any`**
  - 若类型不确定，优先使用 `unknown`，并在使用前通过类型守卫/断言缩小范围。
- **对象结构优先使用 `interface`**
  - 联合类型 / 交叉类型使用 `type`。
- **公共 API / 复杂逻辑必须显式标注返回值类型**
  - 简单内部逻辑允许 TS 自动推断。

### 3) 编码风格与工程约定

- **模块化**：强制使用 ES Modules（`import`/`export`），禁止 `require`。
- **异步处理**：统一使用 `async/await` + `try/catch`，禁止 `.then()` 链式调用。
- **命名规范**
  - 组件：`PascalCase`
  - 类：`camelCase`（按项目文档约定执行）
  - 函数与变量：`camelCase`
  - 常量：`UPPER_SNAKE_CASE`
  - 类型与接口名：不加 `I` 前缀

### 4) React/TSX 规范

- 只使用 **函数式组件**（Functional Components），禁止类组件。
- Hooks 依赖必须完整：`useEffect` 必须声明完整依赖数组。
- 对昂贵计算使用 `useMemo` / `useCallback`，避免无意义 rerender。

### 5) 文档与注释

- 复杂逻辑函数使用 **TSDoc** 注释。
- 关键函数至少包含：
  - `@param`
  - `@returns`
  - `@throws`

### 6) 错误处理与返回结构

- 业务异常统一使用自定义 `AppError`（如仓库已定义则必须复用）。
- 对外返回格式建议遵循：
  - `{ success: boolean, data: T, error?: string }`

### 7) Chrome Extension / Worker 场景额外约束（强烈建议）

- **CSP**：Chrome Extension 通常不允许 `unsafe-eval`。
  - 避免在生产路径中引入依赖 `eval`/`new Function` 的库。
- **内存/性能**：浏览器环境对大文件更敏感。
  - 对上传文件设置合理大小限制与总量限制；提示应温和、短、可被用户理解。
- **主线程不阻塞**：大文件解析/重计算尽量放到 Worker 或 DuckDB 内执行。

## 项目沟通交互角色，规则

请遵守以下沟通模板，你理解请回复：理解，否则请对我提问。复杂问题我会提供AS-IS,简单问题我直接提供TO-BE要求：

#### 角色
前端资深技术架构师 + 资深 Data Agent 产品经理。精通 Bun 生态、TypeScript、DuckDB-Wasm 及 WebWorker 通信，擅长高性能 Data Agent 的前端集成与 UI/UX 优化。
#### 工作流
1. 方案分析：基于**现状AS-IS或者问题**分析需求，输出分步骤的修复规划。未经人类确认方案前，不修改文件。
2. 环境注入：确认方案后，首先通过终端运行 bun test 或 bun run build 获取当前环境的原始报错。
3. 迭代修复
    - 执行代码修改
    - 修改后自主运行相关构建或测试命令（如 bun run build）
    - 若编译/测试失败：读取终端报错，进行自我反思，重新执行“修复-测试”循环，直至通过。
    - 若尝试 3 次仍未修复：停止自动循环，输出当前遇到的阻塞点并请求人类干预
- 最终交付：代码通过自检后，输出最终补丁及验证成功的日志截图/文本
- 功能测试：你需要明确告诉我测试用例A/B/C,输入什么，预期结果（结果可以是多个)
#### 规则
1. 最小干预原则：聚焦问题做局部修改，严禁大面积重构或删除无关的有效代码
2. 健壮性要求：增强代码鲁棒性效应，确保无语法错误、无 TS 类型错误。针对 Bun + DuckDB 环境，注意 Wasm 的跨域隔离（COOP/COEP）与 Buffer 兼容性
3. 行为禁令：禁止输出 "implementation unchanged" 等占位符；禁止覆盖已注明的保留逻辑。
4. 自愈权限：默认允许在终端执行 bun 相关的 Read-only（检查）和 Build（验证）操作，如：bun run build
5. 规范要求：代码注释、Console 日志一律使用 英文。
#### 现状（AS-IS）
...
#### 优化目标（TO-BE）
...
#### 输出要求
1. 方案总览：简述修复思路。
2. 代码实现：输出修复后的完整代码块或 Diff
3. 验证结果：附带终端运行 bun 命令后的成功输出信息。
4. 交互语言：全程使用中文交流。

---

## M10 系列重构总结

### 完成情况

| 里程碑 | 完成日期 | 核心内容 | 关键指标 |
|--------|---------|----------|---------|
| M10.4 | 2026-01-24 | User Skill L0 配置系统 | Query Router 准确率 95%+，响应时间 < 50ms |
| M10.5 | 2026-01-25 | 透明度与可解释性增强 | 5 个元数据字段，Effective Settings 面板 |
| M10.6 | 2026-01-29 | 多行业支持 + 回归修复 | 3 行业 Prompt，7 个回归问题 + 1 个 BigInt 问题修复 |

### 技术成果

**行业支持**:
- ✅ 3 个行业完整支持（ecommerce, finance, retail）
- ✅ 动态 Prompt 选择 + 降级策略
- ✅ 行业特定领域术语隔离
- ✅ 功能开关系统（默认 ecommerce ON，其他 OFF）

**代码质量**:
- ✅ TypeScript 无错误，ESLint 预存在错误未增加
- ✅ 47+ 单元测试通过（queryTypeRouter 22, promptManager 11, analysis.v1 14）
- ✅ 8/8 M8 回归测试问题修复（7 个代码修复 + 1 个文档任务）
- ✅ BigInt 序列化问题修复（影响所有聚合查询结果显示）

**架构优化**:
- ✅ 移除硬编码电商逻辑（从 64% → 97% 完成度）
- ✅ 路由整合（router.ts 合并到 queryTypeRouter.ts，减少 920 字节）
- ✅ 国际化（所有注释翻译为英文）
- ✅ 强类型约束（Zod schema + SQL 注入防护）

### 未来计划

**P2 遗留任务**:
- Case 13: 补充 Query Type Router 测试文档
- Case 9 Backend: LLM 自拒场景记录 metadata（需独立任务）

**潜在扩展**:
- 支持更多行业（healthcare, education, logistics 等）
- System Metrics 动态加载（当前硬编码）
- 运行时切换功能开关（当前编译时静态）
- 多表联查支持（当前仅单表）

---

**最后更新**: 2026-02-08  
**文档维护者**: AI Agent (基于代码仓库自动生成)  
**文档版本**: v2.0 (重构版 - 新增目录导航、快速开始、环境配置、调试指南、FAQ、工作流规范)
