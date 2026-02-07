import { describe, it, expect } from 'vitest';
import { GitHubMCPAdapter } from './github-mcp.js';

describe('GitHubMCPAdapter', () => {
  describe('isConfigured', () => {
    it('returns false when GITHUB_PERSONAL_ACCESS_TOKEN is not set', () => {
      const original = process.env['GITHUB_PERSONAL_ACCESS_TOKEN'];
      delete process.env['GITHUB_PERSONAL_ACCESS_TOKEN'];

      expect(GitHubMCPAdapter.isConfigured()).toBe(false);

      if (original) process.env['GITHUB_PERSONAL_ACCESS_TOKEN'] = original;
    });

    it('returns true when GITHUB_PERSONAL_ACCESS_TOKEN is set', () => {
      const original = process.env['GITHUB_PERSONAL_ACCESS_TOKEN'];
      process.env['GITHUB_PERSONAL_ACCESS_TOKEN'] = 'ghp_test123';

      expect(GitHubMCPAdapter.isConfigured()).toBe(true);

      if (original) {
        process.env['GITHUB_PERSONAL_ACCESS_TOKEN'] = original;
      } else {
        delete process.env['GITHUB_PERSONAL_ACCESS_TOKEN'];
      }
    });
  });

  describe('constructor', () => {
    it('creates an instance', () => {
      const adapter = new GitHubMCPAdapter();
      expect(adapter).toBeInstanceOf(GitHubMCPAdapter);
    });
  });

  describe('connect', () => {
    it('throws when token is not configured', async () => {
      const original = process.env['GITHUB_PERSONAL_ACCESS_TOKEN'];
      delete process.env['GITHUB_PERSONAL_ACCESS_TOKEN'];

      const adapter = new GitHubMCPAdapter();
      await expect(adapter.connect()).rejects.toThrow('GITHUB_PERSONAL_ACCESS_TOKEN is not set');

      if (original) process.env['GITHUB_PERSONAL_ACCESS_TOKEN'] = original;
    });
  });

  describe('fetchActivity', () => {
    it('throws when not connected', async () => {
      const adapter = new GitHubMCPAdapter();
      await expect(adapter.fetchActivity(24)).rejects.toThrow('Not connected');
    });
  });
});
