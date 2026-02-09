/**
 * Auth Provider
 *
 * Central abstraction for resolving authentication credentials.
 * Tool handlers call these functions instead of raw credential resolution.
 *
 * Resolution order (same for both services):
 * 1. Environment variables → return as PAT (always wins, no refresh needed)
 * 2. credentials.json → check `method` field:
 *    - If `method: 'oauth'` → check expiry, refresh if needed, return token
 *    - If no `method` (or PAT format) → return as PAT
 * 3. Return null
 *
 * Refresh logic:
 * - If access token expires within 5 minutes → silent refresh
 * - If refresh fails → throw AuthExpiredError
 */

import {
  resolveGitHubCredentials,
  resolveJiraCredentials,
  isGitHubFromEnv,
  isJiraFromEnv,
} from '../config/credentials.js';
import {
  readGitHubOAuthTokens,
  readJiraOAuthTokens,
  writeGitHubOAuthTokens,
  writeJiraOAuthTokens,
} from './token-store.js';
import { refreshGitHubToken } from './github-device-flow.js';
import { refreshJiraToken } from './jira-oauth-flow.js';
import { GITHUB_CLIENT_ID, JIRA_CLIENT_ID, JIRA_CLIENT_SECRET } from './app-config.js';
import type { ResolvedGitHubAuth, ResolvedJiraAuth, AuthStatus } from './types.js';

/** Buffer before expiry to trigger proactive refresh (5 minutes). */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ─── Auth Expired Error ────────────────────────────────────

export class AuthExpiredError extends Error {
  constructor(public service: 'github' | 'jira') {
    super(
      `${service === 'github' ? 'GitHub' : 'Jira'} OAuth session expired. ` +
        'Run "prodbeam auth login" to re-authenticate.'
    );
    this.name = 'AuthExpiredError';
  }
}

// ─── GitHub Auth ───────────────────────────────────────────

/**
 * Resolve GitHub authentication.
 * Returns token + method, or null if no credentials found.
 * For OAuth tokens, handles automatic refresh.
 */
export async function resolveGitHubAuth(): Promise<ResolvedGitHubAuth | null> {
  // 1. Environment variable — always wins
  if (isGitHubFromEnv()) {
    const creds = resolveGitHubCredentials();
    if (creds) {
      return { token: creds.token, method: 'pat' };
    }
  }

  // 2. Check for OAuth tokens in credentials.json
  const oauthTokens = readGitHubOAuthTokens();
  if (oauthTokens) {
    const now = Date.now();
    const accessExpiry = new Date(oauthTokens.accessTokenExpiresAt).getTime();
    const refreshExpiry = new Date(oauthTokens.refreshTokenExpiresAt).getTime();

    // Access token still valid
    if (accessExpiry - now > REFRESH_BUFFER_MS) {
      return { token: oauthTokens.accessToken, method: 'oauth' };
    }

    // Access token expired or expiring — try refresh
    if (refreshExpiry > now) {
      try {
        const refreshed = await refreshGitHubToken(GITHUB_CLIENT_ID, oauthTokens.refreshToken);
        writeGitHubOAuthTokens(refreshed);
        return { token: refreshed.accessToken, method: 'oauth' };
      } catch {
        throw new AuthExpiredError('github');
      }
    }

    // Refresh token also expired
    throw new AuthExpiredError('github');
  }

  // 3. Check for PAT in credentials.json
  const patCreds = resolveGitHubCredentials();
  if (patCreds) {
    return { token: patCreds.token, method: 'pat' };
  }

  return null;
}

// ─── Jira Auth ─────────────────────────────────────────────

/**
 * Resolve Jira authentication.
 * Returns base URL + auth header + method, or null if no credentials found.
 * For OAuth tokens, handles automatic refresh.
 */
export async function resolveJiraAuth(): Promise<ResolvedJiraAuth | null> {
  // 1. Environment variables — always wins
  if (isJiraFromEnv()) {
    const creds = resolveJiraCredentials();
    if (creds) {
      const baseUrl = creds.host.startsWith('https://') ? creds.host : `https://${creds.host}`;
      const authHeader = `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64')}`;
      return { baseUrl: baseUrl.replace(/\/$/, ''), authHeader, method: 'pat' };
    }
  }

  // 2. Check for OAuth tokens in credentials.json
  const oauthTokens = readJiraOAuthTokens();
  if (oauthTokens) {
    const now = Date.now();
    const accessExpiry = new Date(oauthTokens.accessTokenExpiresAt).getTime();
    const refreshExpiry = new Date(oauthTokens.refreshTokenExpiresAt).getTime();

    // Access token still valid
    if (accessExpiry - now > REFRESH_BUFFER_MS) {
      return {
        baseUrl: oauthTokens.cloudUrl,
        authHeader: `Bearer ${oauthTokens.accessToken}`,
        method: 'oauth',
      };
    }

    // Access token expired or expiring — try refresh
    if (refreshExpiry > now) {
      try {
        const result = await refreshJiraToken(
          JIRA_CLIENT_ID,
          JIRA_CLIENT_SECRET,
          oauthTokens.refreshToken
        );
        const refreshed: typeof oauthTokens = {
          ...oauthTokens,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          accessTokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
          // Reset the 90-day inactivity window on refresh
          refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        };
        writeJiraOAuthTokens(refreshed);
        return {
          baseUrl: refreshed.cloudUrl,
          authHeader: `Bearer ${refreshed.accessToken}`,
          method: 'oauth',
        };
      } catch {
        throw new AuthExpiredError('jira');
      }
    }

    // Refresh token also expired
    throw new AuthExpiredError('jira');
  }

  // 3. Check for PAT in credentials.json
  const patCreds = resolveJiraCredentials();
  if (patCreds) {
    const baseUrl = patCreds.host.startsWith('https://')
      ? patCreds.host
      : `https://${patCreds.host}`;
    const authHeader = `Basic ${Buffer.from(`${patCreds.email}:${patCreds.apiToken}`).toString('base64')}`;
    return { baseUrl: baseUrl.replace(/\/$/, ''), authHeader, method: 'pat' };
  }

  return null;
}

// ─── Auth Status ───────────────────────────────────────────

/**
 * Get the authentication status for both services.
 * Used by `prodbeam auth status` and `get_capabilities`.
 */
export function getAuthStatuses(): AuthStatus[] {
  const statuses: AuthStatus[] = [];

  // GitHub status
  if (isGitHubFromEnv()) {
    statuses.push({ service: 'github', method: 'pat', valid: true });
  } else {
    const oauthTokens = readGitHubOAuthTokens();
    if (oauthTokens) {
      const now = Date.now();
      const refreshExpiry = new Date(oauthTokens.refreshTokenExpiresAt).getTime();
      const valid = refreshExpiry > now;
      statuses.push({
        service: 'github',
        method: 'oauth',
        expiresAt: oauthTokens.accessTokenExpiresAt,
        refreshExpiresAt: oauthTokens.refreshTokenExpiresAt,
        valid,
        error: valid ? undefined : 'Refresh token expired',
      });
    } else {
      const patCreds = resolveGitHubCredentials();
      if (patCreds) {
        statuses.push({ service: 'github', method: 'pat', valid: true });
      } else {
        statuses.push({
          service: 'github',
          method: 'pat',
          valid: false,
          error: 'Not configured',
        });
      }
    }
  }

  // Jira status
  if (isJiraFromEnv()) {
    statuses.push({ service: 'jira', method: 'pat', valid: true });
  } else {
    const oauthTokens = readJiraOAuthTokens();
    if (oauthTokens) {
      const now = Date.now();
      const refreshExpiry = new Date(oauthTokens.refreshTokenExpiresAt).getTime();
      const valid = refreshExpiry > now;
      statuses.push({
        service: 'jira',
        method: 'oauth',
        expiresAt: oauthTokens.accessTokenExpiresAt,
        refreshExpiresAt: oauthTokens.refreshTokenExpiresAt,
        valid,
        error: valid ? undefined : 'Refresh token expired',
      });
    } else {
      const patCreds = resolveJiraCredentials();
      if (patCreds) {
        statuses.push({ service: 'jira', method: 'pat', valid: true });
      } else {
        statuses.push({
          service: 'jira',
          method: 'pat',
          valid: false,
          error: 'Not configured (optional)',
        });
      }
    }
  }

  return statuses;
}
