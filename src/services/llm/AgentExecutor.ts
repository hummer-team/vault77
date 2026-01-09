import { PromptManager } from './PromptManager';
// import { DuckDBService } from '../DuckDBService'; // 移除直接依赖
import { tools, toolSchemas } from '../tools/DuckdbTools.ts';
import { LLMClient, LLMConfig } from './LLMClient';
// --- CRITICAL CHANGE 1: Import streamObject ---
import { streamObject } from 'ai';
import { z } from 'zod';

// 定义 executeQuery 函数的类型
export type ExecuteQueryFunc = (sql: string) => Promise<any>;

export class AgentExecutor {
  private promptManager = new PromptManager();
  private llmClient: LLMClient;
  private executeQuery: ExecuteQueryFunc;

  // 关键修改：构造函数现在接收 executeQuery
  constructor(config: LLMConfig, executeQuery: ExecuteQueryFunc) {
    this.llmClient = new LLMClient(config);
    this.executeQuery = executeQuery;
  }

  public async execute(userInput: string): Promise<any> {
    try {
      // 1. 关键修改：使用注入的 executeQuery 获取表结构
      const tableSchema = await this.executeQuery("DESCRIBE 'main_table';");
      if (!tableSchema || tableSchema.length === 0) {
        throw new Error("Could not retrieve table schema or table is empty.");
      }

      // 2. Get available tools schema description
      const availableTools = JSON.stringify(toolSchemas, null, 2);

      // 3. Construct the prompt
      const prompt = this.promptManager.getToolSelectionPrompt(userInput, tableSchema, availableTools);

      // --- CRITICAL CHANGE 2: Use streamObject and fix the prompt parameter ---
      const { object } = await streamObject({
        model: this.llmClient.model,
        messages: [{ role: 'user', content: prompt }], // <-- Correctly wrap prompt in messages array
        schema: z.object({
          tool: z.enum(toolSchemas.map(t => t.tool) as [string, ...string[]]),
          args: z.any(),
        }),
      });

      // We can still await the final object directly if we don't need to process intermediate steps
      const toolCall = await object;
      // --- END CRITICAL CHANGE ---

      if (!toolCall || !toolCall.tool) {
        throw new Error("The AI did not select a tool to execute.");
      }

      const { tool: toolName, args } = toolCall;

      const toolFunction = tools[toolName];
      if (!toolFunction) {
        throw new Error(`LLM selected an unknown tool: ${toolName}`);
      }

      console.log(`Executing tool: ${toolName} with params:`, args);
      // 关键修改：将 executeQuery 传递给工具函数
      const toolResult = await toolFunction(this.executeQuery, args);

      return {
        tool: toolName,
        params: args,
        result: toolResult,
      };

    } catch (error) {
      console.error("Agent execution failed:", error);
      throw error;
    }
  }
}
