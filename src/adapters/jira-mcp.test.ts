import { describe, it, expect } from 'vitest';
import { JiraMCPAdapter } from './jira-mcp.js';

describe('JiraMCPAdapter', () => {
  describe('isConfigured', () => {
    it('returns false when env vars are not set', () => {
      const origToken = process.env['JIRA_API_TOKEN'];
      const origEmail = process.env['JIRA_EMAIL'];
      const origUrl = process.env['JIRA_URL'];

      delete process.env['JIRA_API_TOKEN'];
      delete process.env['JIRA_EMAIL'];
      delete process.env['JIRA_URL'];

      expect(JiraMCPAdapter.isConfigured()).toBe(false);

      if (origToken) process.env['JIRA_API_TOKEN'] = origToken;
      if (origEmail) process.env['JIRA_EMAIL'] = origEmail;
      if (origUrl) process.env['JIRA_URL'] = origUrl;
    });

    it('returns false when only partial env vars are set', () => {
      const origToken = process.env['JIRA_API_TOKEN'];
      const origEmail = process.env['JIRA_EMAIL'];
      const origUrl = process.env['JIRA_URL'];

      process.env['JIRA_API_TOKEN'] = 'test-token';
      delete process.env['JIRA_EMAIL'];
      delete process.env['JIRA_URL'];

      expect(JiraMCPAdapter.isConfigured()).toBe(false);

      if (origToken) {
        process.env['JIRA_API_TOKEN'] = origToken;
      } else {
        delete process.env['JIRA_API_TOKEN'];
      }
      if (origEmail) process.env['JIRA_EMAIL'] = origEmail;
      if (origUrl) process.env['JIRA_URL'] = origUrl;
    });

    it('returns true when all env vars are set', () => {
      const origToken = process.env['JIRA_API_TOKEN'];
      const origEmail = process.env['JIRA_EMAIL'];
      const origUrl = process.env['JIRA_URL'];

      process.env['JIRA_API_TOKEN'] = 'test-token';
      process.env['JIRA_EMAIL'] = 'test@example.com';
      process.env['JIRA_URL'] = 'https://test.atlassian.net';

      expect(JiraMCPAdapter.isConfigured()).toBe(true);

      if (origToken) {
        process.env['JIRA_API_TOKEN'] = origToken;
      } else {
        delete process.env['JIRA_API_TOKEN'];
      }
      if (origEmail) {
        process.env['JIRA_EMAIL'] = origEmail;
      } else {
        delete process.env['JIRA_EMAIL'];
      }
      if (origUrl) {
        process.env['JIRA_URL'] = origUrl;
      } else {
        delete process.env['JIRA_URL'];
      }
    });
  });

  describe('connect', () => {
    it('throws when env vars are missing', async () => {
      const origToken = process.env['JIRA_API_TOKEN'];
      delete process.env['JIRA_API_TOKEN'];

      const adapter = new JiraMCPAdapter();
      await expect(adapter.connect()).rejects.toThrow('Jira MCP not configured');

      if (origToken) process.env['JIRA_API_TOKEN'] = origToken;
    });
  });

  describe('fetchActivity', () => {
    it('throws when not connected', async () => {
      const adapter = new JiraMCPAdapter();
      await expect(adapter.fetchActivity(24)).rejects.toThrow('Not connected');
    });
  });
});
