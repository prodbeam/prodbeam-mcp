import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraClient, JiraClientError } from './jira-client.js';

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

describe('JiraClient', () => {
  let client: JiraClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new JiraClient('prodbeam.atlassian.net', 'user@test.com', 'api-token');
  });

  describe('constructor', () => {
    it('normalizes host without https prefix', () => {
      const c = new JiraClient('example.atlassian.net', 'a@b.com', 'tok');
      // Verify by calling a method and checking the URL
      mockFetch.mockResolvedValue(jsonResponse([]));
      void c.getProjects();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.atlassian.net/rest/api/3/project',
        expect.anything()
      );
    });

    it('handles host with https prefix', () => {
      const c = new JiraClient('https://example.atlassian.net', 'a@b.com', 'tok');
      mockFetch.mockResolvedValue(jsonResponse([]));
      void c.getProjects();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.atlassian.net/rest/api/3/project',
        expect.anything()
      );
    });

    it('sends basic auth header', () => {
      mockFetch.mockResolvedValue(jsonResponse([]));
      void client.getProjects();

      const expectedAuth = `Basic ${Buffer.from('user@test.com:api-token').toString('base64')}`;
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          headers: expect.objectContaining({ Authorization: expectedAuth }),
        })
      );
    });
  });

  describe('searchUserByEmail', () => {
    it('returns account info when email matches', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse([
          {
            accountId: 'acc123',
            displayName: 'Giri V',
            emailAddress: 'giri@test.com',
            active: true,
            accountType: 'atlassian',
          },
        ])
      );

      const result = await client.searchUserByEmail('giri@test.com');
      expect(result).toEqual({ accountId: 'acc123', displayName: 'Giri V' });
    });

    it('returns null when no users found', async () => {
      mockFetch.mockResolvedValue(jsonResponse([]));
      const result = await client.searchUserByEmail('nobody@test.com');
      expect(result).toBeNull();
    });

    it('falls back to first active user when email field not exposed', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse([
          {
            accountId: 'acc456',
            displayName: 'Alex R',
            active: true,
            accountType: 'atlassian',
          },
        ])
      );

      const result = await client.searchUserByEmail('alex@test.com');
      expect(result).toEqual({ accountId: 'acc456', displayName: 'Alex R' });
    });
  });

  describe('getProjects', () => {
    it('returns project list', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse([{ id: '1', key: 'PA', name: 'Project-A', projectTypeKey: 'software' }])
      );

      const projects = await client.getProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0]?.key).toBe('PA');
    });
  });

  describe('getBoards', () => {
    it('returns boards for a project', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          maxResults: 50,
          startAt: 0,
          total: 1,
          values: [
            {
              id: 10,
              name: 'PA board',
              type: 'scrum',
              location: { projectId: 1, projectKey: 'PA' },
            },
          ],
        })
      );

      const boards = await client.getBoards('PA');
      expect(boards).toHaveLength(1);
      expect(boards[0]?.name).toBe('PA board');
    });
  });

  describe('getSprints', () => {
    it('returns active sprints', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          maxResults: 50,
          startAt: 0,
          values: [
            {
              id: 100,
              name: 'Sprint 12',
              state: 'active',
              startDate: '2026-01-27T00:00:00Z',
              endDate: '2026-02-07T00:00:00Z',
            },
          ],
        })
      );

      const sprints = await client.getSprints(10, 'active');
      expect(sprints).toHaveLength(1);
      expect(sprints[0]?.name).toBe('Sprint 12');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('state=active'),
        expect.anything()
      );
    });
  });

  describe('searchIssues', () => {
    it('maps Jira API issues to internal format', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          total: 1,
          maxResults: 100,
          startAt: 0,
          issues: [
            {
              id: '1001',
              key: 'PA-94',
              self: 'https://prodbeam.atlassian.net/rest/api/3/issue/1001',
              fields: {
                summary: 'Create organizations table',
                status: { name: 'To Do', statusCategory: { key: 'new' } },
                priority: { name: 'Highest' },
                assignee: { displayName: 'Giri V', accountId: 'acc123' },
                issuetype: { name: 'Task' },
                updated: '2026-02-07T10:00:00Z',
                created: '2026-01-20T09:00:00Z',
              },
            },
          ],
        })
      );

      const issues = await client.searchIssues('project = PA');
      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual({
        key: 'PA-94',
        summary: 'Create organizations table',
        status: 'To Do',
        priority: 'Highest',
        assignee: 'Giri V',
        issueType: 'Task',
        updatedAt: '2026-02-07T10:00:00Z',
        url: 'https://prodbeam.atlassian.net/browse/PA-94',
        description: undefined,
        labels: undefined,
        createdAt: '2026-01-20T09:00:00Z',
      });
    });

    it('handles unassigned issues', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          total: 1,
          maxResults: 100,
          startAt: 0,
          issues: [
            {
              id: '1002',
              key: 'PA-99',
              self: '',
              fields: {
                summary: 'Unassigned task',
                status: { name: 'Open', statusCategory: { key: 'new' } },
                priority: { name: 'Medium' },
                assignee: null,
                issuetype: { name: 'Bug' },
                updated: '2026-02-07T10:00:00Z',
                created: '2026-02-07T09:00:00Z',
              },
            },
          ],
        })
      );

      const issues = await client.searchIssues('project = PA');
      expect(issues[0]?.assignee).toBe('Unassigned');
    });

    it('sends JQL as POST body', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ total: 0, maxResults: 100, startAt: 0, issues: [] })
      );

      await client.searchIssues('project = PA AND status = Done');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/api/3/search'),
        expect.objectContaining({
          method: 'POST',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          body: expect.stringContaining('project = PA AND status = Done'),
        })
      );
    });
  });

  describe('error handling', () => {
    it('throws JiraClientError on API failure', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}, 401));
      await expect(client.getProjects()).rejects.toThrow(JiraClientError);
    });

    it('marks 429 as retryable', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}, 429));
      try {
        await client.getProjects();
      } catch (e) {
        expect((e as JiraClientError).retryable).toBe(true);
      }
    });

    it('marks 403 as not retryable', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}, 403));
      try {
        await client.getProjects();
      } catch (e) {
        expect((e as JiraClientError).retryable).toBe(false);
      }
    });
  });
});
