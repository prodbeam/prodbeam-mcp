/**
 * Metrics Calculator
 *
 * Pure functions to compute weekly metrics from raw GitHub and Jira activity.
 * No I/O — all data passed in, results returned.
 */

import type { GitHubActivity } from '../types/github.js';
import type { JiraActivity } from '../types/jira.js';
import type { WeeklyMetrics, RepoMetrics, JiraWeeklyMetrics } from '../types/weekly.js';

/**
 * Calculate weekly metrics from GitHub and optional Jira activity
 */
export function calculateWeeklyMetrics(github: GitHubActivity, jira?: JiraActivity): WeeklyMetrics {
  const repoMap = new Map<string, RepoMetrics>();

  const getRepo = (repo: string): RepoMetrics => {
    let entry = repoMap.get(repo);
    if (!entry) {
      entry = {
        repo,
        commits: 0,
        pullRequests: 0,
        merged: 0,
        additions: 0,
        deletions: 0,
        reviews: 0,
      };
      repoMap.set(repo, entry);
    }
    return entry;
  };

  // Commits
  for (const c of github.commits) {
    getRepo(c.repo).commits++;
  }

  // Pull Requests
  let prOpen = 0;
  let prMerged = 0;
  let prClosed = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;

  // Merge time tracking
  let totalMergeTimeMs = 0;
  let mergedWithTimestamps = 0;

  // PR size distribution
  let prSmall = 0;
  let prMedium = 0;
  let prLarge = 0;

  for (const pr of github.pullRequests) {
    const r = getRepo(pr.repo);
    r.pullRequests++;

    if (pr.state === 'merged') {
      prMerged++;
      r.merged++;
      if (pr.createdAt && pr.mergedAt) {
        const created = new Date(pr.createdAt).getTime();
        const merged = new Date(pr.mergedAt).getTime();
        if (!isNaN(created) && !isNaN(merged) && merged > created) {
          totalMergeTimeMs += merged - created;
          mergedWithTimestamps++;
        }
      }
    } else if (pr.state === 'open') {
      prOpen++;
    } else {
      prClosed++;
    }

    totalAdditions += pr.additions ?? 0;
    totalDeletions += pr.deletions ?? 0;
    r.additions += pr.additions ?? 0;
    r.deletions += pr.deletions ?? 0;

    // Classify PR size by total lines changed
    const linesChanged = (pr.additions ?? 0) + (pr.deletions ?? 0);
    if (linesChanged <= 100) {
      prSmall++;
    } else if (linesChanged <= 500) {
      prMedium++;
    } else {
      prLarge++;
    }
  }

  // Reviews
  let approved = 0;
  let changesRequested = 0;
  let commented = 0;

  for (const rev of github.reviews) {
    getRepo(rev.repo).reviews++;

    if (rev.state === 'APPROVED') approved++;
    else if (rev.state === 'CHANGES_REQUESTED') changesRequested++;
    else commented++;
  }

  // Sort repos by total activity descending
  const repoBreakdown = Array.from(repoMap.values()).sort((a, b) => {
    const totalA = a.commits + a.pullRequests + a.reviews;
    const totalB = b.commits + b.pullRequests + b.reviews;
    return totalB - totalA;
  });

  // Average merge time in hours
  const avgMergeTimeHours =
    mergedWithTimestamps > 0
      ? Math.round((totalMergeTimeMs / mergedWithTimestamps / (1000 * 60 * 60)) * 10) / 10
      : null;

  const metrics: WeeklyMetrics = {
    totalCommits: github.commits.length,
    pullRequests: {
      total: github.pullRequests.length,
      open: prOpen,
      merged: prMerged,
      closed: prClosed,
    },
    additions: totalAdditions,
    deletions: totalDeletions,
    reviews: {
      total: github.reviews.length,
      approved,
      changesRequested,
      commented,
    },
    repoBreakdown,
    avgMergeTimeHours,
    prSizeDistribution: { small: prSmall, medium: prMedium, large: prLarge },
  };

  if (jira && jira.issues.length > 0) {
    metrics.jira = calculateJiraMetrics(jira);
  }

  return metrics;
}

/**
 * Calculate Jira-specific metrics from issue activity
 */
function calculateJiraMetrics(jira: JiraActivity): JiraWeeklyMetrics {
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const issue of jira.issues) {
    byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;
    byPriority[issue.priority] = (byPriority[issue.priority] ?? 0) + 1;
    byType[issue.issueType] = (byType[issue.issueType] ?? 0) + 1;
  }

  return {
    totalIssues: jira.issues.length,
    byStatus,
    byPriority,
    byType,
  };
}
