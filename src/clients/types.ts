/**
 * API Response Types
 *
 * TypeScript types for raw GitHub and Jira REST API responses.
 * These are the shapes returned by the API — they get mapped to
 * our internal types (src/types/) by the client modules.
 */

// ─── GitHub API Responses ────────────────────────────────────

export interface GitHubApiUser {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface GitHubApiOrg {
  login: string;
  id: number;
  description: string | null;
}

export interface GitHubApiRepo {
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  pushed_at: string;
  default_branch: string;
}

export interface GitHubApiCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  html_url: string;
  author: { login: string } | null;
}

export interface GitHubApiPullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed';
  merged_at: string | null;
  user: { login: string };
  created_at: string;
  updated_at: string;
  html_url: string;
  additions?: number;
  deletions?: number;
  head: { repo: { full_name: string } | null };
  base: { repo: { full_name: string } | null };
}

export interface GitHubApiReview {
  id: number;
  user: { login: string };
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED';
  submitted_at: string;
  html_url: string;
}

export interface GitHubApiSearchResult<T> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
}

export interface GitHubApiRateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

// ─── Jira API Responses ──────────────────────────────────────

export interface JiraApiUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active: boolean;
  accountType: string;
}

export interface JiraApiProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface JiraApiBoard {
  id: number;
  name: string;
  type: string;
  location?: {
    projectId: number;
    projectKey: string;
  };
}

export interface JiraApiSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
}

export interface JiraApiIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: string } };
    priority: { name: string };
    assignee: { displayName: string; accountId: string } | null;
    issuetype: { name: string };
    updated: string;
    created: string;
  };
}

export interface JiraApiSearchResult {
  total: number;
  maxResults: number;
  startAt: number;
  issues: JiraApiIssue[];
}

export interface JiraApiBoardList {
  maxResults: number;
  startAt: number;
  total: number;
  values: JiraApiBoard[];
}

export interface JiraApiSprintList {
  maxResults: number;
  startAt: number;
  values: JiraApiSprint[];
}
