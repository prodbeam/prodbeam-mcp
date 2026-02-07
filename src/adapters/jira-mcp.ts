/**
 * Jira MCP Adapter
 *
 * Connects to a Jira MCP server as a subprocess and fetches issue data.
 * Optional integration - the plugin works without Jira.
 *
 * Required env vars: JIRA_API_TOKEN, JIRA_EMAIL, JIRA_URL
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { JiraActivity, JiraIssue } from '../types/jira.js';
import type { MCPToolResponse } from '../types/github.js';

export class JiraMCPAdapter {
  private client: Client | null = null;
  private connected = false;

  /**
   * Check if Jira integration is configured
   */
  static isConfigured(): boolean {
    return Boolean(
      process.env['JIRA_API_TOKEN'] && process.env['JIRA_EMAIL'] && process.env['JIRA_URL']
    );
  }

  /**
   * Connect to the Jira MCP server subprocess
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const token = process.env['JIRA_API_TOKEN'];
    const email = process.env['JIRA_EMAIL'];
    const url = process.env['JIRA_URL'];

    if (!token || !email || !url) {
      throw new Error(
        'Jira MCP not configured. Required env vars: JIRA_API_TOKEN, JIRA_EMAIL, JIRA_URL'
      );
    }

    try {
      this.client = new Client(
        { name: 'prodbeam-jira-adapter', version: '0.1.0' },
        { capabilities: {} }
      );

      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@anthropic-ai/mcp-server-atlassian'],
        env: {
          ...process.env,
          JIRA_API_TOKEN: token,
          JIRA_EMAIL: email,
          JIRA_URL: url,
        } as Record<string, string>,
      });

      await this.client.connect(transport);
      this.connected = true;
      console.error('[prodbeam] Connected to Jira MCP server');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to connect to Jira MCP: ${message}`);
    }
  }

  /**
   * Disconnect from the Jira MCP server
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
   * Fetch Jira activity for the last N hours
   */
  async fetchActivity(hours = 24): Promise<JiraActivity> {
    if (!this.connected || !this.client) {
      throw new Error('Not connected to Jira MCP. Call connect() first.');
    }

    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const sinceDate = from.toISOString().split('T')[0] ?? '';

    try {
      const result = (await this.client.callTool({
        name: 'jira_search_issues',
        arguments: {
          jql: `assignee = currentUser() AND updated >= "${sinceDate}" ORDER BY updated DESC`,
          maxResults: 20,
        },
      })) as MCPToolResponse;

      const issues = this.parseIssues(result);
      return {
        issues,
        timeRange: {
          from: from.toISOString(),
          to: now.toISOString(),
        },
      };
    } catch (error) {
      console.error('[prodbeam] Error fetching Jira issues:', error);
      return {
        issues: [],
        timeRange: {
          from: from.toISOString(),
          to: now.toISOString(),
        },
      };
    }
  }

  /**
   * Check if Jira MCP is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }

  // --- Parsers ---

  private extractText(response: MCPToolResponse): string {
    if (!response.content || response.content.length === 0) {
      return '';
    }
    return response.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text ?? '')
      .join('\n');
  }

  private parseIssues(response: MCPToolResponse): JiraIssue[] {
    const text = this.extractText(response);
    if (!text) return [];

    const issues: JiraIssue[] = [];

    // Try JSON parsing first
    try {
      const data = JSON.parse(text) as unknown;
      const items = Array.isArray(data)
        ? data
        : (((data as Record<string, unknown>)['issues'] as unknown[]) ?? []);

      for (const item of items) {
        const issue = this.extractIssueFromObject(item as Record<string, unknown>);
        if (issue) issues.push(issue);
      }
      return issues;
    } catch {
      // Not JSON, try text parsing
    }

    // Parse markdown/text format
    // Common format: "PROJ-123: Summary [Status]"
    const lines = text.split('\n');
    for (const line of lines) {
      const issueMatch = line.match(/([A-Z]+-\d+)\s*[-:]\s*(.+?)(?:\s*\[(.+?)\])?$/);
      if (issueMatch?.[1] && issueMatch[2]) {
        issues.push({
          key: issueMatch[1],
          summary: issueMatch[2].trim(),
          status: issueMatch[3] ?? 'Unknown',
          priority: '',
          assignee: '',
          issueType: '',
          updatedAt: '',
          url: '',
        });
      }
    }

    return issues;
  }

  private extractIssueFromObject(obj: Record<string, unknown>): JiraIssue | null {
    const key = obj['key'] as string | undefined;
    const fields = obj['fields'] as Record<string, unknown> | undefined;

    if (!key) return null;

    const jiraUrl = process.env['JIRA_URL'] ?? '';
    return {
      key,
      summary: (fields?.['summary'] as string) ?? '',
      status: ((fields?.['status'] as Record<string, unknown>)?.['name'] as string) ?? '',
      priority: ((fields?.['priority'] as Record<string, unknown>)?.['name'] as string) ?? '',
      assignee:
        ((fields?.['assignee'] as Record<string, unknown>)?.['displayName'] as string) ?? '',
      issueType: ((fields?.['issuetype'] as Record<string, unknown>)?.['name'] as string) ?? '',
      updatedAt: (fields?.['updated'] as string) ?? '',
      url: jiraUrl ? `${jiraUrl}/browse/${key}` : '',
    };
  }
}
