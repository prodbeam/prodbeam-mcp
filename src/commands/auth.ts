/**
 * prodbeam auth — Authentication Management Commands
 *
 * Subcommands:
 *   login   — Authenticate with GitHub and/or Jira (OAuth or PAT)
 *   status  — Show current authentication status
 *   logout  — Remove OAuth tokens for a service
 */

import type { Interface } from 'node:readline/promises';
import {
  isGitHubFromEnv,
  isJiraFromEnv,
  resolveGitHubCredentials,
  resolveJiraCredentials,
  mergeCredentials,
} from '../config/credentials.js';
import {
  readGitHubOAuthTokens,
  readJiraOAuthTokens,
  writeGitHubOAuthTokens,
  writeJiraOAuthTokens,
  deleteOAuthTokens,
} from '../auth/token-store.js';
import {
  GITHUB_CLIENT_ID,
  GITHUB_SCOPES,
  JIRA_CLIENT_ID,
  JIRA_CLIENT_SECRET,
  JIRA_SCOPES,
  JIRA_CALLBACK_PORT,
  JIRA_REDIRECT_URI,
} from '../auth/app-config.js';
import { requestDeviceCode, pollForToken } from '../auth/github-device-flow.js';
import {
  buildAuthorizationUrl,
  generateState,
  waitForAuthCode,
  completeJiraOAuthFlow,
} from '../auth/jira-oauth-flow.js';
import { getAuthStatuses } from '../auth/auth-provider.js';
import { GitHubClient } from '../clients/github-client.js';
import { JiraClient } from '../clients/jira-client.js';
import {
  createPrompt,
  ask,
  askSecret,
  askConfirm,
  printHeader,
  printSuccess,
  printWarning,
  printInfo,
  printError,
} from './prompt.js';

// ─── Login ─────────────────────────────────────────────────

export async function runAuthLogin(flags: Record<string, string>): Promise<void> {
  printHeader('prodbeam auth login');

  const githubOnly = flags['github'] !== undefined;
  const jiraOnly = flags['jira'] !== undefined;
  const method = flags['method']; // 'browser' | 'token'

  const rl = createPrompt();

  try {
    if (!jiraOnly) {
      await loginGitHub(rl, method);
    }
    console.log('');
    if (!githubOnly) {
      await loginJira(rl, method);
    }
  } finally {
    rl.close();
  }
}

async function loginGitHub(rl: Interface, methodFlag?: string): Promise<void> {
  console.log('');
  printInfo('GitHub Authentication');
  console.log('');

  // Check env var
  if (isGitHubFromEnv()) {
    printSuccess('GitHub: using GITHUB_TOKEN env var');
    return;
  }

  // Check existing OAuth tokens
  const existingOAuth = readGitHubOAuthTokens();
  if (existingOAuth) {
    const refreshExpiry = new Date(existingOAuth.refreshTokenExpiresAt);
    if (refreshExpiry > new Date()) {
      const keep = await askConfirm(
        rl,
        `GitHub: OAuth active (refreshes until ${refreshExpiry.toLocaleDateString()}). Keep current?`,
        true
      );
      if (keep) return;
    }
  }

  // Check existing PAT
  const existingPat = resolveGitHubCredentials();
  if (existingPat && !existingOAuth) {
    const keep = await askConfirm(rl, 'GitHub: token configured. Keep current?', true);
    if (keep) return;
  }

  // Determine method
  let useOAuth = methodFlag === 'browser';
  if (!useOAuth && methodFlag !== 'token') {
    const choice = await ask(
      rl,
      'How would you like to authenticate?\n  [1] Browser login (recommended)\n  [2] Paste a token\n  Choice',
      {
        required: true,
        validate: (v) => (v === '1' || v === '2' ? null : 'Enter 1 or 2'),
      }
    );
    useOAuth = choice === '1';
  }

  if (useOAuth) {
    await loginGitHubOAuth();
  } else {
    await loginGitHubPat(rl);
  }
}

async function loginGitHubOAuth(): Promise<void> {
  printInfo('Starting GitHub device flow...');

  const deviceCode = await requestDeviceCode(GITHUB_CLIENT_ID, GITHUB_SCOPES);

  console.log('');
  console.log(`  Enter this code in your browser: \x1b[1m${deviceCode.userCode}\x1b[0m`);
  console.log(`  Open: ${deviceCode.verificationUri}`);
  console.log('');
  printInfo('Waiting for authorization...');

  const tokens = await pollForToken(
    GITHUB_CLIENT_ID,
    deviceCode.deviceCode,
    deviceCode.interval,
    deviceCode.expiresIn
  );

  writeGitHubOAuthTokens(tokens);

  // Validate by fetching user info
  const client = new GitHubClient(tokens.accessToken);
  const user = await client.getAuthenticatedUser();
  printSuccess(`GitHub: authenticated as @${user.login} (OAuth)`);
}

async function loginGitHubPat(rl: Interface): Promise<void> {
  printInfo('Create a token at https://github.com/settings/tokens');
  printInfo('Required scopes: repo, read:org, read:user');

  const token = await askSecret(rl, 'GitHub personal access token');
  if (!token) {
    printError('Token is required.');
    return;
  }

  // Validate
  const client = new GitHubClient(token);
  try {
    const user = await client.getAuthenticatedUser();
    mergeCredentials({ github: { token } });
    printSuccess(`GitHub: authenticated as @${user.login} (token)`);
  } catch (error) {
    printError(
      `Authentication failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

async function loginJira(rl: Interface, methodFlag?: string): Promise<void> {
  printInfo('Jira Authentication');
  console.log('');

  // Check env vars
  if (isJiraFromEnv()) {
    printSuccess('Jira: using environment variables');
    return;
  }

  // Check existing OAuth tokens
  const existingOAuth = readJiraOAuthTokens();
  if (existingOAuth) {
    const refreshExpiry = new Date(existingOAuth.refreshTokenExpiresAt);
    if (refreshExpiry > new Date()) {
      const keep = await askConfirm(
        rl,
        `Jira: OAuth active (refreshes until ${refreshExpiry.toLocaleDateString()}). Keep current?`,
        true
      );
      if (keep) return;
    }
  }

  // Check existing PAT
  const existingPat = resolveJiraCredentials();
  if (existingPat && !existingOAuth) {
    const keep = await askConfirm(
      rl,
      `Jira: token configured for ${existingPat.host}. Keep current?`,
      true
    );
    if (keep) return;
  }

  // Determine method
  let useOAuth = methodFlag === 'browser';
  if (!useOAuth && methodFlag !== 'token') {
    const choice = await ask(
      rl,
      'How would you like to authenticate?\n  [1] Browser login\n  [2] Paste API token (recommended)\n  Choice',
      {
        required: true,
        validate: (v) => (v === '1' || v === '2' ? null : 'Enter 1 or 2'),
      }
    );
    useOAuth = choice === '1';
  }

  if (useOAuth) {
    await loginJiraOAuth();
  } else {
    await loginJiraPat(rl);
  }
}

async function loginJiraOAuth(): Promise<void> {
  printInfo('Starting Jira OAuth flow...');

  const state = generateState();
  const authUrl = buildAuthorizationUrl(JIRA_CLIENT_ID, JIRA_REDIRECT_URI, state, JIRA_SCOPES);

  console.log('');
  console.log(`  Open this URL in your browser:`);
  console.log(`  ${authUrl}`);
  console.log('');
  printInfo('Waiting for authorization...');

  const code = await waitForAuthCode(JIRA_CALLBACK_PORT, state);

  const tokens = await completeJiraOAuthFlow(
    JIRA_CLIENT_ID,
    JIRA_CLIENT_SECRET,
    code,
    JIRA_REDIRECT_URI,
    JIRA_SCOPES
  );

  writeJiraOAuthTokens(tokens);

  // Validate by fetching user info
  const client = new JiraClient({
    getBaseUrl: () => tokens.cloudUrl,
    getAuthHeader: () => Promise.resolve(`Bearer ${tokens.accessToken}`),
  });
  const user = await client.getMyself();
  printSuccess(`Jira: authenticated as ${user.displayName} (OAuth)`);
}

async function loginJiraPat(rl: Interface): Promise<void> {
  printInfo('Create a token at https://id.atlassian.com/manage-profile/security/api-tokens');

  const host = await ask(rl, 'Jira Cloud hostname (e.g., company.atlassian.net)', {
    required: true,
    validate: (v) => (v.includes('.') ? null : 'Must be a valid hostname'),
  });
  const email = await ask(rl, 'Jira account email', {
    required: true,
    validate: (v) => (v.includes('@') ? null : 'Must be a valid email'),
  });
  const apiToken = await askSecret(rl, 'Jira API token');
  if (!apiToken) {
    printError('Token is required.');
    return;
  }

  // Validate
  const client = new JiraClient(host, email, apiToken);
  try {
    const user = await client.getMyself();
    mergeCredentials({ jira: { host, email, apiToken } });
    printSuccess(`Jira: authenticated as ${user.displayName} (token)`);
  } catch (error) {
    printError(
      `Authentication failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

// ─── Status ────────────────────────────────────────────────

export function runAuthStatus(): void {
  printHeader('prodbeam auth status');
  console.log('');

  const statuses = getAuthStatuses();

  for (const status of statuses) {
    const label = status.service === 'github' ? 'GitHub' : 'Jira';

    if (!status.valid) {
      printWarning(`${label}: ${status.error ?? 'not configured'}`);
      continue;
    }

    if (status.method === 'oauth') {
      const expiresAt = status.expiresAt ? new Date(status.expiresAt) : null;
      const refreshExpiresAt = status.refreshExpiresAt ? new Date(status.refreshExpiresAt) : null;
      const timeLeft = expiresAt ? formatTimeLeft(expiresAt) : 'unknown';
      const refreshLeft = refreshExpiresAt ? formatTimeLeft(refreshExpiresAt) : 'unknown';
      printSuccess(`${label}: OAuth (token expires in ${timeLeft}, refresh in ${refreshLeft})`);
    } else {
      if (status.service === 'github' && isGitHubFromEnv()) {
        printSuccess(`${label}: GITHUB_TOKEN env var`);
      } else if (status.service === 'jira' && isJiraFromEnv()) {
        printSuccess(`${label}: env vars`);
      } else {
        printSuccess(`${label}: API token`);
      }
    }
  }
}

// ─── Logout ────────────────────────────────────────────────

export function runAuthLogout(flags: Record<string, string>): void {
  printHeader('prodbeam auth logout');
  console.log('');

  const githubOnly = flags['github'] !== undefined;
  const jiraOnly = flags['jira'] !== undefined;
  const logoutBoth = !githubOnly && !jiraOnly;

  if (logoutBoth || githubOnly) {
    const existing = readGitHubOAuthTokens();
    if (existing) {
      deleteOAuthTokens('github');
      printSuccess('GitHub: OAuth tokens removed');
    } else {
      printInfo('GitHub: no OAuth tokens found');
    }
  }

  if (logoutBoth || jiraOnly) {
    const existing = readJiraOAuthTokens();
    if (existing) {
      deleteOAuthTokens('jira');
      printSuccess('Jira: OAuth tokens removed');
    } else {
      printInfo('Jira: no OAuth tokens found');
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────

function formatTimeLeft(date: Date): string {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return 'expired';

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 30) {
    const months = Math.floor(days / 30);
    return `~${months}mo`;
  }
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(ms / (1000 * 60));
  return `${minutes}m`;
}
