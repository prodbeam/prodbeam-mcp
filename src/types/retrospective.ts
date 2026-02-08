/**
 * Types for sprint retrospective report generation
 */

import type { GitHubActivity } from './github.js';
import type { JiraActivity } from './jira.js';

export interface RetroReportInput {
  sprintName: string;
  dateRange: { from: string; to: string };
  github: GitHubActivity;
  jira?: JiraActivity;
  sprintGoal?: string;
  perMember?: GitHubActivity[];
}

export interface SprintReviewInput {
  sprintName: string;
  dateRange: { from: string; to: string };
  github: GitHubActivity;
  jira?: JiraActivity;
  sprintGoal?: string;
  perMember?: GitHubActivity[];
  daysElapsed: number;
  daysTotal: number;
}

export interface SprintMetrics {
  /** Total commits in the sprint */
  totalCommits: number;

  /** PR statistics */
  pullRequests: {
    total: number;
    merged: number;
    open: number;
    closed: number;
    mergeRate: number; // merged / total as percentage (0-100)
  };

  /** Code volume */
  additions: number;
  deletions: number;

  /** Review statistics */
  reviews: {
    total: number;
    approved: number;
    changesRequested: number;
    commented: number;
  };

  /** Average days from PR creation to merge (merged PRs only) */
  avgMergeTimeHours: number | null;

  /** Jira completion stats (when available) */
  jira?: {
    totalIssues: number;
    completed: number;
    completionRate: number; // percentage (0-100)
    byType: Record<string, number>;
    byPriority: Record<string, number>;
  };
}
