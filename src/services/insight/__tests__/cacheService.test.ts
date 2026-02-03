/**
 * @file cacheService.test.ts
 * @description Unit tests for CacheService - LRU cache for insight results
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CacheService } from '../cacheService';
import type { CacheEntry, CacheMetadata } from '../../../types/insight.types';

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockStorage: Map<string, any>;

  beforeEach(() => {
    // Setup mock chrome.storage.session
    mockStorage = new Map();

    (global as any).chrome = {
      storage: {
        session: {
          get: async (keys: string | string[] | null) => {
            if (keys === null) {
              // Return all items
              const result: Record<string, any> = {};
              mockStorage.forEach((value, key) => {
                result[key] = value;
              });
              return result;
            } else if (typeof keys === 'string') {
              const value = mockStorage.get(keys);
              return value ? { [keys]: value } : {};
            } else {
              const result: Record<string, any> = {};
              keys.forEach(key => {
                const value = mockStorage.get(key);
                if (value) result[key] = value;
              });
              return result;
            }
          },
          set: async (items: Record<string, any>) => {
            Object.entries(items).forEach(([key, value]) => {
              mockStorage.set(key, value);
            });
          },
          remove: async (keys: string | string[]) => {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            keyArray.forEach(key => mockStorage.delete(key));
          },
        },
      },
    };

    cacheService = CacheService.getInstance();
  });

  afterEach(() => {
    mockStorage.clear();
  });

  describe('get', () => {
    test('should return null for non-existent key', async () => {
      const result = await cacheService.get('non-existent');
      expect(result).toBeNull();
    });

    test('should return cached data for existing key', async () => {
      const testData = { columns: ['col1', 'col2'] };
      await cacheService.set('test-key', testData);

      const result = await cacheService.get('test-key');
      expect(result).toEqual(testData);
    });

    test('should update lastAccessAt on cache hit', async () => {
      const testData = { value: 123 };
      await cacheService.set('test-key', testData);

      const entry1 = mockStorage.get('insight:test-key') as CacheEntry;
      const originalAccessTime = entry1.lastAccessAt;

      // Wait 10ms
      await new Promise(resolve => setTimeout(resolve, 10));

      await cacheService.get('test-key');

      const entry2 = mockStorage.get('insight:test-key') as CacheEntry;
      expect(entry2.lastAccessAt).toBeGreaterThan(originalAccessTime);
    });
  });

  describe('set', () => {
    test('should cache data successfully', async () => {
      const testData = { columns: ['a', 'b', 'c'] };
      await cacheService.set('test-key', testData);

      const entry = mockStorage.get('insight:test-key') as CacheEntry;
      expect(entry).toBeDefined();
      expect(entry.data).toEqual(testData);
      expect(entry.key).toBe('insight:test-key');
    });

    test('should create metadata on first write', async () => {
      await cacheService.set('test-key', { value: 1 });

      const metadata = mockStorage.get('insight:metadata') as CacheMetadata;
      expect(metadata).toBeDefined();
      expect(metadata.entryCount).toBe(1);
      expect(metadata.totalSize).toBeGreaterThan(0);
    });

    test('should estimate entry size correctly', async () => {
      const testData = { value: 'test' };
      await cacheService.set('test-key', testData);

      const entry = mockStorage.get('insight:test-key') as CacheEntry;
      expect(entry.size).toBeGreaterThan(0);
    });
  });

  describe('evictIfNeeded', () => {
    test('should evict old entries when cache is full', async () => {
      // Create a large entry that approaches cache limit
      const largeData = new Array(1024 * 1024).fill('x').join(''); // ~1MB string

      // Set current time
      const now = Date.now();

      // Create old entry (31 minutes ago)
      const oldEntry: CacheEntry = {
        key: 'insight:old-key',
        data: largeData,
        createdAt: now - 31 * 60 * 1000,
        lastAccessAt: now - 31 * 60 * 1000,
        size: new Blob([JSON.stringify(largeData)]).size,
      };
      mockStorage.set('insight:old-key', oldEntry);

      // Set metadata to simulate high cache usage
      const metadata: CacheMetadata = {
        totalSize: 8.5 * 1024 * 1024, // 8.5MB
        maxSize: 9 * 1024 * 1024,
        entryCount: 1,
      };
      mockStorage.set('insight:metadata', metadata);

      // Try to add new large entry (should trigger eviction)
      const newData = new Array(1024 * 1024).fill('y').join(''); // ~1MB string
      await cacheService.set('new-key', newData);

      // Old entry should be evicted
      expect(mockStorage.has('insight:old-key')).toBe(false);
      // New entry should be cached
      expect(mockStorage.has('insight:new-key')).toBe(true);
    });

    test('should not evict recently accessed entries', async () => {
      const smallData = { value: 'test' };
      await cacheService.set('recent-key', smallData);

      // Entry was just created, should not be evicted
      const entry = mockStorage.get('insight:recent-key') as CacheEntry;
      expect(entry).toBeDefined();
    });
  });

  describe('clear', () => {
    test('should remove all cache entries', async () => {
      await cacheService.set('key1', { value: 1 });
      await cacheService.set('key2', { value: 2 });
      await cacheService.set('key3', { value: 3 });

      expect(mockStorage.size).toBeGreaterThan(0);

      await cacheService.clear();

      // All insight:* keys should be removed
      const remainingKeys = Array.from(mockStorage.keys()).filter(k => k.startsWith('insight:'));
      expect(remainingKeys.length).toBe(0);
    });

    test('should handle empty cache gracefully', async () => {
      await cacheService.clear();
      // Should complete without throwing
      expect(mockStorage.size).toBe(0);
    });
  });

  describe('LRU behavior', () => {
    test('should maintain entry count correctly', async () => {
      await cacheService.set('key1', { value: 1 });
      await cacheService.set('key2', { value: 2 });
      await cacheService.set('key3', { value: 3 });

      const metadata = mockStorage.get('insight:metadata') as CacheMetadata;
      expect(metadata.entryCount).toBe(3);
    });

    test('should update total size correctly', async () => {
      const data1 = { value: 'small' };
      const data2 = { value: 'slightly larger data' };

      await cacheService.set('key1', data1);
      const metadata1 = mockStorage.get('insight:metadata') as CacheMetadata;
      const size1 = metadata1.totalSize;

      await cacheService.set('key2', data2);
      const metadata2 = mockStorage.get('insight:metadata') as CacheMetadata;

      expect(metadata2.totalSize).toBeGreaterThan(size1);
    });
  });

  describe('Edge Cases', () => {
    test('should handle concurrent writes', async () => {
      const promises = [
        cacheService.set('key1', { value: 1 }),
        cacheService.set('key2', { value: 2 }),
        cacheService.set('key3', { value: 3 }),
      ];

      await Promise.all(promises);

      expect(mockStorage.has('insight:key1')).toBe(true);
      expect(mockStorage.has('insight:key2')).toBe(true);
      expect(mockStorage.has('insight:key3')).toBe(true);
    });

    test('should handle special characters in keys', async () => {
      const specialKey = 'table:name-with-special_chars.123';
      await cacheService.set(specialKey, { value: 'test' });

      const result = await cacheService.get(specialKey);
      expect(result).toEqual({ value: 'test' });
    });

    test('should handle null and undefined data', async () => {
      await cacheService.set('null-key', null);
      await cacheService.set('undefined-key', undefined);

      const nullResult = await cacheService.get('null-key');
      const undefinedResult = await cacheService.get('undefined-key');

      expect(nullResult).toBeNull();
      expect(undefinedResult).toBeUndefined();
    });
  });
});
