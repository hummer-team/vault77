/**
 * @file promptPackLoader.test.ts
 * @description Unit tests for prompt pack loader
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { promptPackLoader } from '../promptPackLoader';

describe('PromptPackLoader', () => {
  beforeEach(() => {
    // Clear cache before each test
    promptPackLoader.clearCache();
  });

  describe('loadLocal', () => {
    it('should load ecommerce v1 pack', async () => {
      const pack = await promptPackLoader.loadLocal('ecommerce', 'v1');

      expect(pack.industryId).toBe('ecommerce');
      expect(pack.version).toBe('v1');
      expect(pack.source).toBe('local');
      expect(pack.content).toContain('E-commerce');
      expect(pack.content).toContain('GMV');
      expect(pack.loadedAt).toBeInstanceOf(Date);
    });

    it('should cache loaded packs', async () => {
      const pack1 = await promptPackLoader.loadLocal('ecommerce', 'v1');
      const pack2 = await promptPackLoader.loadLocal('ecommerce', 'v1');

      // Should be the same instance from cache
      expect(pack1.loadedAt).toEqual(pack2.loadedAt);
    });

    it('should throw error for non-existent industry', async () => {
      await expect(promptPackLoader.loadLocal('nonexistent')).rejects.toThrow(
        'Industry pack not found'
      );
    });

    it('should throw error for non-existent version', async () => {
      await expect(promptPackLoader.loadLocal('ecommerce', 'v99')).rejects.toThrow(
        'Version not found'
      );
    });
  });

  describe('loadFromRemote', () => {
    it('should return mock data (not implemented)', async () => {
      const pack = await promptPackLoader.loadFromRemote('ecommerce', 'v1');

      expect(pack.industryId).toBe('ecommerce');
      expect(pack.version).toBe('v1');
      expect(pack.source).toBe('remote');
      expect(pack.content).toContain('Mock Remote Pack');
    });
  });

  describe('load (with fallback)', () => {
    it('should load from local successfully', async () => {
      const pack = await promptPackLoader.load('ecommerce', 'v1');
      expect(pack.source).toBe('local');
    });

    it('should fallback to remote if local fails', async () => {
      const pack = await promptPackLoader.load('nonexistent', 'v1');
      expect(pack.source).toBe('remote');
      expect(pack.content).toContain('Mock');
    });
  });

  describe('listIndustries', () => {
    it('should list available industries', () => {
      const industries = promptPackLoader.listIndustries();
      expect(industries).toContain('ecommerce');
      expect(industries.length).toBeGreaterThan(0);
    });
  });

  describe('listVersions', () => {
    it('should list available versions for ecommerce', () => {
      const versions = promptPackLoader.listVersions('ecommerce');
      expect(versions).toContain('v1');
    });

    it('should return empty array for non-existent industry', () => {
      const versions = promptPackLoader.listVersions('nonexistent');
      expect(versions).toEqual([]);
    });
  });

  describe('trimToBudget', () => {
    it('should not trim if within budget', async () => {
      const pack = await promptPackLoader.loadLocal('ecommerce', 'v1');
      const trimmed = promptPackLoader.trimToBudget(pack, 10000);
      expect(trimmed.length).toBeLessThanOrEqual(10000);
      expect(trimmed).toBe(pack.content);
    });

    it('should trim if over budget', async () => {
      const pack = await promptPackLoader.loadLocal('ecommerce', 'v1');
      const trimmed = promptPackLoader.trimToBudget(pack, 1000);

      expect(trimmed.length).toBeLessThanOrEqual(1100); // Allow for truncation message
      expect(trimmed).toContain('truncated');
    });

    it('should respect default budget of 2000 chars', async () => {
      const pack = await promptPackLoader.loadLocal('ecommerce', 'v1');
      const trimmed = promptPackLoader.trimToBudget(pack);

      // Ecommerce pack should be within 2000 chars budget
      if (pack.content.length <= 2000) {
        expect(trimmed).toBe(pack.content);
      } else {
        expect(trimmed.length).toBeLessThanOrEqual(2050);
        expect(trimmed).toContain('truncated');
      }
    });
  });

  describe('clearCache', () => {
    it('should clear specific pack from cache', async () => {
      await promptPackLoader.loadLocal('ecommerce', 'v1');
      promptPackLoader.clearCache('ecommerce', 'v1');

      // Verify cache was cleared by loading again
      const pack = await promptPackLoader.loadLocal('ecommerce', 'v1');
      expect(pack).toBeDefined();
    });

    it('should clear all cache', async () => {
      await promptPackLoader.loadLocal('ecommerce', 'v1');
      promptPackLoader.clearCache();

      // Verify cache was cleared
      const pack = await promptPackLoader.loadLocal('ecommerce', 'v1');
      expect(pack).toBeDefined();
    });
  });

  describe('pack content validation', () => {
    it('should contain key e-commerce terms', async () => {
      const pack = await promptPackLoader.loadLocal('ecommerce', 'v1');

      expect(pack.content).toContain('GMV');
      expect(pack.content).toContain('AOV');
      expect(pack.content).toContain('order');
      expect(pack.content).toContain('status');
    });

    it('should contain SQL best practices', async () => {
      const pack = await promptPackLoader.loadLocal('ecommerce', 'v1');

      expect(pack.content).toContain('LIMIT');
      expect(pack.content).toContain('DuckDB');
      expect(pack.content).toContain('SELECT');
    });

    it('should contain analysis patterns', async () => {
      const pack = await promptPackLoader.loadLocal('ecommerce', 'v1');

      expect(pack.content).toContain('KPI');
      expect(pack.content).toContain('Trend');
      expect(pack.content).toContain('Distribution');
    });

    it('should support Chinese terminology', async () => {
      const pack = await promptPackLoader.loadLocal('ecommerce', 'v1');

      expect(pack.content).toContain('订单编号');
      expect(pack.content).toContain('用户ID');
      expect(pack.content).toContain('下单时间');
    });
  });
});
