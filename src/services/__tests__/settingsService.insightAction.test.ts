/**
 * Unit tests for settingsService - Insight Action Settings
 * 
 * Note: These are integration tests that use actual localStorage
 * since Bun's mocking works differently than Jest/Vitest
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { settingsService } from '../settingsService';

describe('SettingsService - Insight Action Settings', () => {
  beforeEach(async () => {
    // Clear any existing settings before each test
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('getInsightActionSettings', () => {
    it('should return default settings', async () => {
      const settings = await settingsService.getInsightActionSettings();

      expect(settings.autoGenerate).toBe(true);
      expect(settings.maxAnomaliesForAnalysis).toBe(500);
    });
  });

  describe('updateInsightActionSettings', () => {
    it('should update autoGenerate setting', async () => {
      await settingsService.updateInsightActionSettings({
        autoGenerate: false,
      });

      const settings = await settingsService.getInsightActionSettings();
      expect(settings.autoGenerate).toBe(false);
      expect(settings.maxAnomaliesForAnalysis).toBe(500); // Should preserve default
    });

    it('should update maxAnomaliesForAnalysis', async () => {
      await settingsService.updateInsightActionSettings({
        maxAnomaliesForAnalysis: 1000,
      });

      const settings = await settingsService.getInsightActionSettings();
      expect(settings.autoGenerate).toBe(true); // Should preserve default
      expect(settings.maxAnomaliesForAnalysis).toBe(1000);
    });

    it('should validate maxAnomaliesForAnalysis is positive', async () => {
      await expect(
        settingsService.updateInsightActionSettings({
          maxAnomaliesForAnalysis: 0,
        })
      ).rejects.toThrow('Max anomalies for analysis must be positive');

      await expect(
        settingsService.updateInsightActionSettings({
          maxAnomaliesForAnalysis: -100,
        })
      ).rejects.toThrow('Max anomalies for analysis must be positive');
    });

    it('should update multiple settings at once', async () => {
      await settingsService.updateInsightActionSettings({
        autoGenerate: false,
        maxAnomaliesForAnalysis: 800,
      });

      const settings = await settingsService.getInsightActionSettings();
      expect(settings.autoGenerate).toBe(false);
      expect(settings.maxAnomaliesForAnalysis).toBe(800);
    });

    it('should preserve unmodified settings', async () => {
      // First, set initial custom values
      await settingsService.updateInsightActionSettings({
        autoGenerate: false,
        maxAnomaliesForAnalysis: 1000,
      });

      // Then update only one setting
      await settingsService.updateInsightActionSettings({
        autoGenerate: true,
      });

      const settings = await settingsService.getInsightActionSettings();
      expect(settings.autoGenerate).toBe(true); // Updated
      expect(settings.maxAnomaliesForAnalysis).toBe(1000); // Preserved
    });
  });
});
