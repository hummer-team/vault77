# Vaultmind — 功能变更日志

> 本文件由 AGENTS.md 归档而来，记录各里程碑的详细实现变更。

## 二、核心功能

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

---

### Skill System Integration + User Skill L0
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

### Transparency & Explainability Enhancement
**核心功能**:

1. **Skill Metadata Tags**（`ResultsDisplay.tsx`）
   - **Skill Tag** (蓝色)：显示使用的技能名称（如 `analysis.v1`）
   - **Industry Tag** (绿色)：显示生效的行业配置（如 `ecommerce`）
   - **UserSkill Tag** (橙色/灰色)：显示用户配置状态

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

---

## 三、总体架构概览
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

## 四、关键文件与职责（逐项）
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
  - `src/pages/workbench/components/FlowCanvas.tsx`（**2026-02-17 新增**）
    - SQL Flow 可视化画布，基于 ReactFlow 实现拖拽式节点连接。
    - 节点类型注册（FlowNodeType）：START、TABLE、SELECT、CONDITION、CONDITION_DEFINITION（新增）、CONDITION_GROUP、MERGE、END。
    - 画布交互：节点点击事件（排除特定类型打开详情面板）、边点击删除、快捷键删除（Delete/Backspace）、节点拖拽与连接。
    - 事件处理：onNodeClick（过滤 conditionDefinition 节点，不触发详情面板）、onConnect（智能连接逻辑）、onPaneClick（取消选择）。
  - `src/pages/workbench/components/ResultsDisplay.tsx`（**M10.5 新增透明度功能**）
    - 展示查询结果和分析过程。
    - **新增功能**：
      - `renderSkillMetadataTags()`：渲染 3 个元数据标签（Skill/Industry/UserSkill）。
      - `renderEffectiveSettings()`：渲染 Effective Settings Panel（Table/Field Mapping/Filters/Metrics）。
      - 自动折叠长列表（Filters > 5, Metrics > 8）。
  - `src/components/flow/nodes/ConditionDefinitionNode.tsx`（**2026-02-17 新增**）
    - 条件定义节点核心组件，支持：
      - **表选择**：从 DuckDB 动态加载 table list（通过 getAvailableTables），等待 isDBReady 后加载
      - **多条件配置**：字段/操作符/占位符三元组，支持增删条件（Add/Remove 按钮）
      - **AND/OR 逻辑切换**：Radio.Group 实时切换，默认 AND
      - **节点名称编辑**：refId 可编辑（最大5字符，仅字母数字），校验唯一性
      - **占位符自动生成**：格式 {refId}_{index}（如 CG1_1, CG1_2）
    - **UI 优化**：
      - 下拉框渲染到 `document.body`（`getPopupContainer`）避免节点内事件冲突
      - 使用 `nodrag` 类防止拖拽冲突
      - 点击节点不触发右侧详情面板（FlowCanvas 排除 conditionDefinition 类型）
      - Select 组件添加 `popupClassName="nodrag"` 防止下拉菜单触发拖拽
    - **完整性验证**：检查 tableName 和所有 conditions 是否完整，红色边框提示
  - `src/components/flow/panels/ValueFillPanel.tsx`（**2026-02-17 新增**）
    - 值填充面板（右侧抽屉），功能包括：
      - **按条件组分组展示**：CG1、CG2、CG3 分组显示占位符
      - **基于字段类型的输入控件**：
        - `date` → DatePicker
        - `number`/`integer` → InputNumber
        - `boolean` → Select (true/false)
        - 其他 → Input
      - **实时保存**：onChange 触发 `setPlaceholderValue` 保存到 flowStore
      - **状态显示**：显示占位符值状态（已填充/未填充）
      - **清空功能**：按钮清空所有占位符值
  - `src/components/flow/nodes/MergeNode.tsx`（**2026-02-17 更新**）
    - 衔接节点"+"，用于连接不同阶段的节点。
    - **动态提示文本**：基于上游节点类型显示不同提示：
      - SELECT/SELECT_AGG → "定义条件"
      - CONDITION_DEFINITION → "定义条件关系"
      - CONDITION_GROUP → "执行"
    - **智能节点创建**：
      - `createConditionDefinitionNode`：创建条件定义节点，自动分配 refId（CG1、CG2...）
      - `createRelationNode`：创建关系节点（全局单例，仅创建一次）
      - `createEndNode`：创建执行节点
    - **关系节点单例模式**：检测到已存在 CONDITION_GROUP 节点后，不再自动连接，用户需手动连接条件定义节点到关系节点
    - **节点间距优化**：250px → 180px（ConditionDefinitionNode），500px → 400px（NextMergeNode）
  - `src/components/flow/nodes/ConditionGroupNode.tsx`（**2026-02-17 更新**）
    - 关系节点（原 RelationNode），支持：
      - **三种关系类型**：AND、OR、CUSTOM
      - **自定义表达式输入**：支持 `CG1 AND (CG2 OR CG3)` 语法
      - **表达式验证**：
        - 检测占位符引用（CG1、CG2 是否存在）
        - 检测操作符合法性（AND、OR、括号）
        - 中文操作符自动转换（"并且"→AND、"或者"→OR）
      - **实时表达式编辑**：Input 组件支持多行输入
  - `src/components/flow/nodes/EndNode.tsx`（**2026-02-17 更新**）
    - 执行节点，新增功能：
      - **占位符检测**：`getAllPlaceholdersFromNodes` 扫描所有 CONDITION_DEFINITION 节点
      - **自动打开值填充面板**：未填充时点击执行按钮，自动打开 ValueFillPanel
      - **传递占位符值**：executeQuery 时调用 `getAllPlaceholderValues()` 并传递到 buildSql
      - **执行前验证**：检测到未填充占位符时显示提示并阻止执行
  - `src/pages/settings/ProfilePage.tsx`（**M10.4 新增 User Skill 配置，M10.5 新增 System Metrics 显示**）
    - User Skill 配置界面，包含 4 个配置区块：
      - **Industry Selection**：选择行业（ecommerce/finance/retail/custom）。
      - **Field Mapping**：配置字段映射（Time/Amount/OrderID/UserID）。
      - **Default Filters**：配置默认过滤条件（支持 9 种操作符）。
      - **Custom Metrics**：配置自定义指标（支持 6 种聚合函数）。

---