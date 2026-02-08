/**
 * Discovery Types
 *
 * Types for the auto-discovery flow that resolves team member emails
 * into GitHub usernames, Jira accounts, repos, projects, and sprints.
 */

/** Result of resolving a single member's GitHub identity. */
export interface GitHubMemberDiscovery {
  email: string;
  username: string | null;
  orgs: string[];
  repos: string[];
  error?: string;
}

/** Result of resolving a single member's Jira identity. */
export interface JiraMemberDiscovery {
  email: string;
  accountId: string | null;
  displayName: string | null;
  error?: string;
}

/** Aggregated GitHub discovery for the whole team. */
export interface GitHubTeamDiscovery {
  members: GitHubMemberDiscovery[];
  /** Union of all orgs found across members. */
  orgs: string[];
  /** Union of all active repos found across members, deduplicated. */
  repos: string[];
}

/** Jira project discovered for the team. */
export interface JiraProjectDiscovery {
  key: string;
  name: string;
}

/** Jira sprint discovered for the team. */
export interface JiraSprintDiscovery {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
}

/** Aggregated Jira discovery for the whole team. */
export interface JiraTeamDiscovery {
  members: JiraMemberDiscovery[];
  /** Projects accessible to the authenticated user. */
  projects: JiraProjectDiscovery[];
  /** Active sprints found across project boards. */
  activeSprints: JiraSprintDiscovery[];
  host: string;
}

/** Full discovery result combining GitHub + Jira. */
export interface TeamDiscoveryResult {
  github: GitHubTeamDiscovery;
  jira: JiraTeamDiscovery | null;
}
