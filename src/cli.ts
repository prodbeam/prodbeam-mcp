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
import { resolveConfigDir } from './config/paths.js';
import { runInit } from './commands/init.js';
import { runAuthLogin, runAuthStatus, runAuthLogout } from './commands/auth.js';
import { resolveGitHubAuth, resolveJiraAuth } from './auth/auth-provider.js';
import { GitHubClient } from './clients/github-client.js';
import { JiraClient, type JiraAuthProvider } from './clients/jira-client.js';
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
import type { TeamConfig } from './config/types.js';

// ─── Argument Parsing ───────────────────────────────────────

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const args = argv.slice(2);
  let command = args[0] ?? 'help';
  let flagStart = 1;

  // Handle compound commands: "auth login" → "auth-login", "help weekly" → "help-weekly"
  if (command === 'auth' && args[1] && !args[1].startsWith('--')) {
    command = `auth-${args[1]}`;
    flagStart = 2;
  }
  if (command === 'help' && args[1] && !args[1].startsWith('--')) {
    command = `help-${args[1]}`;
    flagStart = 2;
  }

  const flags: Record<string, string> = {};

  for (let i = flagStart; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Boolean flags (e.g., --github, --jira) vs value flags (e.g., --method browser)
      if (i + 1 < args.length && !args[i + 1]!.startsWith('--')) {
        flags[key] = args[++i]!;
      } else {
        flags[key] = '';
      }
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

  const timeRange = dailyTimeRange();
  const ghClient = await createGitHubClient();

  const github = await fetchGitHubActivityForUser(
    ghClient,
    member.github,
    config.github.repos,
    timeRange
  );

  let jira;
  const jiraClient = await createJiraClient();
  if (jiraClient && member.jiraAccountId) {
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
  const timeRange = dailyTimeRange();
  const ghClient = await createGitHubClient();

  const membersWithGH = config.team.members.filter((m) => m.github);
  const usernames = membersWithGH.map((m) => m.github!);

  const ghActivities = await fetchTeamGitHubActivity(
    ghClient,
    usernames,
    config.github.repos,
    timeRange
  );

  const jiraClient = await createJiraClient();

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
  const weeksAgo = flags['weeks-ago'] ? parseInt(flags['weeks-ago'], 10) : 0;
  const timeRange = weeklyTimeRange(weeksAgo);
  const ghClient = await createGitHubClient();

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
  const jiraClient = await createJiraClient();
  if (jiraClient) {
    jira = await fetchTeamJiraActivity(jiraClient, config.jira.projects, timeRange);
  }

  return generateWeeklyReport({ github, jira });
}

async function runSprintRetro(flags: Record<string, string>): Promise<string> {
  const config = requireConfig();
  const jiraClient = await createJiraClient();

  let sprintName = flags['sprint'];
  let timeRange;
  let sprintGoal: string | undefined;

  if (!sprintName && jiraClient) {
    const activeSprint = await detectActiveSprint(jiraClient, config.jira.projects);
    if (activeSprint) {
      sprintName = activeSprint.name;
      sprintGoal = activeSprint.goal;
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

  const ghClient = await createGitHubClient();
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
  if (jiraClient) {
    jira = await fetchSprintJiraActivity(jiraClient, sprintName, timeRange);
  }

  const dateRange = {
    from: timeRange.from.split('T')[0]!,
    to: timeRange.to.split('T')[0]!,
  };

  return generateRetrospective({ github, jira, sprintName, dateRange, sprintGoal, perMember });
}

async function runSprintReview(flags: Record<string, string>): Promise<string> {
  const config = requireConfig();
  const jiraClient = await createJiraClient();

  let sprintName = flags['sprint'];
  let timeRange;
  let sprintGoal: string | undefined;
  let sprintStartDate: string | undefined;
  let sprintEndDate: string | undefined;

  if (!sprintName && jiraClient) {
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
    throw new Error('No active sprint detected. Use --sprint "Sprint Name"');
  }

  if (!timeRange) {
    const base = weeklyTimeRange(0);
    const from = new Date(new Date(base.to).getTime() - 14 * 24 * 60 * 60 * 1000);
    timeRange = { from: from.toISOString(), to: base.to };
  }

  const ghClient = await createGitHubClient();
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
  if (jiraClient) {
    jira = await fetchSprintJiraActivity(jiraClient, sprintName, timeRange);
  }

  const dateRange = {
    from: timeRange.from.split('T')[0]!,
    to: timeRange.to.split('T')[0]!,
  };

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

  return generateSprintReview({
    github,
    jira,
    sprintName,
    dateRange,
    sprintGoal,
    perMember,
    daysElapsed,
    daysTotal,
  });
}

async function runStatus(): Promise<string> {
  const configExists = teamConfigExists();
  const config = configExists ? readTeamConfig() : null;
  const ghAuth = await resolveGitHubAuth();
  const jiraAuth = await resolveJiraAuth();

  const lines: string[] = [];
  lines.push('Prodbeam v2.0.0');
  lines.push('');
  lines.push(`Config dir:  ${resolveConfigDir()}`);
  lines.push(
    `Team config: ${config ? `${config.team.name} (${config.team.members.length} members)` : 'Not configured'}`
  );
  lines.push(
    `GitHub:      ${ghAuth ? `Configured (${ghAuth.method})` : 'Not configured (run "prodbeam auth login" or set GITHUB_TOKEN)'}`
  );
  lines.push(
    `Jira:        ${jiraAuth ? `Configured (${jiraAuth.method})` : 'Not configured (run "prodbeam auth login" or set JIRA_* env vars)'}`
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

function showHelp(topic?: string): string {
  if (topic && COMMAND_HELP[topic]) {
    return COMMAND_HELP[topic];
  }

  if (topic) {
    return `Unknown command: ${topic}\n\n${MAIN_HELP}`;
  }

  return MAIN_HELP;
}

const MAIN_HELP = `Prodbeam CLI - Engineering Intelligence Reports

Usage:
  prodbeam <command> [options]
  prodbeam help <command>

Setup:
  init              Interactive setup wizard — credentials, team, MCP registration
  auth login        Authenticate with GitHub and/or Jira (OAuth or token)
  auth status       Show current authentication status and token expiry
  auth logout       Remove stored OAuth tokens for a service

Reports:
  standup           Personal daily standup — commits, PRs, reviews, Jira issues (last 24h)
  team-standup      Full team standup — aggregate stats + per-member breakdown (last 24h)
  weekly            Weekly engineering summary — metrics, trends, health score, repo breakdown
  sprint-retro      Sprint retrospective — scorecard, what went well/needs work, action items
  sprint-review     Mid-sprint health check — progress, deliverables, risks, blockers

Info:
  status            Show team config, credentials, repos, and Jira projects
  help [command]    Show help for a specific command

Examples:
  prodbeam init                          Set up team and credentials
  prodbeam auth login                    Authenticate via browser or token
  prodbeam standup                       Your daily standup
  prodbeam weekly --weeks-ago 1          Last week's engineering summary
  prodbeam sprint-retro                  Retrospective for active sprint
  prodbeam help weekly                   Detailed help for weekly command

Environment Variables:
  GITHUB_TOKEN      GitHub personal access token (overrides OAuth)
  JIRA_HOST         Jira Cloud hostname (e.g., company.atlassian.net)
  JIRA_EMAIL        Jira account email
  JIRA_API_TOKEN    Jira API token (overrides OAuth)
  PRODBEAM_HOME     Config directory (default: ~/.prodbeam)`;

const COMMAND_HELP: Record<string, string> = {
  init: `prodbeam init — Interactive Setup Wizard

  Walk through credential detection, validation, team onboarding, and MCP
  server registration. This is the recommended first step after installation.

  The wizard will:
    1. Detect existing credentials (env vars, OAuth tokens, saved tokens)
    2. Offer to authenticate via browser (OAuth) or paste a token (PAT)
    3. Validate credentials against GitHub and Jira APIs
    4. Prompt for team name and member emails
    5. Auto-discover GitHub usernames, Jira accounts, repos, and projects
    6. Register the MCP server with Claude Code (optional)

  Usage:
    prodbeam init

  Examples:
    prodbeam init                     Start the setup wizard`,

  'auth-login': `prodbeam auth login — Authenticate with GitHub and/or Jira

  Authenticate using OAuth (browser-based) or a personal access token. OAuth
  is recommended — tokens refresh automatically and don't require manual
  rotation. Existing credentials are detected and you can keep or replace them.

  Usage:
    prodbeam auth login [options]

  Options:
    --github                Authenticate GitHub only (skip Jira)
    --jira                  Authenticate Jira only (skip GitHub)
    --method <browser|token>  Skip the auth method prompt
        browser             OAuth via browser (recommended)
        token               Paste a personal access token

  Examples:
    prodbeam auth login                     Interactive — choose method for each service
    prodbeam auth login --github            GitHub only
    prodbeam auth login --jira              Jira only
    prodbeam auth login --method browser    Use OAuth for all services
    prodbeam auth login --method token      Use token for all services
    prodbeam auth login --github --method browser   GitHub OAuth only`,

  'auth-status': `prodbeam auth status — Show Authentication Status

  Display the current authentication method, token expiry, and refresh status
  for both GitHub and Jira.

  Usage:
    prodbeam auth status

  Output shows:
    - Authentication method (OAuth or API token)
    - Access token expiry (OAuth only)
    - Refresh token expiry (OAuth only)
    - Whether credentials come from env vars

  Examples:
    prodbeam auth status

  Sample output:
    GitHub: OAuth (token expires in 7h, refresh in ~6mo)
    Jira:   OAuth (token expires in 59m, refresh in ~2mo)`,

  'auth-logout': `prodbeam auth logout — Remove OAuth Tokens

  Remove stored OAuth tokens from ~/.prodbeam/credentials.json. Does not
  affect environment variable credentials or PAT-based tokens.

  Usage:
    prodbeam auth logout [options]

  Options:
    --github                Remove GitHub OAuth tokens only
    --jira                  Remove Jira OAuth tokens only

  If no flag is specified, tokens for both services are removed.

  Examples:
    prodbeam auth logout                    Remove all OAuth tokens
    prodbeam auth logout --github           Remove GitHub tokens only
    prodbeam auth logout --jira             Remove Jira tokens only`,

  standup: `prodbeam standup — Personal Daily Standup

  Generate a daily standup report for a team member. Fetches GitHub commits,
  pull requests, code reviews, and Jira issues from the last 24 hours.

  Usage:
    prodbeam standup [options]

  Options:
    --email <email>         Team member email (default: first member in config)

  Report sections:
    Completed               Merged PRs and resolved Jira issues
    In Progress             Open PRs and in-progress Jira issues
    Focus Areas             Grouped by Jira label/type (when available)
    Blockers                Stale PRs or blocked issues (when detected)
    Activity Summary        Commits, PRs, reviews, Jira issue counts
    Recent Commits          Commit SHAs with messages and repo names

  Examples:
    prodbeam standup                        Standup for the default member
    prodbeam standup --email alice@co.com   Standup for a specific member`,

  'team-standup': `prodbeam team-standup — Full Team Standup

  Generate a team-wide standup with aggregate stats and per-member breakdown.
  Fetches the last 24 hours of activity across all team members.

  Usage:
    prodbeam team-standup

  Report sections:
    Summary                 Team-wide totals (commits, PRs, reviews, issues)
    Per-Member Sections     Each member's completed, in-progress, commits, reviews
    Blockers                Stale PRs or blocked issues across the team

  Examples:
    prodbeam team-standup                   Full team standup report`,

  weekly: `prodbeam weekly — Weekly Engineering Summary

  Generate a comprehensive weekly engineering report with delivery metrics,
  trends, team health scoring, and repository breakdown. Supports historical
  lookback via --weeks-ago.

  Usage:
    prodbeam weekly [options]

  Options:
    --weeks-ago <n>         Week offset (default: 0 = current week)
                            1 = last week, 4 = ~1 month ago, 12 = ~3 months

  Report sections:
    Highlights              Key achievements and metrics summary
    Delivery Metrics        Commits, PRs, code changes, cycle time, reviews
    Key Deliverables        List of merged PRs with titles
    Investment Balance      Jira issue type distribution (when available)
    PR Size Distribution    Small/medium/large PR classification
    Repository Breakdown    Per-repo commits, PRs, reviews, code changes
    Jira Issues             Status, type, and priority breakdown (when available)
    Trends vs Previous      Week-over-week metric comparison (when history exists)
    Insights                Stale PR alerts, anomaly detection
    Team Health             Score out of 100 with dimensional breakdown
    Appendix                Full commit, PR, and review lists

  Examples:
    prodbeam weekly                         Current week's summary
    prodbeam weekly --weeks-ago 1           Last week's summary
    prodbeam weekly --weeks-ago 4           Summary from ~1 month ago
    prodbeam weekly --weeks-ago 12          Summary from ~3 months ago`,

  'sprint-retro': `prodbeam sprint-retro — Sprint Retrospective

  Generate a sprint retrospective with scorecard, qualitative insights,
  developer contributions, and action items. Auto-detects the active Jira
  sprint or accepts a specific sprint name.

  Usage:
    prodbeam sprint-retro [options]

  Options:
    --sprint <name>         Sprint name (default: auto-detect active sprint)

  Report sections:
    Sprint Goal             Auto-detected from Jira sprint goal field
    Sprint Scorecard        Merge rate, avg merge time, completion rate, carryover
    What Went Well          Pattern-based: fast merges, high completion, deliverables
    What Needs Improvement  Pattern-based: stale PRs, no approvals, low completion
    Action Items            Derived from anomalies and improvement areas
    Delivery Metrics        Commits, PRs, code changes, reviews
    Developer Contributions Per-developer: commits, PRs authored/merged, reviews
      Key Deliverables      Merged PRs per developer
      In Progress           Open PRs per developer
      Carryover             Issues carried from previous sprint (when available)
    Jira Issues             Status, type, priority breakdown (when available)
    Trends vs Previous      Sprint-over-sprint metric comparison
    Insights                Stale PR alerts, review imbalance, anomalies
    Team Health             Score out of 100 with dimensional breakdown
    Appendix                Full commit, PR, and review lists

  Examples:
    prodbeam sprint-retro                           Active sprint retrospective
    prodbeam sprint-retro --sprint "Sprint 12"      Retro for a specific sprint`,

  'sprint-review': `prodbeam sprint-review — Mid-Sprint Health Check

  Generate a mid-sprint review showing progress, deliverables, risks, and
  developer status. Designed for sprint check-ins and stakeholder updates.
  Auto-detects the active Jira sprint or accepts a specific sprint name.

  Usage:
    prodbeam sprint-review [options]

  Options:
    --sprint <name>         Sprint name (default: auto-detect active sprint)

  Report sections:
    Sprint Goal             Auto-detected from Jira sprint goal field
    Progress Summary        Days elapsed, PRs merged, PRs awaiting review
    Key Deliverables        Merged PRs with titles
    In Progress             Open PRs with age indicator (days open)
    Risks & Blockers        Long-open PRs, blocked issues, scope warnings
    Developer Progress      Per-developer: merged, open, reviews given
    Delivery Metrics        Commits, PRs, code changes, reviews

  Examples:
    prodbeam sprint-review                          Active sprint review
    prodbeam sprint-review --sprint "Sprint 12"     Review for a specific sprint`,

  status: `prodbeam status — Show Configuration Status

  Display current configuration: team setup, credentials, tracked repos,
  Jira projects, and team members with their linked accounts.

  Usage:
    prodbeam status

  Output shows:
    - Config directory path
    - Team name and member count
    - GitHub credential status and auth method (OAuth/PAT/env var)
    - Jira credential status and auth method
    - Team member list with GitHub username and Jira link status
    - Tracked repositories
    - Jira projects

  Examples:
    prodbeam status                         Show full configuration status`,
};

// Allow "auth login" → "auth-login" lookups in help
COMMAND_HELP['auth'] = COMMAND_HELP['auth-login']!;
COMMAND_HELP['login'] = COMMAND_HELP['auth-login']!;
COMMAND_HELP['logout'] = COMMAND_HELP['auth-logout']!;

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

async function createGitHubClient(): Promise<GitHubClient> {
  const auth = await resolveGitHubAuth();
  if (!auth) {
    console.error(
      'Error: GitHub credentials required. Run "prodbeam auth login" or set GITHUB_TOKEN.'
    );
    process.exit(1);
  }
  return new GitHubClient(auth.token);
}

async function createJiraClient(): Promise<JiraClient | null> {
  const auth = await resolveJiraAuth();
  if (!auth) return null;
  const provider: JiraAuthProvider = {
    getBaseUrl: () => auth.baseUrl,
    getAuthHeader: () => Promise.resolve(auth.authHeader),
  };
  return new JiraClient(provider);
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
      case 'auth-login':
        await runAuthLogin(flags);
        return;
      case 'auth-status':
        runAuthStatus();
        return;
      case 'auth-logout':
        runAuthLogout(flags);
        return;
      case 'auth':
        // Bare "prodbeam auth" shows status
        runAuthStatus();
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
      case 'sprint-review':
        output = await runSprintReview(flags);
        break;
      case 'status':
        output = await runStatus();
        break;
      case 'help':
      case '--help':
      case '-h':
        output = showHelp();
        break;
      default:
        if (command.startsWith('help-')) {
          output = showHelp(command.slice(5));
          break;
        }
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
