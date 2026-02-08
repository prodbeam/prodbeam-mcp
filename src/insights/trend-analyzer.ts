/**
 * Trend Analyzer
 *
 * Pure functions to compare current metrics against a previous snapshot.
 * Produces human-readable insights with severity levels.
 * No I/O — all data passed in, results returned.
 */

import type { Snapshot } from '../history/types.js';
import type { TrendInsight } from './types.js';
import type { ThresholdConfig } from '../config/thresholds.js';
import { DEFAULT_THRESHOLDS } from '../config/thresholds.js';

/**
 * Analyze trends between current and previous snapshots.
 * Returns an array of insights, sorted by severity (alerts first).
 *
 * If previous is null (first-ever snapshot), returns empty array.
 */
export function analyzeTrends(
  current: Snapshot,
  previous: Snapshot | null,
  thresholds?: Required<ThresholdConfig>
): TrendInsight[] {
  if (!previous) return [];

  const t = thresholds ?? DEFAULT_THRESHOLDS;
  const insights: TrendInsight[] = [];

  // Commits
  insights.push(
    compareStat('Commits', current.totalCommits, previous.totalCommits, t, {
      upGood: true,
      format: (c, p) => `${c} commits (was ${p})`,
    })
  );

  // PRs merged
  insights.push(
    compareStat('PRs Merged', current.prsMerged, previous.prsMerged, t, {
      upGood: true,
      format: (c, p) => `${c} PRs merged (was ${p})`,
    })
  );

  // Open PRs
  insights.push(
    compareStat('Open PRs', current.prsOpen, previous.prsOpen, t, {
      upGood: false,
      format: (c, p) => `${c} open PRs (was ${p})`,
    })
  );

  // Code volume
  const currentChurn = current.totalAdditions + current.totalDeletions;
  const previousChurn = previous.totalAdditions + previous.totalDeletions;
  insights.push(
    compareStat('Code Churn', currentChurn, previousChurn, t, {
      upGood: true,
      format: (_c, _p) =>
        `+${current.totalAdditions}/-${current.totalDeletions} lines (was +${previous.totalAdditions}/-${previous.totalDeletions})`,
    })
  );

  // Reviews
  insights.push(
    compareStat('Reviews', current.totalReviews, previous.totalReviews, t, {
      upGood: true,
      format: (c, p) => `${c} reviews (was ${p})`,
    })
  );

  // Merge time (lower is better)
  if (current.avgMergeTimeH !== null && previous.avgMergeTimeH !== null) {
    insights.push(
      compareStat('Avg Merge Time', current.avgMergeTimeH, previous.avgMergeTimeH, t, {
        upGood: false,
        unit: 'h',
        format: (c, p) => `${c}h avg merge time (was ${p}h)`,
      })
    );
  }

  // Jira completion rate
  if (current.jiraTotal > 0 && previous.jiraTotal > 0) {
    insights.push(
      compareStat('Jira Completion', current.jiraCompletionPct, previous.jiraCompletionPct, t, {
        upGood: true,
        unit: '%',
        format: (c, p) => `${c}% completion rate (was ${p}%)`,
      })
    );
  }

  // Filter out stable/trivial changes and sort by severity
  return insights.filter((i) => i.direction !== 'stable').sort(severitySort);
}

// ─── Internals ──────────────────────────────────────────────

interface CompareOptions {
  upGood: boolean;
  unit?: string;
  format: (current: number, previous: number) => string;
}

function compareStat(
  metric: string,
  current: number,
  previous: number,
  t: Required<ThresholdConfig>,
  opts: CompareOptions
): TrendInsight {
  const changePercent =
    previous === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - previous) / previous) * 100);

  const absChange = Math.abs(changePercent);
  const direction: TrendInsight['direction'] =
    absChange < 5 ? 'stable' : changePercent > 0 ? 'up' : 'down';

  // Severity depends on whether the direction is bad for the metric
  const isBadDirection =
    (direction === 'up' && !opts.upGood) || (direction === 'down' && opts.upGood);

  let severity: TrendInsight['severity'] = 'info';
  if (isBadDirection && absChange >= t.trendAlertPercent) {
    severity = 'alert';
  } else if (isBadDirection && absChange >= t.trendWarningPercent) {
    severity = 'warning';
  }

  const arrow = direction === 'up' ? '+' : direction === 'down' ? '' : '';
  const message =
    direction === 'stable'
      ? `${metric}: stable at ${current}${opts.unit ?? ''}`
      : `${metric}: ${arrow}${changePercent}% — ${opts.format(current, previous)}`;

  return {
    metric,
    current,
    previous,
    changePercent,
    direction,
    severity,
    message,
  };
}

const SEVERITY_ORDER: Record<TrendInsight['severity'], number> = {
  alert: 0,
  warning: 1,
  info: 2,
};

function severitySort(a: TrendInsight, b: TrendInsight): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
}
