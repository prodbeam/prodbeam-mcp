/**
 * Content Insights
 *
 * Pure functions that derive meaningful insights from work artifacts:
 * PR-Jira linking, accomplishments, went well/didn't, action items,
 * investment balance, and developer summaries.
 *
 * No I/O — all data passed in, results returned.
 */

import type { GitHubActivity, GitHubPullRequest, GitHubReview } from '../types/github.js';
import type { JiraIssue } from '../types/jira.js';
import type { Anomaly } from './anomaly-detector.js';
import type { SprintMetrics } from '../types/retrospective.js';

// ─── Types ──────────────────────────────────────────────────

export interface PrJiraLink {
  pr: GitHubPullRequest;
  jiraKey: string | null;
  jiraIssue?: JiraIssue;
}

export interface DeveloperSummary {
  username: string;
  commits: number;
  prsAuthored: number;
  prsMerged: number;
  reviewsGiven: number;
  keyDeliverables: string[];
  inProgress: string[];
  carryover: string[];
}

export interface ContentInsights {
  prJiraLinks: PrJiraLink[];
  accomplishments: string[];
  wentWell: string[];
  needsImprovement: string[];
  actionItems: string[];
  investmentBalance: Record<string, number>;
  developerSummaries: DeveloperSummary[];
  sprintGoal?: string;
}

// ─── PR-Jira Linking ────────────────────────────────────────

const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;

/**
 * Link PRs to Jira issues by extracting issue keys from PR titles.
 */
export function linkPRsToJira(prs: GitHubPullRequest[], jiraIssues: JiraIssue[]): PrJiraLink[] {
  const issueMap = new Map(jiraIssues.map((i) => [i.key, i]));

  return prs.map((pr) => {
    const match = pr.title.match(JIRA_KEY_PATTERN);
    const jiraKey = match?.[1] ?? null;
    return {
      pr,
      jiraKey,
      jiraIssue: jiraKey ? issueMap.get(jiraKey) : undefined,
    };
  });
}

// ─── Accomplishments ────────────────────────────────────────

const DONE_STATUSES = new Set(['done', 'closed', 'resolved', 'complete', 'completed']);

/**
 * Generate a list of completed work items with context.
 */
export function generateAccomplishments(
  mergedPRs: GitHubPullRequest[],
  doneIssues: JiraIssue[],
  links: PrJiraLink[]
): string[] {
  const accomplishments: string[] = [];
  const linkedPRs = new Set<number>();
  const linkedIssues = new Set<string>();

  // Linked items: show both PR and Jira context together
  for (const link of links) {
    if (
      link.pr.state === 'merged' &&
      link.jiraIssue &&
      DONE_STATUSES.has(link.jiraIssue.status.toLowerCase())
    ) {
      accomplishments.push(
        `${link.jiraKey}: ${link.jiraIssue.summary} [${link.jiraIssue.status}] → PR #${link.pr.number}`
      );
      linkedPRs.add(link.pr.number);
      linkedIssues.add(link.jiraKey!);
    }
  }

  // Unlinked merged PRs
  for (const pr of mergedPRs) {
    if (!linkedPRs.has(pr.number)) {
      accomplishments.push(`PR #${pr.number}: ${pr.title} [merged]`);
    }
  }

  // Unlinked done Jira issues
  for (const issue of doneIssues) {
    if (!linkedIssues.has(issue.key)) {
      accomplishments.push(`${issue.key}: ${issue.summary} [${issue.status}]`);
    }
  }

  return accomplishments;
}

// ─── What Went Well ─────────────────────────────────────────

/**
 * Generate "what went well" insights from metrics and anomalies.
 */
export function generateWentWell(
  metrics: SprintMetrics | null,
  anomalies: Anomaly[],
  accomplishments: string[]
): string[] {
  const items: string[] = [];

  if (metrics) {
    // Fast merges
    if (metrics.avgMergeTimeHours !== null && metrics.avgMergeTimeHours < 24) {
      items.push(
        `Fast merge cycles: ${metrics.avgMergeTimeHours}h average — well under 24h target`
      );
    }

    // High completion
    if (metrics.jira && metrics.jira.completionRate > 70) {
      items.push(`Strong sprint execution: ${metrics.jira.completionRate}% completion rate`);
    }

    // Good merge rate
    if (metrics.pullRequests.mergeRate > 80) {
      items.push(`Healthy PR throughput: ${metrics.pullRequests.mergeRate}% merge rate`);
    }
  }

  // Accomplishments count
  if (accomplishments.length > 0) {
    const top = accomplishments.slice(0, 3).map((a) => a.split(' → ')[0]!);
    items.push(`Delivered ${accomplishments.length} items including ${top.join(', ')}`);
  }

  // No stale issues (absence of stale_issue anomalies)
  const hasStaleIssues = anomalies.some((a) => a.type === 'stale_issue');
  if (!hasStaleIssues && metrics?.jira && metrics.jira.totalIssues > 0) {
    items.push('Clean board — no stale high-priority items');
  }

  return items;
}

// ─── What Needs Improvement ─────────────────────────────────

/**
 * Generate "what needs improvement" insights.
 */
export function generateNeedsImprovement(
  metrics: SprintMetrics | null,
  anomalies: Anomaly[],
  reviews: GitHubReview[]
): string[] {
  const items: string[] = [];

  // Stale PRs
  const stalePRs = anomalies.filter((a) => a.type === 'stale_pr');
  if (stalePRs.length > 0) {
    const titles = stalePRs.slice(0, 3).map((a) => {
      const num = String(a.details['prNumber'] ?? '');
      const days = String(a.details['ageDays'] ?? '');
      return `#${num} (${days}d)`;
    });
    items.push(
      `${stalePRs.length} PR${stalePRs.length === 1 ? '' : 's'} stale — ${titles.join(', ')}`
    );
  }

  // No approvals (all reviews are COMMENTED)
  if (reviews.length > 0) {
    const approvals = reviews.filter((r) => r.state === 'APPROVED').length;
    if (approvals === 0) {
      items.push(`All ${reviews.length} reviews were COMMENTED — no formal approvals`);
    }
  }

  // High carryover
  if (metrics?.jira) {
    const carryover = metrics.jira.totalIssues - metrics.jira.completed;
    const carryoverPct = Math.round((carryover / metrics.jira.totalIssues) * 100);
    if (carryoverPct > 30) {
      items.push(`${carryoverPct}% carryover (${carryover} issues) into next sprint`);
    }
  }

  // Low completion
  if (metrics?.jira && metrics.jira.completionRate < 50) {
    items.push(`Only ${metrics.jira.completionRate}% of sprint scope completed`);
  }

  // Review imbalance
  const imbalance = anomalies.find((a) => a.type === 'review_imbalance');
  if (imbalance) {
    items.push(imbalance.message);
  }

  return items;
}

// ─── Action Items ───────────────────────────────────────────

/**
 * Generate actionable follow-up items from anomalies.
 */
export function generateActionItems(
  anomalies: Anomaly[],
  reviews: GitHubReview[],
  metrics: SprintMetrics | null
): string[] {
  const items: string[] = [];

  // Stale PRs → triage
  const stalePRs = anomalies.filter((a) => a.type === 'stale_pr');
  if (stalePRs.length > 0) {
    items.push(
      `Triage ${stalePRs.length} stale PR${stalePRs.length === 1 ? '' : 's'}: assign reviewers or close if superseded`
    );
  }

  // No approvals → establish workflow
  if (reviews.length > 0) {
    const approvals = reviews.filter((r) => r.state === 'APPROVED').length;
    if (approvals === 0) {
      items.push(
        'Establish approval workflow — reviews should conclude with APPROVE or CHANGES_REQUESTED'
      );
    }
  }

  // High carryover → review capacity
  if (metrics?.jira) {
    const carryover = metrics.jira.totalIssues - metrics.jira.completed;
    const carryoverPct = Math.round((carryover / metrics.jira.totalIssues) * 100);
    if (carryoverPct > 30) {
      items.push('Review sprint capacity — consider smaller scope next sprint');
    }
  }

  // Review imbalance → rotate
  if (anomalies.some((a) => a.type === 'review_imbalance')) {
    items.push('Rotate review assignments to distribute load');
  }

  return items;
}

// ─── Investment Balance ─────────────────────────────────────

/**
 * Group Jira issues by type to show investment distribution.
 */
export function calculateInvestmentBalance(jiraIssues: JiraIssue[]): Record<string, number> {
  const balance: Record<string, number> = {};
  for (const issue of jiraIssues) {
    balance[issue.issueType] = (balance[issue.issueType] ?? 0) + 1;
  }
  return balance;
}

// ─── Developer Summaries ────────────────────────────────────

/**
 * Build per-developer summaries from per-member GitHub activity and Jira data.
 */
export function buildDeveloperSummaries(
  perMember: GitHubActivity[],
  jiraIssues: JiraIssue[],
  links: PrJiraLink[]
): DeveloperSummary[] {
  return perMember.map((member) => {
    const mergedPRs = member.pullRequests.filter((pr) => pr.state === 'merged');
    const openPRs = member.pullRequests.filter((pr) => pr.state === 'open');

    // Key deliverables: merged PRs (with Jira context if linked)
    const keyDeliverables: string[] = [];
    for (const pr of mergedPRs) {
      const link = links.find((l) => l.pr.number === pr.number && l.pr.repo === pr.repo);
      if (link?.jiraIssue) {
        keyDeliverables.push(`${link.jiraKey}: ${link.jiraIssue.summary} → PR #${pr.number}`);
      } else {
        keyDeliverables.push(`PR #${pr.number}: ${pr.title}`);
      }
    }

    // In progress: open PRs with Jira context
    const inProgress: string[] = [];
    for (const pr of openPRs) {
      const link = links.find((l) => l.pr.number === pr.number && l.pr.repo === pr.repo);
      if (link?.jiraIssue) {
        inProgress.push(`${link.jiraKey}: ${link.jiraIssue.summary} → PR #${pr.number}`);
      } else {
        inProgress.push(`PR #${pr.number}: ${pr.title}`);
      }
    }

    // Carryover: non-done Jira issues assigned to this member
    const carryover: string[] = [];
    const memberName = member.username.toLowerCase();
    for (const issue of jiraIssues) {
      if (
        issue.assignee.toLowerCase() === memberName &&
        !DONE_STATUSES.has(issue.status.toLowerCase())
      ) {
        carryover.push(`${issue.key}: ${issue.summary} [${issue.status}]`);
      }
    }

    return {
      username: member.username,
      commits: member.commits.length,
      prsAuthored: member.pullRequests.length,
      prsMerged: mergedPRs.length,
      reviewsGiven: member.reviews.length,
      keyDeliverables,
      inProgress,
      carryover,
    };
  });
}

// ─── Full Content Insights ──────────────────────────────────

export interface GenerateContentInsightsInput {
  github: GitHubActivity;
  jiraIssues: JiraIssue[];
  anomalies: Anomaly[];
  metrics: SprintMetrics | null;
  perMember?: GitHubActivity[];
  sprintGoal?: string;
}

/**
 * Generate all content insights in one call.
 */
export function generateContentInsights(input: GenerateContentInsightsInput): ContentInsights {
  const { github, jiraIssues, anomalies, metrics, perMember, sprintGoal } = input;

  const links = linkPRsToJira(github.pullRequests, jiraIssues);
  const mergedPRs = github.pullRequests.filter((pr) => pr.state === 'merged');
  const doneIssues = jiraIssues.filter((i) => DONE_STATUSES.has(i.status.toLowerCase()));

  const accomplishments = generateAccomplishments(mergedPRs, doneIssues, links);
  const wentWell = generateWentWell(metrics, anomalies, accomplishments);
  const needsImprovement = generateNeedsImprovement(metrics, anomalies, github.reviews);
  const actionItems = generateActionItems(anomalies, github.reviews, metrics);
  const investmentBalance = calculateInvestmentBalance(jiraIssues);
  const developerSummaries = perMember ? buildDeveloperSummaries(perMember, jiraIssues, links) : [];

  return {
    prJiraLinks: links,
    accomplishments,
    wentWell,
    needsImprovement,
    actionItems,
    investmentBalance,
    developerSummaries,
    sprintGoal,
  };
}
