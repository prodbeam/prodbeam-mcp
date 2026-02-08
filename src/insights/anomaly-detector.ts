/**
 * Anomaly Detector
 *
 * Detects unusual patterns in team activity data.
 * Pure functions — no I/O, all data passed in.
 */

import type { GitHubPullRequest, GitHubReview } from '../types/github.js';
import type { JiraIssue } from '../types/jira.js';
import type { ThresholdConfig } from '../config/thresholds.js';
import { DEFAULT_THRESHOLDS } from '../config/thresholds.js';

export interface Anomaly {
  type: 'stale_pr' | 'stale_issue' | 'review_imbalance' | 'no_activity' | 'high_churn';
  severity: 'info' | 'warning' | 'alert';
  message: string;
  details: Record<string, unknown>;
}

interface MemberActivity {
  username: string;
  commits: number;
  prsAuthored: number;
  reviewsGiven: number;
  additions: number;
  deletions: number;
}

export interface DetectAnomaliesInput {
  pullRequests: GitHubPullRequest[];
  reviews: GitHubReview[];
  jiraIssues: JiraIssue[];
  memberActivity: MemberActivity[];
  now?: Date;
  thresholds?: Required<ThresholdConfig>;
}

/** Minimum team size for review imbalance detection. */
const MIN_TEAM_FOR_IMBALANCE = 2;

/** High-priority Jira statuses that should NOT be stale. */
const HIGH_PRIORITY_SET = new Set(['highest', 'high', 'critical', 'blocker']);

/** In-progress Jira statuses (stale if not moving). */
const IN_PROGRESS_STATUSES = new Set([
  'in progress',
  'in review',
  'in development',
  'doing',
  'active',
]);

/**
 * Detect anomalies in team activity data.
 * Returns anomalies sorted by severity (alerts first).
 */
export function detectAnomalies(input: DetectAnomaliesInput): Anomaly[] {
  const now = input.now ?? new Date();
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  const anomalies: Anomaly[] = [];

  detectStalePRs(input.pullRequests, now, t, anomalies);
  detectStaleIssues(input.jiraIssues, now, t, anomalies);
  detectReviewImbalance(input.reviews, input.memberActivity, t, anomalies);
  detectNoActivity(input.memberActivity, anomalies);
  detectHighChurn(input.memberActivity, t, anomalies);

  return anomalies.sort(severitySort);
}

// ─── Stale PRs ──────────────────────────────────────────────

function detectStalePRs(
  pullRequests: GitHubPullRequest[],
  now: Date,
  t: Required<ThresholdConfig>,
  out: Anomaly[]
): void {
  const openPRs = pullRequests.filter((pr) => pr.state === 'open');

  for (const pr of openPRs) {
    const createdAt = new Date(pr.createdAt);
    const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (ageDays >= t.stalePrAlertDays) {
      out.push({
        type: 'stale_pr',
        severity: 'alert',
        message: `PR #${pr.number} "${pr.title}" has been open for ${Math.floor(ageDays)} days`,
        details: { prNumber: pr.number, repo: pr.repo, ageDays: Math.floor(ageDays) },
      });
    } else if (ageDays >= t.stalePrWarningDays) {
      out.push({
        type: 'stale_pr',
        severity: 'warning',
        message: `PR #${pr.number} "${pr.title}" has been open for ${Math.floor(ageDays)} days`,
        details: { prNumber: pr.number, repo: pr.repo, ageDays: Math.floor(ageDays) },
      });
    }
  }
}

// ─── Stale Issues ───────────────────────────────────────────

function detectStaleIssues(
  issues: JiraIssue[],
  now: Date,
  t: Required<ThresholdConfig>,
  out: Anomaly[]
): void {
  for (const issue of issues) {
    const isHighPriority = HIGH_PRIORITY_SET.has(issue.priority.toLowerCase());
    const isInProgress = IN_PROGRESS_STATUSES.has(issue.status.toLowerCase());

    if (!isHighPriority || !isInProgress) continue;
    if (!issue.updatedAt) continue;

    const updatedAt = new Date(issue.updatedAt);
    const staleDays = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (staleDays >= t.staleIssueDays) {
      out.push({
        type: 'stale_issue',
        severity: 'alert',
        message: `${issue.key} (${issue.priority}) hasn't moved in ${Math.floor(staleDays)} days`,
        details: {
          issueKey: issue.key,
          priority: issue.priority,
          status: issue.status,
          staleDays: Math.floor(staleDays),
        },
      });
    }
  }
}

// ─── Review Imbalance ───────────────────────────────────────

function detectReviewImbalance(
  reviews: GitHubReview[],
  members: MemberActivity[],
  t: Required<ThresholdConfig>,
  out: Anomaly[]
): void {
  if (members.length < MIN_TEAM_FOR_IMBALANCE) return;

  const totalReviews = reviews.length;
  if (totalReviews < 3) return; // Too few reviews to detect imbalance

  // Count reviews per author
  const reviewsByAuthor = new Map<string, number>();
  for (const r of reviews) {
    reviewsByAuthor.set(r.author, (reviewsByAuthor.get(r.author) ?? 0) + 1);
  }

  // Find the top reviewer
  let topReviewer = '';
  let topCount = 0;
  for (const [author, count] of reviewsByAuthor) {
    if (count > topCount) {
      topReviewer = author;
      topCount = count;
    }
  }

  const ratio = topCount / totalReviews;
  if (ratio >= t.reviewImbalanceThreshold) {
    const percentage = Math.round(ratio * 100);
    out.push({
      type: 'review_imbalance',
      severity: 'warning',
      message: `${topReviewer} handled ${percentage}% of reviews (${topCount} of ${totalReviews})`,
      details: {
        reviewer: topReviewer,
        reviewCount: topCount,
        totalReviews,
        percentage,
      },
    });
  }
}

// ─── No Activity ────────────────────────────────────────────

function detectNoActivity(members: MemberActivity[], out: Anomaly[]): void {
  if (members.length === 0) return;

  for (const m of members) {
    const total = m.commits + m.prsAuthored + m.reviewsGiven;
    if (total === 0) {
      out.push({
        type: 'no_activity',
        severity: 'info',
        message: `${m.username} had no GitHub activity in this period`,
        details: { username: m.username },
      });
    }
  }
}

// ─── High Churn ─────────────────────────────────────────────

function detectHighChurn(
  members: MemberActivity[],
  t: Required<ThresholdConfig>,
  out: Anomaly[]
): void {
  if (members.length < 2) return;

  // Calculate team average churn
  const churns = members.map((m) => m.additions + m.deletions);
  const totalChurn = churns.reduce((a, b) => a + b, 0);
  const avgChurn = totalChurn / members.length;

  if (avgChurn === 0) return;

  for (let i = 0; i < members.length; i++) {
    const m = members[i]!;
    const churn = churns[i]!;

    if (churn > avgChurn * t.highChurnMultiplier && churn > t.highChurnMinimum) {
      out.push({
        type: 'high_churn',
        severity: 'warning',
        message: `${m.username} has unusually high code churn (+${m.additions}/-${m.deletions}) — ${Math.round(churn / avgChurn)}x team average`,
        details: {
          username: m.username,
          additions: m.additions,
          deletions: m.deletions,
          churn,
          teamAvgChurn: Math.round(avgChurn),
        },
      });
    }
  }
}

// ─── Sorting ────────────────────────────────────────────────

const SEVERITY_ORDER: Record<Anomaly['severity'], number> = {
  alert: 0,
  warning: 1,
  info: 2,
};

function severitySort(a: Anomaly, b: Anomaly): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
}
