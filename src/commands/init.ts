/**
 * prodbeam init — Interactive Setup Command
 *
 * Consolidates the entire setup flow into a single command:
 * 1. Detect or prompt for GitHub + Jira credentials
 * 2. Validate credentials against live APIs
 * 3. Prompt for team name + member emails
 * 4. Run auto-discovery (GitHub usernames, repos, Jira accounts, projects)
 * 5. Save configuration
 * 6. Register MCP server
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Interface } from 'node:readline/promises';

import {
  resolveGitHubCredentials,
  resolveJiraCredentials,
  mergeCredentials,
} from '../config/credentials.js';
import { teamConfigExists, writeTeamConfig, createDefaultConfig } from '../config/team-config.js';
import { resolveConfigDir } from '../config/paths.js';
import { GitHubClient, GitHubClientError } from '../clients/github-client.js';
import { JiraClient, JiraClientError } from '../clients/jira-client.js';
import { discoverJiraTeam } from '../discovery/jira-discovery.js';
import type { GitHubCredentials, JiraCredentials, TeamConfig } from '../config/types.js';
import {
  createPrompt,
  ask,
  askSecret,
  askConfirm,
  printHeader,
  printSuccess,
  printWarning,
  printInfo,
  printStep,
} from './prompt.js';

const MAX_AUTH_RETRIES = 3;
const TOTAL_STEPS = 6;

type CredSource = 'env' | 'file' | 'prompt';

// ─── Entry Point ──────────────────────────────────────────────

export async function runInit(): Promise<void> {
  printHeader('prodbeam init');
  printInfo('Interactive setup for Prodbeam engineering intelligence.\n');

  const rl = createPrompt();

  try {
    // Step 1: GitHub credentials
    printStep(1, TOTAL_STEPS, 'GitHub credentials');
    const { creds: ghCreds, source: ghSource } = await resolveOrPromptGitHub(rl);

    // Step 2: Jira credentials
    printStep(2, TOTAL_STEPS, 'Jira credentials');
    const { creds: jiraCreds, source: jiraSource } = await resolveOrPromptJira(rl);

    // Step 3: Validate credentials
    printStep(3, TOTAL_STEPS, 'Validating credentials');
    const ghUser = await validateGitHub(rl, ghCreds, ghSource);
    const jiraUser = await validateJira(rl, jiraCreds, jiraSource);

    // Step 4: Team setup
    printStep(4, TOTAL_STEPS, 'Team setup');
    if (teamConfigExists()) {
      const overwrite = await askConfirm(rl, 'Team config already exists. Overwrite?', false);
      if (!overwrite) {
        printInfo('Keeping existing team config.');
        rl.close();
        printSummary(ghUser, jiraUser, null);
        return;
      }
    }

    const teamName = await ask(rl, 'Team name', { required: true });
    const members = await askTeamMembers(rl, ghUser);

    // Step 5: Discovery + persist
    printStep(5, TOTAL_STEPS, 'Running auto-discovery');
    const config = await runDiscovery(ghCreds, jiraCreds, teamName, members);

    // Persist credentials (only if prompted interactively)
    if (ghSource === 'prompt' || jiraSource === 'prompt') {
      const credsToSave: { github?: GitHubCredentials; jira?: JiraCredentials } = {};
      if (ghSource === 'prompt') credsToSave.github = ghCreds;
      if (jiraSource === 'prompt') credsToSave.jira = jiraCreds;
      mergeCredentials(credsToSave);
      printSuccess(`Credentials saved to ${resolveConfigDir()}/credentials.json`);
    }

    writeTeamConfig(config);
    printSuccess(`Team config saved to ${resolveConfigDir()}/team.json`);

    // Step 6: MCP registration
    printStep(6, TOTAL_STEPS, 'MCP server registration');
    registerMcpServer(ghCreds, jiraCreds);

    rl.close();
    printSummary(ghUser, jiraUser, config);
  } catch (error) {
    rl.close();
    if (error instanceof Error && error.message === 'readline was closed') {
      // Ctrl+C during prompt — exit gracefully
      console.log('\nSetup cancelled.');
      return;
    }
    throw error;
  }
}

// ─── Team Member Input ───────────────────────────────────────

interface TeamMemberInput {
  github: string;
  email: string;
}

/**
 * Prompt for team members one at a time.
 * Each member provides a GitHub username and email.
 * The authenticated user's login is suggested as the default for the first member.
 */
async function askTeamMembers(
  rl: Interface,
  ghUser: { login: string; name: string | null }
): Promise<TeamMemberInput[]> {
  printInfo('Add team members (GitHub username + email). Empty username to finish.\n');

  const members: TeamMemberInput[] = [];
  let memberNum = 1;

  for (;;) {
    const isFirst = memberNum === 1;
    const ghDefault = isFirst ? ghUser.login : undefined;

    const github = await ask(rl, `  Member ${memberNum} — GitHub username`, {
      defaultValue: ghDefault,
    });

    if (!github) {
      if (members.length === 0) {
        printWarning('At least one team member is required.');
        continue;
      }
      break;
    }

    const email = await ask(rl, `  Member ${memberNum} — Email`, {
      required: true,
      validate: (v) => (v.includes('@') ? null : 'Must be a valid email address'),
    });

    members.push({ github, email });
    printSuccess(`  Added @${github} (${email})`);
    memberNum++;
    console.log('');
  }

  return members;
}

// ─── MCP Config Scanner ──────────────────────────────────────

/** Env var name variants used by common MCP servers for the same credential. */
const GITHUB_TOKEN_KEYS = ['GITHUB_TOKEN', 'GITHUB_PERSONAL_ACCESS_TOKEN'];
const JIRA_HOST_KEYS = ['JIRA_HOST', 'JIRA_BASE_URL', 'ATLASSIAN_SITE_URL'];
const JIRA_EMAIL_KEYS = ['JIRA_EMAIL', 'ATLASSIAN_EMAIL'];
const JIRA_TOKEN_KEYS = ['JIRA_API_TOKEN', 'ATLASSIAN_API_TOKEN'];

interface McpEnvVars {
  [key: string]: string;
}

/**
 * Scan ~/.claude/mcp.json for env vars across all configured MCP servers.
 * Returns a merged map of all env vars found.
 */
function scanMcpConfigEnvVars(): McpEnvVars {
  const configPath = join(homedir(), '.claude', 'mcp.json');
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as {
      mcpServers?: Record<string, { env?: Record<string, string> }>;
    };

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      return {};
    }

    const merged: McpEnvVars = {};
    for (const server of Object.values(config.mcpServers)) {
      if (server.env && typeof server.env === 'object') {
        for (const [key, value] of Object.entries(server.env)) {
          if (typeof value === 'string' && value) {
            merged[key] = value;
          }
        }
      }
    }
    return merged;
  } catch {
    return {};
  }
}

/** Find the first matching value from a list of env var name variants. */
function findEnvVar(envVars: McpEnvVars, keys: string[]): string | undefined {
  for (const key of keys) {
    if (envVars[key]) return envVars[key];
  }
  return undefined;
}

// ─── Credential Resolution ────────────────────────────────────

interface ResolvedCreds<T> {
  creds: T;
  source: CredSource;
}

async function resolveOrPromptGitHub(rl: Interface): Promise<ResolvedCreds<GitHubCredentials>> {
  // 1. Check env vars
  const envToken = process.env['GITHUB_TOKEN'];
  if (envToken) {
    printSuccess('Found GITHUB_TOKEN in environment.');
    return { creds: { token: envToken }, source: 'env' };
  }

  // 2. Check credentials file
  const fileCreds = resolveGitHubCredentials();
  if (fileCreds) {
    printSuccess('Found GitHub token in credentials file.');
    return { creds: fileCreds, source: 'file' };
  }

  // 3. Scan Claude MCP config
  const mcpEnv = scanMcpConfigEnvVars();
  const mcpToken = findEnvVar(mcpEnv, GITHUB_TOKEN_KEYS);
  if (mcpToken) {
    printSuccess('Found GitHub token in Claude MCP config (~/.claude/mcp.json).');
    return { creds: { token: mcpToken }, source: 'file' };
  }

  // 4. Prompt
  printInfo('No GitHub token found. Create one at https://github.com/settings/tokens');
  printInfo('Required scopes: repo, read:org, read:user');
  const token = await askSecret(rl, 'GitHub personal access token');

  if (!token) {
    throw new Error('GitHub token is required.');
  }

  return { creds: { token }, source: 'prompt' };
}

async function resolveOrPromptJira(rl: Interface): Promise<ResolvedCreds<JiraCredentials>> {
  // 1. Check env vars
  const envToken = process.env['JIRA_API_TOKEN'];
  const envEmail = process.env['JIRA_EMAIL'];
  const envHost = process.env['JIRA_HOST'];

  if (envToken && envEmail && envHost) {
    printSuccess('Found Jira credentials in environment.');
    return { creds: { host: envHost, email: envEmail, apiToken: envToken }, source: 'env' };
  }

  // 2. Check credentials file
  const fileCreds = resolveJiraCredentials();
  if (fileCreds) {
    printSuccess('Found Jira credentials in credentials file.');
    return { creds: fileCreds, source: 'file' };
  }

  // 3. Scan Claude MCP config
  const mcpEnv = scanMcpConfigEnvVars();
  const mcpToken = findEnvVar(mcpEnv, JIRA_TOKEN_KEYS);
  const mcpEmail = findEnvVar(mcpEnv, JIRA_EMAIL_KEYS);
  const mcpHost = findEnvVar(mcpEnv, JIRA_HOST_KEYS);

  if (mcpToken && mcpEmail && mcpHost) {
    printSuccess('Found Jira credentials in Claude MCP config (~/.claude/mcp.json).');
    return { creds: { host: mcpHost, email: mcpEmail, apiToken: mcpToken }, source: 'file' };
  }

  // 4. Prompt
  printInfo('No Jira credentials found.');
  printInfo('Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens');

  const host = await ask(rl, 'Jira Cloud hostname (e.g., company.atlassian.net)', {
    required: true,
    defaultValue: mcpHost,
    validate: (v) =>
      v.includes('.') ? null : 'Must be a valid hostname (e.g., company.atlassian.net)',
  });
  const email = await ask(rl, 'Jira account email', {
    required: true,
    defaultValue: mcpEmail,
    validate: (v) => (v.includes('@') ? null : 'Must be a valid email address'),
  });
  const apiToken = await askSecret(rl, 'Jira API token');

  if (!apiToken) {
    throw new Error('Jira API token is required.');
  }

  return { creds: { host, email, apiToken }, source: 'prompt' };
}

// ─── Credential Validation ───────────────────────────────────

async function validateGitHub(
  rl: Interface,
  creds: GitHubCredentials,
  source: CredSource
): Promise<{ login: string; name: string | null }> {
  for (let attempt = 1; attempt <= MAX_AUTH_RETRIES; attempt++) {
    try {
      const client = new GitHubClient(creds.token);
      const user = await client.getAuthenticatedUser();
      printSuccess(`GitHub: authenticated as @${user.login}${user.name ? ` (${user.name})` : ''}`);
      return user;
    } catch (error) {
      if (error instanceof GitHubClientError && error.statusCode === 401) {
        if (source !== 'prompt' || attempt >= MAX_AUTH_RETRIES) {
          throw new Error(`GitHub authentication failed (${error.statusCode}). Check your token.`);
        }
        printWarning(`Invalid token (attempt ${attempt}/${MAX_AUTH_RETRIES}). Try again.`);
        const token = await askSecret(rl, 'GitHub personal access token');
        if (!token) throw new Error('GitHub token is required.');
        creds.token = token;
        continue;
      }
      // Network error — offer to skip validation
      const skip = await askConfirm(
        rl,
        `GitHub API unreachable: ${error instanceof Error ? error.message : 'unknown error'}. Skip validation?`,
        false
      );
      if (skip) {
        printWarning('Skipping GitHub validation. Credentials saved as-is.');
        return { login: 'unknown', name: null };
      }
      throw error;
    }
  }

  throw new Error('GitHub authentication failed after maximum retries.');
}

async function validateJira(
  rl: Interface,
  creds: JiraCredentials,
  source: CredSource
): Promise<{ accountId: string; displayName: string }> {
  for (let attempt = 1; attempt <= MAX_AUTH_RETRIES; attempt++) {
    try {
      const client = new JiraClient(creds.host, creds.email, creds.apiToken);
      const user = await client.getMyself();
      printSuccess(`Jira: authenticated as ${user.displayName}`);
      return user;
    } catch (error) {
      if (
        error instanceof JiraClientError &&
        (error.statusCode === 401 || error.statusCode === 403)
      ) {
        if (source !== 'prompt' || attempt >= MAX_AUTH_RETRIES) {
          throw new Error(
            `Jira authentication failed (${error.statusCode}). Check your credentials.`
          );
        }
        printWarning(`Invalid credentials (attempt ${attempt}/${MAX_AUTH_RETRIES}). Try again.`);
        const host = await ask(rl, 'Jira Cloud hostname', {
          required: true,
          defaultValue: creds.host,
        });
        const email = await ask(rl, 'Jira account email', {
          required: true,
          defaultValue: creds.email,
        });
        const apiToken = await askSecret(rl, 'Jira API token');
        if (!apiToken) throw new Error('Jira API token is required.');
        creds.host = host;
        creds.email = email;
        creds.apiToken = apiToken;
        continue;
      }
      // Network error — offer to skip
      const skip = await askConfirm(
        rl,
        `Jira API unreachable: ${error instanceof Error ? error.message : 'unknown error'}. Skip validation?`,
        false
      );
      if (skip) {
        printWarning('Skipping Jira validation. Credentials saved as-is.');
        return { accountId: 'unknown', displayName: 'unknown' };
      }
      throw error;
    }
  }

  throw new Error('Jira authentication failed after maximum retries.');
}

// ─── Discovery ───────────────────────────────────────────────

async function runDiscovery(
  ghCreds: GitHubCredentials,
  jiraCreds: JiraCredentials,
  teamName: string,
  members: TeamMemberInput[]
): Promise<TeamConfig> {
  const emails = members.map((m) => m.email);
  const config = createDefaultConfig(teamName, emails);

  // Set GitHub usernames from input (already collected during team setup)
  for (const input of members) {
    const configMember = config.team.members.find(
      (m) => m.email.toLowerCase() === input.email.toLowerCase()
    );
    if (configMember) {
      configMember.github = input.github;
    }
  }

  const ghClient = new GitHubClient(ghCreds.token);
  const jiraClient = new JiraClient(jiraCreds.host, jiraCreds.email, jiraCreds.apiToken);
  const usernames = members.map((m) => m.github);

  // Run GitHub repo/org discovery and Jira discovery in parallel
  const [ghRepoResults, jiraDiscovery] = await Promise.all([
    discoverGitHubReposAndOrgs(ghClient, usernames),
    discoverJiraTeam(jiraClient, emails, jiraCreds.host).catch((error) => {
      printWarning(
        `Jira discovery failed: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      return null;
    }),
  ]);

  // Merge GitHub repos and orgs
  config.github.repos = ghRepoResults.repos;
  if (ghRepoResults.orgs.length > 0) {
    config.github.org = ghRepoResults.orgs[0];
  }
  printInfo(`Found ${ghRepoResults.repos.length} active repos, ${ghRepoResults.orgs.length} orgs`);

  // Merge Jira discovery results
  if (jiraDiscovery) {
    config.jira.host = jiraDiscovery.host;
    config.jira.projects = jiraDiscovery.projects.map((p) => p.key);

    for (const jiraMember of jiraDiscovery.members) {
      const configMember = config.team.members.find(
        (m) => m.email.toLowerCase() === jiraMember.email.toLowerCase()
      );
      if (configMember && jiraMember.accountId) {
        configMember.jiraAccountId = jiraMember.accountId;
        configMember.name = configMember.name ?? jiraMember.displayName ?? undefined;
        printSuccess(`  ${jiraMember.email} -> ${jiraMember.displayName} (Jira)`);
      } else if (jiraMember.error) {
        printWarning(`  ${jiraMember.email}: ${jiraMember.error}`);
      }
    }

    printInfo(`Found ${jiraDiscovery.projects.length} projects`);
  } else {
    config.jira.host = jiraCreds.host;
  }

  return config;
}

/**
 * Discover repos and orgs for a list of known GitHub usernames.
 * Skips the unreliable email-to-username search — usernames are already provided.
 */
async function discoverGitHubReposAndOrgs(
  client: GitHubClient,
  usernames: string[]
): Promise<{ repos: string[]; orgs: string[] }> {
  const repoSet = new Set<string>();
  const orgSet = new Set<string>();

  const results = await Promise.all(
    usernames.map(async (username) => {
      const [repos, orgs] = await Promise.all([
        client.getRecentRepos(username).catch(() => [] as string[]),
        client.getUserOrgs(username).catch(() => [] as string[]),
      ]);
      return { username, repos, orgs };
    })
  );

  for (const { username, repos, orgs } of results) {
    for (const repo of repos) repoSet.add(repo);
    for (const org of orgs) orgSet.add(org);

    if (repos.length > 0 || orgs.length > 0) {
      printSuccess(`  @${username}: ${repos.length} repos, ${orgs.length} orgs`);
    } else {
      printWarning(`  @${username}: no recent repos found`);
    }
  }

  return {
    repos: Array.from(repoSet).sort(),
    orgs: Array.from(orgSet).sort(),
  };
}

// ─── MCP Registration ────────────────────────────────────────

function registerMcpServer(ghCreds: GitHubCredentials, jiraCreds: JiraCredentials): void {
  // Resolve the path to our MCP server entry point
  const thisFile = fileURLToPath(import.meta.url);
  const projectRoot = dirname(dirname(thisFile));
  const serverPath = join(projectRoot, 'index.js');

  // Build args with -e flags so credentials are persisted in the MCP config
  const args = [
    'mcp',
    'add',
    'prodbeam',
    '-e',
    `GITHUB_TOKEN=${ghCreds.token}`,
    '-e',
    `JIRA_HOST=${jiraCreds.host}`,
    '-e',
    `JIRA_EMAIL=${jiraCreds.email}`,
    '-e',
    `JIRA_API_TOKEN=${jiraCreds.apiToken}`,
    '--',
    'node',
    serverPath,
  ];

  // Resolve claude CLI path — may not be on default PATH
  const claudePath = resolveClaudeCli();

  if (!claudePath) {
    printWarning('Claude CLI not found in PATH.');
    printManualMcpInstructions(serverPath, ghCreds, jiraCreds);
    return;
  }

  try {
    // Remove existing registration first (ignore errors if it doesn't exist)
    try {
      execFileSync(claudePath, ['mcp', 'remove', 'prodbeam'], { stdio: 'pipe' });
    } catch {
      // Not registered yet — fine
    }

    execFileSync(claudePath, args, { stdio: 'pipe' });
    printSuccess('MCP server registered with Claude Code.');
    printInfo('Start a new Claude Code session to use prodbeam tools.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printWarning(`MCP registration failed: ${message}`);
    printManualMcpInstructions(serverPath, ghCreds, jiraCreds);
  }
}

/** Try to find the claude CLI binary. */
function resolveClaudeCli(): string | null {
  // Common install locations
  const candidates = [
    'claude',
    join(homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
  ];

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'pipe' });
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function printManualMcpInstructions(
  serverPath: string,
  _ghCreds: GitHubCredentials,
  jiraCreds: JiraCredentials
): void {
  printInfo('Register manually by running:\n');
  const cmd = [
    'claude mcp add prodbeam',
    '  -e GITHUB_TOKEN=<your-github-token>',
    `  -e JIRA_HOST=${jiraCreds.host}`,
    `  -e JIRA_EMAIL=${jiraCreds.email}`,
    '  -e JIRA_API_TOKEN=<your-jira-api-token>',
    `  -- node ${serverPath}`,
  ].join(' \\\n');
  console.log(`  ${cmd}\n`);
  printInfo('Replace <your-github-token> and <your-jira-api-token> with your actual tokens.');
}

// ─── Summary ─────────────────────────────────────────────────

function printSummary(
  ghUser: { login: string; name: string | null },
  jiraUser: { accountId: string; displayName: string },
  config: TeamConfig | null
): void {
  printHeader('Setup Complete');

  console.log(`  GitHub:  @${ghUser.login}`);
  console.log(`  Jira:    ${jiraUser.displayName}`);
  console.log(`  Config:  ${resolveConfigDir()}`);

  if (config) {
    console.log(`  Team:    ${config.team.name} (${config.team.members.length} members)`);
    console.log(`  Repos:   ${config.github.repos.length}`);
    console.log(`  Projects: ${config.jira.projects.join(', ') || 'none'}`);
  }

  console.log('\nNext steps:');
  console.log('  1. Start a new Claude Code session');
  console.log('  2. Try: "Give me today\'s standup"');
  console.log('  3. Run `prodbeam status` to verify config\n');
}
