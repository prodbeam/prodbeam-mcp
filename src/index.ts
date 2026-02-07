#!/usr/bin/env node

/**
 * Prodbeam MCP Server for Claude Code
 *
 * Orchestrates GitHub and Jira MCP servers to generate AI-powered reports:
 * - Daily standups
 * - Weekly summaries
 * - Sprint retrospectives
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP Server instance
 */
const server = new Server(
  {
    name: 'prodbeam-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Register available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'generate_daily_report',
        description:
          'Generate a daily standup report from the last 24 hours of activity (commits, PRs, reviews, Jira issues)',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'generate_weekly_report',
        description: 'Generate a weekly summary report with team metrics and insights',
        inputSchema: {
          type: 'object',
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
          type: 'object',
          properties: {
            sprint: {
              type: 'string',
              description: 'Sprint name (e.g., "Sprint 42")',
            },
            from: {
              type: 'string',
              description: 'Start date (ISO format: YYYY-MM-DD)',
            },
            to: {
              type: 'string',
              description: 'End date (ISO format: YYYY-MM-DD)',
            },
          },
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
      case 'generate_daily_report':
        return await handleDailyReport();

      case 'generate_weekly_report':
        return await handleWeeklyReport(args?.team as boolean);

      case 'generate_retrospective':
        return await handleRetrospective(
          args?.sprint as string,
          args?.from as string,
          args?.to as string
        );

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Generate daily standup report
 */
async function handleDailyReport() {
  // TODO: Phase 1 implementation
  // 1. Connect to GitHub MCP
  // 2. Fetch commits from last 24h
  // 3. Fetch PRs from last 24h
  // 4. Fetch reviews from last 24h
  // 5. Connect to Jira MCP (if available)
  // 6. Fetch Jira issues from last 24h
  // 7. Generate AI report with Anthropic Claude
  // 8. Return formatted report

  return {
    content: [
      {
        type: 'text',
        text: `# Daily Standup - ${new Date().toLocaleDateString()}

🚧 **Coming Soon!**

This feature is under development. Expected completion: February 2026.

For now, you can:
1. Star the repo: https://github.com/prodbeam/claude-mcp
2. Email beta@prodbeam.com for early access
3. Follow progress at https://prodbeam.com/claude-plugin`,
      },
    ],
  };
}

/**
 * Generate weekly summary report
 */
async function handleWeeklyReport(team: boolean) {
  // TODO: Phase 2 implementation
  const reportType = team ? 'Team Weekly Summary' : 'Personal Weekly Summary';

  return {
    content: [
      {
        type: 'text',
        text: `# ${reportType}

🚧 **Coming Soon!**

This feature is under development. Expected completion: March 2026.`,
      },
    ],
  };
}

/**
 * Generate sprint retrospective
 */
async function handleRetrospective(sprint?: string, from?: string, to?: string) {
  // TODO: Phase 3 implementation
  const sprintName = sprint || 'Current Sprint';

  return {
    content: [
      {
        type: 'text',
        text: `# Sprint Retrospective: ${sprintName}

🚧 **Coming Soon!**

This feature is under development. Expected completion: March 2026.

Dates: ${from || 'TBD'} to ${to || 'TBD'}`,
      },
    ],
  };
}

/**
 * Start the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error('Prodbeam MCP server started successfully');
}

// Run the server
main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
