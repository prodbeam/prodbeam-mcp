import { describe, it, expect } from 'vitest';
import { isAIConfigured, generateDailyReport } from './report-generator.js';
import type { GitHubActivity } from '../types/github.js';

describe('report-generator', () => {
  describe('isAIConfigured', () => {
    it('returns false when ANTHROPIC_API_KEY is not set', () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      expect(isAIConfigured()).toBe(false);

      if (original) process.env['ANTHROPIC_API_KEY'] = original;
    });

    it('returns true when ANTHROPIC_API_KEY is set', () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';

      expect(isAIConfigured()).toBe(true);

      if (original) {
        process.env['ANTHROPIC_API_KEY'] = original;
      } else {
        delete process.env['ANTHROPIC_API_KEY'];
      }
    });
  });

  describe('generateDailyReport', () => {
    it('generates a fallback report without AI key', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

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

      const report = await generateDailyReport({ github: githubActivity });

      expect(report).toContain('Daily Standup');
      expect(report).toContain('testuser');
      expect(report).toContain('Commits: 1');
      expect(report).toContain('fix: resolve login bug');
      expect(report).toContain('#42');
      expect(report).toContain('Fix login redirect');
      expect(report).toContain('merged');
      expect(report).toContain('ANTHROPIC_API_KEY');

      if (original) process.env['ANTHROPIC_API_KEY'] = original;
    });

    it('handles empty activity gracefully', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

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

      const report = await generateDailyReport({ github: emptyActivity });

      expect(report).toContain('Daily Standup');
      expect(report).toContain('Commits: 0');
      expect(report).toContain('No commits');
      expect(report).toContain('No pull requests');
      expect(report).toContain('No reviews');

      if (original) process.env['ANTHROPIC_API_KEY'] = original;
    });

    it('includes Jira activity when provided', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const report = await generateDailyReport({
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

      if (original) process.env['ANTHROPIC_API_KEY'] = original;
    });
  });
});
