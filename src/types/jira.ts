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
}

export interface JiraActivity {
  issues: JiraIssue[];
  timeRange: {
    from: string;
    to: string;
  };
}
