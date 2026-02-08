/**
 * Jira Cloud REST API Client
 *
 * Uses native fetch (Node 18+) with basic auth (email:apiToken).
 * Targets Jira Cloud only. All methods return typed responses
 * mapped to our internal types.
 */

import type {
  JiraApiUser,
  JiraApiProject,
  JiraApiBoard,
  JiraApiSprint,
  JiraApiIssue,
  JiraApiSearchResult,
  JiraApiBoardList,
  JiraApiSprintList,
} from './types.js';
import type { JiraIssue } from '../types/jira.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export class JiraClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public retryable: boolean
  ) {
    super(message);
    this.name = 'JiraClientError';
  }
}

export class JiraClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(host: string, email: string, apiToken: string) {
    // Normalize host: ensure https:// prefix, remove trailing slash
    this.baseUrl = host.startsWith('https://') ? host : `https://${host}`;
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
    this.authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
  }

  // ─── Authentication ─────────────────────────────────────

  /**
   * Get the authenticated user's profile.
   * Used to validate credentials are working.
   */
  async getMyself(): Promise<{ accountId: string; displayName: string }> {
    const user = await this.get<JiraApiUser>('/rest/api/3/myself');
    return { accountId: user.accountId, displayName: user.displayName };
  }

  // ─── Discovery Methods ───────────────────────────────────

  /**
   * Search for a Jira user by email.
   * Returns accountId and displayName, or null if not found.
   */
  async searchUserByEmail(
    email: string
  ): Promise<{ accountId: string; displayName: string } | null> {
    const users = await this.get<JiraApiUser[]>(
      `/rest/api/3/user/search?query=${encodeURIComponent(email)}`
    );
    const match = users.find(
      (u) => u.emailAddress?.toLowerCase() === email.toLowerCase() && u.active
    );
    if (!match) {
      // Fallback: return first active user if email field isn't exposed
      const fallback = users.find((u) => u.active);
      return fallback ? { accountId: fallback.accountId, displayName: fallback.displayName } : null;
    }
    return { accountId: match.accountId, displayName: match.displayName };
  }

  /**
   * Get all projects accessible to the authenticated user.
   */
  async getProjects(): Promise<JiraApiProject[]> {
    return this.get<JiraApiProject[]>('/rest/api/3/project');
  }

  /**
   * Get boards for a specific project.
   */
  async getBoards(projectKey: string): Promise<JiraApiBoard[]> {
    const result = await this.get<JiraApiBoardList>(
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}`
    );
    return result.values;
  }

  /**
   * Get sprints for a board, filtered by state.
   */
  async getSprints(
    boardId: number,
    state?: 'active' | 'closed' | 'future'
  ): Promise<JiraApiSprint[]> {
    const query = state ? `?state=${state}` : '';
    const result = await this.get<JiraApiSprintList>(
      `/rest/agile/1.0/board/${boardId}/sprint${query}`
    );
    return result.values;
  }

  // ─── Data Fetching Methods ───────────────────────────────

  /**
   * Search for issues using JQL.
   * Maps to our internal JiraIssue type.
   */
  async searchIssues(jql: string, fields?: string[]): Promise<JiraIssue[]> {
    const fieldList = fields ?? [
      'summary',
      'status',
      'priority',
      'assignee',
      'issuetype',
      'updated',
      'created',
    ];

    const body = {
      jql,
      fields: fieldList,
      maxResults: 100,
    };

    const result = await this.post<JiraApiSearchResult>('/rest/api/3/search', body);

    return result.issues.map((issue) => this.mapIssue(issue));
  }

  /**
   * Get a single issue by key.
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    const issue = await this.get<JiraApiIssue>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,priority,assignee,issuetype,updated,created`
    );
    return this.mapIssue(issue);
  }

  // ─── Mapping ─────────────────────────────────────────────

  private mapIssue(issue: JiraApiIssue): JiraIssue {
    return {
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      priority: issue.fields.priority.name,
      assignee: issue.fields.assignee?.displayName ?? 'Unassigned',
      issueType: issue.fields.issuetype.name,
      updatedAt: issue.fields.updated,
      url: `${this.baseUrl}/browse/${issue.key}`,
    };
  }

  // ─── HTTP Layer ──────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        Authorization: this.authHeader,
        Accept: 'application/json',
      };

      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }

      const response = await fetch(url, init);

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new JiraClientError(
          `Jira API error: ${response.status} ${response.statusText} for ${path}`,
          response.status,
          retryable
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
