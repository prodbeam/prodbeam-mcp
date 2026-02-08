import { describe, it, expect } from 'vitest';
import {
  generateDailyReport,
  generateTeamDailyReport,
  generateWeeklyReport,
  generateRetrospective,
  generateSprintReview,
} from './report-generator.js';
import type { GitHubActivity } from '../types/github.js';
import type { TrendInsight } from '../insights/types.js';

describe('report-generator', () => {
  describe('generateDailyReport', () => {
    it('generates a structured report with completed and in-progress sections', () => {
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
      expect(report).toContain('## Completed');
      expect(report).toContain('#42');
      expect(report).toContain('Fix login redirect');
      expect(report).toContain('merged');
      expect(report).toContain('## Activity Summary');
      expect(report).toContain('Commits | 1');
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
      expect(report).toContain('No completed items');
      expect(report).toContain('No items in progress');
      expect(report).toContain('Commits | 0');
    });

    it('includes Jira activity classified by status', () => {
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
            {
              key: 'PROJ-124',
              summary: 'Add OAuth support',
              status: 'In Progress',
              priority: 'Medium',
              assignee: 'testuser',
              issueType: 'Story',
              updatedAt: '2026-02-07T10:00:00Z',
              url: 'https://company.atlassian.net/browse/PROJ-124',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('## Completed');
      expect(report).toContain('PROJ-123');
      expect(report).toContain('Fix authentication flow');
      expect(report).toContain('## In Progress');
      expect(report).toContain('PROJ-124');
      expect(report).toContain('Add OAuth support');
    });

    it('shows PR size indicators', () => {
      const report = generateDailyReport({
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [
            {
              number: 10,
              title: 'Big change',
              state: 'open',
              author: 'testuser',
              createdAt: new Date().toISOString(),
              updatedAt: '',
              repo: 'org/app',
              url: '',
              additions: 200,
              deletions: 50,
            },
          ],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('(+200/-50)');
    });

    it('shows reviews in activity summary', () => {
      const report = generateDailyReport({
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
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
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Reviews Given');
      expect(report).toContain('PR #5');
      expect(report).toContain('APPROVED');
    });
  });

  describe('generateTeamDailyReport', () => {
    it('generates a team report with per-member completed/in-progress sections', () => {
      const report = generateTeamDailyReport(
        [
          {
            github: {
              username: 'alice',
              commits: [
                {
                  sha: 'abc',
                  message: 'fix: bug',
                  author: 'alice',
                  date: '',
                  repo: 'org/app',
                  url: '',
                },
              ],
              pullRequests: [
                {
                  number: 1,
                  title: 'Fix bug',
                  state: 'merged',
                  author: 'alice',
                  createdAt: '',
                  updatedAt: '',
                  mergedAt: '',
                  repo: 'org/app',
                  url: '',
                },
              ],
              reviews: [],
              timeRange: { from: '', to: '' },
            },
          },
          {
            github: {
              username: 'bob',
              commits: [],
              pullRequests: [],
              reviews: [],
              timeRange: { from: '', to: '' },
            },
          },
        ],
        'Platform Engineering'
      );

      expect(report).toContain('Team Standup: Platform Engineering');
      expect(report).toContain('## Summary');
      expect(report).toContain('Team Members | 2');
      expect(report).toContain('## alice');
      expect(report).toContain('**Completed**');
      expect(report).toContain('## bob');
      expect(report).toContain('No activity in the last 24 hours');
    });

    it('includes team-level blockers section', () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

      const report = generateTeamDailyReport(
        [
          {
            github: {
              username: 'alice',
              commits: [],
              pullRequests: [
                {
                  number: 99,
                  title: 'Stale PR',
                  state: 'open',
                  author: 'alice',
                  createdAt: threeDaysAgo,
                  updatedAt: threeDaysAgo,
                  repo: 'org/app',
                  url: '',
                },
              ],
              reviews: [],
              timeRange: { from: '', to: '' },
            },
          },
        ],
        'Team'
      );

      expect(report).toContain('## Blockers & Risks');
      expect(report).toContain('PR #99');
      expect(report).toContain('open 3 days');
    });
  });

  describe('generateWeeklyReport', () => {
    it('generates a weekly report with highlights and delivery metrics', () => {
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
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '',
            mergedAt: '2026-02-02T10:00:00Z',
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
      expect(report).toContain('## Highlights');
      expect(report).toContain('Merged 1 PR this week');
      expect(report).toContain('## Delivery Metrics');
      expect(report).toContain('Commits | 2');
      expect(report).toContain('Cycle Time (avg)');
      expect(report).toContain('+200/-50');
      expect(report).toContain('## Appendix');
    });

    it('shows PR size distribution', () => {
      const github: GitHubActivity = {
        username: 'testuser',
        commits: [],
        pullRequests: [
          {
            number: 1,
            title: 'Small PR',
            state: 'merged',
            author: 'u',
            createdAt: '',
            updatedAt: '',
            mergedAt: '',
            repo: 'org/app',
            url: '',
            additions: 30,
            deletions: 10,
          },
          {
            number: 2,
            title: 'Medium PR',
            state: 'merged',
            author: 'u',
            createdAt: '',
            updatedAt: '',
            mergedAt: '',
            repo: 'org/app',
            url: '',
            additions: 200,
            deletions: 100,
          },
          {
            number: 3,
            title: 'Large PR',
            state: 'merged',
            author: 'u',
            createdAt: '',
            updatedAt: '',
            mergedAt: '',
            repo: 'org/app',
            url: '',
            additions: 400,
            deletions: 200,
          },
        ],
        reviews: [],
        timeRange: { from: '', to: '' },
      };

      const report = generateWeeklyReport({ github });

      expect(report).toContain('PR Size Distribution');
      expect(report).toContain('Small | 1-100 | 1');
      expect(report).toContain('Medium | 101-500 | 1');
      expect(report).toContain('Large | 501+ | 1');
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
      expect(report).not.toContain('## Highlights');
      expect(report).not.toContain('## Appendix');
    });

    it('includes Jira metrics with by-status and by-type tables', () => {
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
      // By Status
      expect(report).toContain('| Done | 1 |');
      expect(report).toContain('| In Progress | 1 |');
      // By Type
      expect(report).toContain('| Bug | 1 |');
      expect(report).toContain('| Story | 1 |');
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
    it('generates a retrospective with sprint scorecard and delivery metrics', () => {
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
      expect(report).toContain('## Sprint Scorecard');
      expect(report).toContain('Merge Rate | 100%');
      expect(report).toContain('## Delivery Metrics');
      expect(report).toContain('Commits | 1');
      expect(report).toContain('## Appendix');
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
      expect(report).not.toContain('## Appendix');
    });

    it('includes Jira completion metrics with by-status, by-type, and by-priority', () => {
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

      // Sprint Scorecard
      expect(report).toContain('Completion Rate');
      expect(report).toContain('1/2');
      expect(report).toContain('50%');
      expect(report).toContain('Carryover | 1 issues');

      // Jira tables
      expect(report).toContain('## Jira Issues');
      // By Status
      expect(report).toContain('| Done | 1 |');
      expect(report).toContain('| In Progress | 1 |');
      // By Type
      expect(report).toContain('| Story | 1 |');
      expect(report).toContain('| Bug | 1 |');
      // By Priority
      expect(report).toContain('| High | 1 |');
      expect(report).toContain('| Medium | 1 |');

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

    it('includes sprint goal when provided', () => {
      const report = generateRetrospective({
        sprintName: 'Sprint 6',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        sprintGoal: 'Implement core payment processing',
      });

      expect(report).toContain('## Sprint Goal');
      expect(report).toContain('> Implement core payment processing');
    });

    it('includes what went well section when metrics are favorable', () => {
      const report = generateRetrospective({
        sprintName: 'Sprint 7',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        github: {
          username: 'team',
          commits: [],
          pullRequests: [
            {
              number: 1,
              title: 'Feature A',
              state: 'merged',
              author: 'dev',
              createdAt: '2026-01-20T10:00:00Z',
              updatedAt: '',
              mergedAt: '2026-01-20T14:00:00Z',
              repo: 'org/app',
              url: '',
            },
            {
              number: 2,
              title: 'Feature B',
              state: 'merged',
              author: 'dev',
              createdAt: '2026-01-21T10:00:00Z',
              updatedAt: '',
              mergedAt: '2026-01-21T12:00:00Z',
              repo: 'org/app',
              url: '',
            },
          ],
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
              assignee: 'dev',
              issueType: 'Story',
              updatedAt: '',
              url: '',
            },
            {
              key: 'P-2',
              summary: 'Task 2',
              status: 'Done',
              priority: 'Medium',
              assignee: 'dev',
              issueType: 'Bug',
              updatedAt: '',
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('## What Went Well');
      // Fast merges (4h and 2h average)
      expect(report).toContain('Fast merge cycles');
      // High completion (100%)
      expect(report).toContain('Strong sprint execution');
      // Delivered items
      expect(report).toContain('Delivered');
    });

    it('includes what needs improvement when metrics are poor', () => {
      const report = generateRetrospective(
        {
          sprintName: 'Sprint 8',
          dateRange: { from: '2026-01-20', to: '2026-02-03' },
          github: {
            username: 'team',
            commits: [],
            pullRequests: [],
            reviews: [
              {
                pullRequestNumber: 5,
                pullRequestTitle: 'PR',
                author: 'dev',
                state: 'COMMENTED',
                submittedAt: '',
                repo: 'org/app',
              },
            ],
            timeRange: { from: '', to: '' },
          },
          jira: {
            issues: [
              {
                key: 'P-1',
                summary: 'T1',
                status: 'Done',
                priority: 'High',
                assignee: 'u',
                issueType: 'Story',
                updatedAt: '',
                url: '',
              },
              {
                key: 'P-2',
                summary: 'T2',
                status: 'In Progress',
                priority: 'Medium',
                assignee: 'u',
                issueType: 'Bug',
                updatedAt: '',
                url: '',
              },
              {
                key: 'P-3',
                summary: 'T3',
                status: 'To Do',
                priority: 'Low',
                assignee: 'u',
                issueType: 'Task',
                updatedAt: '',
                url: '',
              },
              {
                key: 'P-4',
                summary: 'T4',
                status: 'To Do',
                priority: 'Low',
                assignee: 'u',
                issueType: 'Task',
                updatedAt: '',
                url: '',
              },
              {
                key: 'P-5',
                summary: 'T5',
                status: 'To Do',
                priority: 'Low',
                assignee: 'u',
                issueType: 'Task',
                updatedAt: '',
                url: '',
              },
            ],
            timeRange: { from: '', to: '' },
          },
        },
        {
          anomalies: [
            {
              type: 'stale_pr',
              severity: 'alert',
              message: 'PR #10 stale',
              details: { prNumber: 10, ageDays: 5 },
            },
          ],
        }
      );

      expect(report).toContain('## What Needs Improvement');
      // All reviews are COMMENTED
      expect(report).toContain('no formal approvals');
      // High carryover (4/5 = 80%)
      expect(report).toContain('carryover');
      // Low completion (1/5 = 20%)
      expect(report).toContain('sprint scope completed');
    });

    it('includes action items derived from anomalies', () => {
      const report = generateRetrospective(
        {
          sprintName: 'Sprint 9',
          dateRange: { from: '2026-01-20', to: '2026-02-03' },
          github: {
            username: 'team',
            commits: [],
            pullRequests: [],
            reviews: [
              {
                pullRequestNumber: 1,
                pullRequestTitle: 'PR',
                author: 'dev',
                state: 'COMMENTED',
                submittedAt: '',
                repo: 'org/app',
              },
            ],
            timeRange: { from: '', to: '' },
          },
        },
        {
          anomalies: [{ type: 'stale_pr', severity: 'alert', message: 'Stale PR', details: {} }],
        }
      );

      expect(report).toContain('## Action Items');
      expect(report).toContain('Triage');
      expect(report).toContain('approval workflow');
    });

    it('includes developer contributions when perMember is provided', () => {
      const report = generateRetrospective({
        sprintName: 'Sprint 10',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        github: {
          username: 'team',
          commits: [
            { sha: 'a', message: 'c1', author: 'alice', date: '', repo: 'org/app', url: '' },
          ],
          pullRequests: [
            {
              number: 1,
              title: 'Feature X',
              state: 'merged',
              author: 'alice',
              createdAt: '2026-01-20T10:00:00Z',
              updatedAt: '',
              mergedAt: '2026-01-21T10:00:00Z',
              repo: 'org/app',
              url: '',
            },
          ],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        perMember: [
          {
            username: 'alice',
            commits: [
              { sha: 'a', message: 'c1', author: 'alice', date: '', repo: 'org/app', url: '' },
            ],
            pullRequests: [
              {
                number: 1,
                title: 'Feature X',
                state: 'merged',
                author: 'alice',
                createdAt: '2026-01-20T10:00:00Z',
                updatedAt: '',
                mergedAt: '2026-01-21T10:00:00Z',
                repo: 'org/app',
                url: '',
              },
            ],
            reviews: [],
            timeRange: { from: '', to: '' },
          },
          {
            username: 'bob',
            commits: [],
            pullRequests: [],
            reviews: [
              {
                pullRequestNumber: 1,
                pullRequestTitle: 'Feature X',
                author: 'bob',
                state: 'APPROVED',
                submittedAt: '',
                repo: 'org/app',
              },
            ],
            timeRange: { from: '', to: '' },
          },
        ],
      });

      expect(report).toContain('## Developer Contributions');
      expect(report).toContain('### alice');
      expect(report).toContain('### bob');
      expect(report).toContain('PRs Authored');
      expect(report).toContain('PRs Merged');
      expect(report).toContain('Reviews Given');
      // alice has 1 merged PR
      expect(report).toContain('**Key Deliverables:**');
      expect(report).toContain('Feature X');
    });
  });

  describe('generateDailyReport — Focus Areas', () => {
    it('shows focus areas grouped by labels when available', () => {
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
              key: 'PROJ-10',
              summary: 'API endpoint',
              status: 'In Progress',
              priority: 'High',
              assignee: 'testuser',
              issueType: 'Story',
              updatedAt: new Date().toISOString(),
              url: '',
              labels: ['payments'],
            },
            {
              key: 'PROJ-11',
              summary: 'International cards',
              status: 'In Progress',
              priority: 'Medium',
              assignee: 'testuser',
              issueType: 'Story',
              updatedAt: new Date().toISOString(),
              url: '',
              labels: ['payments'],
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('## Focus Areas');
      expect(report).toContain('payments');
      expect(report).toContain('PROJ-10');
      expect(report).toContain('PROJ-11');
    });

    it('groups focus areas by issue type when no labels', () => {
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
              key: 'PROJ-20',
              summary: 'Fix login',
              status: 'In Progress',
              priority: 'High',
              assignee: 'testuser',
              issueType: 'Bug',
              updatedAt: new Date().toISOString(),
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('## Focus Areas');
      expect(report).toContain('Bug');
      expect(report).toContain('PROJ-20');
    });
  });

  describe('generateDailyReport — PR-Jira Linking', () => {
    it('links merged PR to done Jira issue by key in title', () => {
      const report = generateDailyReport({
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [
            {
              number: 50,
              title: 'PROJ-100: Handle webhooks',
              state: 'merged',
              author: 'testuser',
              createdAt: '2026-02-06T09:00:00Z',
              updatedAt: '',
              mergedAt: '2026-02-07T10:00:00Z',
              repo: 'org/app',
              url: '',
            },
          ],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'PROJ-100',
              summary: 'Handle Stripe webhooks',
              status: 'Done',
              priority: 'High',
              assignee: 'testuser',
              issueType: 'Story',
              updatedAt: '2026-02-07T10:00:00Z',
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('## Completed');
      // Linked format: "PROJ-100: Handle Stripe webhooks [Done] → PR #50"
      expect(report).toContain('PROJ-100');
      expect(report).toContain('Handle Stripe webhooks');
      expect(report).toContain('PR #50');
    });
  });

  describe('generateWeeklyReport — Key Deliverables & Investment Balance', () => {
    it('shows key deliverables for merged PRs and done issues', () => {
      const report = generateWeeklyReport({
        github: {
          username: 'team',
          commits: [],
          pullRequests: [
            {
              number: 10,
              title: 'PROJ-1: Auth feature',
              state: 'merged',
              author: 'dev',
              createdAt: '2026-02-01T10:00:00Z',
              updatedAt: '',
              mergedAt: '2026-02-02T10:00:00Z',
              repo: 'org/app',
              url: '',
            },
          ],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'PROJ-1',
              summary: 'Add authentication',
              status: 'Done',
              priority: 'High',
              assignee: 'dev',
              issueType: 'Story',
              updatedAt: '',
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('## Key Deliverables');
      expect(report).toContain('PROJ-1');
      expect(report).toContain('Add authentication');
      expect(report).toContain('PR #10');
    });

    it('shows investment balance table from Jira issue types', () => {
      const report = generateWeeklyReport({
        github: {
          username: 'team',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'P-1',
              summary: 'S1',
              status: 'Done',
              priority: 'High',
              assignee: 'u',
              issueType: 'Story',
              updatedAt: '',
              url: '',
            },
            {
              key: 'P-2',
              summary: 'S2',
              status: 'Done',
              priority: 'High',
              assignee: 'u',
              issueType: 'Story',
              updatedAt: '',
              url: '',
            },
            {
              key: 'P-3',
              summary: 'B1',
              status: 'Done',
              priority: 'High',
              assignee: 'u',
              issueType: 'Bug',
              updatedAt: '',
              url: '',
            },
            {
              key: 'P-4',
              summary: 'T1',
              status: 'In Progress',
              priority: 'Low',
              assignee: 'u',
              issueType: 'Task',
              updatedAt: '',
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('## Investment Balance');
      expect(report).toContain('| Story | 2 |');
      expect(report).toContain('| Bug | 1 |');
      expect(report).toContain('| Task | 1 |');
    });

    it('omits key deliverables when no merged PRs or done issues', () => {
      const report = generateWeeklyReport({
        github: {
          username: 'team',
          commits: [],
          pullRequests: [
            {
              number: 1,
              title: 'WIP: something',
              state: 'open',
              author: 'dev',
              createdAt: new Date().toISOString(),
              updatedAt: '',
              repo: 'org/app',
              url: '',
            },
          ],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).not.toContain('## Key Deliverables');
      expect(report).not.toContain('## Investment Balance');
    });
  });

  describe('generateSprintReview', () => {
    it('generates a sprint review with progress summary', () => {
      const report = generateSprintReview({
        sprintName: 'Sprint 4',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        daysElapsed: 12,
        daysTotal: 14,
        github: {
          username: 'team',
          commits: [
            { sha: 'a', message: 'feat', author: 'dev', date: '', repo: 'org/app', url: '' },
          ],
          pullRequests: [
            {
              number: 1,
              title: 'Feature',
              state: 'merged',
              author: 'dev',
              createdAt: '2026-01-20T10:00:00Z',
              updatedAt: '',
              mergedAt: '2026-01-21T10:00:00Z',
              repo: 'org/app',
              url: '',
            },
          ],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'P-1',
              summary: 'Done task',
              status: 'Done',
              priority: 'High',
              assignee: 'dev',
              issueType: 'Story',
              updatedAt: '',
              url: '',
            },
            {
              key: 'P-2',
              summary: 'WIP task',
              status: 'In Progress',
              priority: 'Medium',
              assignee: 'dev',
              issueType: 'Bug',
              updatedAt: '',
              url: '',
            },
            {
              key: 'P-3',
              summary: 'Not started',
              status: 'To Do',
              priority: 'Low',
              assignee: 'dev',
              issueType: 'Task',
              updatedAt: '',
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('# Sprint Review: Sprint 4');
      expect(report).toContain('Day 12 of 14');
      expect(report).toContain('86%');

      // Progress Summary
      expect(report).toContain('## Progress Summary');
      expect(report).toContain('Days Elapsed | 12 of 14');
      expect(report).toContain('Issues Completed | 1 of 3');
      expect(report).toContain('Issues In Progress | 1');
      expect(report).toContain('Issues Not Started | 1');
      expect(report).toContain('PRs Merged | 1');
    });

    it('includes sprint goal when provided', () => {
      const report = generateSprintReview({
        sprintName: 'Sprint 5',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        daysElapsed: 7,
        daysTotal: 14,
        sprintGoal: 'Deliver payment integration',
        github: {
          username: 'team',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('## Sprint Goal');
      expect(report).toContain('> Deliver payment integration');
    });

    it('shows key deliverables linked to Jira issues', () => {
      const report = generateSprintReview({
        sprintName: 'Sprint 5',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        daysElapsed: 10,
        daysTotal: 14,
        github: {
          username: 'team',
          commits: [],
          pullRequests: [
            {
              number: 5,
              title: 'PROJ-10: Payment API',
              state: 'merged',
              author: 'dev',
              createdAt: '2026-01-20T10:00:00Z',
              updatedAt: '',
              mergedAt: '2026-01-25T10:00:00Z',
              repo: 'org/app',
              url: '',
            },
          ],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'PROJ-10',
              summary: 'Payment API endpoint',
              status: 'Done',
              priority: 'High',
              assignee: 'dev',
              issueType: 'Story',
              updatedAt: '',
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('## Key Deliverables');
      expect(report).toContain('PROJ-10');
      expect(report).toContain('Payment API endpoint');
      expect(report).toContain('PR #5');
    });

    it('shows risks when near sprint end with incomplete items', () => {
      const report = generateSprintReview(
        {
          sprintName: 'Sprint 5',
          dateRange: { from: '2026-01-20', to: '2026-02-03' },
          daysElapsed: 13,
          daysTotal: 14,
          github: {
            username: 'team',
            commits: [],
            pullRequests: [],
            reviews: [],
            timeRange: { from: '', to: '' },
          },
          jira: {
            issues: [
              {
                key: 'P-1',
                summary: 'Done',
                status: 'Done',
                priority: 'High',
                assignee: 'u',
                issueType: 'Story',
                updatedAt: '',
                url: '',
              },
              {
                key: 'P-2',
                summary: 'WIP',
                status: 'In Progress',
                priority: 'Medium',
                assignee: 'u',
                issueType: 'Bug',
                updatedAt: '',
                url: '',
              },
              {
                key: 'P-3',
                summary: 'Todo',
                status: 'To Do',
                priority: 'Low',
                assignee: 'u',
                issueType: 'Task',
                updatedAt: '',
                url: '',
              },
            ],
            timeRange: { from: '', to: '' },
          },
        },
        {
          anomalies: [{ type: 'stale_pr', severity: 'alert', message: 'PR stale', details: {} }],
        }
      );

      expect(report).toContain('## Risks & Blockers');
      // 1 day remaining with 2 incomplete items
      expect(report).toContain('1 day remaining with 2 incomplete items');
      // Stale PRs
      expect(report).toContain('open for extended period');
    });

    it('shows developer progress when perMember provided', () => {
      const report = generateSprintReview({
        sprintName: 'Sprint 5',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        daysElapsed: 7,
        daysTotal: 14,
        github: {
          username: 'team',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        perMember: [
          {
            username: 'alice',
            commits: [],
            pullRequests: [
              {
                number: 1,
                title: 'A',
                state: 'merged',
                author: 'alice',
                createdAt: '',
                updatedAt: '',
                mergedAt: '',
                repo: 'org/app',
                url: '',
              },
            ],
            reviews: [
              {
                pullRequestNumber: 2,
                pullRequestTitle: 'B',
                author: 'alice',
                state: 'APPROVED',
                submittedAt: '',
                repo: 'org/app',
              },
            ],
            timeRange: { from: '', to: '' },
          },
        ],
      });

      expect(report).toContain('## Developer Progress');
      expect(report).toContain('### alice');
      expect(report).toContain('Completed: 1 PRs merged');
      expect(report).toContain('Reviews Given: 1');
    });

    it('handles empty activity gracefully', () => {
      const report = generateSprintReview({
        sprintName: 'Sprint 1',
        dateRange: { from: '2026-01-01', to: '2026-01-14' },
        daysElapsed: 0,
        daysTotal: 14,
        github: {
          username: 'team',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('# Sprint Review: Sprint 1');
      expect(report).toContain('Day 0 of 14');
      expect(report).toContain('0%');
      expect(report).toContain('## Progress Summary');
      expect(report).toContain('Commits | 0');
      expect(report).not.toContain('## Key Deliverables');
      expect(report).not.toContain('## Risks & Blockers');
    });

    it('includes delivery metrics section', () => {
      const report = generateSprintReview({
        sprintName: 'Sprint 5',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        daysElapsed: 7,
        daysTotal: 14,
        github: {
          username: 'team',
          commits: [
            { sha: 'a', message: 'c1', author: 'dev', date: '', repo: 'org/app', url: '' },
            { sha: 'b', message: 'c2', author: 'dev', date: '', repo: 'org/app', url: '' },
          ],
          pullRequests: [
            {
              number: 1,
              title: 'PR1',
              state: 'merged',
              author: 'dev',
              createdAt: '',
              updatedAt: '',
              mergedAt: '',
              repo: 'org/app',
              url: '',
              additions: 100,
              deletions: 20,
            },
          ],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('## Delivery Metrics');
      expect(report).toContain('Commits | 2');
      expect(report).toContain('+100/-20');
    });
  });
});
