#!/usr/bin/env node

/**
 * Prodbeam MCP Server for Claude Code
 *
 * Orchestrates GitHub and Jira MCP servers to generate AI-powered reports:
 * - Daily standups
 * - Weekly summaries (Phase 2)
 * - Sprint retrospectives (Phase 3)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GitHubMCPAdapter } from './adapters/github-mcp.js';
import { JiraMCPAdapter } from './adapters/jira-mcp.js';
import { generateDailyReport, isAIConfigured } from './generators/report-generator.js';

const server = new Server(
  { name: 'prodbeam-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

/**
 * Register available tools
 */
server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: [
      {
        name: 'generate_daily_report',
        description:
          'Generate a daily standup report from the last 24 hours of GitHub activity (commits, PRs, reviews) and Jira issues',
        inputSchema: {
          type: 'object' as const,
          properties: {
            hours: {
              type: 'number',
              description: 'Number of hours to look back (default: 24)',
              default: 24,
            },
          },
          required: [],
        },
      },
      {
        name: 'generate_weekly_report',
        description: 'Generate a weekly summary report with metrics and insights',
        inputSchema: {
          type: 'object' as const,
          properties: {
            team: {
              type: 'boolean',
              description: 'Generate team-wide report (true) or personal report (false)',
              default: false,
            },
          },
          required: [],
        },
      },
      {
        name: 'generate_retrospective',
        description: 'Generate a sprint retrospective report with AI-powered analysis',
        inputSchema: {
          type: 'object' as const,
          properties: {
            sprint: {
              type: 'string',
              description: 'Sprint name (e.g., "Sprint 42")',
            },
            from: {
              type: 'string',
              description: 'Start date (YYYY-MM-DD)',
            },
            to: {
              type: 'string',
              description: 'End date (YYYY-MM-DD)',
            },
          },
          required: [],
        },
      },
      {
        name: 'setup_check',
        description:
          'Check which integrations are configured and provide setup instructions for missing ones',
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
    ],
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'generate_daily_report': {
        const hours = typeof args?.['hours'] === 'number' ? args['hours'] : 24;
        return await handleDailyReport(hours);
      }

      case 'generate_weekly_report': {
        const team = typeof args?.['team'] === 'boolean' ? args['team'] : false;
        return handleWeeklyReport(team);
      }

      case 'generate_retrospective': {
        const sprint = typeof args?.['sprint'] === 'string' ? args['sprint'] : undefined;
        const from = typeof args?.['from'] === 'string' ? args['from'] : undefined;
        const to = typeof args?.['to'] === 'string' ? args['to'] : undefined;
        return handleRetrospective(sprint, from, to);
      }

      case 'setup_check':
        return handleSetupCheck();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text' as const, text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

/**
 * Generate daily standup report
 */
async function handleDailyReport(hours: number) {
  // Check if GitHub is configured
  if (!GitHubMCPAdapter.isConfigured()) {
    return {
      content: [
        {
          type: 'text' as const,
          text: buildSetupInstructions(
            'GitHub is not configured. Run the setup_check tool for instructions.'
          ),
        },
      ],
    };
  }

  const github = new GitHubMCPAdapter();
  let jira: JiraMCPAdapter | null = null;

  try {
    // Connect to GitHub MCP
    await github.connect();
    const githubActivity = await github.fetchActivity(hours);

    // Connect to Jira MCP (optional)
    let jiraActivity = undefined;
    if (JiraMCPAdapter.isConfigured()) {
      try {
        jira = new JiraMCPAdapter();
        await jira.connect();
        jiraActivity = await jira.fetchActivity(hours);
      } catch (error) {
        console.error('[prodbeam] Jira connection failed (continuing without Jira):', error);
      }
    }

    // Generate report
    const report = await generateDailyReport({
      github: githubActivity,
      jira: jiraActivity,
    });

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text' as const,
          text: `# Daily Report - Error\n\nFailed to generate report: ${errorMessage}\n\nRun the setup_check tool to verify your configuration.`,
        },
      ],
    };
  } finally {
    await github.disconnect();
    if (jira) {
      await jira.disconnect();
    }
  }
}

/**
 * Generate weekly summary report (Phase 2)
 */
function handleWeeklyReport(team: boolean) {
  const reportType = team ? 'Team Weekly Summary' : 'Personal Weekly Summary';
  return {
    content: [
      {
        type: 'text' as const,
        text: `# ${reportType}\n\nThis feature is under development (Phase 2).\n\nUse generate_daily_report for current functionality.`,
      },
    ],
  };
}

/**
 * Generate sprint retrospective (Phase 3)
 */
function handleRetrospective(sprint?: string, from?: string, to?: string) {
  const sprintName = sprint ?? 'Current Sprint';
  const dateRange = from && to ? `${from} to ${to}` : 'dates not specified';

  return {
    content: [
      {
        type: 'text' as const,
        text: `# Sprint Retrospective: ${sprintName}\n\nDate range: ${dateRange}\n\nThis feature is under development (Phase 3).\n\nUse generate_daily_report for current functionality.`,
      },
    ],
  };
}

/**
 * Check setup status and provide instructions
 */
function handleSetupCheck() {
  const sections: string[] = [];
  sections.push('# Prodbeam Setup Status\n');

  // GitHub
  if (GitHubMCPAdapter.isConfigured()) {
    sections.push('## GitHub: Configured');
    sections.push('GITHUB_PERSONAL_ACCESS_TOKEN is set.\n');
  } else {
    sections.push('## GitHub: Not Configured');
    sections.push('GITHUB_PERSONAL_ACCESS_TOKEN is not set.\n');
    sections.push('**To configure:**');
    sections.push('1. Create a GitHub Personal Access Token at https://github.com/settings/tokens');
    sections.push('   - Required scopes: `repo`, `read:user`');
    sections.push('2. Add to your `.claude/mcp.json` under the prodbeam server:');
    sections.push('```json');
    sections.push('"env": {');
    sections.push('  "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-token>"');
    sections.push('}');
    sections.push('```\n');
  }

  // Jira
  if (JiraMCPAdapter.isConfigured()) {
    sections.push('## Jira: Configured');
    sections.push('JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_URL are set.\n');
  } else {
    const hasPartial =
      process.env['JIRA_API_TOKEN'] ?? process.env['JIRA_EMAIL'] ?? process.env['JIRA_URL'];
    sections.push(`## Jira: ${hasPartial ? 'Partially Configured' : 'Not Configured (Optional)'}`);
    sections.push('Jira integration is optional. Reports work with GitHub only.\n');
    sections.push('**To configure:**');
    sections.push('1. Create a Jira API Token at https://id.atlassian.com/manage/api-tokens');
    sections.push('2. Add to your `.claude/mcp.json` under the prodbeam server:');
    sections.push('```json');
    sections.push('"env": {');
    sections.push('  "JIRA_API_TOKEN": "<your-token>",');
    sections.push('  "JIRA_EMAIL": "<your-email>",');
    sections.push('  "JIRA_URL": "https://<company>.atlassian.net"');
    sections.push('}');
    sections.push('```\n');
  }

  // AI
  if (isAIConfigured()) {
    sections.push('## AI Report Generation: Configured');
    sections.push('ANTHROPIC_API_KEY is set. Reports will use AI-powered summaries.\n');
  } else {
    sections.push('## AI Report Generation: Not Configured');
    sections.push('ANTHROPIC_API_KEY is not set. Reports will use raw data format.\n');
    sections.push('**To configure:**');
    sections.push('Add to your `.claude/mcp.json` under the prodbeam server:');
    sections.push('```json');
    sections.push('"env": {');
    sections.push('  "ANTHROPIC_API_KEY": "<your-key>"');
    sections.push('}');
    sections.push('```\n');
  }

  // Summary
  const configured: string[] = [];
  const missing: string[] = [];
  if (GitHubMCPAdapter.isConfigured()) configured.push('GitHub');
  else missing.push('GitHub');
  if (JiraMCPAdapter.isConfigured()) configured.push('Jira');
  if (isAIConfigured()) configured.push('AI');
  else missing.push('AI (optional)');

  sections.push('---');
  sections.push(`**Configured:** ${configured.join(', ') || 'None'}`);
  if (missing.length > 0) {
    sections.push(`**Missing:** ${missing.join(', ')}`);
  }

  const ready = GitHubMCPAdapter.isConfigured();
  sections.push(
    ready
      ? '\nReady to generate reports. Try: generate_daily_report'
      : '\nGitHub token is required to generate reports.'
  );

  return {
    content: [{ type: 'text' as const, text: sections.join('\n') }],
  };
}

/**
 * Build setup instruction text for error responses
 */
function buildSetupInstructions(message: string): string {
  return `${message}\n\nRun the **setup_check** tool for detailed configuration instructions.`;
}

/**
 * Start the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[prodbeam] MCP server started successfully');
}

main().catch((error) => {
  console.error('[prodbeam] Fatal error starting MCP server:', error);
  process.exit(1);
});
