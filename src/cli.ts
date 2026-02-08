#!/usr/bin/env node

/**
 * Prodbeam CLI
 *
 * Generate engineering reports from the command line.
 *
 * Usage:
 *   prodbeam standup [--email user@company.com]
 *   prodbeam team-standup
 *   prodbeam weekly [--weeks-ago 1]
 *   prodbeam sprint-retro [--sprint "Sprint 12"]
 *   prodbeam status
 */

import { readTeamConfig, teamConfigExists } from './config/team-config.js';
import { resolveGitHubCredentials, resolveJiraCredentials } from './config/credentials.js';
import { resolveConfigDir } from './config/paths.js';
import { runInit } from './commands/init.js';
import { GitHubClient } from './clients/github-client.js';
import { JiraClient } from './clients/jira-client.js';
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
} from './generators/report-generator.js';
import type { TeamConfig } from './config/types.js';

// ─── Argument Parsing ───────────────────────────────────────

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const args = argv.slice(2);
  const command = args[0] ?? 'help';
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--') && i + 1 < args.length) {
      const key = arg.slice(2);
      flags[key] = args[++i]!;
    }
  }

  return { command, flags };
}

// ─── Commands ───────────────────────────────────────────────

async function runStandup(flags: Record<string, string>): Promise<string> {
  const config = requireConfig();
  const email = flags['email'];
  const member = email
    ? config.team.members.find((m) => m.email.toLowerCase() === email.toLowerCase())
    : config.team.members[0];

  if (!member) {
    throw new Error(email ? `${email} is not a team member` : 'No team members configured');
  }

  if (!member.github) {
    throw new Error(`No GitHub username for ${member.email}`);
  }

  const ghCreds = requireGitHubCreds();
  const timeRange = dailyTimeRange();
  const ghClient = new GitHubClient(ghCreds.token);

  const github = await fetchGitHubActivityForUser(
    ghClient,
    member.github,
    config.github.repos,
    timeRange
  );

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

  return generateDailyReport({ github, jira });
}

async function runTeamStandup(): Promise<string> {
  const config = requireConfig();
  const ghCreds = requireGitHubCreds();
  const timeRange = dailyTimeRange();
  const ghClient = new GitHubClient(ghCreds.token);

  const membersWithGH = config.team.members.filter((m) => m.github);
  const usernames = membersWithGH.map((m) => m.github!);

  const ghActivities = await fetchTeamGitHubActivity(
    ghClient,
    usernames,
    config.github.repos,
    timeRange
  );

  const jiraCreds = resolveJiraCredentials();
  const jiraClient = jiraCreds
    ? new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken)
    : null;

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

  return generateTeamDailyReport(memberActivities, config.team.name);
}

async function runWeekly(flags: Record<string, string>): Promise<string> {
  const config = requireConfig();
  const ghCreds = requireGitHubCreds();
  const weeksAgo = flags['weeks-ago'] ? parseInt(flags['weeks-ago'], 10) : 0;
  const timeRange = weeklyTimeRange(weeksAgo);
  const ghClient = new GitHubClient(ghCreds.token);

  const membersWithGH = config.team.members.filter((m) => m.github);
  const usernames = membersWithGH.map((m) => m.github!);

  const perMember = await fetchTeamGitHubActivity(
    ghClient,
    usernames,
    config.github.repos,
    timeRange
  );

  const github = {
    username: config.team.name,
    commits: perMember.flatMap((a) => a.commits),
    pullRequests: perMember.flatMap((a) => a.pullRequests),
    reviews: perMember.flatMap((a) => a.reviews),
    timeRange,
  };

  let jira;
  const jiraCreds = resolveJiraCredentials();
  if (jiraCreds) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    jira = await fetchTeamJiraActivity(jiraClient, config.jira.projects, timeRange);
  }

  return generateWeeklyReport({ github, jira });
}

async function runSprintRetro(flags: Record<string, string>): Promise<string> {
  const config = requireConfig();
  const ghCreds = requireGitHubCreds();
  const jiraCreds = resolveJiraCredentials();

  let sprintName = flags['sprint'];
  let timeRange;

  if (!sprintName && jiraCreds) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    const activeSprint = await detectActiveSprint(jiraClient, config.jira.projects);
    if (activeSprint) {
      sprintName = activeSprint.name;
      timeRange = sprintTimeRange(activeSprint.startDate, activeSprint.endDate);
    }
  }

  if (!sprintName) {
    throw new Error('No active sprint detected. Use --sprint "Sprint Name"');
  }

  if (!timeRange) {
    const base = weeklyTimeRange(0);
    const from = new Date(new Date(base.to).getTime() - 14 * 24 * 60 * 60 * 1000);
    timeRange = { from: from.toISOString(), to: base.to };
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

  const github = {
    username: config.team.name,
    commits: perMember.flatMap((a) => a.commits),
    pullRequests: perMember.flatMap((a) => a.pullRequests),
    reviews: perMember.flatMap((a) => a.reviews),
    timeRange,
  };

  let jira;
  if (jiraCreds) {
    const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
    jira = await fetchSprintJiraActivity(jiraClient, sprintName, timeRange);
  }

  const dateRange = {
    from: timeRange.from.split('T')[0]!,
    to: timeRange.to.split('T')[0]!,
  };

  return generateRetrospective({ github, jira, sprintName, dateRange });
}

function runStatus(): string {
  const configExists = teamConfigExists();
  const config = configExists ? readTeamConfig() : null;
  const ghCreds = resolveGitHubCredentials();
  const jiraCreds = resolveJiraCredentials();

  const lines: string[] = [];
  lines.push('Prodbeam v2.0.0');
  lines.push('');
  lines.push(`Config dir:  ${resolveConfigDir()}`);
  lines.push(
    `Team config: ${config ? `${config.team.name} (${config.team.members.length} members)` : 'Not configured'}`
  );
  lines.push(`GitHub:      ${ghCreds ? 'Configured' : 'Not configured (set GITHUB_TOKEN)'}`);
  lines.push(
    `Jira:        ${jiraCreds ? jiraCreds.host : 'Not configured (set JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN)'}`
  );

  if (config) {
    lines.push('');
    lines.push('Team members:');
    for (const m of config.team.members) {
      const gh = m.github ? `@${m.github}` : 'no GitHub';
      const jira = m.jiraAccountId ? 'Jira linked' : 'no Jira';
      lines.push(`  - ${m.name ?? m.email} (${gh}, ${jira})`);
    }
    lines.push('');
    lines.push(`Repos: ${config.github.repos.length}`);
    lines.push(`Jira projects: ${config.jira.projects.join(', ') || 'none'}`);
  }

  return lines.join('\n');
}

function showHelp(): string {
  return `Prodbeam CLI - Engineering Intelligence Reports

Usage:
  prodbeam <command> [options]

Commands:
  init            Interactive setup wizard (start here!)
  standup         Personal daily standup (last 24h)
  team-standup    Full team standup (last 24h)
  weekly          Weekly engineering summary
  sprint-retro    Sprint retrospective
  status          Show configuration status
  help            Show this help message

Options:
  --email <email>       Member email for standup (default: first member)
  --weeks-ago <n>       Week offset for weekly report (default: 0)
  --sprint <name>       Sprint name for retro (default: auto-detect)

Getting started:
  Run 'prodbeam init' to set up credentials, team, and MCP registration.

Environment:
  GITHUB_TOKEN      GitHub personal access token
  JIRA_HOST         Jira Cloud hostname (e.g., company.atlassian.net)
  JIRA_EMAIL        Jira account email
  JIRA_API_TOKEN    Jira API token
  PRODBEAM_HOME     Config directory (default: ~/.prodbeam)`;
}

// ─── Helpers ────────────────────────────────────────────────

function requireConfig(): TeamConfig {
  const config = readTeamConfig();
  if (!config) {
    console.error(
      'Error: No team config found. Run setup_team via MCP or create ~/.prodbeam/team.json'
    );
    process.exit(1);
  }
  return config;
}

function requireGitHubCreds() {
  const creds = resolveGitHubCredentials();
  if (!creds) {
    console.error('Error: GitHub credentials required. Set GITHUB_TOKEN env var.');
    process.exit(1);
  }
  return creds;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const { command, flags } = parseArgs(process.argv);

  try {
    let output: string;

    switch (command) {
      case 'init':
        await runInit();
        return;
      case 'standup':
        output = await runStandup(flags);
        break;
      case 'team-standup':
        output = await runTeamStandup();
        break;
      case 'weekly':
        output = await runWeekly(flags);
        break;
      case 'sprint-retro':
        output = await runSprintRetro(flags);
        break;
      case 'status':
        output = runStatus();
        break;
      case 'help':
      case '--help':
      case '-h':
        output = showHelp();
        break;
      default:
        console.error(`Unknown command: ${command}\n`);
        output = showHelp();
    }

    console.log(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
