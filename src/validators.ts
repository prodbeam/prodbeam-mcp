/**
 * Zod schemas for validating GitHub and Jira data passed by Claude Code.
 *
 * These mirror the TypeScript interfaces in src/types/ but use .default()
 * so partial data from Claude Code doesn't crash the generators.
 */

import { z } from 'zod';

const GitHubCommitSchema = z.object({
  sha: z.string().default(''),
  message: z.string().default(''),
  author: z.string().default(''),
  date: z.string().default(''),
  repo: z.string().default(''),
  url: z.string().default(''),
});

const GitHubPullRequestSchema = z.object({
  number: z.number().default(0),
  title: z.string().default(''),
  state: z.enum(['open', 'closed', 'merged']).default('open'),
  author: z.string().default(''),
  createdAt: z.string().default(''),
  updatedAt: z.string().default(''),
  mergedAt: z.string().optional(),
  repo: z.string().default(''),
  url: z.string().default(''),
  additions: z.number().optional(),
  deletions: z.number().optional(),
});

const GitHubReviewSchema = z.object({
  pullRequestNumber: z.number().default(0),
  pullRequestTitle: z.string().default(''),
  author: z.string().default(''),
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'PENDING']).default('COMMENTED'),
  submittedAt: z.string().default(''),
  repo: z.string().default(''),
});

export const GitHubActivitySchema = z.object({
  username: z.string().default(''),
  commits: z.array(GitHubCommitSchema).default([]),
  pullRequests: z.array(GitHubPullRequestSchema).default([]),
  reviews: z.array(GitHubReviewSchema).default([]),
  timeRange: z
    .object({
      from: z.string().default(''),
      to: z.string().default(''),
    })
    .default({ from: '', to: '' }),
});

const JiraIssueSchema = z.object({
  key: z.string().default(''),
  summary: z.string().default(''),
  status: z.string().default(''),
  priority: z.string().default(''),
  assignee: z.string().default(''),
  issueType: z.string().default(''),
  updatedAt: z.string().default(''),
  url: z.string().default(''),
});

export const JiraActivitySchema = z.object({
  issues: z.array(JiraIssueSchema).default([]),
  timeRange: z
    .object({
      from: z.string().default(''),
      to: z.string().default(''),
    })
    .default({ from: '', to: '' }),
});
