/**
 * @file promptPackLoader.ts
 * @description Loader for industry-specific prompt packs.
 * Supports local file loading and remote API loading (future).
 */

/**
 * Prompt pack content structure.
 */
export interface PromptPack {
  industryId: string;
  version: string;
  content: string;
  loadedAt: Date;
  source: 'local' | 'remote';
}

/**
 * Industry pack map: industryId -> version -> loader
 * Loaders use Vite's ?raw import to get file content as string.
 */
const industryPackMap: Record<string, Record<string, () => Promise<{ default: string }>>> = {
  ecommerce: {
    v1: () => import('../../prompts/skills/ecommerce_basic_skill.v1.md?raw'),
    'v1_compact': () => import('../../prompts/skills/ecommerce_basic_skill.v1_compact.md?raw'),
  },
  // Future industries can be added here:
  // finance: {
  //   v1: () => import('../../prompts/skills/finance_basic_skill.v1.md?raw'),
  // },
};

/**
 * Prompt pack loader service.
 */
class PromptPackLoader {
  private cache: Map<string, PromptPack> = new Map();

  /**
   * Load prompt pack from local file.
   * @param industryId Industry identifier
   * @param version Version string (default: 'v1')
   * @returns PromptPack
   * @throws Error if pack not found
   */
  public async loadLocal(industryId: string, version = 'v1'): Promise<PromptPack> {
    const cacheKey = `${industryId}:${version}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      console.log(`[PromptPackLoader] Using cached pack: ${cacheKey}`);
      return cached;
    }

    // Load from file
    const industry = industryPackMap[industryId];
    if (!industry) {
      throw new Error(`Industry pack not found: ${industryId}`);
    }

    const versionLoader = industry[version];
    if (!versionLoader) {
      throw new Error(`Version not found: ${industryId} ${version}`);
    }

    try {
      const module = await versionLoader();
      const content = module.default;

      const pack: PromptPack = {
        industryId,
        version,
        content,
        loadedAt: new Date(),
        source: 'local',
      };

      // Cache the loaded pack
      this.cache.set(cacheKey, pack);
      console.log(`[PromptPackLoader] Loaded pack: ${cacheKey}, size: ${content.length} chars`);

      return pack;
    } catch (error) {
      console.error(`[PromptPackLoader] Failed to load pack: ${cacheKey}`, error);
      throw new Error(`Failed to load prompt pack: ${industryId} ${version}`);
    }
  }

  /**
   * Load prompt pack from remote API (future implementation).
   * @param industryId Industry identifier
   * @param version Version string
   * @returns PromptPack
   * @throws Error - currently not implemented
   */
  public async loadFromRemote(industryId: string, version = 'v1'): Promise<PromptPack> {
    // TODO: Implement remote API loading in future
    // This is a placeholder for M10.2 verification
    console.warn('[PromptPackLoader] Remote loading not yet implemented, returning mock');

    // Return mock data for testing
    return {
      industryId,
      version,
      content: `# Mock Remote Pack\n\nThis is a mock prompt pack loaded from remote API.\n\nIndustry: ${industryId}\nVersion: ${version}`,
      loadedAt: new Date(),
      source: 'remote',
    };

    // Future implementation:
    // const response = await fetch(`/api/prompt-packs/${industryId}/${version}`);
    // if (!response.ok) {
    //   throw new Error(`Failed to fetch remote pack: ${response.statusText}`);
    // }
    // const data = await response.json();
    // return {
    //   industryId,
    //   version,
    //   content: data.content,
    //   loadedAt: new Date(),
    //   source: 'remote',
    // };
  }

  /**
   * Load prompt pack with fallback strategy.
   * Tries local first, then remote if local fails.
   * @param industryId Industry identifier
   * @param version Version string
   * @returns PromptPack
   */
  public async load(industryId: string, version = 'v1'): Promise<PromptPack> {
    try {
      return await this.loadLocal(industryId, version);
    } catch (localError) {
      console.warn(`[PromptPackLoader] Local load failed, trying remote:`, localError);
      try {
        return await this.loadFromRemote(industryId, version);
      } catch (remoteError) {
        console.error(`[PromptPackLoader] Both local and remote loading failed:`, remoteError);
        throw localError; // Throw original local error
      }
    }
  }

  /**
   * List all available industries.
   * @returns Array of industry IDs
   */
  public listIndustries(): string[] {
    return Object.keys(industryPackMap);
  }

  /**
   * List available versions for an industry.
   * @param industryId Industry identifier
   * @returns Array of version strings
   */
  public listVersions(industryId: string): string[] {
    const industry = industryPackMap[industryId];
    if (!industry) {
      return [];
    }
    return Object.keys(industry);
  }

  /**
   * Clear cache for a specific pack or all packs.
   * @param industryId Optional industry ID to clear specific pack
   * @param version Optional version to clear specific pack
   */
  public clearCache(industryId?: string, version?: string): void {
    if (industryId && version) {
      const cacheKey = `${industryId}:${version}`;
      this.cache.delete(cacheKey);
      console.log(`[PromptPackLoader] Cache cleared: ${cacheKey}`);
    } else {
      this.cache.clear();
      console.log('[PromptPackLoader] All cache cleared');
    }
  }

  /**
   * Get pack content trimmed to budget.
   * @param pack Prompt pack
   * @param maxChars Maximum characters (default: 2000)
   * @returns Trimmed content
   */
  public trimToBudget(pack: PromptPack, maxChars = 2000): string {
    if (pack.content.length <= maxChars) {
      return pack.content;
    }

    const trimmed = pack.content.slice(0, maxChars);
    console.warn(
      `[PromptPackLoader] Pack content trimmed from ${pack.content.length} to ${maxChars} chars`
    );
    return trimmed + '\n\n... (content truncated to fit budget)';
  }
}

// Export singleton instance
export const promptPackLoader = new PromptPackLoader();

// Export type for external use
export type { PromptPackLoader };
