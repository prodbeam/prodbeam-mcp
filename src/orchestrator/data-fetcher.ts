/**
 * Data Fetcher
 *
 * Coordinates fetching GitHub and Jira data across repos and team members.
 * Handles errors gracefully per-repo so one failure doesn't block the report.
 */

import { GitHubClient } from '../clients/github-client.js';
import { JiraClient } from '../clients/jira-client.js';
import type {
  GitHubActivity,
  GitHubCommit,
  GitHubPullRequest,
  GitHubReview,
} from '../types/github.js';
import type { JiraActivity, JiraComment } from '../types/jira.js';
import type { TimeRange } from './time-range.js';

/** Maximum PRs per repo to fetch reviews for (limits API calls). */
const MAX_REVIEW_PRS = 25;

/**
 * Fetch GitHub activity for a single user across all repos.
 *
 * For each repo:
 *   1. Get commits authored by this user in the time range
 *   2. Get PRs authored by this user, updated in the time range
 *   3. Get reviews left by this user on PRs updated in the time range
 *
 * Repo-level errors are silently skipped (logs to stderr).
 */
export async function fetchGitHubActivityForUser(
  client: GitHubClient,
  username: string,
  repos: string[],
  timeRange: TimeRange
): Promise<GitHubActivity> {
  const allCommits: GitHubCommit[] = [];
  const allPRs: GitHubPullRequest[] = [];
  const allReviews: GitHubReview[] = [];

  // Fetch all repos in parallel
  const results = await Promise.allSettled(
    repos.map((repoFullName) => fetchRepoForUser(client, repoFullName, username, timeRange))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allCommits.push(...result.value.commits);
      allPRs.push(...result.value.pullRequests);
      allReviews.push(...result.value.reviews);
    }
    // Rejected results are silently skipped
  }

  return {
    username,
    commits: allCommits,
    pullRequests: allPRs,
    reviews: allReviews,
    timeRange,
  };
}

/**
 * Fetch GitHub activity for all team members across all repos.
 * Returns one GitHubActivity per member.
 *
 * Optimized: fetches each repo's data once, then splits by member.
 */
export async function fetchTeamGitHubActivity(
  client: GitHubClient,
  usernames: string[],
  repos: string[],
  timeRange: TimeRange
): Promise<GitHubActivity[]> {
  // Fetch all repo data once (no author filter)
  const repoResults = await Promise.allSettled(
    repos.map((repoFullName) => fetchRepoAll(client, repoFullName, timeRange))
  );

  const allCommits: GitHubCommit[] = [];
  const allPRs: GitHubPullRequest[] = [];
  const allReviews: GitHubReview[] = [];

  for (const result of repoResults) {
    if (result.status === 'fulfilled') {
      allCommits.push(...result.value.commits);
      allPRs.push(...result.value.pullRequests);
      allReviews.push(...result.value.reviews);
    }
  }

  // Split by member
  const usernameSet = new Set(usernames.map((u) => u.toLowerCase()));

  return usernames.map((username) => {
    const lowerUsername = username.toLowerCase();
    return {
      username,
      commits: allCommits.filter((c) => c.author.toLowerCase() === lowerUsername),
      pullRequests: allPRs.filter((pr) => pr.author.toLowerCase() === lowerUsername),
      reviews: allReviews.filter((r) =>
        r.author.toLowerCase() === lowerUsername && !usernameSet.has(r.author.toLowerCase())
          ? false
          : r.author.toLowerCase() === lowerUsername
      ),
      timeRange,
    };
  });
}

/**
 * Fetch Jira activity for a single user.
 * Uses JQL to find issues assigned to or recently updated by the user.
 */
export async function fetchJiraActivityForUser(
  client: JiraClient,
  accountId: string,
  projects: string[],
  timeRange: TimeRange
): Promise<JiraActivity> {
  if (projects.length === 0) {
    return { issues: [], timeRange };
  }

  const projectList = projects.map((p) => `"${p}"`).join(', ');
  const sinceDate = timeRange.from.split('T')[0]!;
  const jql = `project in (${projectList}) AND assignee = "${accountId}" AND updated >= "${sinceDate}" ORDER BY updated DESC`;

  try {
    const issues = await client.searchIssues(jql);
    return { issues, timeRange };
  } catch {
    return { issues: [], timeRange };
  }
}

/**
 * Fetch all Jira issues for projects in the time range.
 * Used by team standups and weekly summaries.
 */
export async function fetchTeamJiraActivity(
  client: JiraClient,
  projects: string[],
  timeRange: TimeRange
): Promise<JiraActivity> {
  if (projects.length === 0) {
    return { issues: [], timeRange };
  }

  const projectList = projects.map((p) => `"${p}"`).join(', ');
  const sinceDate = timeRange.from.split('T')[0]!;
  const jql = `project in (${projectList}) AND updated >= "${sinceDate}" ORDER BY updated DESC`;

  try {
    const issues = await client.searchIssues(jql);
    return { issues, timeRange };
  } catch {
    return { issues: [], timeRange };
  }
}

/**
 * Fetch Jira issues for a specific sprint.
 */
export async function fetchSprintJiraActivity(
  client: JiraClient,
  sprintName: string,
  timeRange: TimeRange
): Promise<JiraActivity> {
  const jql = `sprint = "${sprintName}" ORDER BY status ASC, updated DESC`;

  try {
    const issues = await client.searchIssues(jql);
    return { issues, timeRange };
  } catch {
    return { issues: [], timeRange };
  }
}

/**
 * Detect the active sprint from Jira project boards.
 * Returns the most recently started active sprint, or null.
 */
export async function detectActiveSprint(
  client: JiraClient,
  projects: string[]
): Promise<{ name: string; startDate: string; endDate: string; goal?: string } | null> {
  for (const project of projects) {
    try {
      const boards = await client.getBoards(project);
      for (const board of boards) {
        try {
          const sprints = await client.getSprints(board.id, 'active');
          if (sprints.length > 0) {
            // Pick the most recently started sprint
            const sorted = [...sprints].sort(
              (a, b) => new Date(b.startDate ?? 0).getTime() - new Date(a.startDate ?? 0).getTime()
            );
            const best = sorted[0]!;
            if (best.startDate && best.endDate) {
              return {
                name: best.name,
                startDate: best.startDate,
                endDate: best.endDate,
                goal: best.goal || undefined,
              };
            }
          }
        } catch {
          // Board may not support sprints (kanban)
        }
      }
    } catch {
      // Project may not have boards
    }
  }

  return null;
}

/**
 * Fetch comments for a list of Jira issue keys.
 * Limits to maxIssues to control API calls. Returns keyed by issue key.
 */
export async function fetchIssueComments(
  client: JiraClient,
  issueKeys: string[],
  maxIssues = 10,
  maxCommentsPerIssue = 5
): Promise<Record<string, JiraComment[]>> {
  const limited = issueKeys.slice(0, maxIssues);
  const result: Record<string, JiraComment[]> = {};

  const results = await Promise.allSettled(
    limited.map(async (key) => {
      const comments = await client.getIssueComments(key, maxCommentsPerIssue);
      return { key, comments };
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.comments.length > 0) {
      result[r.value.key] = r.value.comments;
    }
  }

  return result;
}

// ─── Internal Helpers ────────────────────────────────────────

interface RepoData {
  commits: GitHubCommit[];
  pullRequests: GitHubPullRequest[];
  reviews: GitHubReview[];
}

/**
 * Fetch commits, PRs, and reviews for a single repo, filtered by one user.
 */
async function fetchRepoForUser(
  client: GitHubClient,
  repoFullName: string,
  username: string,
  timeRange: TimeRange
): Promise<RepoData> {
  const [owner, repo] = repoFullName.split('/');
  if (!owner || !repo) return { commits: [], pullRequests: [], reviews: [] };

  // Fetch commits and PRs in parallel
  const [commits, allPRs] = await Promise.all([
    client.getCommits(owner, repo, {
      since: timeRange.from,
      until: timeRange.to,
      author: username,
    }),
    client.getPullRequests(owner, repo, { state: 'all', since: timeRange.from }),
  ]);

  // Filter PRs to this user
  const userPRs = allPRs.filter((pr) => pr.author.toLowerCase() === username.toLowerCase());

  // Fetch reviews left by this user on all PRs (limited)
  const reviews = await fetchReviewsForUser(client, owner, repo, allPRs, username);

  return { commits, pullRequests: userPRs, reviews };
}

/**
 * Fetch all commits, PRs, and reviews for a repo (no author filter).
 * Used for team-level fetching.
 */
async function fetchRepoAll(
  client: GitHubClient,
  repoFullName: string,
  timeRange: TimeRange
): Promise<RepoData> {
  const [owner, repo] = repoFullName.split('/');
  if (!owner || !repo) return { commits: [], pullRequests: [], reviews: [] };

  // Fetch commits and PRs in parallel
  const [commits, allPRs] = await Promise.all([
    client.getCommits(owner, repo, {
      since: timeRange.from,
      until: timeRange.to,
    }),
    client.getPullRequests(owner, repo, { state: 'all', since: timeRange.from }),
  ]);

  // Fetch reviews for all PRs (limited)
  const reviews = await fetchAllReviews(client, owner, repo, allPRs);

  return { commits, pullRequests: allPRs, reviews };
}

/**
 * Fetch reviews left by a specific user on a set of PRs.
 * Limits to MAX_REVIEW_PRS to control API calls.
 */
async function fetchReviewsForUser(
  client: GitHubClient,
  owner: string,
  repo: string,
  prs: GitHubPullRequest[],
  username: string
): Promise<GitHubReview[]> {
  const limited = prs.slice(0, MAX_REVIEW_PRS);
  const allReviews: GitHubReview[] = [];

  const results = await Promise.allSettled(
    limited.map((pr) => client.getReviews(owner, repo, pr.number, pr.title))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const userReviews = result.value.filter(
        (r) => r.author.toLowerCase() === username.toLowerCase()
      );
      allReviews.push(...userReviews);
    }
  }

  return allReviews;
}

/**
 * Fetch all reviews for a set of PRs.
 * Limits to MAX_REVIEW_PRS to control API calls.
 */
async function fetchAllReviews(
  client: GitHubClient,
  owner: string,
  repo: string,
  prs: GitHubPullRequest[]
): Promise<GitHubReview[]> {
  const limited = prs.slice(0, MAX_REVIEW_PRS);
  const allReviews: GitHubReview[] = [];

  const results = await Promise.allSettled(
    limited.map((pr) => client.getReviews(owner, repo, pr.number, pr.title))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allReviews.push(...result.value);
    }
  }

  return allReviews;
}
