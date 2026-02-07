/**
 * Report generator for insight action module
 * Generates Markdown reports and CSV files, packages them into ZIP archives
 */

import type { InsightActionOutput } from '../../types/insight-action.types';
import { generateZip, type ZipContent } from './zipGenerator';

/**
 * Input for report generation
 */
export interface ReportGenerationInput {
  insightOutput: InsightActionOutput;
  anomalyData: any[]; // Original order data (without anomaly score)
  tableName: string;
  algorithmType: string;
}

/**
 * Generate Markdown report from insight output
 * Formats diagnosis, patterns, and recommendations in a structured document
 * @param input Report generation input
 * @returns Markdown string
 */
export function generateMarkdownReport(input: ReportGenerationInput): string {
  const { insightOutput, tableName, algorithmType } = input;
  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  
  let md = `# 数据异常分析报告\n\n`;
  md += `**生成时间**: ${timestamp}\n`;
  md += `**数据表**: ${tableName}\n`;
  md += `**分析算法**: ${algorithmType}\n`;
  md += `**置信度**: ${insightOutput.confidence}\n\n`;
  md += `---\n\n`;
  
  // Diagnosis section
  md += `## 🔍 问题诊断\n\n`;
  md += `${insightOutput.diagnosis}\n\n`;
  
  // Key Patterns section
  if (insightOutput.keyPatterns && insightOutput.keyPatterns.length > 0) {
    md += `## 📊 关键模式\n\n`;
    insightOutput.keyPatterns.forEach((pattern, idx) => {
      md += `${idx + 1}. **${pattern}**\n`;
    });
    md += `\n`;
  }
  
  // Recommendations section
  md += `## 💡 行动建议\n\n`;
  insightOutput.recommendations.forEach((rec, idx) => {
    const priorityIcon = rec.priority === 'high' ? '🔴' : 
                         rec.priority === 'medium' ? '🟡' : '🟢';
    md += `### ${priorityIcon} 建议 ${idx + 1}: ${rec.action}\n\n`;
    md += `**原因**: ${rec.reason}\n`;
    if (rec.estimatedImpact) {
      md += `**预期影响**: ${rec.estimatedImpact}\n`;
    }
    md += `\n`;
  });
  
  md += `---\n\n`;
  md += `*本报告由 AI 自动生成，仅供参考。请结合实际业务场景做出决策。*\n`;
  
  return md;
}

/**
 * Convert data array to CSV string
 * Handles escaping of special characters (quotes, commas, newlines)
 * @param data Array of objects to convert
 * @returns CSV string
 */
export function arrayToCSV(data: any[]): string {
  if (data.length === 0) {
    return '';
  }
  
  const columns = Object.keys(data[0]);
  const header = columns.map(escapeCSVValue).join(',');
  
  const rows = data.map(row => {
    return columns.map(col => escapeCSVValue(row[col])).join(',');
  });
  
  return [header, ...rows].join('\n');
}

/**
 * Escape CSV value (handle quotes, commas, newlines)
 * Per RFC 4180 specification
 * @param value Value to escape
 * @returns Escaped string
 */
function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate and download complete report (ZIP containing MD + CSV)
 * @param input Report generation input
 * @throws Error if report generation fails
 */
export async function downloadReport(input: ReportGenerationInput): Promise<void> {
  const { tableName, anomalyData } = input;
  const timestamp = Date.now();
  
  console.log('[ReportGenerator] Starting report generation:', {
    tableName,
    anomalyCount: anomalyData.length,
  });
  
  try {
    // Generate Markdown report
    const markdown = generateMarkdownReport(input);
    console.log('[ReportGenerator] Markdown report generated, length:', markdown.length);
    
    // Generate CSV from anomaly data
    const csv = arrayToCSV(anomalyData);
    console.log('[ReportGenerator] CSV generated, length:', csv.length);
    
    // Prepare ZIP contents
    const files: ZipContent[] = [
      {
        filename: 'analysis_report.md',
        content: markdown,
      },
      {
        filename: 'anomaly_orders.csv',
        content: csv,
      },
    ];
    
    // Generate and download ZIP
    const zipFilename = `${tableName}_anomaly_report_${timestamp}.zip`;
    await generateZip(files, zipFilename);
    
    console.log('[ReportGenerator] Report download complete');
    
  } catch (error) {
    console.error('[ReportGenerator] Failed to generate report:', error);
    throw new Error(`Report generation failed: ${(error as Error).message}`);
  }
}
