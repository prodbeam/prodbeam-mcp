import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverGitHubTeam } from './github-discovery.js';
import { GitHubClient } from '../clients/github-client.js';

// Create a mock client
function createMockClient() {
  return {
    searchUserByEmail: vi.fn(),
    getUserOrgs: vi.fn(),
    getRecentRepos: vi.fn(),
    getCommits: vi.fn(),
    getPullRequests: vi.fn(),
    getReviews: vi.fn(),
  } as unknown as GitHubClient;
}

describe('github-discovery', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe('discoverGitHubTeam', () => {
    it('discovers usernames, orgs, and repos for all members', async () => {
      const mock = client as unknown as {
        searchUserByEmail: ReturnType<typeof vi.fn>;
        getUserOrgs: ReturnType<typeof vi.fn>;
        getRecentRepos: ReturnType<typeof vi.fn>;
      };

      mock.searchUserByEmail.mockResolvedValueOnce('vislawath').mockResolvedValueOnce('alexr');

      mock.getUserOrgs
        .mockResolvedValueOnce(['prodbeam'])
        .mockResolvedValueOnce(['prodbeam', 'other-org']);

      mock.getRecentRepos
        .mockResolvedValueOnce(['prodbeam/pb-payments', 'prodbeam/pb-demo'])
        .mockResolvedValueOnce(['prodbeam/pb-payments', 'prodbeam/pb-api']);

      const result = await discoverGitHubTeam(client, ['giri@test.com', 'alex@test.com']);

      expect(result.members).toHaveLength(2);
      expect(result.members[0]?.username).toBe('vislawath');
      expect(result.members[1]?.username).toBe('alexr');

      // Orgs deduplicated
      expect(result.orgs).toEqual(['other-org', 'prodbeam']);

      // Repos deduplicated
      expect(result.repos).toEqual(['prodbeam/pb-api', 'prodbeam/pb-demo', 'prodbeam/pb-payments']);
    });

    it('handles member not found on GitHub', async () => {
      const mock = client as unknown as {
        searchUserByEmail: ReturnType<typeof vi.fn>;
        getUserOrgs: ReturnType<typeof vi.fn>;
        getRecentRepos: ReturnType<typeof vi.fn>;
      };

      mock.searchUserByEmail.mockResolvedValueOnce(null);

      const result = await discoverGitHubTeam(client, ['unknown@test.com']);

      expect(result.members[0]?.username).toBeNull();
      expect(result.members[0]?.error).toContain('No GitHub user found');
      expect(result.repos).toEqual([]);
    });

    it('handles API error gracefully for one member', async () => {
      const mock = client as unknown as {
        searchUserByEmail: ReturnType<typeof vi.fn>;
        getUserOrgs: ReturnType<typeof vi.fn>;
        getRecentRepos: ReturnType<typeof vi.fn>;
      };

      mock.searchUserByEmail
        .mockRejectedValueOnce(new Error('API rate limited'))
        .mockResolvedValueOnce('alexr');

      mock.getUserOrgs.mockResolvedValue([]);
      mock.getRecentRepos.mockResolvedValue(['org/repo']);

      const result = await discoverGitHubTeam(client, ['giri@test.com', 'alex@test.com']);

      // First member failed
      expect(result.members[0]?.username).toBeNull();
      expect(result.members[0]?.error).toBe('API rate limited');

      // Second member succeeded
      expect(result.members[1]?.username).toBe('alexr');
      expect(result.repos).toEqual(['org/repo']);
    });

    it('handles org/repo fetch failure gracefully', async () => {
      const mock = client as unknown as {
        searchUserByEmail: ReturnType<typeof vi.fn>;
        getUserOrgs: ReturnType<typeof vi.fn>;
        getRecentRepos: ReturnType<typeof vi.fn>;
      };

      mock.searchUserByEmail.mockResolvedValue('user1');
      mock.getUserOrgs.mockRejectedValue(new Error('forbidden'));
      mock.getRecentRepos.mockRejectedValue(new Error('forbidden'));

      const result = await discoverGitHubTeam(client, ['user@test.com']);

      // Username found but orgs/repos empty due to error
      expect(result.members[0]?.username).toBe('user1');
      expect(result.members[0]?.orgs).toEqual([]);
      expect(result.members[0]?.repos).toEqual([]);
    });

    it('returns empty results for empty email list', async () => {
      const result = await discoverGitHubTeam(client, []);
      expect(result.members).toEqual([]);
      expect(result.orgs).toEqual([]);
      expect(result.repos).toEqual([]);
    });
  });
});
