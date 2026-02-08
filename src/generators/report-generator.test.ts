import { describe, it, expect } from 'vitest';
import {
  generateDailyReport,
  generateWeeklyReport,
  generateRetrospective,
} from './report-generator.js';
import type { GitHubActivity } from '../types/github.js';
import type { TrendInsight } from '../insights/types.js';

describe('report-generator', () => {
  describe('generateDailyReport', () => {
    it('generates a structured report with activity data', () => {
      const githubActivity: GitHubActivity = {
        username: 'testuser',
        commits: [
          {
            sha: 'abc1234',
            message: 'fix: resolve login bug',
            author: 'testuser',
            date: '2026-02-07T10:00:00Z',
            repo: 'org/repo',
            url: 'https://github.com/org/repo/commit/abc1234',
          },
        ],
        pullRequests: [
          {
            number: 42,
            title: 'Fix login redirect',
            state: 'merged',
            author: 'testuser',
            createdAt: '2026-02-06T09:00:00Z',
            updatedAt: '2026-02-07T10:00:00Z',
            mergedAt: '2026-02-07T10:00:00Z',
            repo: 'org/repo',
            url: 'https://github.com/org/repo/pull/42',
          },
        ],
        reviews: [],
        timeRange: {
          from: '2026-02-06T10:00:00Z',
          to: '2026-02-07T10:00:00Z',
        },
      };

      const report = generateDailyReport({ github: githubActivity });

      expect(report).toContain('Daily Standup');
      expect(report).toContain('testuser');
      expect(report).toContain('Commits: 1');
      expect(report).toContain('fix: resolve login bug');
      expect(report).toContain('#42');
      expect(report).toContain('Fix login redirect');
      expect(report).toContain('merged');
    });

    it('handles empty activity gracefully', () => {
      const emptyActivity: GitHubActivity = {
        username: 'testuser',
        commits: [],
        pullRequests: [],
        reviews: [],
        timeRange: {
          from: '2026-02-06T10:00:00Z',
          to: '2026-02-07T10:00:00Z',
        },
      };

      const report = generateDailyReport({ github: emptyActivity });

      expect(report).toContain('Daily Standup');
      expect(report).toContain('Commits: 0');
      expect(report).toContain('No commits');
      expect(report).toContain('No pull requests');
      expect(report).toContain('No reviews');
    });

    it('includes Jira activity when provided', () => {
      const report = generateDailyReport({
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'PROJ-123',
              summary: 'Fix authentication flow',
              status: 'Done',
              priority: 'High',
              assignee: 'testuser',
              issueType: 'Bug',
              updatedAt: '2026-02-07T10:00:00Z',
              url: 'https://company.atlassian.net/browse/PROJ-123',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('PROJ-123');
      expect(report).toContain('Fix authentication flow');
      expect(report).toContain('Done');
    });
  });

  describe('generateWeeklyReport', () => {
    it('generates a weekly report with metrics', () => {
      const github: GitHubActivity = {
        username: 'testuser',
        commits: [
          {
            sha: 'abc1234',
            message: 'feat: add auth',
            author: 'testuser',
            date: '',
            repo: 'org/app',
            url: '',
          },
          {
            sha: 'def5678',
            message: 'fix: login bug',
            author: 'testuser',
            date: '',
            repo: 'org/app',
            url: '',
          },
        ],
        pullRequests: [
          {
            number: 10,
            title: 'Add auth feature',
            state: 'merged',
            author: 'testuser',
            createdAt: '',
            updatedAt: '',
            mergedAt: '',
            repo: 'org/app',
            url: '',
            additions: 200,
            deletions: 50,
          },
        ],
        reviews: [
          {
            pullRequestNumber: 5,
            pullRequestTitle: 'Refactor DB',
            author: 'testuser',
            state: 'APPROVED',
            submittedAt: '',
            repo: 'org/lib',
          },
        ],
        timeRange: { from: '2026-02-01T00:00:00Z', to: '2026-02-07T00:00:00Z' },
      };

      const report = generateWeeklyReport({ github });

      expect(report).toContain('Weekly Engineering Summary');
      expect(report).toContain('testuser');
      expect(report).toContain('Commits | 2');
      expect(report).toContain('Pull Requests | 1');
      expect(report).toContain('+200/-50');
    });

    it('handles empty activity gracefully', () => {
      const report = generateWeeklyReport({
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Weekly Engineering Summary');
      expect(report).toContain('Commits | 0');
      expect(report).toContain('No commits');
      expect(report).toContain('No pull requests');
      expect(report).toContain('No reviews');
    });

    it('includes Jira metrics when provided', () => {
      const report = generateWeeklyReport({
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'PROJ-1',
              summary: 'Fix auth',
              status: 'Done',
              priority: 'High',
              assignee: 'u',
              issueType: 'Bug',
              updatedAt: '',
              url: '',
            },
            {
              key: 'PROJ-2',
              summary: 'Add feature',
              status: 'In Progress',
              priority: 'Medium',
              assignee: 'u',
              issueType: 'Story',
              updatedAt: '',
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Jira Issues: 2');
      expect(report).toContain('Done');
      expect(report).toContain('In Progress');
      expect(report).toContain('PROJ-1');
      expect(report).toContain('PROJ-2');
    });

    it('includes repo breakdown table', () => {
      const report = generateWeeklyReport({
        github: {
          username: 'testuser',
          commits: [
            { sha: 'a', message: 'c1', author: 'u', date: '', repo: 'org/frontend', url: '' },
            { sha: 'b', message: 'c2', author: 'u', date: '', repo: 'org/backend', url: '' },
          ],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Repository Breakdown');
      expect(report).toContain('org/frontend');
      expect(report).toContain('org/backend');
    });

    it('includes trends section when provided', () => {
      const trends: TrendInsight[] = [
        {
          metric: 'Commits',
          current: 50,
          previous: 40,
          changePercent: 25,
          direction: 'up',
          severity: 'info',
          message: 'Commits: +25% — 50 commits (was 40)',
        },
        {
          metric: 'Open PRs',
          current: 8,
          previous: 3,
          changePercent: 167,
          direction: 'up',
          severity: 'alert',
          message: 'Open PRs: +167% — 8 open PRs (was 3)',
        },
      ];

      const report = generateWeeklyReport(
        {
          github: {
            username: 'testuser',
            commits: [],
            pullRequests: [],
            reviews: [],
            timeRange: { from: '', to: '' },
          },
        },
        { trends }
      );

      expect(report).toContain('Trends vs Previous Period');
      expect(report).toContain('Commits');
      expect(report).toContain('+25%');
      expect(report).toContain('[!!] alert');
      expect(report).toContain('Open PRs');
      expect(report).toContain('+167%');
    });

    it('omits trends section when empty array', () => {
      const report = generateWeeklyReport(
        {
          github: {
            username: 'testuser',
            commits: [],
            pullRequests: [],
            reviews: [],
            timeRange: { from: '', to: '' },
          },
        },
        { trends: [] }
      );

      expect(report).not.toContain('Trends vs Previous Period');
    });
  });

  describe('generateRetrospective', () => {
    it('generates a retrospective with metrics', () => {
      const report = generateRetrospective({
        sprintName: 'Sprint 42',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        github: {
          username: 'testuser',
          commits: [
            {
              sha: 'abc',
              message: 'feat: new feature',
              author: 'testuser',
              date: '',
              repo: 'org/app',
              url: '',
            },
          ],
          pullRequests: [
            {
              number: 10,
              title: 'Add feature',
              state: 'merged',
              author: 'testuser',
              createdAt: '2026-01-20T10:00:00Z',
              updatedAt: '',
              mergedAt: '2026-01-21T10:00:00Z',
              repo: 'org/app',
              url: '',
              additions: 100,
              deletions: 20,
            },
          ],
          reviews: [],
          timeRange: { from: '2026-01-20', to: '2026-02-03' },
        },
      });

      expect(report).toContain('Sprint Retrospective: Sprint 42');
      expect(report).toContain('2026-01-20');
      expect(report).toContain('2026-02-03');
      expect(report).toContain('testuser');
      expect(report).toContain('Merge Rate | 100%');
      expect(report).toContain('Commits | 1');
    });

    it('handles empty activity gracefully', () => {
      const report = generateRetrospective({
        sprintName: 'Sprint 1',
        dateRange: { from: '2026-01-01', to: '2026-01-14' },
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Sprint Retrospective: Sprint 1');
      expect(report).toContain('Commits | 0');
      expect(report).toContain('No commits');
      expect(report).toContain('No pull requests');
      expect(report).toContain('No reviews');
    });

    it('includes Jira completion metrics when provided', () => {
      const report = generateRetrospective({
        sprintName: 'Sprint 5',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'P-1',
              summary: 'Task 1',
              status: 'Done',
              priority: 'High',
              assignee: 'u',
              issueType: 'Story',
              updatedAt: '',
              url: '',
            },
            {
              key: 'P-2',
              summary: 'Task 2',
              status: 'In Progress',
              priority: 'Medium',
              assignee: 'u',
              issueType: 'Bug',
              updatedAt: '',
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Jira Completion');
      expect(report).toContain('1/2');
      expect(report).toContain('50%');
      expect(report).toContain('P-1');
      expect(report).toContain('P-2');
    });

    it('displays sprint name correctly', () => {
      const report = generateRetrospective({
        sprintName: 'Q1 Sprint 3',
        dateRange: { from: '2026-02-01', to: '2026-02-14' },
        github: {
          username: 'dev',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Q1 Sprint 3');
    });

    it('includes trends section when provided', () => {
      const trends: TrendInsight[] = [
        {
          metric: 'Avg Merge Time',
          current: 8,
          previous: 4,
          changePercent: 100,
          direction: 'up',
          severity: 'alert',
          message: 'Avg Merge Time: +100% — 8h avg merge time (was 4h)',
        },
      ];

      const report = generateRetrospective(
        {
          sprintName: 'Sprint 5',
          dateRange: { from: '2026-01-20', to: '2026-02-03' },
          github: {
            username: 'testuser',
            commits: [],
            pullRequests: [],
            reviews: [],
            timeRange: { from: '', to: '' },
          },
        },
        { trends }
      );

      expect(report).toContain('Trends vs Previous Period');
      expect(report).toContain('Avg Merge Time');
      expect(report).toContain('+100%');
      expect(report).toContain('[!!] alert');
    });

    it('includes anomalies section when provided', () => {
      const report = generateRetrospective(
        {
          sprintName: 'Sprint 5',
          dateRange: { from: '2026-01-20', to: '2026-02-03' },
          github: {
            username: 'testuser',
            commits: [],
            pullRequests: [],
            reviews: [],
            timeRange: { from: '', to: '' },
          },
        },
        {
          anomalies: [
            {
              type: 'stale_pr',
              severity: 'alert',
              message: 'PR #15 has been open for 12 days',
              details: {},
            },
          ],
        }
      );

      expect(report).toContain('Insights');
      expect(report).toContain('[!!] **alert:**');
      expect(report).toContain('PR #15');
    });

    it('includes team health section when provided', () => {
      const report = generateRetrospective(
        {
          sprintName: 'Sprint 5',
          dateRange: { from: '2026-01-20', to: '2026-02-03' },
          github: {
            username: 'testuser',
            commits: [],
            pullRequests: [],
            reviews: [],
            timeRange: { from: '', to: '' },
          },
        },
        {
          health: {
            overallScore: 75,
            dimensions: {
              velocity: { score: 80, trend: 'up' },
              throughput: { score: 70, trend: 'stable' },
              reviewCoverage: { score: 85, trend: 'stable' },
              issueFlow: { score: 65, trend: 'down' },
            },
            recommendations: ['Jira completion rate is dropping'],
          },
        }
      );

      expect(report).toContain('Team Health: 75/100');
      expect(report).toContain('Velocity | 80');
      expect(report).toContain('Throughput | 70');
      expect(report).toContain('Review Coverage | 85');
      expect(report).toContain('Issue Flow | 65');
      expect(report).toContain('Recommendations');
      expect(report).toContain('Jira completion rate is dropping');
    });
  });
});
