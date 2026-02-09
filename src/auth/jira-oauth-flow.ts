/**
 * Jira OAuth 2.0 (3LO) Authentication Flow
 *
 * Implements the Authorization Code Grant with PKCE for Jira Cloud.
 * The flow uses a temporary localhost HTTP server to receive the callback.
 *
 * Flow:
 * 1. Build authorization URL with state parameter
 * 2. User opens URL in browser and authorizes
 * 3. Jira redirects to localhost callback with auth code
 * 4. Exchange auth code for access + refresh tokens
 * 5. Discover cloud resources (get cloudId for API calls)
 *
 * Token refresh uses the standard OAuth refresh_token grant.
 * Jira rotates refresh tokens on each use (90-day inactivity expiry).
 */

import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { JiraOAuthTokens, JiraCloudResource } from './types.js';

const AUTH_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';
const DEFAULT_TIMEOUT_MS = 30_000;

// ─── Authorization URL ─────────────────────────────────────

/**
 * Build the Jira OAuth authorization URL.
 * The user must visit this URL to authorize the application.
 */
export function buildAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[]
): string {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: clientId,
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
  });

  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Generate a cryptographically random state parameter.
 */
export function generateState(): string {
  return randomBytes(16).toString('hex');
}

// ─── Callback Server ───────────────────────────────────────

/**
 * Start a temporary localhost HTTP server and wait for the OAuth callback.
 * Returns the authorization code from the callback.
 *
 * The server binds to 127.0.0.1 only (no external access).
 * Shuts down automatically after receiving the callback or timing out.
 *
 * @throws {Error} If the state parameter doesn't match or the callback times out.
 */
export async function waitForAuthCode(
  port: number,
  state: string,
  timeoutMs = 120_000
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // eslint-disable-next-line prefer-const -- assigned after timer setup to avoid reference-before-init
    let server: Server;

    const timer = setTimeout(() => {
      server?.close();
      reject(new Error('OAuth callback timed out. Please try again.'));
    }, timeoutMs);

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      clearTimeout(timer);

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(errorHtml(error));
        server.close();
        reject(new Error(`Jira OAuth error: ${error}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(errorHtml('State mismatch — possible CSRF attack. Please try again.'));
        server.close();
        reject(new Error('OAuth state mismatch — possible CSRF attack.'));
        return;
      }

      if (!code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(errorHtml('No authorization code received.'));
        server.close();
        reject(new Error('No authorization code received from Jira.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(successHtml());
      server.close();
      resolve(code);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(`Port ${port} is already in use. Close the process using it and try again.`)
        );
      } else {
        reject(new Error(`Failed to start OAuth callback server: ${err.message}`));
      }
    });

    server.listen(port, '127.0.0.1');
  });
}

// ─── Token Exchange ────────────────────────────────────────

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jira token exchange failed: ${response.status} — ${body}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      accessToken: data['access_token'] as string,
      refreshToken: data['refresh_token'] as string,
      expiresIn: (data['expires_in'] as number) ?? 3600,
      scope: (data['scope'] as string) ?? '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Cloud Resource Discovery ──────────────────────────────

/**
 * Discover accessible Jira Cloud resources (sites) for the authenticated user.
 * Returns a list of cloud resources with their IDs and URLs.
 */
export async function discoverCloudResources(accessToken: string): Promise<JiraCloudResource[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(RESOURCES_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Cloud resource discovery failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Array<Record<string, unknown>>;
    return data.map((resource) => ({
      id: resource['id'] as string,
      url: resource['url'] as string,
      name: resource['name'] as string,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Token Refresh ─────────────────────────────────────────

/**
 * Refresh a Jira OAuth access token using the refresh token.
 * Jira rotates refresh tokens on each use.
 */
export async function refreshJiraToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jira token refresh failed: ${response.status} — ${body}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      accessToken: data['access_token'] as string,
      refreshToken: data['refresh_token'] as string,
      expiresIn: (data['expires_in'] as number) ?? 3600,
      scope: (data['scope'] as string) ?? '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Full OAuth Flow ───────────────────────────────────────

/**
 * Complete the Jira OAuth flow: exchange code, discover cloud, build tokens.
 * This is a convenience function that combines exchangeCodeForTokens and
 * discoverCloudResources into a single call.
 */
export async function completeJiraOAuthFlow(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  scopes: string[]
): Promise<JiraOAuthTokens> {
  const tokenResult = await exchangeCodeForTokens(clientId, clientSecret, code, redirectUri);

  const resources = await discoverCloudResources(tokenResult.accessToken);
  if (resources.length === 0) {
    throw new Error(
      'No accessible Jira Cloud sites found. Ensure you have access to at least one site.'
    );
  }

  // Use the first accessible resource
  const cloud = resources[0]!;
  const now = new Date();

  return {
    method: 'oauth',
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken,
    accessTokenExpiresAt: new Date(now.getTime() + tokenResult.expiresIn * 1000).toISOString(),
    // Jira refresh tokens expire after 90 days of inactivity
    refreshTokenExpiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    cloudId: cloud.id,
    cloudUrl: `https://api.atlassian.com/ex/jira/${cloud.id}`,
    scopes,
    tokenType: 'bearer',
  };
}

// ─── HTML Templates ────────────────────────────────────────

function successHtml(): string {
  return `<!DOCTYPE html>
<html><head><title>Prodbeam — Authorized</title></head>
<body style="font-family:system-ui;text-align:center;padding:40px">
<h2>Authorized</h2>
<p>You can close this tab and return to the terminal.</p>
</body></html>`;
}

function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><title>Prodbeam — Error</title></head>
<body style="font-family:system-ui;text-align:center;padding:40px">
<h2>Authorization Failed</h2>
<p>${escapeHtml(message)}</p>
<p>Please return to the terminal and try again.</p>
</body></html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
