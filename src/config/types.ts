/**
 * Configuration Types
 *
 * Defines the shape of team config, member config, and credentials.
 * These are the canonical types — Zod schemas in team-config.ts and
 * credentials.ts validate against these.
 */

/** A single team member. Email is the only required user input; rest is auto-discovered. */
export interface MemberConfig {
  email: string;
  name?: string;
  github?: string;
  jiraAccountId?: string;
}

/** GitHub integration settings for the team. */
export interface GitHubConfig {
  org?: string;
  repos: string[];
}

/** Jira integration settings for the team. */
export interface JiraConfig {
  host: string;
  projects: string[];
}

/** Report and behavior settings. */
export interface ProdbeamSettings {
  timezone: string;
  reportFormat: 'markdown' | 'slack';
  thresholds?: import('./thresholds.js').ThresholdConfig;
}

/** Root team configuration — stored in ~/.prodbeam/team.json */
export interface TeamConfig {
  version: 1;
  team: {
    name: string;
    members: MemberConfig[];
  };
  github: GitHubConfig;
  jira: JiraConfig;
  settings: ProdbeamSettings;
}

/** GitHub credentials. */
export interface GitHubCredentials {
  token: string;
}

/** Jira credentials (basic auth: email + API token). */
export interface JiraCredentials {
  host: string;
  email: string;
  apiToken: string;
}

/** Root credentials — stored in ~/.prodbeam/credentials.json */
export interface CredentialsConfig {
  github?: GitHubCredentials;
  jira?: JiraCredentials;
}
