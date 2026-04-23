/**
 * @file operatorBindingService.ts
 * @description Persists the relationship between a biz-kernel operator and the
 *   attachments (files) that were selected when the flow template was built.
 *   Used to detect "file changed" scenarios so stale flow templates can be cleared.
 */

import { storageService } from '../storageService';

const BINDING_KEY = 'vaultmind_operator_bindings';

export interface OperatorBinding {
  kernelName: string;
  /** IDs of the Attachment objects selected when the flow was built */
  attachmentIds: string[];
  /** DuckDB table names corresponding to those attachments */
  tableNames: string[];
}

class OperatorBindingService {
  /**
   * Persist the file binding for a kernel.
   */
  async saveBinding(
    kernelName: string,
    attachmentIds: string[],
    tableNames: string[]
  ): Promise<void> {
    const map = await storageService.getItem<Record<string, OperatorBinding>>(
      BINDING_KEY,
      {}
    );
    map[kernelName] = { kernelName, attachmentIds, tableNames };
    await storageService.setItem(BINDING_KEY, map);
  }

  /**
   * Retrieve the binding for a kernel, or null if none exists.
   */
  async getBinding(kernelName: string): Promise<OperatorBinding | null> {
    const map = await storageService.getItem<Record<string, OperatorBinding>>(
      BINDING_KEY,
      {}
    );
    return map[kernelName] ?? null;
  }

  /**
   * Delete the binding for a kernel (call when clearing a flow template).
   */
  async clearBinding(kernelName: string): Promise<void> {
    const map = await storageService.getItem<Record<string, OperatorBinding>>(
      BINDING_KEY,
      {}
    );
    delete map[kernelName];
    await storageService.setItem(BINDING_KEY, map);
  }
}

export const operatorBindingService = new OperatorBindingService();
