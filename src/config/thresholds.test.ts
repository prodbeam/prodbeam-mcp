import { describe, it, expect } from 'vitest';
import { resolveThresholds, DEFAULT_THRESHOLDS } from './thresholds.js';
import type { ThresholdConfig } from './thresholds.js';

describe('thresholds', () => {
  describe('DEFAULT_THRESHOLDS', () => {
    it('has stale PR warning of 1 day', () => {
      expect(DEFAULT_THRESHOLDS.stalePrWarningDays).toBe(1);
    });

    it('has stale PR alert of 2 days', () => {
      expect(DEFAULT_THRESHOLDS.stalePrAlertDays).toBe(2);
    });

    it('has all required fields', () => {
      expect(DEFAULT_THRESHOLDS.staleIssueDays).toBe(7);
      expect(DEFAULT_THRESHOLDS.reviewImbalanceThreshold).toBe(0.6);
      expect(DEFAULT_THRESHOLDS.highChurnMultiplier).toBe(3);
      expect(DEFAULT_THRESHOLDS.highChurnMinimum).toBe(1000);
      expect(DEFAULT_THRESHOLDS.trendAlertPercent).toBe(50);
      expect(DEFAULT_THRESHOLDS.trendWarningPercent).toBe(25);
      expect(DEFAULT_THRESHOLDS.mergeTimeWarningH).toBe(24);
      expect(DEFAULT_THRESHOLDS.mergeTimeAlertH).toBe(48);
    });
  });

  describe('resolveThresholds', () => {
    it('returns defaults when no overrides provided', () => {
      const result = resolveThresholds();
      expect(result).toEqual(DEFAULT_THRESHOLDS);
    });

    it('returns defaults when undefined passed', () => {
      const result = resolveThresholds(undefined);
      expect(result).toEqual(DEFAULT_THRESHOLDS);
    });

    it('applies partial overrides while keeping other defaults', () => {
      const overrides: ThresholdConfig = {
        stalePrWarningDays: 3,
        stalePrAlertDays: 7,
      };
      const result = resolveThresholds(overrides);

      expect(result.stalePrWarningDays).toBe(3);
      expect(result.stalePrAlertDays).toBe(7);
      expect(result.staleIssueDays).toBe(DEFAULT_THRESHOLDS.staleIssueDays);
      expect(result.reviewImbalanceThreshold).toBe(DEFAULT_THRESHOLDS.reviewImbalanceThreshold);
      expect(result.trendAlertPercent).toBe(DEFAULT_THRESHOLDS.trendAlertPercent);
    });

    it('applies full overrides', () => {
      const overrides: ThresholdConfig = {
        stalePrWarningDays: 5,
        stalePrAlertDays: 10,
        staleIssueDays: 14,
        reviewImbalanceThreshold: 0.8,
        highChurnMultiplier: 5,
        highChurnMinimum: 2000,
        trendAlertPercent: 75,
        trendWarningPercent: 40,
        mergeTimeWarningH: 12,
        mergeTimeAlertH: 24,
      };
      const result = resolveThresholds(overrides);

      expect(result).toEqual(overrides);
    });

    it('does not mutate DEFAULT_THRESHOLDS', () => {
      const original = { ...DEFAULT_THRESHOLDS };
      resolveThresholds({ stalePrWarningDays: 99 });
      expect(DEFAULT_THRESHOLDS).toEqual(original);
    });
  });
});
