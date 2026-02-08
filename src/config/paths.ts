/**
 * Config Directory Resolution
 *
 * Resolves the prodbeam config directory in order:
 * 1. PRODBEAM_HOME environment variable
 * 2. ~/.prodbeam/ (default)
 *
 * Ensures the directory exists with 700 permissions.
 */

import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_DIR_NAME = '.prodbeam';

/**
 * Resolve the prodbeam config directory path.
 * Does NOT create the directory — call ensureConfigDir() for that.
 */
export function resolveConfigDir(): string {
  const envDir = process.env['PRODBEAM_HOME'];
  if (envDir) {
    return envDir;
  }
  return join(homedir(), DEFAULT_DIR_NAME);
}

/**
 * Ensure the config directory exists with proper permissions.
 * Creates it if missing. Returns the resolved path.
 */
export function ensureConfigDir(): string {
  const dir = resolveConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } else {
    chmodSync(dir, 0o700);
  }
  return dir;
}

/** Resolve path to team.json */
export function teamConfigPath(): string {
  return join(resolveConfigDir(), 'team.json');
}

/** Resolve path to credentials.json */
export function credentialsPath(): string {
  return join(resolveConfigDir(), 'credentials.json');
}

/** Resolve path to history.db */
export function historyDbPath(): string {
  return join(resolveConfigDir(), 'history.db');
}
