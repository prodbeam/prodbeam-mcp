/**
 * GitHub REST API Client
 *
 * Uses native fetch (Node 18+). All methods return typed responses
 * mapped to our internal types. Handles rate limiting and pagination.
 */

import type {
  GitHubApiUser,
  GitHubApiOrg,
  GitHubApiRepo,
  GitHubApiCommit,
  GitHubApiPullRequest,
  GitHubApiReview,
  GitHubApiSearchResult,
} from './types.js';
import type { GitHubCommit, GitHubPullRequest, GitHubReview } from '../types/github.js';

const GITHUB_API = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 30_000;

export class GitHubClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public retryable: boolean
  ) {
    super(message);
    this.name = 'GitHubClientError';
  }
}

export class GitHubClient {
  private getToken: () => Promise<string>;

  constructor(tokenOrProvider: string | (() => Promise<string>)) {
    if (typeof tokenOrProvider === 'string') {
      const token = tokenOrProvider;
      this.getToken = () => Promise.resolve(token);
    } else {
      this.getToken = tokenOrProvider;
    }
  }

  // ─── Authentication ─────────────────────────────────────

  /**
   * Get the authenticated user's profile.
   * Used to validate the token is working.
   */
  async getAuthenticatedUser(): Promise<{ login: string; name: string | null }> {
    const user = await this.get<GitHubApiUser>('/user');
    return { login: user.login, name: user.name };
  }

  // ─── Discovery Methods ───────────────────────────────────

  /**
   * Search for a GitHub user by email address.
   * Returns the username or null if not found.
   */
  async searchUserByEmail(email: string): Promise<string | null> {
    const data = await this.get<GitHubApiSearchResult<GitHubApiUser>>(
      `/search/users?q=${encodeURIComponent(email)}+in:email`
    );
    const user = data.items[0];
    return user?.login ?? null;
  }

  /**
   * Get organizations for a user.
   */
  async getUserOrgs(username: string): Promise<string[]> {
    const orgs = await this.get<GitHubApiOrg[]>(`/users/${encodeURIComponent(username)}/orgs`);
    return orgs.map((o) => o.login);
  }

  /**
   * Get repos a user has pushed to recently.
   * Returns full_name format (owner/repo).
   */
  async getRecentRepos(username: string, sinceDays = 90): Promise<string[]> {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const repos = await this.get<GitHubApiRepo[]>(
      `/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100&type=all`
    );
    return repos.filter((r) => new Date(r.pushed_at) >= cutoff).map((r) => r.full_name);
  }

  // ─── Data Fetching Methods ───────────────────────────────

  /**
   * Get commits for a repo, optionally filtered by author and date range.
   * Maps GitHub API response to our internal GitHubCommit type.
   */
  async getCommits(
    owner: string,
    repo: string,
    params: { since?: string; until?: string; author?: string }
  ): Promise<GitHubCommit[]> {
    const query = new URLSearchParams();
    if (params.since) query.set('since', params.since);
    if (params.until) query.set('until', params.until);
    if (params.author) query.set('author', params.author);
    query.set('per_page', '100');

    const commits = await this.get<GitHubApiCommit[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${query.toString()}`
    );

    return commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0] ?? '',
      author: c.author?.login ?? c.commit.author.name,
      date: c.commit.author.date,
      repo: `${owner}/${repo}`,
      url: c.html_url,
    }));
  }

  /**
   * Get pull requests for a repo.
   * Maps to our internal GitHubPullRequest type.
   */
  async getPullRequests(
    owner: string,
    repo: string,
    params: { state?: 'open' | 'closed' | 'all'; since?: string }
  ): Promise<GitHubPullRequest[]> {
    const query = new URLSearchParams();
    query.set('state', params.state ?? 'all');
    query.set('sort', 'updated');
    query.set('direction', 'desc');
    query.set('per_page', '100');

    const prs = await this.get<GitHubApiPullRequest[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${query.toString()}`
    );

    // Filter by since date if provided
    const filtered = params.since
      ? prs.filter((pr) => new Date(pr.updated_at) >= new Date(params.since!))
      : prs;

    return filtered.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
      author: pr.user.login,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: pr.merged_at ?? undefined,
      repo: `${owner}/${repo}`,
      url: pr.html_url,
      additions: pr.additions,
      deletions: pr.deletions,
      body: pr.body ? pr.body.slice(0, 500) : undefined,
      labels: pr.labels?.map((l) => l.name),
    }));
  }

  /**
   * Get reviews for a specific pull request.
   * Maps to our internal GitHubReview type.
   */
  async getReviews(
    owner: string,
    repo: string,
    prNumber: number,
    prTitle: string
  ): Promise<GitHubReview[]> {
    const reviews = await this.get<GitHubApiReview[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/reviews`
    );

    return reviews
      .filter((r) => r.state !== 'PENDING' && r.state !== 'DISMISSED')
      .map((r) => ({
        pullRequestNumber: prNumber,
        pullRequestTitle: prTitle,
        author: r.user.login,
        state: r.state as GitHubReview['state'],
        submittedAt: r.submitted_at,
        repo: `${owner}/${repo}`,
        body: r.body ? r.body.slice(0, 500) : undefined,
      }));
  }

  // ─── HTTP Layer ──────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const url = `${GITHUB_API}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const token = await this.getToken();

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new GitHubClientError(
          `GitHub API error: ${response.status} ${response.statusText} for ${path}`,
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
