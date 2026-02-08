/**
 * Credentials Resolver
 *
 * Resolves API credentials in order:
 * 1. Environment variables (GITHUB_TOKEN, JIRA_API_TOKEN, JIRA_EMAIL, JIRA_HOST)
 * 2. ~/.prodbeam/credentials.json
 * 3. Returns partial/null if neither found
 *
 * Credentials file is stored with 600 permissions (owner read/write only).
 */

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { z } from 'zod';
import type { CredentialsConfig, GitHubCredentials, JiraCredentials } from './types.js';
import { ensureConfigDir, credentialsPath } from './paths.js';

// ─── Zod Schema ──────────────────────────────────────────────

const CredentialsSchema = z.object({
  github: z
    .object({
      token: z.string().min(1),
    })
    .optional(),
  jira: z
    .object({
      host: z.string().min(1),
      email: z.string().email(),
      apiToken: z.string().min(1),
    })
    .optional(),
});

// ─── Environment Variable Names ──────────────────────────────

const ENV_GITHUB_TOKEN = 'GITHUB_TOKEN';
const ENV_JIRA_API_TOKEN = 'JIRA_API_TOKEN';
const ENV_JIRA_EMAIL = 'JIRA_EMAIL';
const ENV_JIRA_HOST = 'JIRA_HOST';

// ─── Resolve ─────────────────────────────────────────────────

/**
 * Resolve GitHub credentials.
 * Checks env var first, then credentials file.
 */
export function resolveGitHubCredentials(): GitHubCredentials | null {
  // 1. Environment variable
  const envToken = process.env[ENV_GITHUB_TOKEN];
  if (envToken) {
    return { token: envToken };
  }

  // 2. Credentials file
  const fileConfig = readCredentialsFile();
  if (fileConfig?.github?.token) {
    return fileConfig.github;
  }

  return null;
}

/**
 * Resolve Jira credentials.
 * Checks env vars first, then credentials file.
 */
export function resolveJiraCredentials(): JiraCredentials | null {
  // 1. Environment variables
  const envToken = process.env[ENV_JIRA_API_TOKEN];
  const envEmail = process.env[ENV_JIRA_EMAIL];
  const envHost = process.env[ENV_JIRA_HOST];

  if (envToken && envEmail && envHost) {
    return { host: envHost, email: envEmail, apiToken: envToken };
  }

  // 2. Credentials file
  const fileConfig = readCredentialsFile();
  if (fileConfig?.jira?.apiToken && fileConfig.jira.email && fileConfig.jira.host) {
    return fileConfig.jira;
  }

  return null;
}

/**
 * Resolve all credentials. Returns what's available.
 */
export function resolveCredentials(): CredentialsConfig {
  const github = resolveGitHubCredentials() ?? undefined;
  const jira = resolveJiraCredentials() ?? undefined;
  return { github, jira };
}

// ─── File Operations ─────────────────────────────────────────

/**
 * Read credentials from ~/.prodbeam/credentials.json.
 * Returns null if the file doesn't exist.
 */
function readCredentialsFile(): CredentialsConfig | null {
  const filePath = credentialsPath();
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  const result = CredentialsSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }
  return result.data;
}

/**
 * Write credentials to ~/.prodbeam/credentials.json with 600 permissions.
 */
export function writeCredentials(config: CredentialsConfig): void {
  ensureConfigDir();
  const filePath = credentialsPath();
  writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  chmodSync(filePath, 0o600);
}

/**
 * Merge new credentials into the existing credentials file.
 * Only overwrites fields present in newCreds; preserves the rest.
 * If no file exists, writes newCreds as the initial file.
 */
export function mergeCredentials(newCreds: CredentialsConfig): void {
  const existing = readCredentialsFile() ?? {};
  const merged: CredentialsConfig = { ...existing };

  if (newCreds.github) {
    merged.github = newCreds.github;
  }
  if (newCreds.jira) {
    merged.jira = newCreds.jira;
  }

  writeCredentials(merged);
}

/**
 * Check if any credentials are configured (env or file).
 */
export function hasGitHubCredentials(): boolean {
  return resolveGitHubCredentials() !== null;
}

export function hasJiraCredentials(): boolean {
  return resolveJiraCredentials() !== null;
}
