/**
 * GitHub Device Flow Authentication
 *
 * Implements RFC 8628 (OAuth 2.0 Device Authorization Grant) for GitHub Apps.
 * This flow is designed for CLI tools — the user authorizes via browser while
 * the CLI polls for the token.
 *
 * Flow:
 * 1. Request a device code from GitHub
 * 2. Display the user code and verification URL to the user
 * 3. Poll GitHub until the user authorizes (or the code expires)
 * 4. Store the access + refresh tokens
 *
 * Token refresh uses the standard OAuth refresh_token grant.
 */

import type { GitHubDeviceCodeResponse, GitHubOAuthTokens } from './types.js';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const DEFAULT_TIMEOUT_MS = 30_000;

// ─── Device Code Request ───────────────────────────────────

/**
 * Request a device code from GitHub.
 * The user must visit verificationUri and enter userCode.
 */
export async function requestDeviceCode(
  clientId: string,
  scopes: string[]
): Promise<GitHubDeviceCodeResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: scopes.join(' '),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `GitHub device code request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      deviceCode: data['device_code'] as string,
      userCode: data['user_code'] as string,
      verificationUri: data['verification_uri'] as string,
      interval: (data['interval'] as number) ?? 5,
      expiresIn: (data['expires_in'] as number) ?? 900,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Token Polling ─────────────────────────────────────────

/**
 * Poll GitHub for an access token after the user has been shown the device code.
 * Respects the polling interval and handles slow_down responses.
 *
 * @throws {Error} If the code expires or the user denies access.
 */
export async function pollForToken(
  clientId: string,
  deviceCode: string,
  interval: number,
  expiresIn: number
): Promise<GitHubOAuthTokens> {
  const deadline = Date.now() + expiresIn * 1000;
  let pollInterval = interval;

  while (Date.now() < deadline) {
    await sleep(pollInterval * 1000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
        signal: controller.signal,
      });

      const data = (await response.json()) as Record<string, unknown>;
      const error = data['error'] as string | undefined;

      if (error === 'authorization_pending') {
        continue;
      }

      if (error === 'slow_down') {
        // GitHub asks us to increase the interval by 5 seconds
        pollInterval += 5;
        continue;
      }

      if (error === 'expired_token') {
        throw new Error('Device code expired. Please restart the authentication flow.');
      }

      if (error === 'access_denied') {
        throw new Error('User denied the authorization request.');
      }

      if (error) {
        throw new Error(`GitHub OAuth error: ${error}`);
      }

      // Success — we have tokens
      const accessToken = data['access_token'] as string;
      const refreshToken = data['refresh_token'] as string;
      const expiresInSec = (data['expires_in'] as number) ?? 28800; // 8h default
      const refreshExpiresInSec = (data['refresh_token_expires_in'] as number) ?? 15811200; // ~6mo

      const now = new Date();
      return {
        method: 'oauth',
        accessToken,
        refreshToken,
        accessTokenExpiresAt: new Date(now.getTime() + expiresInSec * 1000).toISOString(),
        refreshTokenExpiresAt: new Date(now.getTime() + refreshExpiresInSec * 1000).toISOString(),
        scopes: ((data['scope'] as string) ?? '').split(',').filter(Boolean),
        tokenType: 'bearer',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Device code expired. Please restart the authentication flow.');
}

// ─── Token Refresh ─────────────────────────────────────────

/**
 * Refresh a GitHub OAuth access token using the refresh token.
 * Returns new access + refresh tokens (GitHub rotates both).
 */
export async function refreshGitHubToken(
  clientId: string,
  refreshToken: string
): Promise<GitHubOAuthTokens> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      signal: controller.signal,
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (data['error']) {
      throw new Error(
        `GitHub token refresh failed: ${String(data['error'])} — ${String(data['error_description'] ?? '')}`
      );
    }

    const accessToken = data['access_token'] as string;
    const newRefreshToken = data['refresh_token'] as string;
    const expiresInSec = (data['expires_in'] as number) ?? 28800;
    const refreshExpiresInSec = (data['refresh_token_expires_in'] as number) ?? 15811200;

    const now = new Date();
    return {
      method: 'oauth',
      accessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresAt: new Date(now.getTime() + expiresInSec * 1000).toISOString(),
      refreshTokenExpiresAt: new Date(now.getTime() + refreshExpiresInSec * 1000).toISOString(),
      scopes: ((data['scope'] as string) ?? '').split(',').filter(Boolean),
      tokenType: 'bearer',
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Helpers ───────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
