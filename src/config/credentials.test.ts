import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
}));

vi.mock('./paths.js', () => ({
  credentialsPath: vi.fn(() => '/mock/.prodbeam/credentials.json'),
  ensureConfigDir: vi.fn(() => '/mock/.prodbeam'),
  resolveConfigDir: vi.fn(() => '/mock/.prodbeam'),
}));

import {
  resolveGitHubCredentials,
  resolveJiraCredentials,
  resolveCredentials,
  writeCredentials,
  hasGitHubCredentials,
  hasJiraCredentials,
} from './credentials.js';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

describe('credentials', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    // Save and clear env vars
    for (const key of ['GITHUB_TOKEN', 'JIRA_API_TOKEN', 'JIRA_EMAIL', 'JIRA_HOST']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('resolveGitHubCredentials', () => {
    it('returns null when no credentials available', () => {
      expect(resolveGitHubCredentials()).toBeNull();
    });

    it('resolves from GITHUB_TOKEN env var', () => {
      process.env['GITHUB_TOKEN'] = 'ghp_test123';
      expect(resolveGitHubCredentials()).toEqual({ token: 'ghp_test123' });
    });

    it('resolves from credentials file when env var not set', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ github: { token: 'file_token' } }));

      expect(resolveGitHubCredentials()).toEqual({ token: 'file_token' });
    });

    it('env var takes precedence over file', () => {
      process.env['GITHUB_TOKEN'] = 'env_token';
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ github: { token: 'file_token' } }));

      expect(resolveGitHubCredentials()).toEqual({ token: 'env_token' });
    });
  });

  describe('resolveJiraCredentials', () => {
    it('returns null when no credentials available', () => {
      expect(resolveJiraCredentials()).toBeNull();
    });

    it('resolves from env vars when all three are set', () => {
      process.env['JIRA_API_TOKEN'] = 'jira_token';
      process.env['JIRA_EMAIL'] = 'user@test.com';
      process.env['JIRA_HOST'] = 'test.atlassian.net';

      expect(resolveJiraCredentials()).toEqual({
        host: 'test.atlassian.net',
        email: 'user@test.com',
        apiToken: 'jira_token',
      });
    });

    it('returns null when only partial env vars set', () => {
      process.env['JIRA_API_TOKEN'] = 'jira_token';
      // Missing JIRA_EMAIL and JIRA_HOST
      expect(resolveJiraCredentials()).toBeNull();
    });

    it('resolves from credentials file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          jira: { host: 'prod.atlassian.net', email: 'a@b.com', apiToken: 'tok' },
        })
      );

      expect(resolveJiraCredentials()).toEqual({
        host: 'prod.atlassian.net',
        email: 'a@b.com',
        apiToken: 'tok',
      });
    });
  });

  describe('resolveCredentials', () => {
    it('returns empty object when nothing configured', () => {
      const creds = resolveCredentials();
      expect(creds.github).toBeUndefined();
      expect(creds.jira).toBeUndefined();
    });

    it('returns both when both configured', () => {
      process.env['GITHUB_TOKEN'] = 'gh_tok';
      process.env['JIRA_API_TOKEN'] = 'j_tok';
      process.env['JIRA_EMAIL'] = 'a@b.com';
      process.env['JIRA_HOST'] = 'x.atlassian.net';

      const creds = resolveCredentials();
      expect(creds.github).toBeDefined();
      expect(creds.jira).toBeDefined();
    });
  });

  describe('writeCredentials', () => {
    it('writes file with 600 permissions', () => {
      writeCredentials({ github: { token: 'test' } });

      expect(writeFileSync).toHaveBeenCalledWith(
        '/mock/.prodbeam/credentials.json',
        expect.stringContaining('"token": "test"'),
        'utf-8'
      );
      expect(chmodSync).toHaveBeenCalledWith('/mock/.prodbeam/credentials.json', 0o600);
    });
  });

  describe('has*Credentials', () => {
    it('hasGitHubCredentials returns false when missing', () => {
      expect(hasGitHubCredentials()).toBe(false);
    });

    it('hasGitHubCredentials returns true with env var', () => {
      process.env['GITHUB_TOKEN'] = 'tok';
      expect(hasGitHubCredentials()).toBe(true);
    });

    it('hasJiraCredentials returns false when missing', () => {
      expect(hasJiraCredentials()).toBe(false);
    });

    it('hasJiraCredentials returns true with env vars', () => {
      process.env['JIRA_API_TOKEN'] = 'tok';
      process.env['JIRA_EMAIL'] = 'a@b.com';
      process.env['JIRA_HOST'] = 'x.atlassian.net';
      expect(hasJiraCredentials()).toBe(true);
    });
  });
});
