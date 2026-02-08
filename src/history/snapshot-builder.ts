/**
 * Snapshot Builder
 *
 * Converts raw activity data into a Snapshot for persistence.
 * Pure function — no I/O.
 */

import type { Snapshot } from './types.js';
import type { GitHubActivity } from '../types/github.js';
import type { JiraActivity } from '../types/jira.js';

interface BuildSnapshotInput {
  teamName: string;
  snapshotType: Snapshot['snapshotType'];
  periodStart: string;
  periodEnd: string;
  sprintName?: string;
  github: GitHubActivity;
  jira?: JiraActivity;
}

const DONE_STATUSES = new Set(['done', 'closed', 'resolved', 'complete', 'completed']);

/**
 * Build a Snapshot from activity data.
 * Computes aggregate metrics from raw GitHub/Jira activity.
 */
export function buildSnapshot(input: BuildSnapshotInput): Snapshot {
  const { teamName, snapshotType, periodStart, periodEnd, sprintName, github, jira } = input;

  const totalCommits = github.commits.length;
  const totalPRs = github.pullRequests.length;
  const prsMerged = github.pullRequests.filter((pr) => pr.state === 'merged').length;
  const prsOpen = github.pullRequests.filter((pr) => pr.state === 'open').length;

  const totalAdditions = github.pullRequests.reduce((sum, pr) => sum + (pr.additions ?? 0), 0);
  const totalDeletions = github.pullRequests.reduce((sum, pr) => sum + (pr.deletions ?? 0), 0);
  const totalReviews = github.reviews.length;

  // Calculate average merge time from PRs that have both createdAt and mergedAt
  const mergedPRs = github.pullRequests.filter((pr) => pr.mergedAt && pr.createdAt);
  let avgMergeTimeH: number | null = null;
  if (mergedPRs.length > 0) {
    const totalHours = mergedPRs.reduce((sum, pr) => {
      const created = new Date(pr.createdAt).getTime();
      const merged = new Date(pr.mergedAt!).getTime();
      return sum + (merged - created) / (1000 * 60 * 60);
    }, 0);
    avgMergeTimeH = Math.round((totalHours / mergedPRs.length) * 10) / 10;
  }

  // Jira metrics
  const jiraTotal = jira?.issues.length ?? 0;
  const jiraCompleted = jira
    ? jira.issues.filter((i) => DONE_STATUSES.has(i.status.toLowerCase())).length
    : 0;
  const jiraCompletionPct = jiraTotal > 0 ? Math.round((jiraCompleted / jiraTotal) * 100) : 0;

  return {
    teamName,
    snapshotType,
    periodStart,
    periodEnd,
    sprintName,
    totalCommits,
    totalPRs,
    prsMerged,
    prsOpen,
    totalAdditions,
    totalDeletions,
    totalReviews,
    avgMergeTimeH,
    jiraTotal,
    jiraCompleted,
    jiraCompletionPct,
  };
}
