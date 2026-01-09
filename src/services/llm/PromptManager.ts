import { ecommercePrompts } from '../../prompts/ecommerce'; // Direct import for simplicity

// Define a more structured prompt template
interface PromptTemplate {
  system_prompt: string;
  tool_selection_prompt_template: string;
  suggestions: string[];
}

// A record to hold different prompt sets by role
const promptSets: Record<string, PromptTemplate> = {
  ecommerce: ecommercePrompts,
  // finance: financePrompts, // Future extension
};

export class PromptManager {

  /**
   * Gets prompt suggestions for a given user role.
   * @param role The role of the user (e.g., 'ecommerce').
   * @returns A list of suggestion strings.
   */
  public getSuggestions(role: string): string[] {
    const prompts = promptSets[role.toLowerCase()];
    if (!prompts) {
      console.warn(`No prompt template found for role: ${role}`);
      return [];
    }
    return prompts.suggestions;
  }

  /**
   * Constructs the full prompt for the LLM, including system message and tool selection guidance.
   * @param role The role of the user, to select the correct prompt set.
   * @param userInput The user's natural language query.
   * @param tableSchema The schema of the table to be analyzed.
   * @returns The fully constructed prompt string.
   */
  // --- CRITICAL CHANGE: Remove availableTools from function signature ---
  public getToolSelectionPrompt(role: string, userInput: string, tableSchema: any): string {
    const prompts = promptSets[role.toLowerCase()];
    if (!prompts) {
      throw new Error(`Prompt set for role "${role}" not found.`);
    }

    const schemaString = JSON.stringify(tableSchema, null, 2);

    // 1. Combine the system prompt and the main tool selection template
    let fullPrompt = `${prompts.system_prompt}\n\n${prompts.tool_selection_prompt_template}`;

    // 2. Replace placeholders in the template
    fullPrompt = fullPrompt.replace('{userInput}', userInput);
    fullPrompt = fullPrompt.replace('{tableSchema}', schemaString);

    console.log("[PromptManager] Constructed Full Prompt:", fullPrompt); // For debugging
    return fullPrompt;
  }
}
