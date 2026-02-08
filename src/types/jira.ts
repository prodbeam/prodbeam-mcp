/**
 * Jira data types for the MCP adapter
 */

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string;
  issueType: string;
  updatedAt: string;
  url: string;
  description?: string;
  labels?: string[];
  createdAt?: string;
}

export interface JiraComment {
  author: string;
  body: string;
  created: string;
}

export interface JiraActivity {
  issues: JiraIssue[];
  comments?: Record<string, JiraComment[]>;
  timeRange: {
    from: string;
    to: string;
  };
}
