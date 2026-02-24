/**
 * @file types.ts
 * @description Type definitions for business kernels (biz-kernels)
 * Business kernels are reusable analytical operators for data processing
 */

/**
 * Author type for biz kernels
 */
export type KernelAuthor = 'official' | 'developer';

/**
 * Metadata for a business kernel
 * Naming convention: fn_[industry]_[kernel]_[function]
 * Example: fn_ecom_arbitrage_analyze
 */
export interface BizKernelMetadata {
  /** Unique identifier following naming convention */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Industry classification (e.g., '电商/订单') */
  industry: string;
  /** Category within industry (e.g., '风险风控') */
  category: string;
  /** Version string (semver) */
  version: string;
  /** Short description for list view */
  description: string;
  /** Detailed description for detail view */
  detailedDescription?: string;
  /** Author type */
  author: KernelAuthor;
  /** Popularity/likes count */
  likes: number;
  /** Credit cost to use */
  credits: number;
  /** Data volume indicator (e.g., '5w order') */
  dataVolume: string;
  /** Estimated execution time */
  estimatedTime: string;
  /** SQL template for execution (reserved) */
  sqlTemplate?: string;
  /** Additional metadata for detail view */
  metadata?: {
    inputFields?: string[];
    outputFields?: string[];
    constraints?: string[];
  };
}

/**
 * User's applied kernel record
 */
export interface UserBizKernel {
  /** Reference to BizKernelMetadata.name */
  name: string;
  /** Timestamp when applied */
  appliedAt: number;
}

/**
 * Filter criteria for searching kernels
 */
export interface KernelFilter {
  /** Search keyword for name/description */
  keyword?: string;
  /** Industry filter */
  industry?: string;
  /** Category filter */
  category?: string;
  /** Author filter */
  author?: KernelAuthor;
}

/**
 * Storage keys for biz kernel data
 */
export const KERNEL_STORAGE_KEYS = {
  /** User applied kernels */
  USER_KERNELS: 'biz-kernel:user-kernels',
} as const;

/**
 * Industry categories
 */
export const KERNEL_INDUSTRIES = [
  '电商/订单',
  '电商/商品',
  '电商/营销',
] as const;

/**
 * Attribute categories
 */
export const KERNEL_CATEGORIES = [
  '基础洞察',
  '风险风控',
  '用户增长',
  '经营决策',
  '运营细节',
] as const;

export type KernelIndustry = (typeof KERNEL_INDUSTRIES)[number];
export type KernelCategory = (typeof KERNEL_CATEGORIES)[number];
