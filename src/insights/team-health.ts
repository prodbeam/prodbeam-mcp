/**
 * Team Health Scorer
 *
 * Computes an overall team health score (0-100) across four dimensions:
 *   - Velocity: commit activity trend
 *   - Throughput: PR merge rate and volume
 *   - Review Coverage: balanced review distribution
 *   - Issue Flow: Jira completion and carryover rate
 *
 * Generates actionable recommendations based on dimension scores.
 * Pure function — no I/O, all data passed in.
 */

import type { Snapshot, MemberSnapshot } from '../history/types.js';
import type { ThresholdConfig } from '../config/thresholds.js';
import { DEFAULT_THRESHOLDS } from '../config/thresholds.js';

export interface DimensionScore {
  score: number; // 0-100
  trend: 'up' | 'down' | 'stable';
}

export interface TeamHealthReport {
  overallScore: number; // 0-100
  dimensions: {
    velocity: DimensionScore;
    throughput: DimensionScore;
    reviewCoverage: DimensionScore;
    issueFlow: DimensionScore;
  };
  recommendations: string[];
}

export interface AssessTeamHealthInput {
  current: Snapshot;
  history: Snapshot[];
  memberSnapshots: MemberSnapshot[];
  thresholds?: Required<ThresholdConfig>;
}

/**
 * Assess team health from current and historical data.
 * Returns a health report with overall score, dimension breakdown, and recommendations.
 */
export function assessTeamHealth(input: AssessTeamHealthInput): TeamHealthReport {
  const { current, history, memberSnapshots } = input;
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;

  const velocity = scoreVelocity(current, history);
  const throughput = scoreThroughput(current, history, t);
  const reviewCoverage = scoreReviewCoverage(current, memberSnapshots);
  const issueFlow = scoreIssueFlow(current, history);

  // Weighted average: throughput and review coverage matter most
  const overallScore = Math.round(
    velocity.score * 0.2 +
      throughput.score * 0.3 +
      reviewCoverage.score * 0.25 +
      issueFlow.score * 0.25
  );

  const recommendations = generateRecommendations({
    velocity,
    throughput,
    reviewCoverage,
    issueFlow,
    current,
    memberSnapshots,
    thresholds: t,
  });

  return {
    overallScore,
    dimensions: { velocity, throughput, reviewCoverage, issueFlow },
    recommendations,
  };
}

// ─── Dimension Scorers ──────────────────────────────────────

function scoreVelocity(current: Snapshot, history: Snapshot[]): DimensionScore {
  if (history.length === 0) {
    // No history: score based on absolute commit activity
    return { score: current.totalCommits > 0 ? 70 : 30, trend: 'stable' };
  }

  const prevAvg = average(history.map((s) => s.totalCommits));
  if (prevAvg === 0) {
    return {
      score: current.totalCommits > 0 ? 80 : 50,
      trend: current.totalCommits > 0 ? 'up' : 'stable',
    };
  }

  const ratio = current.totalCommits / prevAvg;
  const trend = ratio > 1.1 ? 'up' : ratio < 0.9 ? 'down' : 'stable';

  // Score: 80+ if at or above average, drops as it falls below
  let score: number;
  if (ratio >= 1.0) {
    score = Math.min(100, 80 + Math.round(ratio * 10));
  } else {
    score = Math.max(20, Math.round(ratio * 80));
  }

  return { score, trend };
}

function scoreThroughput(
  current: Snapshot,
  history: Snapshot[],
  t: Required<ThresholdConfig>
): DimensionScore {
  if (current.totalPRs === 0) {
    return { score: 30, trend: 'stable' };
  }

  // Merge rate as percentage of total PRs
  const mergeRate = current.totalPRs > 0 ? current.prsMerged / current.totalPRs : 0;

  // Score based on merge rate: 80%+ merge rate = high score
  let score = Math.round(mergeRate * 100);

  // Penalize slow merge times
  if (current.avgMergeTimeH !== null && current.avgMergeTimeH > t.mergeTimeWarningH) {
    score = Math.max(20, score - 15);
  } else if (current.avgMergeTimeH !== null && current.avgMergeTimeH > t.mergeTimeAlertH) {
    score = Math.max(20, score - 30);
  }

  // Trend from history
  let trend: DimensionScore['trend'] = 'stable';
  if (history.length > 0) {
    const prevAvgMerged = average(history.map((s) => s.prsMerged));
    if (prevAvgMerged > 0) {
      const ratio = current.prsMerged / prevAvgMerged;
      trend = ratio > 1.1 ? 'up' : ratio < 0.9 ? 'down' : 'stable';
    }
  }

  return { score: clamp(score, 0, 100), trend };
}

function scoreReviewCoverage(current: Snapshot, memberSnapshots: MemberSnapshot[]): DimensionScore {
  if (current.totalReviews === 0) {
    return { score: 30, trend: 'stable' };
  }

  if (memberSnapshots.length <= 1) {
    // Single member team — reviews are inherently balanced
    return { score: 70, trend: 'stable' };
  }

  // Check how evenly reviews are distributed
  const reviewCounts = memberSnapshots.map((m) => m.reviewsGiven);
  const total = reviewCounts.reduce((a, b) => a + b, 0);

  if (total === 0) {
    return { score: 30, trend: 'stable' };
  }

  // Calculate Gini coefficient for review distribution
  const gini = calculateGini(reviewCounts);

  // Perfect equality = 0, perfect inequality = 1
  // Score: lower gini = better
  const score = Math.round((1 - gini) * 100);

  return { score: clamp(score, 0, 100), trend: 'stable' };
}

function scoreIssueFlow(current: Snapshot, history: Snapshot[]): DimensionScore {
  if (current.jiraTotal === 0) {
    // No Jira data — neutral score
    return { score: 60, trend: 'stable' };
  }

  // Score based on completion percentage
  let score = Math.round(current.jiraCompletionPct);

  // Trend from history
  let trend: DimensionScore['trend'] = 'stable';
  if (history.length > 0) {
    const prevAvgCompletion = average(history.map((s) => s.jiraCompletionPct));
    if (prevAvgCompletion > 0) {
      const diff = current.jiraCompletionPct - prevAvgCompletion;
      trend = diff > 5 ? 'up' : diff < -5 ? 'down' : 'stable';
    }
  }

  // Boost for high completion
  if (current.jiraCompletionPct >= 90) {
    score = Math.min(100, score + 5);
  }

  return { score: clamp(score, 0, 100), trend };
}

// ─── Recommendations ────────────────────────────────────────

interface RecommendationContext {
  velocity: DimensionScore;
  throughput: DimensionScore;
  reviewCoverage: DimensionScore;
  issueFlow: DimensionScore;
  current: Snapshot;
  memberSnapshots: MemberSnapshot[];
  thresholds: Required<ThresholdConfig>;
}

function generateRecommendations(ctx: RecommendationContext): string[] {
  const recs: string[] = [];

  // Velocity
  if (ctx.velocity.score < 50 && ctx.velocity.trend === 'down') {
    recs.push(
      'Commit velocity is declining — consider whether scope or blockers are slowing the team'
    );
  }

  // Throughput
  if (
    ctx.current.avgMergeTimeH !== null &&
    ctx.current.avgMergeTimeH > ctx.thresholds.mergeTimeWarningH
  ) {
    recs.push(
      `Average merge time is ${Math.round(ctx.current.avgMergeTimeH)}h — aim for under ${ctx.thresholds.mergeTimeWarningH}h to maintain flow`
    );
  }
  if (ctx.current.prsOpen > ctx.current.prsMerged && ctx.current.prsOpen > 3) {
    recs.push(
      `${ctx.current.prsOpen} PRs are open vs ${ctx.current.prsMerged} merged — review backlog may be growing`
    );
  }

  // Review coverage
  if (ctx.reviewCoverage.score < 50 && ctx.memberSnapshots.length > 1) {
    recs.push('Review load is unevenly distributed — consider rotating review assignments');
  }

  // Issue flow
  if (ctx.issueFlow.score < 60 && ctx.issueFlow.trend === 'down') {
    recs.push('Jira completion rate is dropping — review sprint scope or address blockers');
  }
  if (ctx.current.jiraCompletionPct > 0 && ctx.current.jiraCompletionPct < 50) {
    recs.push(
      `Only ${ctx.current.jiraCompletionPct}% of issues completed — sprint may be over-committed`
    );
  }

  return recs;
}

// ─── Utilities ──────────────────────────────────────────────

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Calculate Gini coefficient for a distribution.
 * Returns 0 (perfect equality) to 1 (perfect inequality).
 */
function calculateGini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;

  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i]!;
  }

  return numerator / (n * sum);
}
