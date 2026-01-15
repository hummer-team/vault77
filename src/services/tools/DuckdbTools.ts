import { ExecuteQueryFunc } from '../llm/AgentExecutor'; // 导入类型

// --- Custom Error Types ---
export class MissingColumnError extends Error {
  public missingColumn: string;

  constructor(message: string, missingColumn: string) {
    super(message);
    this.name = 'MissingColumnError';
    this.missingColumn = missingColumn;
  }
}

/**
 * Executes a given SQL query against the DuckDB database.
 * This is a powerful and general-purpose tool.
 * @param executeQuery The function to execute a SQL query.
 * @param params An object containing the SQL query string.
 * @param params.query The SQL query to execute.
 * @returns A promise that resolves to the query result.
 */
export const sql_query_tool = async (executeQuery: ExecuteQueryFunc, { query }: { query: string }): Promise<any> => {
  console.log(`[sql_query_tool] Executing query:`, query);
  try {
    const result = await executeQuery(query);
    console.log(`[sql_query_tool] Query result:`, result);
    return result;
  } catch (error: any) {
    console.error(`[sql_query_tool] Error executing query:`, error);
    
    // Check for "column not found" errors from DuckDB
    const columnNotFoundMatch = error.message.match(/Column "([^"]+)" not found/i) || error.message.match(/Unknown column '([^']+)'/i);
    if (columnNotFoundMatch && columnNotFoundMatch[1]) {
      const missingColumn = columnNotFoundMatch[1];
      throw new MissingColumnError(`The column '${missingColumn}' was not found in the table.`, missingColumn);
    }
    
    // Re-throw other errors as is
    throw error;
  }
};

// --- Tool Registry and Schema ---

// The registry now only contains our single, powerful tool.
export const tools: Record<string, (executeQuery: ExecuteQueryFunc, params: any) => Promise<any>> = {
  sql_query_tool,
};

// The schema now describes the `sql_query_tool`.
export const toolSchemas = [
  {
    tool: "sql_query_tool",
    description: "Executes a valid SQL query against the database to answer a user's question. Use this for any data retrieval or calculation.",
    params: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A complete and valid SQL query to run on the available tables.",
        },
      },
      required: ["query"],
    },
  },
];
