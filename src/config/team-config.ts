/**
 * Team Configuration Manager
 *
 * Reads and writes ~/.prodbeam/team.json.
 * Validates with Zod on read; serializes on write.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { z } from 'zod';
import type { TeamConfig } from './types.js';
import { ensureConfigDir, teamConfigPath } from './paths.js';

// ─── Zod Schemas ─────────────────────────────────────────────

const MemberConfigSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  github: z.string().optional(),
  jiraAccountId: z.string().optional(),
});

const GitHubConfigSchema = z.object({
  org: z.string().optional(),
  repos: z.array(z.string()).default([]),
});

const JiraConfigSchema = z.object({
  host: z.string(),
  projects: z.array(z.string()).default([]),
});

const ThresholdConfigSchema = z
  .object({
    stalePrWarningDays: z.number().positive().optional(),
    stalePrAlertDays: z.number().positive().optional(),
    staleIssueDays: z.number().positive().optional(),
    reviewImbalanceThreshold: z.number().min(0).max(1).optional(),
    highChurnMultiplier: z.number().positive().optional(),
    highChurnMinimum: z.number().nonnegative().optional(),
    trendAlertPercent: z.number().positive().optional(),
    trendWarningPercent: z.number().positive().optional(),
    mergeTimeWarningH: z.number().positive().optional(),
    mergeTimeAlertH: z.number().positive().optional(),
  })
  .optional();

const SettingsSchema = z.object({
  timezone: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  reportFormat: z.enum(['markdown', 'slack']).default('markdown'),
  thresholds: ThresholdConfigSchema,
});

const TeamConfigSchema = z.object({
  version: z.literal(1),
  team: z.object({
    name: z.string().min(1),
    members: z.array(MemberConfigSchema).min(1),
  }),
  github: GitHubConfigSchema,
  jira: JiraConfigSchema,
  settings: SettingsSchema,
});

export { TeamConfigSchema };

// ─── Read / Write ────────────────────────────────────────────

/**
 * Read and validate team config from ~/.prodbeam/team.json.
 * Returns null if the file doesn't exist.
 * Throws on invalid JSON or schema validation failure.
 */
export function readTeamConfig(): TeamConfig | null {
  const filePath = teamConfigPath();
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  return TeamConfigSchema.parse(parsed);
}

/**
 * Write team config to ~/.prodbeam/team.json.
 * Creates the config directory if it doesn't exist.
 * Validates before writing to prevent corrupt configs.
 */
export function writeTeamConfig(config: TeamConfig): void {
  TeamConfigSchema.parse(config);
  ensureConfigDir();
  const filePath = teamConfigPath();
  writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Check if team config exists.
 */
export function teamConfigExists(): boolean {
  return existsSync(teamConfigPath());
}

/**
 * Create a default team config scaffold.
 * Used by setup_team to generate the initial config before discovery fills it in.
 */
export function createDefaultConfig(teamName: string, emails: string[]): TeamConfig {
  return {
    version: 1,
    team: {
      name: teamName,
      members: emails.map((email) => ({ email })),
    },
    github: {
      repos: [],
    },
    jira: {
      host: '',
      projects: [],
    },
    settings: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      reportFormat: 'markdown',
    },
  };
}
