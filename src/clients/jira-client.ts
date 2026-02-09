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
  JiraApiCommentList,
} from './types.js';
import type { JiraIssue, JiraComment } from '../types/jira.js';

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

/** Interface for OAuth-based Jira authentication. */
export interface JiraAuthProvider {
  getBaseUrl(): string;
  getAuthHeader(): Promise<string>;
}

export class JiraClient {
  private getBaseUrl: () => string;
  private getAuthHeader: () => Promise<string>;

  constructor(host: string, email: string, apiToken: string);
  constructor(authProvider: JiraAuthProvider);
  constructor(hostOrProvider: string | JiraAuthProvider, email?: string, apiToken?: string) {
    if (typeof hostOrProvider === 'string') {
      // PAT-based auth (existing behavior)
      let baseUrl = hostOrProvider.startsWith('https://')
        ? hostOrProvider
        : `https://${hostOrProvider}`;
      baseUrl = baseUrl.replace(/\/$/, '');
      const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
      this.getBaseUrl = () => baseUrl;
      this.getAuthHeader = () => Promise.resolve(authHeader);
    } else {
      // OAuth-based auth
      this.getBaseUrl = () => hostOrProvider.getBaseUrl();
      this.getAuthHeader = () => hostOrProvider.getAuthHeader();
    }
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
      'description',
      'labels',
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
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,priority,assignee,issuetype,updated,created,description,labels`
    );
    return this.mapIssue(issue);
  }

  /**
   * Get comments for an issue, most recent first.
   */
  async getIssueComments(issueKey: string, maxResults = 5): Promise<JiraComment[]> {
    const result = await this.get<JiraApiCommentList>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?maxResults=${maxResults}&orderBy=-created`
    );
    return result.comments.map((c) => ({
      author: c.author.displayName,
      body: extractTextFromADF(c.body).slice(0, 500),
      created: c.created,
    }));
  }

  // ─── Mapping ─────────────────────────────────────────────

  private mapIssue(issue: JiraApiIssue): JiraIssue {
    const desc = issue.fields.description
      ? extractTextFromADF(issue.fields.description).slice(0, 500)
      : undefined;
    return {
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      priority: issue.fields.priority.name,
      assignee: issue.fields.assignee?.displayName ?? 'Unassigned',
      issueType: issue.fields.issuetype.name,
      updatedAt: issue.fields.updated,
      url: `${this.getBaseUrl()}/browse/${issue.key}`,
      description: desc || undefined,
      labels: issue.fields.labels?.length ? issue.fields.labels : undefined,
      createdAt: issue.fields.created,
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
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const authHeader = await this.getAuthHeader();

    try {
      const headers: Record<string, string> = {
        Authorization: authHeader,
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

// ─── ADF Text Extraction ──────────────────────────────────

/**
 * Extract plain text from Atlassian Document Format (ADF).
 * Recursively walks the ADF tree collecting text nodes.
 */
function extractTextFromADF(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return '';
  const node = adf as Record<string, unknown>;
  if (node['type'] === 'text' && typeof node['text'] === 'string') {
    return node['text'];
  }
  if (Array.isArray(node['content'])) {
    return (node['content'] as unknown[])
      .map((child) => extractTextFromADF(child))
      .join('')
      .replace(/\n{3,}/g, '\n\n');
  }
  return '';
}
