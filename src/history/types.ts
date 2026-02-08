/**
 * History Types
 *
 * Data structures for metric snapshots stored in SQLite.
 * Only aggregated numbers are persisted — never commit messages,
 * PR titles, issue summaries, or any sensitive content.
 */

/** A point-in-time snapshot of team engineering metrics. */
export interface Snapshot {
  id?: number;
  teamName: string;
  snapshotType: 'daily' | 'weekly' | 'sprint';
  periodStart: string;
  periodEnd: string;
  sprintName?: string;
  createdAt?: string;

  // GitHub metrics
  totalCommits: number;
  totalPRs: number;
  prsMerged: number;
  prsOpen: number;
  totalAdditions: number;
  totalDeletions: number;
  totalReviews: number;
  avgMergeTimeH: number | null;

  // Jira metrics
  jiraTotal: number;
  jiraCompleted: number;
  jiraCompletionPct: number;
}

/** Per-member metrics within a snapshot. */
export interface MemberSnapshot {
  id?: number;
  snapshotId?: number;
  memberGithub: string;
  commits: number;
  prs: number;
  prsMerged: number;
  reviewsGiven: number;
  additions: number;
  deletions: number;
  jiraCompleted: number;
}
