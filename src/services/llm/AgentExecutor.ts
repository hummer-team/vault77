import { PromptManager } from './PromptManager';
// import { DuckDBService } from '../DuckDBService'; // 移除直接依赖
import { tools, toolSchemas } from '../tools/DuckdbTools.ts';
import { LLMClient, LLMConfig } from './LLMClient';
import { streamObject } from 'ai';
import { z } from 'zod';

// 定义 executeQuery 函数的类型
export type ExecuteQueryFunc = (sql: string) => Promise<any>;

export class AgentExecutor {
  private promptManager = new PromptManager();
  private llmClient: LLMClient;
  private executeQuery: ExecuteQueryFunc;

  constructor(config: LLMConfig, executeQuery: ExecuteQueryFunc) {
    this.llmClient = new LLMClient(config);
    this.executeQuery = executeQuery;
  }

  public async execute(userInput: string): Promise<any> {
    try {
      const tableSchema = await this.executeQuery("DESCRIBE main_table;");
      if (!tableSchema || tableSchema.length === 0) {
        throw new Error("Could not retrieve table schema or table is empty.");
      }

      // --- CRITICAL CHANGE 1: Remove unused availableTools variable ---
      // const availableTools = JSON.stringify(toolSchemas, null, 2); // This is no longer needed

      const role = 'ecommerce'; // For MVP, we hardcode the role.
      // Pass only the required arguments
      const prompt = this.promptManager.getToolSelectionPrompt(role, userInput, tableSchema);
      // --- END CRITICAL CHANGE ---

      const { object } = await streamObject({
        model: this.llmClient.model,
        messages: [{ role: 'user', content: prompt }],
        schema: z.object({
          thought: z.string().describe("Your detailed, step-by-step thought process for how you will answer the user's request."),
          action: z.object({
            tool: z.enum(toolSchemas.map(t => t.tool) as [string, ...string[]]),
            args: z.object({
              query: z.string().describe("The complete SQL query to be executed."),
            }),
          }),
        }),
      });

      const structuredResult = await object;
      
      console.log("[AgentExecutor] LLM Thought:", structuredResult.thought);

      const { tool: toolName, args } = structuredResult.action;
      if (!toolName || !args) {
        throw new Error("The AI did not return a valid action object.");
      }

      const toolFunction = tools[toolName];
      if (!toolFunction) {
        throw new Error(`LLM selected an unknown tool: ${toolName}`);
      }

      console.log(`Executing tool: ${toolName} with params:`, args);
      const toolResult = await toolFunction(this.executeQuery, args);

      return {
        tool: toolName,
        params: args,
        result: toolResult,
        thought: structuredResult.thought,
      };

    } catch (error) {
      console.error("Agent execution failed:", error);
      throw error;
    }
  }
}
