/**
 * Insight Types
 *
 * Data structures for trend analysis and anomaly detection.
 */

/** A single trend insight comparing current to previous period. */
export interface TrendInsight {
  metric: string;
  current: number;
  previous: number;
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
  severity: 'info' | 'warning' | 'alert';
  message: string;
}
