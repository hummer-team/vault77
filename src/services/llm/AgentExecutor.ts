import { PromptManager } from './PromptManager';
// import { DuckDBService } from '../DuckDBService'; // 移除直接依赖
import { tools, toolSchemas } from '../tools/duckdbTools';
import { LLMClient, LLMConfig } from './LLMClient';
import { streamText } from 'ai';
import { z } from 'zod';

// 定义 executeQuery 函数的类型
export type ExecuteQueryFunc = (sql: string) => Promise<any>;

export class AgentExecutor {
  private promptManager = new PromptManager();
  private llmClient: LLMClient;
  private executeQuery: ExecuteQueryFunc; // 新增 executeQuery 成员

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

      // 4. Start the stream with `streamText`
      const result = await streamText({
        model: this.llmClient.model,
        prompt: prompt,
        tools: toolSchemas.reduce((acc, toolDef) => {
          acc[toolDef.tool] = {
            description: toolDef.description,
            parameters: z.object(toolDef.params.properties),
          };
          return acc;
        }, {} as any),
      });

      // 5. Iterate through the stream to find the tool call
      for await (const part of result.fullStream) {
        if (part.type === 'tool-call') {
          const { toolName, input: args } = part;

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
        }
      }

      throw new Error("The AI did not select a tool to execute.");

    } catch (error) {
      console.error("Agent execution failed:", error);
      throw error;
    }
  }
}
