import { describe, it, expect } from 'vitest';
import { analyzeTrends } from './trend-analyzer.js';
import type { Snapshot } from '../history/types.js';
import { resolveThresholds } from '../config/thresholds.js';

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    teamName: 'Test',
    snapshotType: 'weekly',
    periodStart: '2026-01-31T00:00:00Z',
    periodEnd: '2026-02-07T00:00:00Z',
    totalCommits: 40,
    totalPRs: 10,
    prsMerged: 7,
    prsOpen: 3,
    totalAdditions: 1000,
    totalDeletions: 400,
    totalReviews: 12,
    avgMergeTimeH: 4.0,
    jiraTotal: 20,
    jiraCompleted: 16,
    jiraCompletionPct: 80,
    ...overrides,
  };
}

describe('trend-analyzer', () => {
  it('returns empty array when no previous snapshot', () => {
    const current = makeSnapshot();
    const insights = analyzeTrends(current, null);
    expect(insights).toEqual([]);
  });

  it('detects increased commits as positive info', () => {
    const current = makeSnapshot({ totalCommits: 50 });
    const previous = makeSnapshot({ totalCommits: 40 });

    const insights = analyzeTrends(current, previous);
    const commitInsight = insights.find((i) => i.metric === 'Commits');

    expect(commitInsight).toBeDefined();
    expect(commitInsight!.direction).toBe('up');
    expect(commitInsight!.changePercent).toBe(25);
    expect(commitInsight!.severity).toBe('info'); // up + upGood = good direction
  });

  it('detects decreased commits as warning', () => {
    const current = makeSnapshot({ totalCommits: 20 });
    const previous = makeSnapshot({ totalCommits: 40 });

    const insights = analyzeTrends(current, previous);
    const commitInsight = insights.find((i) => i.metric === 'Commits');

    expect(commitInsight!.direction).toBe('down');
    expect(commitInsight!.changePercent).toBe(-50);
    expect(commitInsight!.severity).toBe('alert'); // 50% drop on upGood metric
  });

  it('detects increased open PRs as warning', () => {
    const current = makeSnapshot({ prsOpen: 8 });
    const previous = makeSnapshot({ prsOpen: 3 });

    const insights = analyzeTrends(current, previous);
    const prInsight = insights.find((i) => i.metric === 'Open PRs');

    expect(prInsight!.direction).toBe('up');
    expect(prInsight!.severity).toBe('alert'); // up on !upGood metric, >50%
  });

  it('detects merge time increase as warning', () => {
    const current = makeSnapshot({ avgMergeTimeH: 8.0 });
    const previous = makeSnapshot({ avgMergeTimeH: 4.0 });

    const insights = analyzeTrends(current, previous);
    const mergeInsight = insights.find((i) => i.metric === 'Avg Merge Time');

    expect(mergeInsight!.direction).toBe('up');
    expect(mergeInsight!.changePercent).toBe(100);
    expect(mergeInsight!.severity).toBe('alert');
  });

  it('detects Jira completion drop as alert', () => {
    const current = makeSnapshot({ jiraCompletionPct: 40, jiraTotal: 20 });
    const previous = makeSnapshot({ jiraCompletionPct: 80, jiraTotal: 20 });

    const insights = analyzeTrends(current, previous);
    const jiraInsight = insights.find((i) => i.metric === 'Jira Completion');

    expect(jiraInsight!.direction).toBe('down');
    expect(jiraInsight!.changePercent).toBe(-50);
    expect(jiraInsight!.severity).toBe('alert');
  });

  it('filters out stable metrics', () => {
    // Same values = stable = filtered out
    const current = makeSnapshot();
    const previous = makeSnapshot();

    const insights = analyzeTrends(current, previous);
    expect(insights).toHaveLength(0);
  });

  it('sorts alerts before warnings before info', () => {
    const current = makeSnapshot({
      totalCommits: 10, // -75% = alert (bad: upGood metric dropped)
      prsMerged: 9, // +28% = info (good: upGood metric increased)
      prsOpen: 8, // +166% = alert (bad: !upGood metric increased)
    });
    const previous = makeSnapshot({
      totalCommits: 40,
      prsMerged: 7,
      prsOpen: 3,
    });

    const insights = analyzeTrends(current, previous);

    // Alerts should come first
    const severities = insights.map((i) => i.severity);
    const alertIndex = severities.indexOf('alert');
    const infoIndex = severities.indexOf('info');
    if (alertIndex !== -1 && infoIndex !== -1) {
      expect(alertIndex).toBeLessThan(infoIndex);
    }
  });

  it('handles zero previous values without division by zero', () => {
    const current = makeSnapshot({ totalCommits: 10 });
    const previous = makeSnapshot({ totalCommits: 0 });

    const insights = analyzeTrends(current, previous);
    const commitInsight = insights.find((i) => i.metric === 'Commits');

    expect(commitInsight!.changePercent).toBe(100);
    expect(commitInsight!.direction).toBe('up');
  });

  it('skips merge time comparison when either is null', () => {
    const current = makeSnapshot({ avgMergeTimeH: null });
    const previous = makeSnapshot({ avgMergeTimeH: 4.0 });

    const insights = analyzeTrends(current, previous);
    const mergeInsight = insights.find((i) => i.metric === 'Avg Merge Time');

    expect(mergeInsight).toBeUndefined();
  });

  it('skips Jira trends when no Jira data', () => {
    const current = makeSnapshot({ jiraTotal: 0 });
    const previous = makeSnapshot({ jiraTotal: 0 });

    const insights = analyzeTrends(current, previous);
    const jiraInsight = insights.find((i) => i.metric === 'Jira Completion');

    expect(jiraInsight).toBeUndefined();
  });

  it('includes human-readable messages', () => {
    const current = makeSnapshot({ totalCommits: 60 });
    const previous = makeSnapshot({ totalCommits: 40 });

    const insights = analyzeTrends(current, previous);
    const commitInsight = insights.find((i) => i.metric === 'Commits');

    expect(commitInsight!.message).toContain('60 commits');
    expect(commitInsight!.message).toContain('was 40');
  });

  describe('custom thresholds', () => {
    it('uses custom alert and warning thresholds', () => {
      // 30% drop: with default thresholds (alert=50, warning=25), this is a warning
      const current = makeSnapshot({ totalCommits: 28 });
      const previous = makeSnapshot({ totalCommits: 40 });

      const defaultInsights = analyzeTrends(current, previous);
      const defaultCommit = defaultInsights.find((i) => i.metric === 'Commits');
      expect(defaultCommit!.severity).toBe('warning');

      // With stricter thresholds (alert=20), 30% drop becomes an alert
      const strictThresholds = resolveThresholds({ trendAlertPercent: 20 });
      const strictInsights = analyzeTrends(current, previous, strictThresholds);
      const strictCommit = strictInsights.find((i) => i.metric === 'Commits');
      expect(strictCommit!.severity).toBe('alert');
    });

    it('uses custom warning threshold', () => {
      // 15% drop: with default (warning=25), this is info
      const current = makeSnapshot({ totalCommits: 34 });
      const previous = makeSnapshot({ totalCommits: 40 });

      const defaultInsights = analyzeTrends(current, previous);
      const defaultCommit = defaultInsights.find((i) => i.metric === 'Commits');
      expect(defaultCommit!.severity).toBe('info');

      // With stricter warning (10%), 15% drop becomes a warning
      const strictThresholds = resolveThresholds({ trendWarningPercent: 10 });
      const strictInsights = analyzeTrends(current, previous, strictThresholds);
      const strictCommit = strictInsights.find((i) => i.metric === 'Commits');
      expect(strictCommit!.severity).toBe('warning');
    });
  });
});
