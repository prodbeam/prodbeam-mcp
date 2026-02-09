import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as paths from '../config/paths.js';
import {
  readGitHubOAuthTokens,
  readJiraOAuthTokens,
  writeGitHubOAuthTokens,
  writeJiraOAuthTokens,
  deleteOAuthTokens,
} from './token-store.js';
import type { GitHubOAuthTokens, JiraOAuthTokens } from './types.js';

vi.mock('node:fs');
vi.mock('../config/paths.js');

const mockFs = vi.mocked(fs);
const mockPaths = vi.mocked(paths);

const CREDS_PATH = '/test/.prodbeam/credentials.json';

function makeGitHubOAuth(): GitHubOAuthTokens {
  return {
    method: 'oauth',
    accessToken: 'ghu_test',
    refreshToken: 'ghr_test',
    accessTokenExpiresAt: '2026-02-08T22:00:00Z',
    refreshTokenExpiresAt: '2026-08-07T14:00:00Z',
    scopes: ['repo', 'read:org'],
    tokenType: 'bearer',
  };
}

function makeJiraOAuth(): JiraOAuthTokens {
  return {
    method: 'oauth',
    accessToken: 'eyJ_test',
    refreshToken: 'jira_refresh_test',
    accessTokenExpiresAt: '2026-02-08T15:30:00Z',
    refreshTokenExpiresAt: '2026-05-09T14:30:00Z',
    cloudId: 'cloud-123',
    cloudUrl: 'https://api.atlassian.com/ex/jira/cloud-123',
    scopes: ['read:jira-work', 'offline_access'],
    tokenType: 'bearer',
  };
}

describe('token-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaths.credentialsPath.mockReturnValue(CREDS_PATH);
    mockPaths.ensureConfigDir.mockReturnValue('/test/.prodbeam');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readGitHubOAuthTokens', () => {
    it('returns null when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(readGitHubOAuthTokens()).toBeNull();
    });

    it('returns null when github entry has no method field (PAT)', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ github: { token: 'ghp_test' } }));
      expect(readGitHubOAuthTokens()).toBeNull();
    });

    it('returns tokens when github entry has method: oauth', () => {
      const oauthData = makeGitHubOAuth();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ github: oauthData }));

      const result = readGitHubOAuthTokens();
      expect(result).not.toBeNull();
      expect(result!.method).toBe('oauth');
      expect(result!.accessToken).toBe('ghu_test');
      expect(result!.refreshToken).toBe('ghr_test');
    });

    it('returns null when JSON is invalid', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');
      expect(readGitHubOAuthTokens()).toBeNull();
    });
  });

  describe('readJiraOAuthTokens', () => {
    it('returns null when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(readJiraOAuthTokens()).toBeNull();
    });

    it('returns null for PAT-format jira entry', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({ jira: { host: 'acme.atlassian.net', email: 'a@b.com', apiToken: 'tok' } })
      );
      expect(readJiraOAuthTokens()).toBeNull();
    });

    it('returns tokens for OAuth jira entry', () => {
      const oauthData = makeJiraOAuth();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ jira: oauthData }));

      const result = readJiraOAuthTokens();
      expect(result).not.toBeNull();
      expect(result!.cloudId).toBe('cloud-123');
      expect(result!.accessToken).toBe('eyJ_test');
    });
  });

  describe('writeGitHubOAuthTokens', () => {
    it('writes to credentials.json with 0o600 permissions', () => {
      mockFs.existsSync.mockReturnValue(false);
      const tokens = makeGitHubOAuth();

      writeGitHubOAuthTokens(tokens);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        CREDS_PATH,
        expect.stringContaining('"method": "oauth"'),
        'utf-8'
      );
      expect(mockFs.chmodSync).toHaveBeenCalledWith(CREDS_PATH, 0o600);
    });

    it('preserves existing jira entry when writing github', () => {
      const existing = { jira: { host: 'acme.atlassian.net', email: 'a@b.com', apiToken: 'tok' } };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existing));

      writeGitHubOAuthTokens(makeGitHubOAuth());

      const written = JSON.parse(
        (mockFs.writeFileSync as unknown as { mock: { calls: [string, string][] } }).mock
          .calls[0]![1]
      ) as Record<string, unknown>;
      expect(written['jira']).toEqual(existing.jira);
      expect((written['github'] as Record<string, unknown>)['method']).toBe('oauth');
    });
  });

  describe('writeJiraOAuthTokens', () => {
    it('preserves existing github entry when writing jira', () => {
      const existing = { github: { token: 'ghp_test' } };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existing));

      writeJiraOAuthTokens(makeJiraOAuth());

      const written = JSON.parse(
        (mockFs.writeFileSync as unknown as { mock: { calls: [string, string][] } }).mock
          .calls[0]![1]
      ) as Record<string, unknown>;
      expect(written['github']).toEqual(existing.github);
      expect((written['jira'] as Record<string, unknown>)['method']).toBe('oauth');
    });
  });

  describe('deleteOAuthTokens', () => {
    it('removes github entry but keeps jira', () => {
      const existing = { github: makeGitHubOAuth(), jira: makeJiraOAuth() };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existing));

      deleteOAuthTokens('github');

      const written = JSON.parse(
        (mockFs.writeFileSync as unknown as { mock: { calls: [string, string][] } }).mock
          .calls[0]![1]
      ) as Record<string, unknown>;
      expect(written['github']).toBeUndefined();
      expect(written['jira']).toBeDefined();
    });

    it('does nothing when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      deleteOAuthTokens('github');
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});
