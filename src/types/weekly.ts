/**
 * Types for weekly report generation
 */

import type { GitHubActivity } from './github.js';
import type { JiraActivity } from './jira.js';

export interface WeeklyReportInput {
  github: GitHubActivity;
  jira?: JiraActivity;
  perMember?: GitHubActivity[];
}

export interface RepoMetrics {
  repo: string;
  commits: number;
  pullRequests: number;
  merged: number;
  additions: number;
  deletions: number;
  reviews: number;
}

export interface JiraWeeklyMetrics {
  totalIssues: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
}

export interface WeeklyMetrics {
  totalCommits: number;
  pullRequests: {
    total: number;
    open: number;
    merged: number;
    closed: number;
  };
  additions: number;
  deletions: number;
  reviews: {
    total: number;
    approved: number;
    changesRequested: number;
    commented: number;
  };
  repoBreakdown: RepoMetrics[];
  avgMergeTimeHours: number | null;
  prSizeDistribution: { small: number; medium: number; large: number };
  jira?: JiraWeeklyMetrics;
}
