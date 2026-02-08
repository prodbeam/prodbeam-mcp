import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverJiraTeam } from './jira-discovery.js';
import { JiraClient } from '../clients/jira-client.js';

function createMockClient() {
  return {
    searchUserByEmail: vi.fn(),
    getProjects: vi.fn(),
    getBoards: vi.fn(),
    getSprints: vi.fn(),
    searchIssues: vi.fn(),
    getIssue: vi.fn(),
  } as unknown as JiraClient;
}

describe('jira-discovery', () => {
  let client: JiraClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe('discoverJiraTeam', () => {
    it('discovers members, projects, and active sprints', async () => {
      const mock = client as unknown as {
        searchUserByEmail: ReturnType<typeof vi.fn>;
        getProjects: ReturnType<typeof vi.fn>;
        getBoards: ReturnType<typeof vi.fn>;
        getSprints: ReturnType<typeof vi.fn>;
      };

      mock.searchUserByEmail
        .mockResolvedValueOnce({ accountId: 'acc1', displayName: 'Giri V' })
        .mockResolvedValueOnce({ accountId: 'acc2', displayName: 'Alex R' });

      mock.getProjects.mockResolvedValue([
        { id: '1', key: 'PA', name: 'Project-A', projectTypeKey: 'software' },
      ]);

      mock.getBoards.mockResolvedValue([{ id: 10, name: 'PA board', type: 'scrum' }]);

      mock.getSprints.mockResolvedValue([
        {
          id: 100,
          name: 'Sprint 12',
          state: 'active',
          startDate: '2026-01-27T00:00:00Z',
          endDate: '2026-02-07T00:00:00Z',
        },
      ]);

      const result = await discoverJiraTeam(
        client,
        ['giri@test.com', 'alex@test.com'],
        'prodbeam.atlassian.net'
      );

      expect(result.members).toHaveLength(2);
      expect(result.members[0]?.accountId).toBe('acc1');
      expect(result.members[0]?.displayName).toBe('Giri V');
      expect(result.members[1]?.accountId).toBe('acc2');

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0]?.key).toBe('PA');

      expect(result.activeSprints).toHaveLength(1);
      expect(result.activeSprints[0]?.name).toBe('Sprint 12');

      expect(result.host).toBe('prodbeam.atlassian.net');
    });

    it('handles member not found in Jira', async () => {
      const mock = client as unknown as {
        searchUserByEmail: ReturnType<typeof vi.fn>;
        getProjects: ReturnType<typeof vi.fn>;
        getBoards: ReturnType<typeof vi.fn>;
        getSprints: ReturnType<typeof vi.fn>;
      };

      mock.searchUserByEmail.mockResolvedValue(null);
      mock.getProjects.mockResolvedValue([]);

      const result = await discoverJiraTeam(client, ['nobody@test.com'], 'test.atlassian.net');

      expect(result.members[0]?.accountId).toBeNull();
      expect(result.members[0]?.error).toContain('No Jira user found');
    });

    it('handles API error on member lookup', async () => {
      const mock = client as unknown as {
        searchUserByEmail: ReturnType<typeof vi.fn>;
        getProjects: ReturnType<typeof vi.fn>;
        getBoards: ReturnType<typeof vi.fn>;
        getSprints: ReturnType<typeof vi.fn>;
      };

      mock.searchUserByEmail.mockRejectedValue(new Error('Jira offline'));
      mock.getProjects.mockResolvedValue([]);

      const result = await discoverJiraTeam(client, ['giri@test.com'], 'test.atlassian.net');

      expect(result.members[0]?.accountId).toBeNull();
      expect(result.members[0]?.error).toBe('Jira offline');
    });

    it('handles board/sprint discovery failure gracefully', async () => {
      const mock = client as unknown as {
        searchUserByEmail: ReturnType<typeof vi.fn>;
        getProjects: ReturnType<typeof vi.fn>;
        getBoards: ReturnType<typeof vi.fn>;
        getSprints: ReturnType<typeof vi.fn>;
      };

      mock.searchUserByEmail.mockResolvedValue({ accountId: 'acc1', displayName: 'Test' });
      mock.getProjects.mockResolvedValue([
        { id: '1', key: 'PA', name: 'Project-A', projectTypeKey: 'software' },
      ]);
      mock.getBoards.mockRejectedValue(new Error('No boards'));

      const result = await discoverJiraTeam(client, ['giri@test.com'], 'test.atlassian.net');

      // Projects found, sprints empty due to board error
      expect(result.projects).toHaveLength(1);
      expect(result.activeSprints).toEqual([]);
    });

    it('deduplicates sprints across multiple boards', async () => {
      const mock = client as unknown as {
        searchUserByEmail: ReturnType<typeof vi.fn>;
        getProjects: ReturnType<typeof vi.fn>;
        getBoards: ReturnType<typeof vi.fn>;
        getSprints: ReturnType<typeof vi.fn>;
      };

      mock.searchUserByEmail.mockResolvedValue({ accountId: 'acc1', displayName: 'Test' });
      mock.getProjects.mockResolvedValue([
        { id: '1', key: 'PA', name: 'Project-A', projectTypeKey: 'software' },
      ]);
      mock.getBoards.mockResolvedValue([
        { id: 10, name: 'Board 1', type: 'scrum' },
        { id: 20, name: 'Board 2', type: 'scrum' },
      ]);

      // Same sprint returned by both boards
      const sprint = { id: 100, name: 'Sprint 12', state: 'active' as const };
      mock.getSprints.mockResolvedValue([sprint]);

      const result = await discoverJiraTeam(client, ['giri@test.com'], 'test.atlassian.net');

      // Sprint should appear only once
      expect(result.activeSprints).toHaveLength(1);
    });

    it('handles getProjects failure', async () => {
      const mock = client as unknown as {
        searchUserByEmail: ReturnType<typeof vi.fn>;
        getProjects: ReturnType<typeof vi.fn>;
      };

      mock.searchUserByEmail.mockResolvedValue({ accountId: 'acc1', displayName: 'Test' });
      mock.getProjects.mockRejectedValue(new Error('Forbidden'));

      const result = await discoverJiraTeam(client, ['giri@test.com'], 'test.atlassian.net');

      expect(result.members).toHaveLength(1);
      expect(result.projects).toEqual([]);
      expect(result.activeSprints).toEqual([]);
    });
  });
});
