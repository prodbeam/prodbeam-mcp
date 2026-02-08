import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubClient, GitHubClientError } from './github-client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as Response;
}

describe('GitHubClient', () => {
  let client: GitHubClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GitHubClient('test-token');
  });

  describe('searchUserByEmail', () => {
    it('returns username when user found', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          total_count: 1,
          incomplete_results: false,
          items: [
            { login: 'vislawath', id: 1, name: 'Giri V', email: 'giri@test.com', avatar_url: '' },
          ],
        })
      );

      const result = await client.searchUserByEmail('giri@test.com');
      expect(result).toBe('vislawath');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/search/users?q=giri%40test.com'),
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        })
      );
    });

    it('returns null when no user found', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ total_count: 0, incomplete_results: false, items: [] })
      );

      const result = await client.searchUserByEmail('nobody@test.com');
      expect(result).toBeNull();
    });
  });

  describe('getUserOrgs', () => {
    it('returns org names', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse([
          { login: 'prodbeam', id: 1, description: null },
          { login: 'other-org', id: 2, description: null },
        ])
      );

      const orgs = await client.getUserOrgs('vislawath');
      expect(orgs).toEqual(['prodbeam', 'other-org']);
    });
  });

  describe('getRecentRepos', () => {
    it('returns repos pushed within the time window', async () => {
      const recentDate = new Date().toISOString();
      const oldDate = new Date('2020-01-01').toISOString();

      mockFetch.mockResolvedValue(
        jsonResponse([
          {
            name: 'active-repo',
            full_name: 'user/active-repo',
            owner: { login: 'user' },
            private: false,
            pushed_at: recentDate,
            default_branch: 'main',
          },
          {
            name: 'old-repo',
            full_name: 'user/old-repo',
            owner: { login: 'user' },
            private: false,
            pushed_at: oldDate,
            default_branch: 'main',
          },
        ])
      );

      const repos = await client.getRecentRepos('user', 90);
      expect(repos).toEqual(['user/active-repo']);
    });
  });

  describe('getCommits', () => {
    it('maps API commits to internal format', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse([
          {
            sha: 'abc1234567890',
            commit: {
              message: 'feat: add login\n\nDetailed description',
              author: { name: 'Giri', email: 'giri@test.com', date: '2026-02-07T10:00:00Z' },
            },
            html_url: 'https://github.com/org/repo/commit/abc1234567890',
            author: { login: 'vislawath' },
          },
        ])
      );

      const commits = await client.getCommits('org', 'repo', { since: '2026-02-06' });

      expect(commits).toHaveLength(1);
      expect(commits[0]).toEqual({
        sha: 'abc1234',
        message: 'feat: add login',
        author: 'vislawath',
        date: '2026-02-07T10:00:00Z',
        repo: 'org/repo',
        url: 'https://github.com/org/repo/commit/abc1234567890',
      });
    });

    it('uses commit author name when GitHub user not linked', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse([
          {
            sha: 'def5678901234',
            commit: {
              message: 'fix: bug',
              author: { name: 'External Dev', email: 'ext@test.com', date: '2026-02-07T10:00:00Z' },
            },
            html_url: 'https://github.com/org/repo/commit/def5678901234',
            author: null,
          },
        ])
      );

      const commits = await client.getCommits('org', 'repo', {});
      expect(commits[0]?.author).toBe('External Dev');
    });
  });

  describe('getPullRequests', () => {
    it('maps merged PRs correctly', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse([
          {
            number: 42,
            title: 'Fix login',
            state: 'closed',
            merged_at: '2026-02-07T10:00:00Z',
            user: { login: 'vislawath' },
            created_at: '2026-02-06T09:00:00Z',
            updated_at: '2026-02-07T10:00:00Z',
            html_url: 'https://github.com/org/repo/pull/42',
            additions: 50,
            deletions: 10,
            head: { repo: null },
            base: { repo: null },
          },
        ])
      );

      const prs = await client.getPullRequests('org', 'repo', { state: 'all' });
      expect(prs[0]?.state).toBe('merged');
      expect(prs[0]?.mergedAt).toBe('2026-02-07T10:00:00Z');
    });

    it('filters by since date', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse([
          {
            number: 1,
            title: 'Recent',
            state: 'open',
            merged_at: null,
            user: { login: 'u' },
            created_at: '2026-02-07T00:00:00Z',
            updated_at: '2026-02-07T10:00:00Z',
            html_url: '',
            head: { repo: null },
            base: { repo: null },
          },
          {
            number: 2,
            title: 'Old',
            state: 'open',
            merged_at: null,
            user: { login: 'u' },
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T10:00:00Z',
            html_url: '',
            head: { repo: null },
            base: { repo: null },
          },
        ])
      );

      const prs = await client.getPullRequests('org', 'repo', {
        state: 'all',
        since: '2026-02-06T00:00:00Z',
      });
      expect(prs).toHaveLength(1);
      expect(prs[0]?.title).toBe('Recent');
    });
  });

  describe('getReviews', () => {
    it('maps reviews and filters out pending/dismissed', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse([
          {
            id: 1,
            user: { login: 'reviewer1' },
            state: 'APPROVED',
            submitted_at: '2026-02-07T10:00:00Z',
            html_url: '',
          },
          {
            id: 2,
            user: { login: 'reviewer2' },
            state: 'PENDING',
            submitted_at: '2026-02-07T11:00:00Z',
            html_url: '',
          },
          {
            id: 3,
            user: { login: 'reviewer3' },
            state: 'CHANGES_REQUESTED',
            submitted_at: '2026-02-07T12:00:00Z',
            html_url: '',
          },
        ])
      );

      const reviews = await client.getReviews('org', 'repo', 42, 'Fix login');
      expect(reviews).toHaveLength(2);
      expect(reviews[0]?.state).toBe('APPROVED');
      expect(reviews[1]?.state).toBe('CHANGES_REQUESTED');
    });
  });

  describe('error handling', () => {
    it('throws GitHubClientError on API failure', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}, 401));

      await expect(client.searchUserByEmail('test@test.com')).rejects.toThrow(GitHubClientError);
    });

    it('marks 429 as retryable', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}, 429));

      try {
        await client.searchUserByEmail('test@test.com');
      } catch (e) {
        expect(e).toBeInstanceOf(GitHubClientError);
        expect((e as GitHubClientError).retryable).toBe(true);
      }
    });

    it('marks 500 as retryable', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}, 500));

      try {
        await client.searchUserByEmail('test@test.com');
      } catch (e) {
        expect(e).toBeInstanceOf(GitHubClientError);
        expect((e as GitHubClientError).retryable).toBe(true);
      }
    });

    it('marks 403 as not retryable', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}, 403));

      try {
        await client.searchUserByEmail('test@test.com');
      } catch (e) {
        expect(e).toBeInstanceOf(GitHubClientError);
        expect((e as GitHubClientError).retryable).toBe(false);
      }
    });
  });
});
