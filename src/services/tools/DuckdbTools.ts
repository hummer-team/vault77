// import { DuckDBService } from '../DuckDBService'; // 移除直接依赖
import { ExecuteQueryFunc } from '../llm/AgentExecutor'; // 导入类型

// const duckDBService = DuckDBService.getInstance(); // 移除旧实例

// --- Tool Definitions ---

// 关键修改：工具函数现在接收 executeQuery 作为第一个参数
export const findMax = async (executeQuery: ExecuteQueryFunc, { column }: { column: string }): Promise<any> => {
  const sql = `SELECT MAX("${column}") as max_value FROM main_table;`;
  return await executeQuery(sql);
};

export const sumByGroup = async (executeQuery: ExecuteQueryFunc, { groupColumn, aggColumn }: { groupColumn: string, aggColumn: string }): Promise<any> => {
  const sql = `SELECT "${groupColumn}", SUM("${aggColumn}") as total FROM main_table GROUP BY "${groupColumn}" ORDER BY total DESC;`;
  return await executeQuery(sql);
};

// --- Tool Registry and Schema ---

// 关键修改：更新 tools 的类型定义
export const tools: Record<string, (executeQuery: ExecuteQueryFunc, params: any) => Promise<any>> = {
  findMax,
  sumByGroup,
};

export const toolSchemas = [
  {
    tool: "findMax",
    description: "Finds the maximum value in a specific column.",
    params: {
      type: "object",
      properties: {
        column: {
          type: "string",
          description: "The name of the column to find the maximum value from.",
        },
      },
      required: ["column"],
    },
  },
  {
    tool: "sumByGroup",
    description: "Calculates the sum of a numeric column, grouped by a dimension column.",
    params: {
      type: "object",
      properties: {
        groupColumn: {
          type: "string",
          description: "The column to group the results by (e.g., 'city', 'category').",
        },
        aggColumn: {
          type: "string",
          description: "The numeric column to sum up (e.g., 'sales', 'revenue').",
        },
      },
      required: ["groupColumn", "aggColumn"],
    },
  },
];
