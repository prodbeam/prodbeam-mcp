import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
}));

vi.mock('./paths.js', () => ({
  teamConfigPath: vi.fn(() => '/mock/.prodbeam/team.json'),
  ensureConfigDir: vi.fn(() => '/mock/.prodbeam'),
  resolveConfigDir: vi.fn(() => '/mock/.prodbeam'),
}));

import {
  readTeamConfig,
  writeTeamConfig,
  teamConfigExists,
  createDefaultConfig,
} from './team-config.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { TeamConfig } from './types.js';

const validConfig: TeamConfig = {
  version: 1,
  team: {
    name: 'platform-eng',
    members: [
      { email: 'giri@prodbeam.com', name: 'Giri V', github: 'vislawath' },
      { email: 'alex@prodbeam.com' },
    ],
  },
  github: { org: 'prodbeam', repos: ['prodbeam/pb-payments'] },
  jira: { host: 'prodbeam.atlassian.net', projects: ['PA'] },
  settings: { timezone: 'America/Denver', reportFormat: 'markdown' },
};

describe('team-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readTeamConfig', () => {
    it('returns null when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(readTeamConfig()).toBeNull();
    });

    it('reads and validates valid config', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(validConfig));

      const result = readTeamConfig();
      expect(result).toEqual(validConfig);
    });

    it('throws on invalid JSON', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not json');

      expect(() => readTeamConfig()).toThrow();
    });

    it('throws when required fields missing', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: 1 }));

      expect(() => readTeamConfig()).toThrow();
    });

    it('throws on invalid email', () => {
      const badConfig = {
        ...validConfig,
        team: { name: 'test', members: [{ email: 'not-an-email' }] },
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(badConfig));

      expect(() => readTeamConfig()).toThrow();
    });
  });

  describe('writeTeamConfig', () => {
    it('writes validated config as formatted JSON', () => {
      writeTeamConfig(validConfig);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/mock/.prodbeam/team.json',
        JSON.stringify(validConfig, null, 2) + '\n',
        'utf-8'
      );
    });

    it('throws when writing invalid config', () => {
      const invalidConfig = { version: 2 } as unknown as TeamConfig;
      expect(() => writeTeamConfig(invalidConfig)).toThrow();
    });
  });

  describe('teamConfigExists', () => {
    it('returns true when file exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      expect(teamConfigExists()).toBe(true);
    });

    it('returns false when file missing', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(teamConfigExists()).toBe(false);
    });
  });

  describe('createDefaultConfig', () => {
    it('creates config scaffold with emails', () => {
      const config = createDefaultConfig('my-team', ['a@test.com', 'b@test.com']);

      expect(config.version).toBe(1);
      expect(config.team.name).toBe('my-team');
      expect(config.team.members).toHaveLength(2);
      expect(config.team.members[0]?.email).toBe('a@test.com');
      expect(config.team.members[1]?.email).toBe('b@test.com');
      expect(config.github.repos).toEqual([]);
      expect(config.jira.projects).toEqual([]);
      expect(config.settings.reportFormat).toBe('markdown');
    });
  });
});
