/**
 * OAuth Token Storage
 *
 * Reads and writes OAuth token entries in the existing credentials.json file.
 * Uses the `method` field to distinguish OAuth tokens from PAT credentials.
 * File permissions are maintained at 0o600 (owner read/write only).
 */

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { ensureConfigDir, credentialsPath } from '../config/paths.js';
import type { GitHubOAuthTokens, JiraOAuthTokens } from './types.js';

// ─── Read ──────────────────────────────────────────────────

/**
 * Read GitHub OAuth tokens from credentials.json.
 * Returns null if no file exists or the entry is not OAuth format.
 */
export function readGitHubOAuthTokens(): GitHubOAuthTokens | null {
  const data = readCredentialsRaw();
  if (!data?.['github']) return null;

  const gh = data['github'] as Record<string, unknown>;
  if (gh['method'] !== 'oauth') return null;

  return {
    method: 'oauth',
    accessToken: gh['accessToken'] as string,
    refreshToken: gh['refreshToken'] as string,
    accessTokenExpiresAt: gh['accessTokenExpiresAt'] as string,
    refreshTokenExpiresAt: gh['refreshTokenExpiresAt'] as string,
    scopes: (gh['scopes'] as string[]) ?? [],
    tokenType: 'bearer',
  };
}

/**
 * Read Jira OAuth tokens from credentials.json.
 * Returns null if no file exists or the entry is not OAuth format.
 */
export function readJiraOAuthTokens(): JiraOAuthTokens | null {
  const data = readCredentialsRaw();
  if (!data?.['jira']) return null;

  const jira = data['jira'] as Record<string, unknown>;
  if (jira['method'] !== 'oauth') return null;

  return {
    method: 'oauth',
    accessToken: jira['accessToken'] as string,
    refreshToken: jira['refreshToken'] as string,
    accessTokenExpiresAt: jira['accessTokenExpiresAt'] as string,
    refreshTokenExpiresAt: jira['refreshTokenExpiresAt'] as string,
    cloudId: jira['cloudId'] as string,
    cloudUrl: jira['cloudUrl'] as string,
    scopes: (jira['scopes'] as string[]) ?? [],
    tokenType: 'bearer',
  };
}

// ─── Write ─────────────────────────────────────────────────

/**
 * Write GitHub OAuth tokens to credentials.json.
 * Merges with existing data (preserves Jira entry).
 */
export function writeGitHubOAuthTokens(tokens: GitHubOAuthTokens): void {
  const data = readCredentialsRaw() ?? {};
  data['github'] = tokens;
  writeCredentialsRaw(data);
}

/**
 * Write Jira OAuth tokens to credentials.json.
 * Merges with existing data (preserves GitHub entry).
 */
export function writeJiraOAuthTokens(tokens: JiraOAuthTokens): void {
  const data = readCredentialsRaw() ?? {};
  data['jira'] = tokens;
  writeCredentialsRaw(data);
}

// ─── Delete ────────────────────────────────────────────────

/**
 * Remove OAuth tokens for a service from credentials.json.
 * Preserves the other service's credentials.
 */
export function deleteOAuthTokens(service: 'github' | 'jira'): void {
  const data = readCredentialsRaw();
  if (!data) return;

  delete data[service];
  writeCredentialsRaw(data);
}

// ─── Internal ──────────────────────────────────────────────

function readCredentialsRaw(): Record<string, unknown> | null {
  const filePath = credentialsPath();
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeCredentialsRaw(data: Record<string, unknown>): void {
  ensureConfigDir();
  const filePath = credentialsPath();
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  chmodSync(filePath, 0o600);
}
