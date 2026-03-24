/**
 * @file bizKernelService.ts
 * @description Business kernel service for managing kernel metadata and user applications
 * Loads metadata into DuckDB for SQL-based querying
 */

import { storageService } from '../storageService';
import { getAllKernels } from './bizKernelMeta.ts';
import type { BizKernelMetadata, UserBizKernel, KernelFilter } from './types';
import { CATEGORY_SORT_ORDER } from './types';
import { KERNEL_UDF_MAP } from '../duckDBUdfService';

// Storage key for user kernels
const USER_KERNELS_KEY = 'biz-kernel:user-kernels';
// Storage key for kernel → UDF function name mapping
const KERNEL_UDF_MAPPING_KEY = 'biz-kernel:kernel-udf-mapping';

/**
 * Service for managing business kernels
 */
class BizKernelService {
  private kernels: BizKernelMetadata[] = [];
  private userKernels: UserBizKernel[] = [];
  /** Persisted kernel → UDF function name mapping for applied data-cleaning kernels */
  private kernelUdfMapping: Record<string, string> = {};
  private initialized = false;

  /**
   * Initialize the service by loading metadata
   * In future phases, this will load into DuckDB
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[BizKernelService] Initializing...');

    // Load kernel metadata from hardcoded source
    this.kernels = getAllKernels();
    console.log(`[BizKernelService] Loaded ${this.kernels.length} kernels`);

    // Load user applied kernels from storage
    await this.loadUserKernels();
    await this.loadKernelUdfMapping();

    this.initialized = true;
    console.log('[BizKernelService] Initialization complete');
  }

  /**
   * Load user kernels from storage
   */
  private async loadUserKernels(): Promise<void> {
    try {
      this.userKernels = await storageService.getItem<UserBizKernel[]>(
        USER_KERNELS_KEY,
        []
      );
      console.log(
        `[BizKernelService] Loaded ${this.userKernels.length} user kernels`
      );
    } catch (error) {
      console.error('[BizKernelService] Failed to load user kernels:', error);
      this.userKernels = [];
    }
  }

  /**
   * Save user kernels to storage
   */
  private async saveUserKernels(): Promise<void> {
    try {
      await storageService.setItem(USER_KERNELS_KEY, this.userKernels);
      console.log('[BizKernelService] Saved user kernels');
    } catch (error) {
      console.error('[BizKernelService] Failed to save user kernels:', error);
      throw error;
    }
  }

  /**
   * Load kernel → UDF mapping from Chrome Storage
   */
  private async loadKernelUdfMapping(): Promise<void> {
    try {
      this.kernelUdfMapping = await storageService.getItem<Record<string, string>>(
        KERNEL_UDF_MAPPING_KEY,
        {}
      );
      console.log('[BizKernelService] Loaded kernel-UDF mapping:', Object.keys(this.kernelUdfMapping).length, 'entries');
    } catch (error) {
      console.error('[BizKernelService] Failed to load kernel-UDF mapping:', error);
      this.kernelUdfMapping = {};
    }
  }

  /**
   * Persist the kernel → UDF mapping to Chrome Storage
   */
  private async saveKernelUdfMapping(): Promise<void> {
    try {
      await storageService.setItem(KERNEL_UDF_MAPPING_KEY, this.kernelUdfMapping);
    } catch (error) {
      console.error('[BizKernelService] Failed to save kernel-UDF mapping:', error);
    }
  }

  /**
   * Get all kernel metadata
   * Sorted by: category order (ascending) first, then likes (descending)
   */
  public getAllKernels(): BizKernelMetadata[] {
    this.ensureInitialized();
    return [...this.kernels].sort((a, b) => {
      // First sort by category order (ascending)
      const categoryOrderA = CATEGORY_SORT_ORDER[a.category as keyof typeof CATEGORY_SORT_ORDER] ?? 999;
      const categoryOrderB = CATEGORY_SORT_ORDER[b.category as keyof typeof CATEGORY_SORT_ORDER] ?? 999;
      if (categoryOrderA !== categoryOrderB) {
        return categoryOrderA - categoryOrderB;
      }
      // Then sort by likes (descending)
      return b.likes - a.likes;
    });
  }

  /**
   * Get kernel by name
   */
  public getKernelByName(name: string): BizKernelMetadata | undefined {
    this.ensureInitialized();
    return this.kernels.find((k) => k.name === name);
  }

  /**
   * Search kernels by filter criteria
   * In future phases, this will use DuckDB SQL queries
   * Sorted by: category order (ascending) first, then likes (descending)
   */
  public searchKernels(filter: KernelFilter): BizKernelMetadata[] {
    this.ensureInitialized();

    const filtered = this.kernels.filter((kernel) => {
      // Keyword search (name and description)
      if (filter.keyword) {
        const keyword = filter.keyword.toLowerCase();
        const matchName = kernel.name.toLowerCase().includes(keyword);
        const matchDisplayName = kernel.displayName
          .toLowerCase()
          .includes(keyword);
        const matchDesc = kernel.description.toLowerCase().includes(keyword);
        if (!matchName && !matchDisplayName && !matchDesc) {
          return false;
        }
      }

      // Industry filter
      if (filter.industry && kernel.industry !== filter.industry) {
        return false;
      }

      // Category filter
      if (filter.category && kernel.category !== filter.category) {
        return false;
      }

      // Author filter
      if (filter.author && kernel.author !== filter.author) {
        return false;
      }

      return true;
    });

    // Sort by category order (ascending) first, then likes (descending)
    return filtered.sort((a, b) => {
      const categoryOrderA = CATEGORY_SORT_ORDER[a.category as keyof typeof CATEGORY_SORT_ORDER] ?? 999;
      const categoryOrderB = CATEGORY_SORT_ORDER[b.category as keyof typeof CATEGORY_SORT_ORDER] ?? 999;
      if (categoryOrderA !== categoryOrderB) {
        return categoryOrderA - categoryOrderB;
      }
      return b.likes - a.likes;
    });
  }

  /**
   * Get kernels sorted by popularity (likes)
   * Sorted by: category order (ascending) first, then likes (descending)
   */
  public getKernelsByPopularity(): BizKernelMetadata[] {
    this.ensureInitialized();
    return [...this.kernels].sort((a, b) => {
      // First sort by category order (ascending)
      const categoryOrderA = CATEGORY_SORT_ORDER[a.category as keyof typeof CATEGORY_SORT_ORDER] ?? 999;
      const categoryOrderB = CATEGORY_SORT_ORDER[b.category as keyof typeof CATEGORY_SORT_ORDER] ?? 999;
      if (categoryOrderA !== categoryOrderB) {
        return categoryOrderA - categoryOrderB;
      }
      // Then sort by likes (descending)
      return b.likes - a.likes;
    });
  }

  /**
   * Get unique industries
   */
  public getIndustries(): string[] {
    this.ensureInitialized();
    return [...new Set(this.kernels.map((k) => k.industry))];
  }

  /**
   * Get unique categories
   */
  public getCategories(): string[] {
    this.ensureInitialized();
    return [...new Set(this.kernels.map((k) => k.category))];
  }

  /**
   * Get categories by industry
   */
  public getCategoriesByIndustry(industry: string): string[] {
    this.ensureInitialized();
    const kernels = this.kernels.filter((k) => k.industry === industry);
    return [...new Set(kernels.map((k) => k.category))];
  }

  /**
   * Apply a kernel (add to user's collection)
   */
  public async applyKernel(name: string): Promise<void> {
    this.ensureInitialized();

    // Check if kernel exists
    const kernel = this.getKernelByName(name);
    if (!kernel) {
      throw new Error(`Kernel not found: ${name}`);
    }

    // Check if already applied
    if (this.isKernelApplied(name)) {
      console.log(`[BizKernelService] Kernel ${name} is already applied`);
      return;
    }

    // Add to user kernels
    this.userKernels.push({
      name,
      appliedAt: Date.now(),
    });

    await this.saveUserKernels();

    // If this is a data-cleaning UDF kernel, persist the kernel → UDF function mapping
    const udfFunctionName = KERNEL_UDF_MAP[name];
    if (udfFunctionName) {
      this.kernelUdfMapping[name] = udfFunctionName;
      await this.saveKernelUdfMapping();
      console.log(`[BizKernelService] Saved UDF mapping: ${name} → ${udfFunctionName}`);
    }

    console.log(`[BizKernelService] Applied kernel: ${name}`);
  }

  /**
   * Get the DuckDB UDF function name associated with an applied kernel.
   * Returns null if the kernel has no UDF mapping.
   *
   * @param kernelName - BizKernel name
   */
  public getKernelUdfFunction(kernelName: string): string | null {
    // Check in-memory mapping first, then fall back to KERNEL_UDF_MAP
    return this.kernelUdfMapping[kernelName] ?? KERNEL_UDF_MAP[kernelName] ?? null;
  }

  /**
   * Cancel application of a kernel (remove from user's collection)
   */
  public async cancelKernel(name: string): Promise<void> {
    this.ensureInitialized();

    const index = this.userKernels.findIndex((k) => k.name === name);
    if (index === -1) {
      throw new Error(`Kernel not applied: ${name}`);
    }

    this.userKernels.splice(index, 1);
    await this.saveUserKernels();
    console.log(`[BizKernelService] Cancelled kernel: ${name}`);
  }

  /**
   * Check if a kernel is applied by the user
   */
  public isKernelApplied(name: string): boolean {
    this.ensureInitialized();
    return this.userKernels.some((k) => k.name === name);
  }

  /**
   * Get all applied kernels with full metadata
   */
  public getAppliedKernels(): BizKernelMetadata[] {
    this.ensureInitialized();
    return this.userKernels
      .map((userKernel) => this.getKernelByName(userKernel.name))
      .filter((k): k is BizKernelMetadata => k !== undefined);
  }

  /**
   * Get user kernel records (for internal use)
   */
  public getUserKernels(): UserBizKernel[] {
    this.ensureInitialized();
    return [...this.userKernels];
  }

  // ── Flow Template Storage ────────────────────────────────────────────
  private readonly KERNEL_TEMPLATES_KEY = 'vaultmind_kernel_flow_templates';

  /**
   * Check whether the kernel has a FlowCanvas-built template saved.
   * @param kernelName - The kernel's internal name
   */
  public hasFlowTemplate(kernelName: string): boolean {
    const raw = localStorage.getItem(this.KERNEL_TEMPLATES_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return !!map[kernelName];
  }

  /**
   * Persist a FlowCanvas-validated SQL string as the template for a kernel.
   * @param kernelName - The kernel's internal name
   * @param sql - Validated SQL from FlowCanvas
   */
  public saveFlowTemplate(kernelName: string, sql: string): void {
    const raw = localStorage.getItem(this.KERNEL_TEMPLATES_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[kernelName] = sql;
    localStorage.setItem(this.KERNEL_TEMPLATES_KEY, JSON.stringify(map));
  }

  /**
   * Reset all user kernels (for testing)
   */
  public async resetUserKernels(): Promise<void> {
    this.userKernels = [];
    await this.saveUserKernels();
    console.log('[BizKernelService] Reset user kernels');
  }

  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'BizKernelService not initialized. Call initialize() first.'
      );
    }
  }
}

// Export singleton instance
export const bizKernelService = new BizKernelService();
