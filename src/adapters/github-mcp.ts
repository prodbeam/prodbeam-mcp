/**
 * GitHub MCP Adapter
 *
 * Connects to the GitHub MCP server as a subprocess and fetches activity data.
 * Uses verified tool names from https://github.com/github/github-mcp-server
 *
 * Required env var: GITHUB_PERSONAL_ACCESS_TOKEN
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  GitHubActivity,
  GitHubCommit,
  GitHubPullRequest,
  GitHubReview,
  MCPToolResponse,
} from '../types/github.js';

export class GitHubMCPAdapter {
  private client: Client | null = null;
  private connected = false;
  private username = '';

  /**
   * Check if the GitHub token is configured
   */
  static isConfigured(): boolean {
    return Boolean(process.env['GITHUB_PERSONAL_ACCESS_TOKEN']);
  }

  /**
   * Connect to the GitHub MCP server subprocess
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const token = process.env['GITHUB_PERSONAL_ACCESS_TOKEN'];
    if (!token) {
      throw new Error(
        'GITHUB_PERSONAL_ACCESS_TOKEN is not set. ' +
          'Add it to your .claude/mcp.json under the prodbeam server env vars.'
      );
    }

    try {
      this.client = new Client(
        { name: 'prodbeam-github-adapter', version: '0.1.0' },
        { capabilities: {} }
      );

      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
          ...process.env,
          GITHUB_PERSONAL_ACCESS_TOKEN: token,
        } as Record<string, string>,
      });

      await this.client.connect(transport);
      this.connected = true;
      console.error('[prodbeam] Connected to GitHub MCP server');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to connect to GitHub MCP: ${message}`);
    }
  }

  /**
   * Disconnect from the GitHub MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore close errors
      }
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Get the authenticated user's username
   */
  async getCurrentUser(): Promise<string> {
    if (this.username) {
      return this.username;
    }

    const result = await this.callTool('get_me', {});
    const text = this.extractText(result);

    // Try to extract username from response
    const loginMatch = text.match(/"login"\s*:\s*"([^"]+)"/);
    if (loginMatch?.[1]) {
      this.username = loginMatch[1];
      return this.username;
    }

    // Fallback: try plain text format
    const usernameMatch = text.match(/Username:\s*(\S+)/i) ?? text.match(/login:\s*(\S+)/i);
    if (usernameMatch?.[1]) {
      this.username = usernameMatch[1];
      return this.username;
    }

    throw new Error('Could not determine GitHub username from get_me response');
  }

  /**
   * Fetch GitHub activity for the last N hours
   */
  async fetchActivity(hours = 24): Promise<GitHubActivity> {
    this.ensureConnected();

    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const username = await this.getCurrentUser();
    const sinceDate = from.toISOString().split('T')[0] ?? '';

    // Fetch PRs authored and reviewed in parallel
    const [authoredPRs, reviewedPRs] = await Promise.all([
      this.fetchAuthoredPullRequests(username, sinceDate),
      this.fetchReviewedPullRequests(username, sinceDate),
    ]);

    // Extract unique repos from PRs to fetch commits
    const repos = this.extractUniqueRepos([...authoredPRs, ...reviewedPRs]);
    const commits = await this.fetchCommitsFromRepos(repos, username, from);

    // Convert reviewed PRs to review objects
    const reviews = this.convertToReviews(reviewedPRs, username);

    return {
      username,
      commits,
      pullRequests: authoredPRs,
      reviews,
      timeRange: {
        from: from.toISOString(),
        to: now.toISOString(),
      },
    };
  }

  /**
   * Check if GitHub MCP is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.connect();
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  // --- Private methods ---

  private ensureConnected(): void {
    if (!this.connected || !this.client) {
      throw new Error('Not connected to GitHub MCP. Call connect() first.');
    }
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResponse> {
    this.ensureConnected();
    const result = await this.client!.callTool({ name, arguments: args });
    return result as MCPToolResponse;
  }

  private extractText(response: MCPToolResponse): string {
    if (!response.content || response.content.length === 0) {
      return '';
    }
    return response.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text ?? '')
      .join('\n');
  }

  /**
   * Fetch PRs authored by user using search_pull_requests
   */
  private async fetchAuthoredPullRequests(
    username: string,
    sinceDate: string
  ): Promise<GitHubPullRequest[]> {
    try {
      const result = await this.callTool('search_pull_requests', {
        q: `author:${username} updated:>=${sinceDate}`,
        sort: 'updated',
        order: 'desc',
        perPage: 20,
      });

      return this.parsePullRequests(result);
    } catch (error) {
      console.error('[prodbeam] Error fetching authored PRs:', error);
      return [];
    }
  }

  /**
   * Fetch PRs reviewed by user using search_pull_requests
   */
  private async fetchReviewedPullRequests(
    username: string,
    sinceDate: string
  ): Promise<GitHubPullRequest[]> {
    try {
      const result = await this.callTool('search_pull_requests', {
        q: `reviewed-by:${username} -author:${username} updated:>=${sinceDate}`,
        sort: 'updated',
        order: 'desc',
        perPage: 20,
      });

      return this.parsePullRequests(result);
    } catch (error) {
      console.error('[prodbeam] Error fetching reviewed PRs:', error);
      return [];
    }
  }

  /**
   * Fetch commits from specific repos
   */
  private async fetchCommitsFromRepos(
    repos: string[],
    username: string,
    since: Date
  ): Promise<GitHubCommit[]> {
    const allCommits: GitHubCommit[] = [];

    for (const repo of repos.slice(0, 5)) {
      // Limit to 5 repos
      try {
        const [owner, name] = repo.split('/');
        if (!owner || !name) continue;

        const result = await this.callTool('list_commits', {
          owner,
          repo: name,
          author: username,
          since: since.toISOString(),
          perPage: 20,
        });

        const commits = this.parseCommits(result, repo);
        allCommits.push(...commits);
      } catch (error) {
        console.error(`[prodbeam] Error fetching commits for ${repo}:`, error);
      }
    }

    return allCommits;
  }

  /**
   * Extract unique "owner/repo" strings from PRs
   */
  private extractUniqueRepos(prs: GitHubPullRequest[]): string[] {
    const repos = new Set<string>();
    for (const pr of prs) {
      if (pr.repo) {
        repos.add(pr.repo);
      }
    }
    return Array.from(repos);
  }

  /**
   * Convert reviewed PRs into review objects
   */
  private convertToReviews(reviewedPRs: GitHubPullRequest[], _username: string): GitHubReview[] {
    return reviewedPRs.map((pr) => ({
      pullRequestNumber: pr.number,
      pullRequestTitle: pr.title,
      author: pr.author,
      state: 'COMMENTED' as const,
      submittedAt: pr.updatedAt,
      repo: pr.repo,
    }));
  }

  // --- Parsers ---

  /**
   * Parse commits from MCP tool response text.
   * GitHub MCP returns markdown or JSON formatted commit data.
   */
  private parseCommits(response: MCPToolResponse, repo: string): GitHubCommit[] {
    const text = this.extractText(response);
    if (!text) return [];

    const commits: GitHubCommit[] = [];

    // Try JSON parsing first
    try {
      const data = JSON.parse(text) as unknown;
      if (Array.isArray(data)) {
        for (const item of data) {
          const commit = this.extractCommitFromObject(item as Record<string, unknown>, repo);
          if (commit) commits.push(commit);
        }
        return commits;
      }
    } catch {
      // Not JSON, try text parsing
    }

    // Parse markdown/text format: look for commit patterns
    // Common format: "- `sha` message (author, date)"
    // or "sha - message"
    const lines = text.split('\n');
    for (const line of lines) {
      const shaMatch = line.match(/[`]?([a-f0-9]{7,40})[`]?\s*[-:]\s*(.+)/i);
      if (shaMatch?.[1] && shaMatch[2]) {
        commits.push({
          sha: shaMatch[1],
          message: shaMatch[2].trim().replace(/\s*\(.*\)\s*$/, ''),
          author: '',
          date: '',
          repo,
          url: '',
        });
      }
    }

    return commits;
  }

  private extractCommitFromObject(obj: Record<string, unknown>, repo: string): GitHubCommit | null {
    const sha = (obj['sha'] as string) ?? '';
    const commit = obj['commit'] as Record<string, unknown> | undefined;
    const message = (commit?.['message'] as string) ?? (obj['message'] as string) ?? '';

    if (!sha && !message) return null;

    const author =
      ((commit?.['author'] as Record<string, unknown>)?.['name'] as string) ??
      ((obj['author'] as Record<string, unknown>)?.['login'] as string) ??
      '';
    const date =
      ((commit?.['author'] as Record<string, unknown>)?.['date'] as string) ??
      (obj['date'] as string) ??
      '';
    const url = (obj['html_url'] as string) ?? '';

    return { sha: sha.slice(0, 7), message: message.split('\n')[0] ?? '', author, date, repo, url };
  }

  /**
   * Parse pull requests from MCP tool response text.
   */
  private parsePullRequests(response: MCPToolResponse): GitHubPullRequest[] {
    const text = this.extractText(response);
    if (!text) return [];

    const prs: GitHubPullRequest[] = [];

    // Try JSON parsing first
    try {
      const data = JSON.parse(text) as unknown;
      const items = Array.isArray(data)
        ? data
        : (((data as Record<string, unknown>)['items'] as unknown[]) ?? []);
      for (const item of items) {
        const pr = this.extractPRFromObject(item as Record<string, unknown>);
        if (pr) prs.push(pr);
      }
      return prs;
    } catch {
      // Not JSON, try text parsing
    }

    // Parse markdown/text format for PRs
    // Common format: "#123 - Title (open) [owner/repo]"
    const lines = text.split('\n');
    for (const line of lines) {
      const prMatch = line.match(/#(\d+)\s*[-:]\s*(.+?)(?:\s*\[(open|closed|merged)\])?/i);
      if (prMatch?.[1] && prMatch[2]) {
        const repoMatch = line.match(/(?:in|repo[:\s]+)\s*(\S+\/\S+)/i);
        prs.push({
          number: parseInt(prMatch[1], 10),
          title: prMatch[2].trim(),
          state: (prMatch[3]?.toLowerCase() as 'open' | 'closed' | 'merged') ?? 'open',
          author: '',
          createdAt: '',
          updatedAt: '',
          repo: repoMatch?.[1] ?? '',
          url: '',
        });
      }
    }

    return prs;
  }

  private extractPRFromObject(obj: Record<string, unknown>): GitHubPullRequest | null {
    const number = obj['number'] as number | undefined;
    const title = obj['title'] as string | undefined;
    if (!number && !title) return null;

    const repoUrl = (obj['repository_url'] as string) ?? (obj['html_url'] as string) ?? '';
    const repoMatch =
      repoUrl.match(/repos\/(.+\/.+?)(?:\/|$)/) ?? repoUrl.match(/github\.com\/(.+?\/.+?)(?:\/|$)/);

    let state: 'open' | 'closed' | 'merged' =
      ((obj['state'] as string)?.toLowerCase() as 'open' | 'closed') ?? 'open';
    const mergedAt =
      obj['merged_at'] ??
      (obj['pull_request'] as Record<string, unknown> | undefined)?.['merged_at'];
    if (mergedAt) {
      state = 'merged';
    }

    return {
      number: number ?? 0,
      title: title ?? '',
      state,
      author: ((obj['user'] as Record<string, unknown>)?.['login'] as string) ?? '',
      createdAt: (obj['created_at'] as string) ?? '',
      updatedAt: (obj['updated_at'] as string) ?? '',
      mergedAt: (obj['merged_at'] as string) ?? undefined,
      repo: repoMatch?.[1] ?? '',
      url: (obj['html_url'] as string) ?? '',
      additions: obj['additions'] as number | undefined,
      deletions: obj['deletions'] as number | undefined,
    };
  }
}
