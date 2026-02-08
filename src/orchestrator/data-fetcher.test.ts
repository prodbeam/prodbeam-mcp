import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchGitHubActivityForUser,
  fetchTeamGitHubActivity,
  fetchJiraActivityForUser,
  fetchTeamJiraActivity,
  fetchSprintJiraActivity,
  detectActiveSprint,
} from './data-fetcher.js';
import { GitHubClient } from '../clients/github-client.js';
import { JiraClient } from '../clients/jira-client.js';
import type { TimeRange } from './time-range.js';

function createMockGitHubClient() {
  return {
    searchUserByEmail: vi.fn(),
    getUserOrgs: vi.fn(),
    getRecentRepos: vi.fn(),
    getCommits: vi.fn(),
    getPullRequests: vi.fn(),
    getReviews: vi.fn(),
  } as unknown as GitHubClient;
}

function createMockJiraClient() {
  return {
    searchUserByEmail: vi.fn(),
    getProjects: vi.fn(),
    getBoards: vi.fn(),
    getSprints: vi.fn(),
    searchIssues: vi.fn(),
    getIssue: vi.fn(),
  } as unknown as JiraClient;
}

const timeRange: TimeRange = {
  from: '2026-02-06T12:00:00.000Z',
  to: '2026-02-07T12:00:00.000Z',
};

describe('data-fetcher', () => {
  describe('fetchGitHubActivityForUser', () => {
    let client: GitHubClient;

    beforeEach(() => {
      client = createMockGitHubClient();
    });

    it('fetches commits, PRs, and reviews across repos', async () => {
      const mock = client as unknown as {
        getCommits: ReturnType<typeof vi.fn>;
        getPullRequests: ReturnType<typeof vi.fn>;
        getReviews: ReturnType<typeof vi.fn>;
      };

      mock.getCommits.mockResolvedValue([
        {
          sha: 'abc1234',
          message: 'fix bug',
          author: 'alice',
          date: '2026-02-07T10:00:00Z',
          repo: 'org/repo1',
          url: '',
        },
      ]);
      mock.getPullRequests.mockResolvedValue([
        {
          number: 1,
          title: 'Fix bug',
          state: 'open',
          author: 'alice',
          createdAt: '',
          updatedAt: '',
          repo: 'org/repo1',
          url: '',
        },
        {
          number: 2,
          title: 'Other PR',
          state: 'open',
          author: 'bob',
          createdAt: '',
          updatedAt: '',
          repo: 'org/repo1',
          url: '',
        },
      ]);
      mock.getReviews.mockResolvedValue([]);

      const result = await fetchGitHubActivityForUser(client, 'alice', ['org/repo1'], timeRange);

      expect(result.username).toBe('alice');
      expect(result.commits).toHaveLength(1);
      expect(result.pullRequests).toHaveLength(1); // Only alice's PR
      expect(result.pullRequests[0]?.author).toBe('alice');
      expect(result.timeRange).toEqual(timeRange);
    });

    it('collects reviews where user is the reviewer', async () => {
      const mock = client as unknown as {
        getCommits: ReturnType<typeof vi.fn>;
        getPullRequests: ReturnType<typeof vi.fn>;
        getReviews: ReturnType<typeof vi.fn>;
      };

      mock.getCommits.mockResolvedValue([]);
      mock.getPullRequests.mockResolvedValue([
        {
          number: 5,
          title: 'Some PR',
          state: 'open',
          author: 'bob',
          createdAt: '',
          updatedAt: '',
          repo: 'org/repo1',
          url: '',
        },
      ]);
      mock.getReviews.mockResolvedValue([
        {
          pullRequestNumber: 5,
          pullRequestTitle: 'Some PR',
          author: 'alice',
          state: 'APPROVED',
          submittedAt: '',
          repo: 'org/repo1',
        },
        {
          pullRequestNumber: 5,
          pullRequestTitle: 'Some PR',
          author: 'carol',
          state: 'COMMENTED',
          submittedAt: '',
          repo: 'org/repo1',
        },
      ]);

      const result = await fetchGitHubActivityForUser(client, 'alice', ['org/repo1'], timeRange);

      expect(result.reviews).toHaveLength(1);
      expect(result.reviews[0]?.author).toBe('alice');
    });

    it('skips repos that fail gracefully', async () => {
      const mock = client as unknown as {
        getCommits: ReturnType<typeof vi.fn>;
        getPullRequests: ReturnType<typeof vi.fn>;
        getReviews: ReturnType<typeof vi.fn>;
      };

      // First repo fails, second succeeds
      mock.getCommits.mockRejectedValueOnce(new Error('forbidden')).mockResolvedValueOnce([
        {
          sha: 'def5678',
          message: 'add feature',
          author: 'alice',
          date: '',
          repo: 'org/repo2',
          url: '',
        },
      ]);
      mock.getPullRequests.mockRejectedValueOnce(new Error('forbidden')).mockResolvedValueOnce([]);
      mock.getReviews.mockResolvedValue([]);

      const result = await fetchGitHubActivityForUser(
        client,
        'alice',
        ['org/repo1', 'org/repo2'],
        timeRange
      );

      expect(result.commits).toHaveLength(1);
      expect(result.commits[0]?.repo).toBe('org/repo2');
    });

    it('handles empty repos list', async () => {
      const result = await fetchGitHubActivityForUser(client, 'alice', [], timeRange);

      expect(result.commits).toEqual([]);
      expect(result.pullRequests).toEqual([]);
      expect(result.reviews).toEqual([]);
    });

    it('handles invalid repo format', async () => {
      const result = await fetchGitHubActivityForUser(client, 'alice', ['invalid-repo'], timeRange);

      expect(result.commits).toEqual([]);
    });
  });

  describe('fetchTeamGitHubActivity', () => {
    let client: GitHubClient;

    beforeEach(() => {
      client = createMockGitHubClient();
    });

    it('splits repo activity across team members', async () => {
      const mock = client as unknown as {
        getCommits: ReturnType<typeof vi.fn>;
        getPullRequests: ReturnType<typeof vi.fn>;
        getReviews: ReturnType<typeof vi.fn>;
      };

      mock.getCommits.mockResolvedValue([
        { sha: 'abc', message: 'fix', author: 'alice', date: '', repo: 'org/repo1', url: '' },
        { sha: 'def', message: 'add', author: 'bob', date: '', repo: 'org/repo1', url: '' },
      ]);
      mock.getPullRequests.mockResolvedValue([
        {
          number: 1,
          title: 'PR1',
          state: 'open',
          author: 'alice',
          createdAt: '',
          updatedAt: '',
          repo: 'org/repo1',
          url: '',
        },
      ]);
      mock.getReviews.mockResolvedValue([]);

      const results = await fetchTeamGitHubActivity(
        client,
        ['alice', 'bob'],
        ['org/repo1'],
        timeRange
      );

      expect(results).toHaveLength(2);
      expect(results[0]?.username).toBe('alice');
      expect(results[0]?.commits).toHaveLength(1);
      expect(results[0]?.pullRequests).toHaveLength(1);
      expect(results[1]?.username).toBe('bob');
      expect(results[1]?.commits).toHaveLength(1);
      expect(results[1]?.pullRequests).toHaveLength(0);
    });
  });

  describe('fetchJiraActivityForUser', () => {
    let client: JiraClient;

    beforeEach(() => {
      client = createMockJiraClient();
    });

    it('fetches issues assigned to the user', async () => {
      const mock = client as unknown as { searchIssues: ReturnType<typeof vi.fn> };

      mock.searchIssues.mockResolvedValue([
        {
          key: 'PA-94',
          summary: 'Task',
          status: 'In Progress',
          priority: 'High',
          assignee: 'Giri',
          issueType: 'Task',
          updatedAt: '',
          url: '',
        },
      ]);

      const result = await fetchJiraActivityForUser(client, 'acc123', ['PA'], timeRange);

      expect(result.issues).toHaveLength(1);
      expect(mock.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('assignee = "acc123"')
      );
    });

    it('returns empty on Jira error', async () => {
      const mock = client as unknown as { searchIssues: ReturnType<typeof vi.fn> };
      mock.searchIssues.mockRejectedValue(new Error('Jira down'));

      const result = await fetchJiraActivityForUser(client, 'acc123', ['PA'], timeRange);

      expect(result.issues).toEqual([]);
    });

    it('returns empty when no projects', async () => {
      const result = await fetchJiraActivityForUser(client, 'acc123', [], timeRange);

      expect(result.issues).toEqual([]);
    });
  });

  describe('fetchTeamJiraActivity', () => {
    let client: JiraClient;

    beforeEach(() => {
      client = createMockJiraClient();
    });

    it('fetches all issues for projects in time range', async () => {
      const mock = client as unknown as { searchIssues: ReturnType<typeof vi.fn> };

      mock.searchIssues.mockResolvedValue([
        {
          key: 'PA-1',
          summary: 'A',
          status: 'Done',
          priority: 'High',
          assignee: 'X',
          issueType: 'Task',
          updatedAt: '',
          url: '',
        },
        {
          key: 'PA-2',
          summary: 'B',
          status: 'Open',
          priority: 'Low',
          assignee: 'Y',
          issueType: 'Bug',
          updatedAt: '',
          url: '',
        },
      ]);

      const result = await fetchTeamJiraActivity(client, ['PA', 'PB'], timeRange);

      expect(result.issues).toHaveLength(2);
      expect(mock.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('project in ("PA", "PB")')
      );
    });
  });

  describe('fetchSprintJiraActivity', () => {
    let client: JiraClient;

    beforeEach(() => {
      client = createMockJiraClient();
    });

    it('fetches issues for a specific sprint', async () => {
      const mock = client as unknown as { searchIssues: ReturnType<typeof vi.fn> };

      mock.searchIssues.mockResolvedValue([
        {
          key: 'PA-10',
          summary: 'Sprint task',
          status: 'Done',
          priority: 'Medium',
          assignee: 'Z',
          issueType: 'Story',
          updatedAt: '',
          url: '',
        },
      ]);

      const result = await fetchSprintJiraActivity(client, 'Sprint 12', timeRange);

      expect(result.issues).toHaveLength(1);
      expect(mock.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('sprint = "Sprint 12"')
      );
    });

    it('returns empty on error', async () => {
      const mock = client as unknown as { searchIssues: ReturnType<typeof vi.fn> };
      mock.searchIssues.mockRejectedValue(new Error('bad JQL'));

      const result = await fetchSprintJiraActivity(client, 'Bad Sprint', timeRange);

      expect(result.issues).toEqual([]);
    });
  });

  describe('detectActiveSprint', () => {
    let client: JiraClient;

    beforeEach(() => {
      client = createMockJiraClient();
    });

    it('returns the active sprint with dates', async () => {
      const mock = client as unknown as {
        getBoards: ReturnType<typeof vi.fn>;
        getSprints: ReturnType<typeof vi.fn>;
      };

      mock.getBoards.mockResolvedValue([{ id: 10, name: 'Board', type: 'scrum' }]);
      mock.getSprints.mockResolvedValue([
        {
          id: 100,
          name: 'Sprint 12',
          state: 'active',
          startDate: '2026-01-27T00:00:00Z',
          endDate: '2026-02-07T00:00:00Z',
        },
      ]);

      const result = await detectActiveSprint(client, ['PA']);

      expect(result).toEqual({
        name: 'Sprint 12',
        startDate: '2026-01-27T00:00:00Z',
        endDate: '2026-02-07T00:00:00Z',
      });
    });

    it('returns null when no active sprints found', async () => {
      const mock = client as unknown as {
        getBoards: ReturnType<typeof vi.fn>;
        getSprints: ReturnType<typeof vi.fn>;
      };

      mock.getBoards.mockResolvedValue([{ id: 10, name: 'Board', type: 'scrum' }]);
      mock.getSprints.mockResolvedValue([]);

      const result = await detectActiveSprint(client, ['PA']);

      expect(result).toBeNull();
    });

    it('handles board/sprint errors gracefully', async () => {
      const mock = client as unknown as {
        getBoards: ReturnType<typeof vi.fn>;
      };

      mock.getBoards.mockRejectedValue(new Error('forbidden'));

      const result = await detectActiveSprint(client, ['PA']);

      expect(result).toBeNull();
    });

    it('returns null for empty projects', async () => {
      const result = await detectActiveSprint(client, []);

      expect(result).toBeNull();
    });

    it('picks the most recently started sprint when multiple are active', async () => {
      const mock = client as unknown as {
        getBoards: ReturnType<typeof vi.fn>;
        getSprints: ReturnType<typeof vi.fn>;
      };

      mock.getBoards.mockResolvedValue([{ id: 10, name: 'Board', type: 'scrum' }]);
      mock.getSprints.mockResolvedValue([
        {
          id: 100,
          name: 'Sprint 11',
          state: 'active',
          startDate: '2026-01-13T00:00:00Z',
          endDate: '2026-01-27T00:00:00Z',
        },
        {
          id: 101,
          name: 'Sprint 12',
          state: 'active',
          startDate: '2026-01-27T00:00:00Z',
          endDate: '2026-02-07T00:00:00Z',
        },
      ]);

      const result = await detectActiveSprint(client, ['PA']);

      expect(result?.name).toBe('Sprint 12');
    });
  });
});
