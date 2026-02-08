import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './snapshot-builder.js';
import type { GitHubActivity } from '../types/github.js';
import type { JiraActivity } from '../types/jira.js';

function makeGitHub(overrides: Partial<GitHubActivity> = {}): GitHubActivity {
  return {
    username: 'team',
    commits: [],
    pullRequests: [],
    reviews: [],
    timeRange: { from: '2026-01-31T00:00:00Z', to: '2026-02-07T00:00:00Z' },
    ...overrides,
  };
}

describe('buildSnapshot', () => {
  it('builds snapshot from empty activity', () => {
    const snap = buildSnapshot({
      teamName: 'Test',
      snapshotType: 'weekly',
      periodStart: '2026-01-31T00:00:00Z',
      periodEnd: '2026-02-07T00:00:00Z',
      github: makeGitHub(),
    });

    expect(snap.teamName).toBe('Test');
    expect(snap.snapshotType).toBe('weekly');
    expect(snap.totalCommits).toBe(0);
    expect(snap.totalPRs).toBe(0);
    expect(snap.prsMerged).toBe(0);
    expect(snap.prsOpen).toBe(0);
    expect(snap.totalAdditions).toBe(0);
    expect(snap.totalDeletions).toBe(0);
    expect(snap.totalReviews).toBe(0);
    expect(snap.avgMergeTimeH).toBeNull();
    expect(snap.jiraTotal).toBe(0);
    expect(snap.jiraCompleted).toBe(0);
    expect(snap.jiraCompletionPct).toBe(0);
  });

  it('counts commits, PRs, and reviews', () => {
    const snap = buildSnapshot({
      teamName: 'Test',
      snapshotType: 'weekly',
      periodStart: '2026-01-31T00:00:00Z',
      periodEnd: '2026-02-07T00:00:00Z',
      github: makeGitHub({
        commits: [
          { sha: 'a', message: 'c1', author: 'u', date: '', repo: 'r', url: '' },
          { sha: 'b', message: 'c2', author: 'u', date: '', repo: 'r', url: '' },
        ],
        pullRequests: [
          {
            number: 1,
            title: 'PR1',
            state: 'merged',
            author: 'u',
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '',
            mergedAt: '2026-02-01T12:00:00Z',
            repo: 'r',
            url: '',
            additions: 100,
            deletions: 50,
          },
          {
            number: 2,
            title: 'PR2',
            state: 'open',
            author: 'u',
            createdAt: '2026-02-02T10:00:00Z',
            updatedAt: '',
            repo: 'r',
            url: '',
            additions: 30,
            deletions: 10,
          },
        ],
        reviews: [
          {
            pullRequestNumber: 5,
            pullRequestTitle: 'Review PR',
            author: 'u',
            state: 'APPROVED',
            submittedAt: '',
            repo: 'r',
          },
        ],
      }),
    });

    expect(snap.totalCommits).toBe(2);
    expect(snap.totalPRs).toBe(2);
    expect(snap.prsMerged).toBe(1);
    expect(snap.prsOpen).toBe(1);
    expect(snap.totalAdditions).toBe(130);
    expect(snap.totalDeletions).toBe(60);
    expect(snap.totalReviews).toBe(1);
  });

  it('calculates average merge time from merged PRs', () => {
    const snap = buildSnapshot({
      teamName: 'Test',
      snapshotType: 'weekly',
      periodStart: '2026-01-31T00:00:00Z',
      periodEnd: '2026-02-07T00:00:00Z',
      github: makeGitHub({
        pullRequests: [
          {
            number: 1,
            title: 'Fast PR',
            state: 'merged',
            author: 'u',
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '',
            mergedAt: '2026-02-01T12:00:00Z', // 2 hours
            repo: 'r',
            url: '',
          },
          {
            number: 2,
            title: 'Slow PR',
            state: 'merged',
            author: 'u',
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '',
            mergedAt: '2026-02-01T20:00:00Z', // 10 hours
            repo: 'r',
            url: '',
          },
        ],
      }),
    });

    // Average of 2h and 10h = 6h
    expect(snap.avgMergeTimeH).toBe(6);
  });

  it('handles Jira completion calculation', () => {
    const jira: JiraActivity = {
      issues: [
        {
          key: 'P-1',
          summary: 'Done task',
          status: 'Done',
          priority: 'High',
          assignee: 'u',
          issueType: 'Story',
          updatedAt: '',
          url: '',
        },
        {
          key: 'P-2',
          summary: 'Closed task',
          status: 'Closed',
          priority: 'Medium',
          assignee: 'u',
          issueType: 'Bug',
          updatedAt: '',
          url: '',
        },
        {
          key: 'P-3',
          summary: 'Open task',
          status: 'In Progress',
          priority: 'Low',
          assignee: 'u',
          issueType: 'Task',
          updatedAt: '',
          url: '',
        },
      ],
      timeRange: { from: '', to: '' },
    };

    const snap = buildSnapshot({
      teamName: 'Test',
      snapshotType: 'sprint',
      periodStart: '2026-01-20T00:00:00Z',
      periodEnd: '2026-02-03T00:00:00Z',
      sprintName: 'Sprint 5',
      github: makeGitHub(),
      jira,
    });

    expect(snap.jiraTotal).toBe(3);
    expect(snap.jiraCompleted).toBe(2); // Done + Closed
    expect(snap.jiraCompletionPct).toBe(67); // 2/3 rounded
    expect(snap.sprintName).toBe('Sprint 5');
  });

  it('sets avgMergeTimeH to null when no merged PRs', () => {
    const snap = buildSnapshot({
      teamName: 'Test',
      snapshotType: 'daily',
      periodStart: '2026-02-06T00:00:00Z',
      periodEnd: '2026-02-07T00:00:00Z',
      github: makeGitHub({
        pullRequests: [
          {
            number: 1,
            title: 'Open PR',
            state: 'open',
            author: 'u',
            createdAt: '',
            updatedAt: '',
            repo: 'r',
            url: '',
          },
        ],
      }),
    });

    expect(snap.avgMergeTimeH).toBeNull();
  });
});
