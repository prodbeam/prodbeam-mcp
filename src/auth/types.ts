/**
 * OAuth Authentication Types
 *
 * Defines token structures for GitHub App (device flow) and
 * Jira OAuth 2.0 (3LO flow). The `method` field discriminates
 * between OAuth and PAT formats in credentials.json.
 */

export type AuthMethod = 'pat' | 'oauth';

// ─── GitHub OAuth ──────────────────────────────────────────

export interface GitHubOAuthTokens {
  method: 'oauth';
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string; // ISO 8601
  refreshTokenExpiresAt: string; // ISO 8601
  scopes: string[];
  tokenType: 'bearer';
}

export interface GitHubDeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

// ─── Jira OAuth ────────────────────────────────────────────

export interface JiraOAuthTokens {
  method: 'oauth';
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string; // ISO 8601
  refreshTokenExpiresAt: string; // ISO 8601
  cloudId: string;
  cloudUrl: string; // https://api.atlassian.com/ex/jira/{cloudId}
  scopes: string[];
  tokenType: 'bearer';
}

export interface JiraCloudResource {
  id: string;
  url: string;
  name: string;
}

// ─── Auth Provider ─────────────────────────────────────────

export interface ResolvedGitHubAuth {
  token: string;
  method: AuthMethod;
}

export interface ResolvedJiraAuth {
  baseUrl: string; // host URL for PAT, api.atlassian.com/ex/jira/{cloudId} for OAuth
  authHeader: string; // "Bearer {token}" or "Basic {base64}"
  method: AuthMethod;
}

export interface AuthStatus {
  service: 'github' | 'jira';
  method: AuthMethod;
  expiresAt?: string;
  refreshExpiresAt?: string;
  valid: boolean;
  error?: string;
}
