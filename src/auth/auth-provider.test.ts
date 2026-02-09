import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveGitHubAuth,
  resolveJiraAuth,
  getAuthStatuses,
  AuthExpiredError,
} from './auth-provider.js';

// Mock dependencies
vi.mock('../config/credentials.js', () => ({
  resolveGitHubCredentials: vi.fn(),
  resolveJiraCredentials: vi.fn(),
  isGitHubFromEnv: vi.fn(),
  isJiraFromEnv: vi.fn(),
}));

vi.mock('./token-store.js', () => ({
  readGitHubOAuthTokens: vi.fn(),
  readJiraOAuthTokens: vi.fn(),
  writeGitHubOAuthTokens: vi.fn(),
  writeJiraOAuthTokens: vi.fn(),
}));

vi.mock('./github-device-flow.js', () => ({
  refreshGitHubToken: vi.fn(),
}));

vi.mock('./jira-oauth-flow.js', () => ({
  refreshJiraToken: vi.fn(),
}));

vi.mock('./app-config.js', () => ({
  GITHUB_CLIENT_ID: 'test-gh-client',
  JIRA_CLIENT_ID: 'test-jira-client',
  JIRA_CLIENT_SECRET: 'test-jira-secret',
}));

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

const mockIsGHEnv = vi.mocked(isGitHubFromEnv);
const mockIsJiraEnv = vi.mocked(isJiraFromEnv);
const mockResolveGH = vi.mocked(resolveGitHubCredentials);
const mockResolveJira = vi.mocked(resolveJiraCredentials);
const mockReadGHOAuth = vi.mocked(readGitHubOAuthTokens);
const mockReadJiraOAuth = vi.mocked(readJiraOAuthTokens);
const mockWriteGHOAuth = vi.mocked(writeGitHubOAuthTokens);
const mockWriteJiraOAuth = vi.mocked(writeJiraOAuthTokens);
const mockRefreshGH = vi.mocked(refreshGitHubToken);
const mockRefreshJira = vi.mocked(refreshJiraToken);

describe('auth-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsGHEnv.mockReturnValue(false);
    mockIsJiraEnv.mockReturnValue(false);
    mockResolveGH.mockReturnValue(null);
    mockResolveJira.mockReturnValue(null);
    mockReadGHOAuth.mockReturnValue(null);
    mockReadJiraOAuth.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveGitHubAuth', () => {
    it('returns env var token when GITHUB_TOKEN is set', async () => {
      mockIsGHEnv.mockReturnValue(true);
      mockResolveGH.mockReturnValue({ token: 'ghp_env' });

      const result = await resolveGitHubAuth();
      expect(result).toEqual({ token: 'ghp_env', method: 'pat' });
    });

    it('returns OAuth token when valid and not expired', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h from now
      const farFuture = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(); // 6mo

      mockReadGHOAuth.mockReturnValue({
        method: 'oauth',
        accessToken: 'ghu_valid',
        refreshToken: 'ghr_valid',
        accessTokenExpiresAt: future,
        refreshTokenExpiresAt: farFuture,
        scopes: ['repo'],
        tokenType: 'bearer',
      });

      const result = await resolveGitHubAuth();
      expect(result).toEqual({ token: 'ghu_valid', method: 'oauth' });
    });

    it('refreshes token when access token is about to expire', async () => {
      const nearExpiry = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 min from now
      const farFuture = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

      mockReadGHOAuth.mockReturnValue({
        method: 'oauth',
        accessToken: 'ghu_old',
        refreshToken: 'ghr_old',
        accessTokenExpiresAt: nearExpiry,
        refreshTokenExpiresAt: farFuture,
        scopes: ['repo'],
        tokenType: 'bearer',
      });

      mockRefreshGH.mockResolvedValue({
        method: 'oauth',
        accessToken: 'ghu_refreshed',
        refreshToken: 'ghr_refreshed',
        accessTokenExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        refreshTokenExpiresAt: farFuture,
        scopes: ['repo'],
        tokenType: 'bearer',
      });

      const result = await resolveGitHubAuth();
      expect(result).toEqual({ token: 'ghu_refreshed', method: 'oauth' });
      expect(mockWriteGHOAuth).toHaveBeenCalled();
    });

    it('throws AuthExpiredError when refresh token is expired', async () => {
      const past = new Date(Date.now() - 1000).toISOString();

      mockReadGHOAuth.mockReturnValue({
        method: 'oauth',
        accessToken: 'ghu_expired',
        refreshToken: 'ghr_expired',
        accessTokenExpiresAt: past,
        refreshTokenExpiresAt: past,
        scopes: ['repo'],
        tokenType: 'bearer',
      });

      await expect(resolveGitHubAuth()).rejects.toThrow(AuthExpiredError);
    });

    it('falls back to PAT when no OAuth tokens', async () => {
      mockResolveGH.mockReturnValue({ token: 'ghp_pat' });

      const result = await resolveGitHubAuth();
      expect(result).toEqual({ token: 'ghp_pat', method: 'pat' });
    });

    it('returns null when no credentials at all', async () => {
      const result = await resolveGitHubAuth();
      expect(result).toBeNull();
    });
  });

  describe('resolveJiraAuth', () => {
    it('returns env var credentials when set', async () => {
      mockIsJiraEnv.mockReturnValue(true);
      mockResolveJira.mockReturnValue({
        host: 'acme.atlassian.net',
        email: 'a@b.com',
        apiToken: 'tok',
      });

      const result = await resolveJiraAuth();
      expect(result).not.toBeNull();
      expect(result!.method).toBe('pat');
      expect(result!.baseUrl).toBe('https://acme.atlassian.net');
      expect(result!.authHeader).toContain('Basic');
    });

    it('returns OAuth token when valid', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const farFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      mockReadJiraOAuth.mockReturnValue({
        method: 'oauth',
        accessToken: 'eyJ_valid',
        refreshToken: 'jr_valid',
        accessTokenExpiresAt: future,
        refreshTokenExpiresAt: farFuture,
        cloudId: 'cloud-123',
        cloudUrl: 'https://api.atlassian.com/ex/jira/cloud-123',
        scopes: ['read:jira-work'],
        tokenType: 'bearer',
      });

      const result = await resolveJiraAuth();
      expect(result).toEqual({
        baseUrl: 'https://api.atlassian.com/ex/jira/cloud-123',
        authHeader: 'Bearer eyJ_valid',
        method: 'oauth',
      });
    });

    it('refreshes expired Jira token', async () => {
      const nearExpiry = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      const farFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      mockReadJiraOAuth.mockReturnValue({
        method: 'oauth',
        accessToken: 'eyJ_old',
        refreshToken: 'jr_old',
        accessTokenExpiresAt: nearExpiry,
        refreshTokenExpiresAt: farFuture,
        cloudId: 'cloud-123',
        cloudUrl: 'https://api.atlassian.com/ex/jira/cloud-123',
        scopes: ['read:jira-work'],
        tokenType: 'bearer',
      });

      mockRefreshJira.mockResolvedValue({
        accessToken: 'eyJ_refreshed',
        refreshToken: 'jr_refreshed',
        expiresIn: 3600,
        scope: 'read:jira-work',
      });

      const result = await resolveJiraAuth();
      expect(result!.authHeader).toBe('Bearer eyJ_refreshed');
      expect(mockWriteJiraOAuth).toHaveBeenCalled();
    });

    it('returns null when no credentials', async () => {
      const result = await resolveJiraAuth();
      expect(result).toBeNull();
    });
  });

  describe('getAuthStatuses', () => {
    it('reports env var auth as PAT', () => {
      mockIsGHEnv.mockReturnValue(true);
      mockIsJiraEnv.mockReturnValue(true);

      const statuses = getAuthStatuses();
      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toEqual({ service: 'github', method: 'pat', valid: true });
      expect(statuses[1]).toEqual({ service: 'jira', method: 'pat', valid: true });
    });

    it('reports OAuth status with expiry info', () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const farFuture = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

      mockReadGHOAuth.mockReturnValue({
        method: 'oauth',
        accessToken: 'ghu',
        refreshToken: 'ghr',
        accessTokenExpiresAt: future,
        refreshTokenExpiresAt: farFuture,
        scopes: ['repo'],
        tokenType: 'bearer',
      });
      mockResolveJira.mockReturnValue(null);

      const statuses = getAuthStatuses();
      const ghStatus = statuses.find((s) => s.service === 'github');
      expect(ghStatus!.method).toBe('oauth');
      expect(ghStatus!.valid).toBe(true);
      expect(ghStatus!.expiresAt).toBe(future);
    });

    it('reports not configured when no credentials', () => {
      const statuses = getAuthStatuses();
      const ghStatus = statuses.find((s) => s.service === 'github');
      expect(ghStatus!.valid).toBe(false);
      expect(ghStatus!.error).toBe('Not configured');
    });
  });
});
