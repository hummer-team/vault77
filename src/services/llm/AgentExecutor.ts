import { PromptManager } from './PromptManager';
import { tools, toolSchemas } from '../tools/DuckdbTools.ts';
import { LLMClient, LLMConfig } from './LLMClient';

// The 'ai' and 'zod' packages are no longer needed for the API call.
export type ExecuteQueryFunc = (sql: string) => Promise<any>;

export class AgentExecutor {
  private promptManager = new PromptManager();
  private llmClient: LLMClient;
  private executeQuery: ExecuteQueryFunc;
  private llmConfig: LLMConfig; // <-- CRITICAL CHANGE 1: Store llmConfig

  constructor(config: LLMConfig, executeQuery: ExecuteQueryFunc) {
    this.llmClient = new LLMClient(config);
    this.executeQuery = executeQuery;
    this.llmConfig = config; // <-- CRITICAL CHANGE 1: Store llmConfig
  }

  public async execute(userInput: string): Promise<any> {
    try {
      const tableSchema = await this.executeQuery("DESCRIBE main_table;");
      if (!tableSchema || tableSchema.length === 0) {
        throw new Error("Could not retrieve table schema or table is empty.");
      }

      const role = 'ecommerce';
      const userPromptTemplate = this.promptManager.getToolSelectionPrompt(role, userInput, tableSchema);

      // --- CRITICAL CHANGE 2: Implement Mock Logic ---
      let response: any;
      if (this.llmConfig.mockEnabled) {
        console.warn('[AgentExecutor] LLM Mock is ENABLED. Returning mock response.');
        // Simulate a Qwen-like response with tool call in content
        response = {
          choices: [{
            message: {
              role: 'assistant',
              content: JSON.stringify({
                thought: `Mocking LLM response for query: "${userInput}". Decided to use sql_query_tool.`,
                action: {
                  tool: 'sql_query_tool',
                  args: {
                    query: `SELECT 'mocked_value' AS mock_result, '${userInput}' AS user_query FROM main_table LIMIT 10;`
                  }
                }
              })
            },
            finish_reason: 'stop',
            index: 0
          }],
          object: 'chat.completion',
          id: 'mock-chatcmpl-id',
          model: 'mock-model',
          created: Date.now(),
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };
        // Add a small delay to simulate network latency
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        // Original LLM API call
        console.log('[AgentExecutor] Calling official openai.chat.completions.create...');
        response = await this.llmClient.client.chat.completions.create({
          model: this.llmClient.modelName,
          messages: [
            { role: 'system', content: "You are an expert data analyst who writes SQL queries based on user requests." },
            { role: 'user', content: userPromptTemplate }
          ],
          tools: toolSchemas.map(t => ({ type: 'function', function: { name: t.tool, description: t.description, parameters: t.params } })),
          tool_choice: 'auto',
        });
      }
      // --- END CRITICAL CHANGE 2 ---

      const message = response.choices[0].message;
      console.log('[AgentExecutor] Received LLM message:', message); // Add log to see the raw message

      // --- CRITICAL CHANGE: Adapt to Qwen's response format ---
      let toolCall = message.tool_calls?.[0];
      let thought = `AI decided to use a tool.`; // Default thought

      // If 'tool_calls' is missing, try to parse it from the 'content' field
      if (!toolCall && message.content && typeof message.content === 'string') {
        try {
          const parsedContent = JSON.parse(message.content);
          
          if (parsedContent.action && parsedContent.action.tool) {
            // Reshape the parsed content to mimic the structure of a standard toolCall
            toolCall = {
              id: `call_${Date.now()}`, // Create a synthetic ID
              type: 'function',
              function: {
                name: parsedContent.action.tool,
                arguments: JSON.stringify(parsedContent.action.args),
              }
            };
            thought = parsedContent.thought || thought; // Use the thought from the response if available
            console.log('[AgentExecutor] Extracted tool call from message content.');
          }
        } catch (e) {
          // Content is not a valid JSON, we will proceed and let the `if (!toolCall)` handle it.
          console.warn('[AgentExecutor] Message content is not a valid JSON for tool call.');
        }
      }
      // --- END CRITICAL CHANGE ---

      if (!toolCall) {
        throw new Error("The AI did not select a tool to execute.");
      }

      // --- CRITICAL CHANGE: Add type guard to satisfy TypeScript ---
      if (toolCall.type === 'function') {
        const toolName = toolCall.function.name;
        // Arguments from the official library are a JSON string and must be parsed.
        const args = JSON.parse(toolCall.function.arguments);
        
        console.log(`[AgentExecutor] LLM wants to execute tool: ${toolName} with params:`, args);

        const toolFunction = tools[toolName];
        if (!toolFunction) {
          throw new Error(`LLM selected an unknown tool: ${toolName}`);
        }

        // --- CRITICAL CHANGE: Correctly CALL the tool function and await its RESULT ---
        const toolResult = await toolFunction(this.executeQuery, args);
        // --- END CRITICAL CHANGE ---

        return {
          tool: toolName,
          params: args,
          result: toolResult, // Now this holds the actual data: [{ min_order_amount: 100 }]
          thought: thought,
        };
      } else {
        // Handle cases where the tool call is not a function, though unlikely for now
        throw new Error(`Unsupported tool type: ${toolCall.type}`);
      }
      // --- END CRITICAL CHANGE ---

    } catch (error) {
      console.error("Agent execution failed:", error);
      throw error; // This is correct, it propagates the error to the UI layer.
    }
  }
}
