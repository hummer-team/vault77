/**
 * @file bizKernelService.test.ts
 * @description Unit tests for BizKernelService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bizKernelService } from '../bizKernelService';
import { SEED_KERNELS } from '../bizKernelMeta';

describe('BizKernelService', () => {
  // Reset service state before each test
  beforeEach(async () => {
    await bizKernelService.initialize();
    await bizKernelService.resetUserKernels();
  });

  afterEach(async () => {
    await bizKernelService.resetUserKernels();
  });

  describe('initialization', () => {
    it('should initialize and load seed kernels', async () => {
      const kernels = bizKernelService.getAllKernels();
      expect(kernels).toHaveLength(SEED_KERNELS.length);
      expect(kernels[0].name).toBeDefined();
    });

    it('should load user kernels from storage', async () => {
      const userKernels = bizKernelService.getUserKernels();
      expect(userKernels).toEqual([]);
    });
  });

  describe('getAllKernels', () => {
    it('should return all seed kernels', () => {
      const kernels = bizKernelService.getAllKernels();
      expect(kernels).toHaveLength(10);
      expect(kernels.map((k) => k.name)).toContain('fn_ecom_rfm_profile');
    });
  });

  describe('getKernelByName', () => {
    it('should return kernel by exact name', () => {
      const kernel = bizKernelService.getKernelByName('fn_ecom_rfm_profile');
      expect(kernel).toBeDefined();
      expect(kernel?.displayName).toBe('RFM 用户画像');
    });

    it('should return undefined for non-existent kernel', () => {
      const kernel = bizKernelService.getKernelByName('non_existent');
      expect(kernel).toBeUndefined();
    });
  });

  describe('searchKernels', () => {
    it('should filter by keyword in name', () => {
      const results = bizKernelService.searchKernels({ keyword: 'rfm' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('rfm');
    });

    it('should filter by keyword in description', () => {
      const results = bizKernelService.searchKernels({ keyword: '库存' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter by industry', () => {
      const results = bizKernelService.searchKernels({
        industry: '电商/订单',
      });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((k) => {
        expect(k.industry).toBe('电商/订单');
      });
    });

    it('should filter by category', () => {
      const results = bizKernelService.searchKernels({
        category: '风险风控',
      });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((k) => {
        expect(k.category).toBe('风险风控');
      });
    });

    it('should filter by author', () => {
      const results = bizKernelService.searchKernels({ author: 'official' });
      expect(results.length).toBe(SEED_KERNELS.length);
    });

    it('should combine multiple filters', () => {
      const results = bizKernelService.searchKernels({
        industry: '电商/订单',
        category: '用户增长',
      });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((k) => {
        expect(k.industry).toBe('电商/订单');
        expect(k.category).toBe('用户增长');
      });
    });
  });

  describe('getKernelsByPopularity', () => {
    it('should return kernels sorted by likes descending', () => {
      const kernels = bizKernelService.getKernelsByPopularity();
      expect(kernels.length).toBe(SEED_KERNELS.length);

      // Check if sorted by likes (descending)
      for (let i = 0; i < kernels.length - 1; i++) {
        expect(kernels[i].likes).toBeGreaterThanOrEqual(kernels[i + 1].likes);
      }
    });
  });

  describe('getIndustries', () => {
    it('should return unique industries', () => {
      const industries = bizKernelService.getIndustries();
      expect(industries.length).toBeGreaterThan(0);
      expect(industries).toContain('电商/订单');
    });
  });

  describe('getCategories', () => {
    it('should return unique categories', () => {
      const categories = bizKernelService.getCategories();
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('基础洞察');
      expect(categories).toContain('风险风控');
    });
  });

  describe('getCategoriesByIndustry', () => {
    it('should return categories for specific industry', () => {
      const categories = bizKernelService.getCategoriesByIndustry('电商/订单');
      expect(categories.length).toBeGreaterThan(0);
    });
  });

  describe('applyKernel', () => {
    it('should apply a kernel successfully', async () => {
      await bizKernelService.applyKernel('fn_ecom_rfm_profile');

      const isApplied = bizKernelService.isKernelApplied('fn_ecom_rfm_profile');
      expect(isApplied).toBe(true);

      const appliedKernels = bizKernelService.getAppliedKernels();
      expect(appliedKernels).toHaveLength(1);
      expect(appliedKernels[0].name).toBe('fn_ecom_rfm_profile');
    });

    it('should not apply same kernel twice', async () => {
      await bizKernelService.applyKernel('fn_ecom_rfm_profile');
      await bizKernelService.applyKernel('fn_ecom_rfm_profile');

      const userKernels = bizKernelService.getUserKernels();
      expect(userKernels).toHaveLength(1);
    });

    it('should throw error for non-existent kernel', async () => {
      await expect(
        bizKernelService.applyKernel('non_existent')
      ).rejects.toThrow('Kernel not found');
    });
  });

  describe('cancelKernel', () => {
    it('should cancel an applied kernel', async () => {
      await bizKernelService.applyKernel('fn_ecom_rfm_profile');
      await bizKernelService.cancelKernel('fn_ecom_rfm_profile');

      const isApplied = bizKernelService.isKernelApplied('fn_ecom_rfm_profile');
      expect(isApplied).toBe(false);

      const appliedKernels = bizKernelService.getAppliedKernels();
      expect(appliedKernels).toHaveLength(0);
    });

    it('should throw error for non-applied kernel', async () => {
      await expect(
        bizKernelService.cancelKernel('fn_ecom_rfm_profile')
      ).rejects.toThrow('Kernel not applied');
    });
  });

  describe('isKernelApplied', () => {
    it('should return false for non-applied kernel', () => {
      const isApplied = bizKernelService.isKernelApplied('fn_ecom_rfm_profile');
      expect(isApplied).toBe(false);
    });

    it('should return true for applied kernel', async () => {
      await bizKernelService.applyKernel('fn_ecom_rfm_profile');
      const isApplied = bizKernelService.isKernelApplied('fn_ecom_rfm_profile');
      expect(isApplied).toBe(true);
    });
  });

  describe('getAppliedKernels', () => {
    it('should return empty array when no kernels applied', () => {
      const applied = bizKernelService.getAppliedKernels();
      expect(applied).toEqual([]);
    });

    it('should return applied kernels with full metadata', async () => {
      await bizKernelService.applyKernel('fn_ecom_rfm_profile');
      await bizKernelService.applyKernel('fn_ecom_arbitrage_analyze');

      const applied = bizKernelService.getAppliedKernels();
      expect(applied).toHaveLength(2);
      expect(applied[0].displayName).toBeDefined();
      expect(applied[0].description).toBeDefined();
    });
  });

  describe('resetUserKernels', () => {
    it('should clear all user kernels', async () => {
      await bizKernelService.applyKernel('fn_ecom_rfm_profile');
      await bizKernelService.resetUserKernels();

      const userKernels = bizKernelService.getUserKernels();
      expect(userKernels).toHaveLength(0);
    });
  });
});
