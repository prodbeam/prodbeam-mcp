#!/usr/bin/env node

/**
 * Prodbeam MCP Server v2
 *
 * Self-sufficient engineering intelligence server.
 * Fetches its own data from GitHub and Jira APIs.
 * Requires one-time setup: team name + member emails.
 *
 * Tools:
 *   Setup:   setup_team, add_member, remove_member, refresh_config
 *   Reports: standup, team_standup, weekly_summary, sprint_retro
 *   Info:    get_capabilities
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { resolveGitHubCredentials, resolveJiraCredentials } from './config/credentials.js';
import {
  readTeamConfig,
  writeTeamConfig,
  teamConfigExists,
  createDefaultConfig,
} from './config/team-config.js';
import { resolveConfigDir } from './config/paths.js';
import { GitHubClient } from './clients/github-client.js';
import { JiraClient } from './clients/jira-client.js';
import { discoverGitHubTeam } from './discovery/github-discovery.js';
import { discoverJiraTeam } from './discovery/jira-discovery.js';
import {
  fetchGitHubActivityForUser,
  fetchTeamGitHubActivity,
  fetchJiraActivityForUser,
  fetchTeamJiraActivity,
  fetchSprintJiraActivity,
  detectActiveSprint,
} from './orchestrator/data-fetcher.js';
import { dailyTimeRange, weeklyTimeRange, sprintTimeRange } from './orchestrator/time-range.js';
import {
  generateDailyReport,
  generateTeamDailyReport,
  generateWeeklyReport,
  generateRetrospective,
  generateSprintReview,
} from './generators/report-generator.js';
import { HistoryStore } from './history/history-store.js';
import { buildSnapshot } from './history/snapshot-builder.js';
import { analyzeTrends } from './insights/trend-analyzer.js';
import { detectAnomalies } from './insights/anomaly-detector.js';
import { assessTeamHealth } from './insights/team-health.js';
import { resolveThresholds } from './config/thresholds.js';
import type { ReportExtras } from './generators/report-generator.js';
import type { MemberConfig, TeamConfig } from './config/types.js';

const SERVER_INSTRUCTIONS = `Prodbeam is an engineering intelligence server that generates reports from GitHub and Jira data.

Use prodbeam tools when the user asks about:
- Daily standups, what they or their team worked on, yesterday's activity → standup or team_standup
- Weekly engineering summaries, metrics, productivity reports → weekly_summary
- Sprint retrospectives, retros, sprint reviews, sprint health → sprint_retro or sprint_review
- Team setup, adding/removing members, configuration → setup_team, add_member, remove_member
- Refreshing repos/sprints, re-scanning → refresh_config
- What tools are available, credential status → get_capabilities

Common triggers: "standup", "what did I do", "weekly report", "sprint retro", "sprint review", "team activity", "engineering metrics"`;

const server = new Server(
  { name: 'prodbeam', version: '2.0.0' },
  {
    capabilities: { tools: {}, prompts: {} },
    instructions: SERVER_INSTRUCTIONS,
  }
);

// ─── Tool Definitions ────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: [
      // Setup tools
      {
        name: 'setup_team',
        description:
          'One-time team setup. Provide team name and member emails — prodbeam auto-discovers GitHub usernames, Jira accounts, active repos, projects, and sprints.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            teamName: {
              type: 'string' as const,
              description: 'Team name (e.g., "Platform Engineering")',
            },
            emails: {
              type: 'array' as const,
              items: { type: 'string' as const },
              description: 'Email addresses of team members',
            },
          },
          required: ['teamName', 'emails'],
        },
      },
      {
        name: 'add_member',
        description:
          'Add a new member to the team. Provide their email — prodbeam auto-discovers their GitHub and Jira identities.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            email: {
              type: 'string' as const,
              description: 'Email address of the new team member',
            },
          },
          required: ['email'],
        },
      },
      {
        name: 'remove_member',
        description: 'Remove a member from the team by email address.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            email: {
              type: 'string' as const,
              description: 'Email address of the member to remove',
            },
          },
          required: ['email'],
        },
      },
      {
        name: 'refresh_config',
        description:
          'Re-scan repos and sprints for existing team members. Updates team config with newly discovered repos and current sprint info.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
      // Report tools
      {
        name: 'standup',
        description:
          'Generate a personal daily standup report. Fetches your GitHub commits, PRs, reviews, and Jira issues from the last 24 hours. Use when the user asks: "standup", "what did I work on", "my activity", "daily update". Requires team setup.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            email: {
              type: 'string' as const,
              description:
                'Email of the team member (optional — defaults to first member in config)',
            },
          },
        },
      },
      {
        name: 'team_standup',
        description:
          'Generate a full team standup report. Shows per-member activity from the last 24 hours with aggregate stats. Use when the user asks: "team standup", "what did the team do", "team activity", "everyone\'s update".',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
      {
        name: 'weekly_summary',
        description:
          'Generate a weekly engineering summary with metrics, repo breakdown, and Jira stats. Covers the last 7 days by default. Use when the user asks: "weekly summary", "weekly report", "this week\'s metrics", "engineering summary", "productivity report".',
        inputSchema: {
          type: 'object' as const,
          properties: {
            weeksAgo: {
              type: 'number' as const,
              description: 'Offset in weeks (0 = current week, 1 = last week, etc.)',
            },
          },
        },
      },
      {
        name: 'sprint_retro',
        description:
          'Generate a sprint retrospective report with merge time analysis, completion rates, and Jira metrics. Auto-detects the active sprint from Jira. Use when the user asks: "sprint retro", "retrospective", "sprint review meeting", "how did the sprint go".',
        inputSchema: {
          type: 'object' as const,
          properties: {
            sprintName: {
              type: 'string' as const,
              description: 'Sprint name (optional — auto-detects active sprint if not provided)',
            },
          },
        },
      },
      {
        name: 'sprint_review',
        description:
          'Review current sprint progress with deliverables, risks, and developer status. Mid-sprint health check. Use when the user asks: "sprint review", "sprint status", "sprint health", "how is the sprint going", "sprint progress".',
        inputSchema: {
          type: 'object' as const,
          properties: {
            sprintName: {
              type: 'string' as const,
              description: 'Sprint name (optional — auto-detects active sprint if not provided)',
            },
          },
        },
      },
      // Info
      {
        name: 'get_capabilities',
        description: 'Returns available tools, current team config status, and credential status.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
    ],
  };
});

// ─── Prompts ─────────────────────────────────────────────────

const PROMPTS = [
  {
    name: 'standup',
    description: 'Generate your personal daily standup report',
    arguments: [
      {
        name: 'email',
        description: 'Team member email (optional — defaults to first member)',
        required: false,
      },
    ],
  },
  {
    name: 'team-standup',
    description: "Generate the full team's daily standup report",
  },
  {
    name: 'weekly-summary',
    description: 'Generate a weekly engineering summary with metrics',
    arguments: [
      {
        name: 'weeksAgo',
        description: 'Offset in weeks (0 = current, 1 = last week)',
        required: false,
      },
    ],
  },
  {
    name: 'sprint-retro',
    description:
      'Generate a sprint retrospective with what went well, improvements, and action items',
    arguments: [
      {
        name: 'sprintName',
        description: 'Sprint name (optional — auto-detects active sprint)',
        required: false,
      },
    ],
  },
  {
    name: 'sprint-review',
    description: 'Review current sprint progress, deliverables, and risks',
    arguments: [
      {
        name: 'sprintName',
        description: 'Sprint name (optional — auto-detects active sprint)',
        required: false,
      },
    ],
  },
];

server.setRequestHandler(ListPromptsRequestSchema, () => {
  return { prompts: PROMPTS };
});

server.setRequestHandler(GetPromptRequestSchema, (request) => {
  const { name, arguments: promptArgs } = request.params;
  const prompt = PROMPTS.find((p) => p.name === name);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  // Map prompt names to tool calls
  const toolMap: Record<string, { tool: string; argMap: Record<string, string> }> = {
    standup: { tool: 'standup', argMap: { email: 'email' } },
    'team-standup': { tool: 'team_standup', argMap: {} },
    'weekly-summary': { tool: 'weekly_summary', argMap: { weeksAgo: 'weeksAgo' } },
    'sprint-retro': { tool: 'sprint_retro', argMap: { sprintName: 'sprintName' } },
    'sprint-review': { tool: 'sprint_review', argMap: { sprintName: 'sprintName' } },
  };

  const mapping = toolMap[name];
  if (!mapping) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  // Build the tool call arguments
  const toolArgs: Record<string, string> = {};
  if (promptArgs) {
    for (const [promptKey, toolKey] of Object.entries(mapping.argMap)) {
      if (promptArgs[promptKey]) {
        toolArgs[toolKey] = promptArgs[promptKey];
      }
    }
  }

  const argsDescription =
    Object.keys(toolArgs).length > 0 ? ` with ${JSON.stringify(toolArgs)}` : '';

  return {
    description: prompt.description,
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Use the prodbeam ${mapping.tool} tool${argsDescription} to generate the report.`,
        },
      },
    ],
  };
});

// ─── Tool Handlers ───────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'setup_team':
        return await handleSetupTeam(args);
      case 'add_member':
        return await handleAddMember(args);
      case 'remove_member':
        return handleRemoveMember(args);
      case 'refresh_config':
        return await handleRefreshConfig();
      case 'standup':
        return await handleStandup(args);
      case 'team_standup':
        return await handleTeamStandup();
      case 'weekly_summary':
        return await handleWeeklySummary(args);
      case 'sprint_retro':
        return await handleSprintRetro(args);
      case 'sprint_review':
        return await handleSprintReview(args);
      case 'get_capabilities':
        return handleGetCapabilities();
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

// ─── Setup Team ──────────────────────────────────────────────

async function handleSetupTeam(
  args: Record<string, unknown> | undefined
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const teamName = args?.['teamName'];
  const emails = args?.['emails'];

  if (typeof teamName !== 'string' || !teamName.trim()) {
    throw new Error('teamName is required and must be a non-empty string');
  }
  if (!Array.isArray(emails) || emails.length === 0) {
    throw new Error('emails is required and must be a non-empty array of email strings');
  }

  const emailList = emails.filter((e): e is string => typeof e === 'string' && e.includes('@'));
  if (emailList.length === 0) {
    throw new Error('No valid email addresses provided');
  }

  // Start with a scaffold config
  const config = createDefaultConfig(teamName.trim(), emailList);

  const parts: string[] = [];
  parts.push(`# Prodbeam Team Setup`);
  parts.push('');
  parts.push(`**Team:** ${teamName}`);
  parts.push(`**Config directory:** ${resolveConfigDir()}`);
  parts.push('');

  // GitHub discovery
  const ghCreds = resolveGitHubCredentials();
  if (ghCreds) {
    parts.push('## GitHub Discovery');
    parts.push('');

    const ghClient = new GitHubClient(ghCreds.token);
    const ghResult = await discoverGitHubTeam(ghClient, emailList);

    for (const member of ghResult.members) {
      const configMember = config.team.members.find((m) => m.email === member.email);
      if (configMember && member.username) {
        configMember.github = member.username;
        configMember.name = configMember.name ?? member.username;
      }

      const status = member.username ? `@${member.username}` : `not found`;
      const suffix = member.error ? ` (${member.error})` : '';
      parts.push(`- ${member.email} → ${status}${suffix}`);
    }

    if (ghResult.orgs.length > 0) {
      config.github.org = ghResult.orgs[0];
      parts.push('');
      parts.push(`**Orgs:** ${ghResult.orgs.join(', ')}`);
    }

    if (ghResult.repos.length > 0) {
      config.github.repos = ghResult.repos;
      parts.push(`**Active repos (last 90 days):** ${ghResult.repos.length}`);
      for (const repo of ghResult.repos) {
        parts.push(`  - ${repo}`);
      }
    }
    parts.push('');
  } else {
    parts.push('## GitHub Discovery');
    parts.push('');
    parts.push(
      '⚠️ No GitHub credentials found. Set `GITHUB_TOKEN` env var or run setup again after configuring credentials.'
    );
    parts.push('');
  }

  // Jira discovery
  const jiraCreds = resolveJiraCredentials();
  if (jiraCreds) {
    parts.push('## Jira Discovery');
    parts.push('');

    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    const jiraResult = await discoverJiraTeam(jiraClient, emailList, jiraCreds.host);

    config.jira.host = jiraResult.host;

    for (const member of jiraResult.members) {
      const configMember = config.team.members.find((m) => m.email === member.email);
      if (configMember && member.accountId) {
        configMember.jiraAccountId = member.accountId;
        if (!configMember.name && member.displayName) {
          configMember.name = member.displayName;
        }
      }

      const status = member.displayName ?? 'not found';
      const suffix = member.error ? ` (${member.error})` : '';
      parts.push(`- ${member.email} → ${status}${suffix}`);
    }

    if (jiraResult.projects.length > 0) {
      config.jira.projects = jiraResult.projects.map((p) => p.key);
      parts.push('');
      parts.push(
        `**Projects:** ${jiraResult.projects.map((p) => `${p.key} (${p.name})`).join(', ')}`
      );
    }

    if (jiraResult.activeSprints.length > 0) {
      parts.push(`**Active sprints:**`);
      for (const sprint of jiraResult.activeSprints) {
        const dates =
          sprint.startDate && sprint.endDate
            ? ` (${sprint.startDate.split('T')[0]} → ${sprint.endDate.split('T')[0]})`
            : '';
        parts.push(`  - ${sprint.name}${dates}`);
      }
    }
    parts.push('');
  } else {
    parts.push('## Jira Discovery');
    parts.push('');
    parts.push(
      '⚠️ No Jira credentials found. Set `JIRA_HOST`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` env vars or configure credentials.'
    );
    parts.push('');
  }

  // Write config
  writeTeamConfig(config);

  parts.push('---');
  parts.push('');
  parts.push(`✅ Team config written to \`${resolveConfigDir()}/team.json\``);
  parts.push('');
  parts.push('**Generated config:**');
  parts.push('```json');
  parts.push(JSON.stringify(config, null, 2));
  parts.push('```');

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}

// ─── Add Member ──────────────────────────────────────────────

async function handleAddMember(
  args: Record<string, unknown> | undefined
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const email = args?.['email'];
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new Error('A valid email address is required');
  }

  const config = readTeamConfig();
  if (!config) {
    throw new Error('No team config found. Run setup_team first.');
  }

  // Check for duplicate
  if (config.team.members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
    throw new Error(`${email} is already a team member`);
  }

  const newMember: MemberConfig = { email };
  const parts: string[] = [];
  parts.push(`# Add Member: ${email}`);
  parts.push('');

  // GitHub discovery
  const ghCreds = resolveGitHubCredentials();
  if (ghCreds) {
    const ghClient = new GitHubClient(ghCreds.token);
    const username = await ghClient.searchUserByEmail(email);
    if (username) {
      newMember.github = username;
      newMember.name = username;
      parts.push(`GitHub: @${username}`);

      // Discover new repos
      const repos = await ghClient.getRecentRepos(username).catch(() => [] as string[]);
      const newRepos = repos.filter((r) => !config.github.repos.includes(r));
      if (newRepos.length > 0) {
        config.github.repos.push(...newRepos);
        parts.push(`New repos discovered: ${newRepos.join(', ')}`);
      }
    } else {
      parts.push(`GitHub: not found for ${email}`);
    }
  }

  // Jira discovery
  const jiraCreds = resolveJiraCredentials();
  if (jiraCreds) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    const user = await jiraClient.searchUserByEmail(email);
    if (user) {
      newMember.jiraAccountId = user.accountId;
      if (!newMember.name) {
        newMember.name = user.displayName;
      }
      parts.push(`Jira: ${user.displayName} (${user.accountId})`);
    } else {
      parts.push(`Jira: not found for ${email}`);
    }
  }

  config.team.members.push(newMember);
  writeTeamConfig(config);

  parts.push('');
  parts.push(`✅ Added ${newMember.name ?? email} to team "${config.team.name}"`);
  parts.push(`Team now has ${config.team.members.length} members.`);

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}

// ─── Remove Member ───────────────────────────────────────────

function handleRemoveMember(args: Record<string, unknown> | undefined): {
  content: Array<{ type: 'text'; text: string }>;
} {
  const email = args?.['email'];
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new Error('A valid email address is required');
  }

  const config = readTeamConfig();
  if (!config) {
    throw new Error('No team config found. Run setup_team first.');
  }

  const index = config.team.members.findIndex((m) => m.email.toLowerCase() === email.toLowerCase());
  if (index === -1) {
    throw new Error(`${email} is not a team member`);
  }

  const removed = config.team.members[index];
  config.team.members.splice(index, 1);

  if (config.team.members.length === 0) {
    throw new Error('Cannot remove the last team member. Delete the config file instead.');
  }

  writeTeamConfig(config);

  return {
    content: [
      {
        type: 'text',
        text: `Removed ${removed?.name ?? email} from team "${config.team.name}"\nTeam now has ${config.team.members.length} members.`,
      },
    ],
  };
}

// ─── Refresh Config ──────────────────────────────────────────

async function handleRefreshConfig(): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  const config = readTeamConfig();
  if (!config) {
    throw new Error('No team config found. Run setup_team first.');
  }

  const parts: string[] = [];
  parts.push('# Config Refresh');
  parts.push('');

  const emails = config.team.members.map((m) => m.email);

  // Re-run GitHub discovery
  const ghCreds = resolveGitHubCredentials();
  if (ghCreds) {
    const ghClient = new GitHubClient(ghCreds.token);
    const ghResult = await discoverGitHubTeam(ghClient, emails);

    // Update member GitHub usernames
    for (const member of ghResult.members) {
      const configMember = config.team.members.find((m) => m.email === member.email);
      if (configMember && member.username) {
        configMember.github = member.username;
      }
    }

    // Find new repos
    const previousRepos = new Set(config.github.repos);
    const newRepos = ghResult.repos.filter((r) => !previousRepos.has(r));
    if (newRepos.length > 0) {
      config.github.repos = ghResult.repos;
      parts.push(`**New repos discovered:** ${newRepos.join(', ')}`);
    } else {
      parts.push(`**Repos:** no changes (${config.github.repos.length} tracked)`);
    }

    if (ghResult.orgs.length > 0) {
      config.github.org = ghResult.orgs[0];
    }
  }

  // Re-run Jira discovery
  const jiraCreds = resolveJiraCredentials();
  if (jiraCreds) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    const jiraResult = await discoverJiraTeam(jiraClient, emails, jiraCreds.host);

    // Update member Jira accounts
    for (const member of jiraResult.members) {
      const configMember = config.team.members.find((m) => m.email === member.email);
      if (configMember && member.accountId) {
        configMember.jiraAccountId = member.accountId;
        if (!configMember.name && member.displayName) {
          configMember.name = member.displayName;
        }
      }
    }

    // Update projects
    const newProjects = jiraResult.projects.map((p) => p.key);
    config.jira.projects = newProjects;

    if (jiraResult.activeSprints.length > 0) {
      parts.push(`**Active sprints:**`);
      for (const sprint of jiraResult.activeSprints) {
        parts.push(`  - ${sprint.name} [${sprint.state}]`);
      }
    }
  }

  writeTeamConfig(config);

  parts.push('');
  parts.push(`✅ Config refreshed at \`${resolveConfigDir()}/team.json\``);

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}

// ─── Standup (Personal) ─────────────────────────────────────

async function handleStandup(
  args: Record<string, unknown> | undefined
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const config = requireTeamConfig();
  const email = typeof args?.['email'] === 'string' ? args['email'] : undefined;
  const member = resolveMember(config, email);

  if (!member.github) {
    throw new Error(`No GitHub username for ${member.email}. Run refresh_config to re-discover.`);
  }

  const timeRange = dailyTimeRange();
  const ghCreds = resolveGitHubCredentials();

  if (!ghCreds) {
    throw new Error('GitHub credentials required. Set GITHUB_TOKEN env var.');
  }

  const ghClient = new GitHubClient(ghCreds.token);
  const github = await fetchGitHubActivityForUser(
    ghClient,
    member.github,
    config.github.repos,
    timeRange
  );

  // Jira (optional)
  let jira;
  const jiraCreds = resolveJiraCredentials();
  if (jiraCreds && member.jiraAccountId) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    jira = await fetchJiraActivityForUser(
      jiraClient,
      member.jiraAccountId,
      config.jira.projects,
      timeRange
    );
  }

  const report = generateDailyReport({ github, jira });
  return { content: [{ type: 'text', text: report }] };
}

// ─── Team Standup ───────────────────────────────────────────

async function handleTeamStandup(): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  const config = requireTeamConfig();
  const ghCreds = resolveGitHubCredentials();

  if (!ghCreds) {
    throw new Error('GitHub credentials required. Set GITHUB_TOKEN env var.');
  }

  const timeRange = dailyTimeRange();
  const ghClient = new GitHubClient(ghCreds.token);
  const jiraCreds = resolveJiraCredentials();
  const jiraClient = jiraCreds
    ? new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken)
    : null;

  // Get GitHub usernames for all members
  const membersWithGH = config.team.members.filter((m) => m.github);
  const usernames = membersWithGH.map((m) => m.github!);

  // Fetch all GitHub activity at once, split by member
  const ghActivities = await fetchTeamGitHubActivity(
    ghClient,
    usernames,
    config.github.repos,
    timeRange
  );

  // Build per-member activities
  const memberActivities: Array<{
    github: (typeof ghActivities)[0];
    jira?: Awaited<ReturnType<typeof fetchJiraActivityForUser>>;
  }> = [];

  for (let i = 0; i < membersWithGH.length; i++) {
    const member = membersWithGH[i]!;
    const github = ghActivities[i]!;

    let jira;
    if (jiraClient && member.jiraAccountId) {
      jira = await fetchJiraActivityForUser(
        jiraClient,
        member.jiraAccountId,
        config.jira.projects,
        timeRange
      );
    }

    memberActivities.push({ github, jira });
  }

  const report = generateTeamDailyReport(memberActivities, config.team.name);
  return { content: [{ type: 'text', text: report }] };
}

// ─── Weekly Summary ─────────────────────────────────────────

async function handleWeeklySummary(
  args: Record<string, unknown> | undefined
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const config = requireTeamConfig();
  const ghCreds = resolveGitHubCredentials();

  if (!ghCreds) {
    throw new Error('GitHub credentials required. Set GITHUB_TOKEN env var.');
  }

  const weeksAgo = typeof args?.['weeksAgo'] === 'number' ? args['weeksAgo'] : 0;
  const timeRange = weeklyTimeRange(weeksAgo);
  const ghClient = new GitHubClient(ghCreds.token);

  // Aggregate all team members' activity into one GitHubActivity
  const membersWithGH = config.team.members.filter((m) => m.github);
  const usernames = membersWithGH.map((m) => m.github!);

  const perMember = await fetchTeamGitHubActivity(
    ghClient,
    usernames,
    config.github.repos,
    timeRange
  );

  // Merge into a single aggregated GitHubActivity
  const github = mergeGitHubActivities(perMember, config.team.name, timeRange);

  // Jira (optional)
  let jira;
  const jiraCreds = resolveJiraCredentials();
  if (jiraCreds) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    jira = await fetchTeamJiraActivity(jiraClient, config.jira.projects, timeRange);
  }

  // Intelligence: snapshot, trends, anomalies, health
  const snapshot = buildSnapshot({
    teamName: config.team.name,
    snapshotType: 'weekly',
    periodStart: timeRange.from,
    periodEnd: timeRange.to,
    github,
    jira,
  });

  const thresholds = resolveThresholds(config.settings.thresholds);
  const extras: ReportExtras = {};
  try {
    const store = new HistoryStore();
    const previous = store.getPreviousSnapshot('weekly', timeRange.to);
    const history = store.getWeeklyHistory(5);
    extras.trends = analyzeTrends(snapshot, previous, thresholds);
    extras.anomalies = detectAnomalies({
      pullRequests: github.pullRequests,
      reviews: github.reviews,
      jiraIssues: jira?.issues ?? [],
      memberActivity: buildMemberActivity(perMember),
      thresholds,
    });
    extras.health = assessTeamHealth({
      current: snapshot,
      history,
      memberSnapshots: buildMemberSnapshots(perMember),
      thresholds,
    });
    store.saveSnapshot(snapshot);
    store.close();
  } catch {
    // Intelligence is best-effort — don't fail the report if DB has issues
  }

  const report = generateWeeklyReport({ github, jira, perMember }, extras);
  return { content: [{ type: 'text', text: report }] };
}

// ─── Sprint Retro ───────────────────────────────────────────

async function handleSprintRetro(
  args: Record<string, unknown> | undefined
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const config = requireTeamConfig();
  const ghCreds = resolveGitHubCredentials();
  const jiraCreds = resolveJiraCredentials();

  if (!ghCreds) {
    throw new Error('GitHub credentials required. Set GITHUB_TOKEN env var.');
  }

  let sprintName = typeof args?.['sprintName'] === 'string' ? args['sprintName'] : undefined;
  let timeRange;
  let sprintGoal: string | undefined;

  // Detect sprint from Jira if not provided
  if (!sprintName && jiraCreds) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    const activeSprint = await detectActiveSprint(jiraClient, config.jira.projects);
    if (activeSprint) {
      sprintName = activeSprint.name;
      sprintGoal = activeSprint.goal;
      timeRange = sprintTimeRange(activeSprint.startDate, activeSprint.endDate);
    }
  }

  if (!sprintName) {
    throw new Error(
      'No active sprint detected. Provide a sprintName parameter or ensure Jira credentials are configured.'
    );
  }

  // Default time range to last 2 weeks if sprint dates not available
  if (!timeRange) {
    timeRange = weeklyTimeRange(0);
    // Extend to 2 weeks for a typical sprint
    const from = new Date(new Date(timeRange.to).getTime() - 14 * 24 * 60 * 60 * 1000);
    timeRange = { from: from.toISOString(), to: timeRange.to };
  }

  const ghClient = new GitHubClient(ghCreds.token);
  const membersWithGH = config.team.members.filter((m) => m.github);
  const usernames = membersWithGH.map((m) => m.github!);

  const perMember = await fetchTeamGitHubActivity(
    ghClient,
    usernames,
    config.github.repos,
    timeRange
  );

  const github = mergeGitHubActivities(perMember, config.team.name, timeRange);

  // Jira sprint data
  let jira;
  if (jiraCreds) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    jira = await fetchSprintJiraActivity(jiraClient, sprintName, timeRange);
  }

  const dateRange = {
    from: timeRange.from.split('T')[0]!,
    to: timeRange.to.split('T')[0]!,
  };

  // Intelligence: snapshot, trends, anomalies, health
  const snapshot = buildSnapshot({
    teamName: config.team.name,
    snapshotType: 'sprint',
    periodStart: timeRange.from,
    periodEnd: timeRange.to,
    sprintName,
    github,
    jira,
  });

  const thresholds = resolveThresholds(config.settings.thresholds);
  const extras: ReportExtras = {};
  try {
    const store = new HistoryStore();
    const previous = store.getPreviousSnapshot('sprint', timeRange.to);
    const history = store.getSprintHistory(5);
    extras.trends = analyzeTrends(snapshot, previous, thresholds);
    extras.anomalies = detectAnomalies({
      pullRequests: github.pullRequests,
      reviews: github.reviews,
      jiraIssues: jira?.issues ?? [],
      memberActivity: buildMemberActivity(perMember),
      thresholds,
    });
    extras.health = assessTeamHealth({
      current: snapshot,
      history,
      memberSnapshots: buildMemberSnapshots(perMember),
      thresholds,
    });
    store.saveSnapshot(snapshot);
    store.close();
  } catch {
    // Intelligence is best-effort — don't fail the report if DB has issues
  }

  const report = generateRetrospective(
    { github, jira, sprintName, dateRange, sprintGoal, perMember },
    extras
  );
  return { content: [{ type: 'text', text: report }] };
}

// ─── Sprint Review ──────────────────────────────────────────

async function handleSprintReview(
  args: Record<string, unknown> | undefined
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const config = requireTeamConfig();
  const ghCreds = resolveGitHubCredentials();
  const jiraCreds = resolveJiraCredentials();

  if (!ghCreds) {
    throw new Error('GitHub credentials required. Set GITHUB_TOKEN env var.');
  }

  let sprintName = typeof args?.['sprintName'] === 'string' ? args['sprintName'] : undefined;
  let timeRange;
  let sprintGoal: string | undefined;
  let sprintStartDate: string | undefined;
  let sprintEndDate: string | undefined;

  // Detect sprint from Jira if not provided
  if (!sprintName && jiraCreds) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    const activeSprint = await detectActiveSprint(jiraClient, config.jira.projects);
    if (activeSprint) {
      sprintName = activeSprint.name;
      sprintGoal = activeSprint.goal;
      sprintStartDate = activeSprint.startDate;
      sprintEndDate = activeSprint.endDate;
      timeRange = sprintTimeRange(activeSprint.startDate, activeSprint.endDate);
    }
  }

  if (!sprintName) {
    throw new Error(
      'No active sprint detected. Provide a sprintName parameter or ensure Jira credentials are configured.'
    );
  }

  if (!timeRange) {
    timeRange = weeklyTimeRange(0);
    const from = new Date(new Date(timeRange.to).getTime() - 14 * 24 * 60 * 60 * 1000);
    timeRange = { from: from.toISOString(), to: timeRange.to };
  }

  const ghClient = new GitHubClient(ghCreds.token);
  const membersWithGH = config.team.members.filter((m) => m.github);
  const usernames = membersWithGH.map((m) => m.github!);

  const perMember = await fetchTeamGitHubActivity(
    ghClient,
    usernames,
    config.github.repos,
    timeRange
  );

  const github = mergeGitHubActivities(perMember, config.team.name, timeRange);

  let jira;
  if (jiraCreds) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    jira = await fetchSprintJiraActivity(jiraClient, sprintName, timeRange);
  }

  const dateRange = {
    from: timeRange.from.split('T')[0]!,
    to: timeRange.to.split('T')[0]!,
  };

  // Calculate sprint days
  const now = new Date();
  const start = sprintStartDate ? new Date(sprintStartDate) : new Date(timeRange.from);
  const end = sprintEndDate ? new Date(sprintEndDate) : new Date(timeRange.to);
  const daysElapsed = Math.max(
    0,
    Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );
  const daysTotal = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Intelligence
  const thresholds = resolveThresholds(config.settings.thresholds);
  const extras: ReportExtras = {};
  try {
    const store = new HistoryStore();
    extras.anomalies = detectAnomalies({
      pullRequests: github.pullRequests,
      reviews: github.reviews,
      jiraIssues: jira?.issues ?? [],
      memberActivity: buildMemberActivity(perMember),
      thresholds,
    });
    store.close();
  } catch {
    // Intelligence is best-effort
  }

  const report = generateSprintReview(
    { github, jira, sprintName, dateRange, sprintGoal, perMember, daysElapsed, daysTotal },
    extras
  );
  return { content: [{ type: 'text', text: report }] };
}

// ─── Shared Helpers ─────────────────────────────────────────

/**
 * Read and validate team config, throwing a helpful error if missing.
 */
function requireTeamConfig(): TeamConfig {
  const config = readTeamConfig();
  if (!config) {
    throw new Error('No team config found. Run setup_team first.');
  }
  return config;
}

/**
 * Resolve which team member to generate a report for.
 * If email provided, find that member. Otherwise use the first member.
 */
function resolveMember(config: TeamConfig, email?: string): MemberConfig {
  if (email) {
    const member = config.team.members.find((m) => m.email.toLowerCase() === email.toLowerCase());
    if (!member) {
      throw new Error(`${email} is not a team member. Check your config.`);
    }
    return member;
  }

  const first = config.team.members[0];
  if (!first) {
    throw new Error('No team members configured.');
  }
  return first;
}

/**
 * Merge multiple per-member GitHubActivity objects into one aggregate.
 */
function mergeGitHubActivities(
  activities: Array<{
    username: string;
    commits: {
      sha: string;
      message: string;
      author: string;
      date: string;
      repo: string;
      url: string;
    }[];
    pullRequests: {
      number: number;
      title: string;
      state: 'open' | 'closed' | 'merged';
      author: string;
      createdAt: string;
      updatedAt: string;
      mergedAt?: string;
      repo: string;
      url: string;
      additions?: number;
      deletions?: number;
    }[];
    reviews: {
      pullRequestNumber: number;
      pullRequestTitle: string;
      author: string;
      state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
      submittedAt: string;
      repo: string;
    }[];
    timeRange: { from: string; to: string };
  }>,
  teamName: string,
  timeRange: { from: string; to: string }
) {
  return {
    username: teamName,
    commits: activities.flatMap((a) => a.commits),
    pullRequests: activities.flatMap((a) => a.pullRequests),
    reviews: activities.flatMap((a) => a.reviews),
    timeRange,
  };
}

/**
 * Convert per-member GitHubActivity into anomaly detector input format.
 */
function buildMemberActivity(
  perMember: Array<{
    username: string;
    commits: { sha: string }[];
    pullRequests: { author: string; additions?: number; deletions?: number }[];
    reviews: { author: string }[];
  }>
) {
  return perMember.map((m) => ({
    username: m.username,
    commits: m.commits.length,
    prsAuthored: m.pullRequests.length,
    reviewsGiven: m.reviews.length,
    additions: m.pullRequests.reduce((sum, pr) => sum + (pr.additions ?? 0), 0),
    deletions: m.pullRequests.reduce((sum, pr) => sum + (pr.deletions ?? 0), 0),
  }));
}

/**
 * Convert per-member GitHubActivity into MemberSnapshot format for team health.
 */
function buildMemberSnapshots(
  perMember: Array<{
    username: string;
    commits: { sha: string }[];
    pullRequests: { state: string; additions?: number; deletions?: number }[];
    reviews: { author: string }[];
  }>
) {
  return perMember.map((m) => ({
    memberGithub: m.username,
    commits: m.commits.length,
    prs: m.pullRequests.length,
    prsMerged: m.pullRequests.filter((pr) => pr.state === 'merged').length,
    reviewsGiven: m.reviews.length,
    additions: m.pullRequests.reduce((sum, pr) => sum + (pr.additions ?? 0), 0),
    deletions: m.pullRequests.reduce((sum, pr) => sum + (pr.deletions ?? 0), 0),
    jiraCompleted: 0,
  }));
}

// ─── Get Capabilities ────────────────────────────────────────

function handleGetCapabilities(): { content: Array<{ type: 'text'; text: string }> } {
  const configExists = teamConfigExists();
  const config = configExists ? readTeamConfig() : null;
  const ghCreds = resolveGitHubCredentials();
  const jiraCreds = resolveJiraCredentials();

  const parts: string[] = [];
  parts.push('# Prodbeam MCP v2');
  parts.push('');

  // Status
  parts.push('## Status');
  parts.push('');
  parts.push(`| Component | Status |`);
  parts.push(`|-----------|--------|`);
  parts.push(`| Config directory | \`${resolveConfigDir()}\` |`);
  parts.push(
    `| Team config | ${configExists ? `✅ ${config?.team.name} (${config?.team.members.length} members)` : '❌ Not configured'} |`
  );
  parts.push(`| GitHub credentials | ${ghCreds ? '✅ Token configured' : '❌ Not configured'} |`);
  parts.push(
    `| Jira credentials | ${jiraCreds ? `✅ ${jiraCreds.host}` : '❌ Not configured (optional)'} |`
  );
  parts.push('');

  // Setup guidance when things are missing
  if (!ghCreds || !configExists) {
    parts.push('## Getting Started');
    parts.push('');
    renderSetupGuide(parts, { ghCreds: !!ghCreds, jiraCreds: !!jiraCreds, configExists });
  }

  if (config) {
    parts.push('## Team');
    parts.push('');
    for (const m of config.team.members) {
      const gh = m.github ? `@${m.github}` : 'no GitHub';
      const jira = m.jiraAccountId ? '✅ Jira' : 'no Jira';
      parts.push(`- ${m.name ?? m.email} (${gh}, ${jira})`);
    }
    parts.push('');
    parts.push(`**Repos:** ${config.github.repos.join(', ') || 'none'}`);
    parts.push(`**Jira projects:** ${config.jira.projects.join(', ') || 'none'}`);
    parts.push('');
  }

  // Thresholds
  parts.push('## Intelligence Thresholds');
  parts.push('');
  const t = resolveThresholds(config?.settings.thresholds);
  parts.push(`| Threshold | Value |`);
  parts.push(`|-----------|-------|`);
  parts.push(`| Stale PR warning | ${t.stalePrWarningDays}d |`);
  parts.push(`| Stale PR alert | ${t.stalePrAlertDays}d |`);
  parts.push(`| Stale issue | ${t.staleIssueDays}d |`);
  parts.push(`| Review imbalance | ${Math.round(t.reviewImbalanceThreshold * 100)}% |`);
  parts.push(`| High churn multiplier | ${t.highChurnMultiplier}x avg |`);
  parts.push(`| High churn minimum | ${t.highChurnMinimum} lines |`);
  parts.push(`| Trend alert | ${t.trendAlertPercent}% change |`);
  parts.push(`| Trend warning | ${t.trendWarningPercent}% change |`);
  parts.push(`| Merge time warning | ${t.mergeTimeWarningH}h |`);
  parts.push(`| Merge time alert | ${t.mergeTimeAlertH}h |`);
  parts.push('');

  // Tools
  parts.push('## Available Tools');
  parts.push('');
  parts.push('### Setup');
  parts.push('- **setup_team** — One-time setup with team name + member emails');
  parts.push('- **add_member** — Add a member by email');
  parts.push('- **remove_member** — Remove a member by email');
  parts.push('- **refresh_config** — Re-scan repos and sprints');
  parts.push('');
  parts.push('### Reports');
  parts.push('- **standup** — Personal daily standup (last 24h)');
  parts.push('- **team_standup** — Full team standup (last 24h)');
  parts.push('- **weekly_summary** — Week-in-review with metrics');
  parts.push('- **sprint_retro** — Sprint retrospective with completion rates');
  parts.push('- **sprint_review** — Mid-sprint health check with risks and progress');

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}

/**
 * Render step-by-step setup guidance based on what's missing.
 */
function renderSetupGuide(
  parts: string[],
  status: { ghCreds: boolean; jiraCreds: boolean; configExists: boolean }
): void {
  let step = 1;

  if (!status.ghCreds) {
    parts.push(`### Step ${step}: Set up GitHub credentials (required)`);
    parts.push('');
    parts.push('1. Go to https://github.com/settings/tokens');
    parts.push('2. Click **"Generate new token (classic)"**');
    parts.push('3. Select these scopes: `repo`, `read:user`, `read:org`');
    parts.push('4. Copy the token and add it to your MCP server config:');
    parts.push('');
    parts.push('```json');
    parts.push('{');
    parts.push('  "mcpServers": {');
    parts.push('    "prodbeam": {');
    parts.push('      "command": "npx",');
    parts.push('      "args": ["-y", "@prodbeam/mcp"],');
    parts.push('      "env": {');
    parts.push('        "GITHUB_TOKEN": "ghp_your_token_here"');
    parts.push('      }');
    parts.push('    }');
    parts.push('  }');
    parts.push('}');
    parts.push('```');
    parts.push('');
    parts.push(
      'After updating your config, restart your MCP client and run `get_capabilities` again.'
    );
    parts.push('');
    step++;
  }

  if (!status.jiraCreds) {
    parts.push(`### Step ${step}: Set up Jira credentials (optional)`);
    parts.push('');
    parts.push('Skip this step if your team does not use Jira. Prodbeam works with GitHub alone.');
    parts.push('');
    parts.push('1. Go to https://id.atlassian.com/manage/api-tokens');
    parts.push('2. Click **"Create API token"**, give it a label like "Prodbeam"');
    parts.push('3. Add these env vars to your MCP server config:');
    parts.push('');
    parts.push('```json');
    parts.push('"env": {');
    parts.push('  "GITHUB_TOKEN": "ghp_your_token_here",');
    parts.push('  "JIRA_HOST": "https://yourcompany.atlassian.net",');
    parts.push('  "JIRA_EMAIL": "you@company.com",');
    parts.push('  "JIRA_API_TOKEN": "your_jira_api_token"');
    parts.push('}');
    parts.push('```');
    parts.push('');
    step++;
  }

  if (!status.configExists) {
    parts.push(`### Step ${step}: Set up your team`);
    parts.push('');
    if (!status.ghCreds) {
      parts.push('Once GitHub credentials are configured, run:');
    } else {
      parts.push('Run:');
    }
    parts.push('');
    parts.push('> `setup_team` with your team name and member email addresses');
    parts.push('');
    parts.push(
      'Prodbeam will auto-discover GitHub usernames, Jira accounts, active repos, and projects.'
    );
    parts.push('');
  }
}

// ─── Start Server ────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[prodbeam] MCP server v2.0.0 started');
}

main().catch((error) => {
  console.error('[prodbeam] Fatal error:', error);
  process.exit(1);
});
