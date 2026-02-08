/**
 * Configurable Thresholds
 *
 * Defines all intelligence thresholds in one place.
 * Teams can override any subset via team.json settings.thresholds.
 * Missing overrides fall back to defaults.
 */

export interface ThresholdConfig {
  stalePrWarningDays?: number;
  stalePrAlertDays?: number;
  staleIssueDays?: number;
  reviewImbalanceThreshold?: number;
  highChurnMultiplier?: number;
  highChurnMinimum?: number;
  trendAlertPercent?: number;
  trendWarningPercent?: number;
  mergeTimeWarningH?: number;
  mergeTimeAlertH?: number;
}

export const DEFAULT_THRESHOLDS: Required<ThresholdConfig> = {
  stalePrWarningDays: 1,
  stalePrAlertDays: 2,
  staleIssueDays: 7,
  reviewImbalanceThreshold: 0.6,
  highChurnMultiplier: 3,
  highChurnMinimum: 1000,
  trendAlertPercent: 50,
  trendWarningPercent: 25,
  mergeTimeWarningH: 24,
  mergeTimeAlertH: 48,
};

/**
 * Merge user overrides onto defaults.
 * Returns a fully-resolved config with no optional fields.
 */
export function resolveThresholds(overrides?: ThresholdConfig): Required<ThresholdConfig> {
  if (!overrides) return { ...DEFAULT_THRESHOLDS };
  return { ...DEFAULT_THRESHOLDS, ...overrides };
}
