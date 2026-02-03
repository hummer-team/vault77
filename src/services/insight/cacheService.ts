/**
 * LRU Cache Service
 * Manages insight result caching using chrome.storage.session API
 */

import { CacheEntry, CacheMetadata } from '../../types/insight.types.ts';

const CACHE_KEY_PREFIX = 'insight:';
const METADATA_KEY = 'insight:metadata';
const MAX_CACHE_SIZE = 9 * 1024 * 1024; // 9MB in bytes
const EVICTION_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Singleton service for LRU caching
 */
export class CacheService {
  private static instance: CacheService;

  private constructor() {}

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Get cached data by key
   * Updates lastAccessAt timestamp on successful retrieval
   * @param key - Cache key (without prefix)
   * @returns Cached data or null if not found/expired
   */
  public async get<T = unknown>(key: string): Promise<T | null> {
    const fullKey = this.buildKey(key);

    try {
      const result = await chrome.storage.session.get(fullKey);
      const entry = result[fullKey] as CacheEntry | undefined;

      if (!entry) {
        console.log(`[CacheService] Cache miss: ${key}`);
        return null;
      }

      // Update lastAccessAt timestamp
      entry.lastAccessAt = Date.now();
      await chrome.storage.session.set({ [fullKey]: entry });

      console.log(`[CacheService] Cache hit: ${key}`);
      return entry.data as T;
    } catch (error) {
      console.error('[CacheService] Failed to get cache entry:', error);
      return null;
    }
  }

  /**
   * Set cache entry
   * Evicts old entries if cache size exceeds limit
   * @param key - Cache key (without prefix)
   * @param data - Data to cache
   */
  public async set(key: string, data: unknown): Promise<void> {
    const fullKey = this.buildKey(key);

    try {
      // Estimate entry size
      const dataString = JSON.stringify(data);
      const estimatedSize = new Blob([dataString]).size;

      // Evict old entries if needed
      await this.evictIfNeeded(estimatedSize);

      // Create cache entry
      const entry: CacheEntry = {
        key: fullKey,
        data,
        createdAt: Date.now(),
        lastAccessAt: Date.now(),
        size: estimatedSize,
      };

      // Save entry
      await chrome.storage.session.set({ [fullKey]: entry });

      // Update metadata
      await this.updateMetadata(estimatedSize, 1);

      console.log(`[CacheService] Cached entry: ${key}, size: ${estimatedSize} bytes`);
    } catch (error) {
      console.error('[CacheService] Failed to set cache entry:', error);
      throw error;
    }
  }

  /**
   * Evict old cache entries if storage size exceeds limit
   * Uses LRU strategy: removes entries not accessed for 30+ minutes
   */
  private async evictIfNeeded(newEntrySize: number): Promise<void> {
    const metadata = await this.getMetadata();

    // Check if eviction is needed
    if (metadata.totalSize + newEntrySize <= MAX_CACHE_SIZE) {
      return;
    }

    console.log('[CacheService] Cache size limit exceeded, starting eviction...');

    // Get all cache entries
    const allItems = await chrome.storage.session.get(null);
    const entries: CacheEntry[] = [];

    for (const [key, value] of Object.entries(allItems)) {
      if (key.startsWith(CACHE_KEY_PREFIX) && key !== METADATA_KEY) {
        entries.push(value as CacheEntry);
      }
    }

    // Sort by lastAccessAt (oldest first)
    entries.sort((a, b) => a.lastAccessAt - b.lastAccessAt);

    // Evict entries until size is under limit
    const now = Date.now();
    let evictedSize = 0;
    let evictedCount = 0;
    const keysToRemove: string[] = [];

    for (const entry of entries) {
      // Check if entry is old enough to evict (30 minutes)
      const age = now - entry.lastAccessAt;
      if (age > EVICTION_AGE_MS) {
        keysToRemove.push(entry.key);
        evictedSize += entry.size;
        evictedCount++;

        // Stop if we've freed enough space
        if (metadata.totalSize - evictedSize + newEntrySize <= MAX_CACHE_SIZE) {
          break;
        }
      }
    }

    // Remove evicted entries
    if (keysToRemove.length > 0) {
      await chrome.storage.session.remove(keysToRemove);
      await this.updateMetadata(-evictedSize, -evictedCount);
      console.log(`[CacheService] Evicted ${evictedCount} entries, freed ${evictedSize} bytes`);
    } else {
      console.warn('[CacheService] No entries eligible for eviction (all accessed recently)');
    }
  }

  /**
   * Get cache metadata
   */
  private async getMetadata(): Promise<CacheMetadata> {
    try {
      const result = await chrome.storage.session.get(METADATA_KEY);
      const metadata = result[METADATA_KEY] as CacheMetadata | undefined;

      return metadata || {
        totalSize: 0,
        maxSize: MAX_CACHE_SIZE,
        entryCount: 0,
      };
    } catch (error) {
      console.error('[CacheService] Failed to get metadata:', error);
      return {
        totalSize: 0,
        maxSize: MAX_CACHE_SIZE,
        entryCount: 0,
      };
    }
  }

  /**
   * Update cache metadata
   * @param sizeDelta - Change in total size (positive or negative)
   * @param countDelta - Change in entry count (positive or negative)
   */
  private async updateMetadata(sizeDelta: number, countDelta: number): Promise<void> {
    try {
      const metadata = await this.getMetadata();
      metadata.totalSize = Math.max(0, metadata.totalSize + sizeDelta);
      metadata.entryCount = Math.max(0, metadata.entryCount + countDelta);

      await chrome.storage.session.set({ [METADATA_KEY]: metadata });
    } catch (error) {
      console.error('[CacheService] Failed to update metadata:', error);
    }
  }

  /**
   * Clear all cache entries
   * Used for manual cache clearing (e.g., in Settings page)
   */
  public async clear(): Promise<void> {
    try {
      const allItems = await chrome.storage.session.get(null);
      const keysToRemove: string[] = [];

      for (const key of Object.keys(allItems)) {
        if (key.startsWith(CACHE_KEY_PREFIX)) {
          keysToRemove.push(key);
        }
      }

      await chrome.storage.session.remove(keysToRemove);
      console.log(`[CacheService] Cleared ${keysToRemove.length} cache entries`);
    } catch (error) {
      console.error('[CacheService] Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Build full cache key with prefix
   */
  private buildKey(key: string): string {
    return `${CACHE_KEY_PREFIX}${key}`;
  }
}
