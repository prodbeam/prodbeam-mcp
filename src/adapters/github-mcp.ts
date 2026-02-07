/**
 * GitHub MCP Adapter
 *
 * Connects to the existing GitHub MCP server and fetches activity data.
 * This adapter orchestrates calls to the GitHub MCP tools instead of
 * making direct API calls.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  GitHubActivity,
  GitHubCommit,
  GitHubPullRequest,
  GitHubReview,
} from '../types/github.js';

export class GitHubMCPAdapter {
  private client: Client | null = null;
  private connected = false;

  /**
   * Connect to the GitHub MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Create MCP client
      this.client = new Client(
        {
          name: 'prodbeam-github-adapter',
          version: '0.1.0',
        },
        {
          capabilities: {},
        }
      );

      // Connect to GitHub MCP server via stdio
      // The user's Claude Code already has GitHub MCP configured
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
      });

      await this.client.connect(transport);
      this.connected = true;
      console.error('✓ Connected to GitHub MCP server');
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
      await this.client.close();
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Fetch GitHub activity for the last N hours
   */
  async fetchActivity(hours = 24): Promise<GitHubActivity> {
    if (!this.connected || !this.client) {
      throw new Error('Not connected to GitHub MCP. Call connect() first.');
    }

    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);

    try {
      // Fetch commits, PRs, and reviews in parallel
      const [commits, pullRequests, reviews] = await Promise.all([
        this.fetchCommits(from, now),
        this.fetchPullRequests(from, now),
        this.fetchReviews(from, now),
      ]);

      return {
        commits,
        pullRequests,
        reviews,
        timeRange: {
          from: from.toISOString(),
          to: now.toISOString(),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to fetch GitHub activity: ${message}`);
    }
  }

  /**
   * Fetch commits from the last N hours
   */
  private async fetchCommits(from: Date, to: Date): Promise<GitHubCommit[]> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      // Call GitHub MCP's search_commits tool
      const result = await this.client.callTool({
        name: 'search_commits',
        arguments: {
          since: from.toISOString(),
          until: to.toISOString(),
        },
      });

      // Parse the response and transform to our format
      return this.parseCommits(result);
    } catch (error) {
      console.error('Error fetching commits:', error);
      return [];
    }
  }

  /**
   * Fetch pull requests from the last N hours
   */
  private async fetchPullRequests(
    from: Date,
    to: Date
  ): Promise<GitHubPullRequest[]> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      // Call GitHub MCP's search_pull_requests tool
      const result = await this.client.callTool({
        name: 'search_pull_requests',
        arguments: {
          since: from.toISOString(),
          until: to.toISOString(),
        },
      });

      // Parse the response and transform to our format
      return this.parsePullRequests(result);
    } catch (error) {
      console.error('Error fetching pull requests:', error);
      return [];
    }
  }

  /**
   * Fetch reviews from the last N hours
   */
  private async fetchReviews(from: Date, to: Date): Promise<GitHubReview[]> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      // Call GitHub MCP's search_reviews tool
      const result = await this.client.callTool({
        name: 'search_reviews',
        arguments: {
          since: from.toISOString(),
          until: to.toISOString(),
        },
      });

      // Parse the response and transform to our format
      return this.parseReviews(result);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      return [];
    }
  }

  /**
   * Parse commits from GitHub MCP response
   */
  private parseCommits(result: unknown): GitHubCommit[] {
    // TODO: Implement proper parsing based on actual GitHub MCP response format
    // This is a placeholder implementation
    console.error('Parsing commits:', result);
    return [];
  }

  /**
   * Parse pull requests from GitHub MCP response
   */
  private parsePullRequests(result: unknown): GitHubPullRequest[] {
    // TODO: Implement proper parsing based on actual GitHub MCP response format
    // This is a placeholder implementation
    console.error('Parsing pull requests:', result);
    return [];
  }

  /**
   * Parse reviews from GitHub MCP response
   */
  private parseReviews(result: unknown): GitHubReview[] {
    // TODO: Implement proper parsing based on actual GitHub MCP response format
    // This is a placeholder implementation
    console.error('Parsing reviews:', result);
    return [];
  }

  /**
   * Check if GitHub MCP is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }
}
