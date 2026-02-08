/**
 * GitHub data types for the MCP adapter
 */

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  repo: string;
  url: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  repo: string;
  url: string;
  additions?: number;
  deletions?: number;
  body?: string;
  labels?: string[];
}

export interface GitHubReview {
  pullRequestNumber: number;
  pullRequestTitle: string;
  author: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
  submittedAt: string;
  repo: string;
  body?: string;
}

export interface GitHubActivity {
  username: string;
  commits: GitHubCommit[];
  pullRequests: GitHubPullRequest[];
  reviews: GitHubReview[];
  timeRange: {
    from: string;
    to: string;
  };
}
