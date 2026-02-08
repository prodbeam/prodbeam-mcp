import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Mock fs before importing the module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
}));

import {
  resolveConfigDir,
  ensureConfigDir,
  teamConfigPath,
  credentialsPath,
  historyDbPath,
} from './paths.js';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';

describe('paths', () => {
  const originalEnv = process.env['PRODBEAM_HOME'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['PRODBEAM_HOME'];
    } else {
      process.env['PRODBEAM_HOME'] = originalEnv;
    }
    vi.clearAllMocks();
  });

  describe('resolveConfigDir', () => {
    it('returns ~/.prodbeam by default', () => {
      delete process.env['PRODBEAM_HOME'];
      expect(resolveConfigDir()).toBe(join(homedir(), '.prodbeam'));
    });

    it('respects PRODBEAM_HOME env var', () => {
      process.env['PRODBEAM_HOME'] = '/custom/path';
      expect(resolveConfigDir()).toBe('/custom/path');
    });
  });

  describe('ensureConfigDir', () => {
    it('creates directory with 700 permissions when missing', () => {
      delete process.env['PRODBEAM_HOME'];
      vi.mocked(existsSync).mockReturnValue(false);

      const result = ensureConfigDir();

      expect(result).toBe(join(homedir(), '.prodbeam'));
      expect(mkdirSync).toHaveBeenCalledWith(result, { recursive: true, mode: 0o700 });
    });

    it('sets permissions on existing directory', () => {
      delete process.env['PRODBEAM_HOME'];
      vi.mocked(existsSync).mockReturnValue(true);

      ensureConfigDir();

      expect(mkdirSync).not.toHaveBeenCalled();
      expect(chmodSync).toHaveBeenCalledWith(join(homedir(), '.prodbeam'), 0o700);
    });
  });

  describe('file paths', () => {
    beforeEach(() => {
      delete process.env['PRODBEAM_HOME'];
    });

    it('teamConfigPath returns team.json path', () => {
      expect(teamConfigPath()).toBe(join(homedir(), '.prodbeam', 'team.json'));
    });

    it('credentialsPath returns credentials.json path', () => {
      expect(credentialsPath()).toBe(join(homedir(), '.prodbeam', 'credentials.json'));
    });

    it('historyDbPath returns history.db path', () => {
      expect(historyDbPath()).toBe(join(homedir(), '.prodbeam', 'history.db'));
    });
  });
});
