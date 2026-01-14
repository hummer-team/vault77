/**
 * @file SettingsService.ts
 * @description A service for managing user settings, including profile and LLM configurations.
 * It uses the StorageService for data persistence.
 */

import { storageService } from './StorageService';
import { v4 as uuidv4 } from 'uuid';

// --- Data Structures ---

export interface UserProfile {
  nickname: string;
  avatar: string;
  occupation: string;
  skills: string[];
}

export interface LLMProviderConfig {
  id: string;
  url: string;
  apiKey: string;
  isEnabled: boolean;
}

// --- Constants for Storage Keys ---

const USER_PROFILE_KEY = 'userProfile';
const LLM_CONFIGS_KEY = 'llmProviderConfigs';

// --- Service Class ---

class SettingsService {
  // --- User Profile Methods ---

  public async getUserProfile(): Promise<UserProfile> {
    return storageService.getItem<UserProfile>(USER_PROFILE_KEY, {
      nickname: '',
      avatar: '',
      occupation: '',
      skills: [],
    });
  }

  public async saveUserProfile(profile: UserProfile): Promise<void> {
    console.log('[SettingsService] Saving user profile:', profile);
    await storageService.setItem(USER_PROFILE_KEY, profile);
  }

  // --- LLM Provider Config Methods ---

  public async getLlmConfigs(): Promise<LLMProviderConfig[]> {
    return storageService.getItem<LLMProviderConfig[]>(LLM_CONFIGS_KEY, []);
  }

  public async addLlmConfig(config: Omit<LLMProviderConfig, 'id'>): Promise<LLMProviderConfig[]> {
    const configs = await this.getLlmConfigs();
    const newConfig: LLMProviderConfig = { ...config, id: uuidv4() };
    const updatedConfigs = [...configs, newConfig];
    await storageService.setItem(LLM_CONFIGS_KEY, updatedConfigs);
    console.log('[SettingsService] Added new LLM config:', newConfig);
    return updatedConfigs;
  }

  public async updateLlmConfig(
    configId: string,
    updates: Partial<Omit<LLMProviderConfig, 'id'>>
  ): Promise<LLMProviderConfig[]> {
    const configs = await this.getLlmConfigs();
    const updatedConfigs = configs.map(c => (c.id === configId ? { ...c, ...updates } : c));
    await storageService.setItem(LLM_CONFIGS_KEY, updatedConfigs);
    console.log(`[SettingsService] Updated LLM config with ID: ${configId}`, updates);
    return updatedConfigs;
  }

  public async deleteLlmConfig(configId: string): Promise<LLMProviderConfig[]> {
    const configs = await this.getLlmConfigs();
    const updatedConfigs = configs.filter(c => c.id !== configId);
    await storageService.setItem(LLM_CONFIGS_KEY, updatedConfigs);
    console.log(`[SettingsService] Deleted LLM config with ID: ${configId}`);
    return updatedConfigs;
  }
}

// Export a singleton instance
export const settingsService = new SettingsService();
