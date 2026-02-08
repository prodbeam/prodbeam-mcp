/**
 * Report Generator
 *
 * Transforms pre-fetched activity data into structured Markdown reports.
 * All functions are synchronous — no I/O, no API calls.
 */

import type { GitHubActivity } from '../types/github.js';
import type { JiraActivity } from '../types/jira.js';
import type { WeeklyReportInput } from '../types/weekly.js';
import type { RetroReportInput } from '../types/retrospective.js';
import type { TrendInsight } from '../insights/types.js';
import type { Anomaly } from '../insights/anomaly-detector.js';
import type { TeamHealthReport } from '../insights/team-health.js';
import { calculateWeeklyMetrics } from './metrics-calculator.js';
import { analyzeSprintActivity } from './sprint-analyzer.js';

/** Optional intelligence extras that can be injected into reports. */
export interface ReportExtras {
  trends?: TrendInsight[];
  anomalies?: Anomaly[];
  health?: TeamHealthReport;
}

interface DailyReportInput {
  github: GitHubActivity;
  jira?: JiraActivity;
}

/**
 * Generate a daily standup report from pre-fetched data
 */
export function generateDailyReport(input: DailyReportInput): string {
  const { github, jira } = input;
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const parts: string[] = [];
  parts.push(`# Daily Standup - ${today}`);
  parts.push('');
  parts.push(`## GitHub Activity (Last 24 Hours) - ${github.username}`);
  parts.push('');

  // Commits
  parts.push(`### Commits: ${github.commits.length}`);
  if (github.commits.length > 0) {
    for (const c of github.commits) {
      parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
    }
  } else {
    parts.push('_No commits_');
  }
  parts.push('');

  // Pull Requests
  parts.push(`### Pull Requests: ${github.pullRequests.length}`);
  if (github.pullRequests.length > 0) {
    for (const pr of github.pullRequests) {
      parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]`);
    }
  } else {
    parts.push('_No pull requests_');
  }
  parts.push('');

  // Reviews
  parts.push(`### Reviews: ${github.reviews.length}`);
  if (github.reviews.length > 0) {
    for (const r of github.reviews) {
      parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}]`);
    }
  } else {
    parts.push('_No reviews_');
  }

  // Jira
  if (jira && jira.issues.length > 0) {
    parts.push('');
    parts.push(`### Jira Issues: ${jira.issues.length}`);
    for (const issue of jira.issues) {
      const link = issue.url ? `[${issue.key}](${issue.url})` : issue.key;
      parts.push(`- ${link}: ${issue.summary} [${issue.status}]`);
    }
  }

  parts.push('');
  parts.push('---');

  return parts.join('\n');
}

/**
 * Generate a team daily standup report — per-member sections + aggregate.
 */
export function generateTeamDailyReport(
  memberActivities: Array<{ github: GitHubActivity; jira?: JiraActivity }>,
  teamName: string
): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const parts: string[] = [];
  parts.push(`# Team Standup: ${teamName} - ${today}`);
  parts.push('');

  // Aggregate stats
  let totalCommits = 0;
  let totalPRs = 0;
  let totalReviews = 0;
  let totalIssues = 0;

  for (const { github, jira } of memberActivities) {
    totalCommits += github.commits.length;
    totalPRs += github.pullRequests.length;
    totalReviews += github.reviews.length;
    if (jira) totalIssues += jira.issues.length;
  }

  parts.push('## Summary');
  parts.push('');
  parts.push(`| Metric | Count |`);
  parts.push(`|--------|-------|`);
  parts.push(`| Team Members | ${memberActivities.length} |`);
  parts.push(`| Total Commits | ${totalCommits} |`);
  parts.push(`| Total PRs | ${totalPRs} |`);
  parts.push(`| Total Reviews | ${totalReviews} |`);
  if (totalIssues > 0) {
    parts.push(`| Total Jira Issues | ${totalIssues} |`);
  }
  parts.push('');

  // Per-member sections
  for (const { github, jira } of memberActivities) {
    parts.push(`## ${github.username}`);
    parts.push('');

    // Commits
    if (github.commits.length > 0) {
      parts.push(`**Commits:** ${github.commits.length}`);
      for (const c of github.commits) {
        parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
      }
      parts.push('');
    }

    // PRs
    if (github.pullRequests.length > 0) {
      parts.push(`**Pull Requests:** ${github.pullRequests.length}`);
      for (const pr of github.pullRequests) {
        parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]`);
      }
      parts.push('');
    }

    // Reviews
    if (github.reviews.length > 0) {
      parts.push(`**Reviews:** ${github.reviews.length}`);
      for (const r of github.reviews) {
        parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}]`);
      }
      parts.push('');
    }

    // Jira
    if (jira && jira.issues.length > 0) {
      parts.push(`**Jira Issues:** ${jira.issues.length}`);
      for (const issue of jira.issues) {
        const link = issue.url ? `[${issue.key}](${issue.url})` : issue.key;
        parts.push(`- ${link}: ${issue.summary} [${issue.status}]`);
      }
      parts.push('');
    }

    // Empty activity
    if (
      github.commits.length === 0 &&
      github.pullRequests.length === 0 &&
      github.reviews.length === 0 &&
      (!jira || jira.issues.length === 0)
    ) {
      parts.push('_No activity in the last 24 hours_');
      parts.push('');
    }
  }

  parts.push('---');
  return parts.join('\n');
}

/**
 * Generate a weekly summary report from pre-fetched data.
 * Optionally includes a trend comparison section if insights are provided.
 */
export function generateWeeklyReport(input: WeeklyReportInput, extras?: ReportExtras): string {
  const { github, jira } = input;
  const trends = extras?.trends;
  const anomalies = extras?.anomalies;
  const health = extras?.health;
  const metrics = calculateWeeklyMetrics(github, jira);
  const endDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const parts: string[] = [];
  parts.push(`# Weekly Engineering Summary - ${endDate}`);
  parts.push('');
  parts.push(`## GitHub Activity (Last 7 Days) - ${github.username}`);
  parts.push('');

  // Metrics table
  parts.push('### Metrics');
  parts.push('');
  parts.push('| Metric | Count |');
  parts.push('|--------|-------|');
  parts.push(`| Commits | ${metrics.totalCommits} |`);
  parts.push(
    `| Pull Requests | ${metrics.pullRequests.total} (${metrics.pullRequests.open} open, ${metrics.pullRequests.merged} merged, ${metrics.pullRequests.closed} closed) |`
  );
  parts.push(`| Code Changes | +${metrics.additions}/-${metrics.deletions} |`);
  parts.push(
    `| Reviews | ${metrics.reviews.total} (${metrics.reviews.approved} approved, ${metrics.reviews.changesRequested} changes requested) |`
  );
  parts.push('');

  // Repo breakdown table
  if (metrics.repoBreakdown.length > 0) {
    parts.push('### Repository Breakdown');
    parts.push('');
    parts.push('| Repository | Commits | PRs | Merged | +/- | Reviews |');
    parts.push('|------------|---------|-----|--------|-----|---------|');
    for (const r of metrics.repoBreakdown) {
      parts.push(
        `| ${r.repo} | ${r.commits} | ${r.pullRequests} | ${r.merged} | +${r.additions}/-${r.deletions} | ${r.reviews} |`
      );
    }
    parts.push('');
  }

  // Commits
  parts.push(`### Commits: ${github.commits.length}`);
  if (github.commits.length > 0) {
    for (const c of github.commits) {
      parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
    }
  } else {
    parts.push('_No commits_');
  }
  parts.push('');

  // PRs
  parts.push(`### Pull Requests: ${github.pullRequests.length}`);
  if (github.pullRequests.length > 0) {
    for (const pr of github.pullRequests) {
      const stats = pr.additions !== undefined ? ` (+${pr.additions}/-${pr.deletions})` : '';
      parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]${stats}`);
    }
  } else {
    parts.push('_No pull requests_');
  }
  parts.push('');

  // Reviews
  parts.push(`### Reviews: ${github.reviews.length}`);
  if (github.reviews.length > 0) {
    for (const r of github.reviews) {
      parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}]`);
    }
  } else {
    parts.push('_No reviews_');
  }

  // Jira
  if (jira && jira.issues.length > 0 && metrics.jira) {
    parts.push('');
    parts.push(`### Jira Issues: ${metrics.jira.totalIssues}`);
    parts.push('');
    parts.push('| Status | Count |');
    parts.push('|--------|-------|');
    for (const [status, count] of Object.entries(metrics.jira.byStatus)) {
      parts.push(`| ${status} | ${count} |`);
    }
    parts.push('');
    for (const issue of jira.issues) {
      const link = issue.url ? `[${issue.key}](${issue.url})` : issue.key;
      parts.push(`- ${link}: ${issue.summary} [${issue.status}]`);
    }
  }

  // Trends
  if (trends && trends.length > 0) {
    parts.push('');
    renderTrends(parts, trends);
  }

  // Anomalies
  if (anomalies && anomalies.length > 0) {
    parts.push('');
    renderAnomalies(parts, anomalies);
  }

  // Team Health
  if (health) {
    parts.push('');
    renderTeamHealth(parts, health);
  }

  parts.push('');
  parts.push('---');

  return parts.join('\n');
}

/**
 * Generate a sprint retrospective report from pre-fetched data.
 * Optionally includes intelligence sections if extras are provided.
 */
export function generateRetrospective(input: RetroReportInput, extras?: ReportExtras): string {
  const { github, jira, sprintName, dateRange } = input;
  const metrics = analyzeSprintActivity(github, jira);
  const trends = extras?.trends;
  const anomalies = extras?.anomalies;
  const health = extras?.health;

  const parts: string[] = [];

  parts.push(`# Sprint Retrospective: ${sprintName}`);
  parts.push('');
  parts.push(`**Period:** ${dateRange.from} to ${dateRange.to}`);
  parts.push(`**Developer:** ${github.username}`);
  parts.push('');

  // Metrics table
  parts.push('## Sprint Metrics');
  parts.push('');
  parts.push('| Metric | Value |');
  parts.push('|--------|-------|');
  parts.push(`| Commits | ${metrics.totalCommits} |`);
  parts.push(
    `| Pull Requests | ${metrics.pullRequests.total} (${metrics.pullRequests.merged} merged, ${metrics.pullRequests.open} open, ${metrics.pullRequests.closed} closed) |`
  );
  parts.push(`| Merge Rate | ${metrics.pullRequests.mergeRate}% |`);
  if (metrics.avgMergeTimeHours !== null) {
    parts.push(`| Avg Merge Time | ${metrics.avgMergeTimeHours} hours |`);
  }
  parts.push(`| Code Changes | +${metrics.additions}/-${metrics.deletions} |`);
  parts.push(
    `| Reviews | ${metrics.reviews.total} (${metrics.reviews.approved} approved, ${metrics.reviews.changesRequested} changes requested) |`
  );

  if (metrics.jira) {
    parts.push(
      `| Jira Completion | ${metrics.jira.completed}/${metrics.jira.totalIssues} (${metrics.jira.completionRate}%) |`
    );
  }
  parts.push('');

  // Jira breakdown
  if (metrics.jira && jira && jira.issues.length > 0) {
    parts.push('## Jira Issues');
    parts.push('');
    parts.push('| Type | Count |');
    parts.push('|------|-------|');
    for (const [type, count] of Object.entries(metrics.jira.byType)) {
      parts.push(`| ${type} | ${count} |`);
    }
    parts.push('');
    for (const issue of jira.issues) {
      const link = issue.url ? `[${issue.key}](${issue.url})` : issue.key;
      parts.push(`- ${link}: ${issue.summary} [${issue.status}]`);
    }
    parts.push('');
  }

  // Commits
  parts.push(`## Commits: ${github.commits.length}`);
  if (github.commits.length > 0) {
    for (const c of github.commits) {
      parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
    }
  } else {
    parts.push('_No commits_');
  }
  parts.push('');

  // PRs
  parts.push(`## Pull Requests: ${github.pullRequests.length}`);
  if (github.pullRequests.length > 0) {
    for (const pr of github.pullRequests) {
      const stats = pr.additions !== undefined ? ` (+${pr.additions}/-${pr.deletions})` : '';
      parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]${stats}`);
    }
  } else {
    parts.push('_No pull requests_');
  }
  parts.push('');

  // Reviews
  parts.push(`## Reviews: ${github.reviews.length}`);
  if (github.reviews.length > 0) {
    for (const r of github.reviews) {
      parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}]`);
    }
  } else {
    parts.push('_No reviews_');
  }

  // Trends
  if (trends && trends.length > 0) {
    parts.push('');
    renderTrends(parts, trends);
  }

  // Anomalies
  if (anomalies && anomalies.length > 0) {
    parts.push('');
    renderAnomalies(parts, anomalies);
  }

  // Team Health
  if (health) {
    parts.push('');
    renderTeamHealth(parts, health);
  }

  parts.push('');
  parts.push('---');

  return parts.join('\n');
}

// ─── Trend Rendering ─────────────────────────────────────────

const SEVERITY_ICON: Record<TrendInsight['severity'], string> = {
  alert: '[!!]',
  warning: '[!]',
  info: '[i]',
};

/**
 * Render trend insights as a Markdown section.
 * Mutates the `parts` array by appending lines.
 */
function renderTrends(parts: string[], trends: TrendInsight[]): void {
  parts.push('## Trends vs Previous Period');
  parts.push('');
  parts.push('| Metric | Change | Direction | Severity |');
  parts.push('|--------|--------|-----------|----------|');
  for (const t of trends) {
    const arrow = t.direction === 'up' ? 'Up' : t.direction === 'down' ? 'Down' : 'Stable';
    const sign = t.changePercent > 0 ? '+' : '';
    parts.push(
      `| ${t.metric} | ${sign}${t.changePercent}% | ${arrow} | ${SEVERITY_ICON[t.severity]} ${t.severity} |`
    );
  }
  parts.push('');
  for (const t of trends) {
    parts.push(`- ${SEVERITY_ICON[t.severity]} ${t.message}`);
  }
}

const ANOMALY_ICON: Record<Anomaly['severity'], string> = {
  alert: '[!!]',
  warning: '[!]',
  info: '[i]',
};

/**
 * Render anomalies as a Markdown section.
 */
function renderAnomalies(parts: string[], anomalies: Anomaly[]): void {
  parts.push('## Insights');
  parts.push('');
  for (const a of anomalies) {
    parts.push(`- ${ANOMALY_ICON[a.severity]} **${a.severity}:** ${a.message}`);
  }
}

const TREND_ARROW: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  stable: 'Stable',
};

/**
 * Render team health report as a Markdown section.
 */
function renderTeamHealth(parts: string[], health: TeamHealthReport): void {
  parts.push(`## Team Health: ${health.overallScore}/100`);
  parts.push('');
  parts.push('| Dimension | Score | Trend |');
  parts.push('|-----------|-------|-------|');
  const dims = health.dimensions;
  parts.push(`| Velocity | ${dims.velocity.score} | ${TREND_ARROW[dims.velocity.trend]} |`);
  parts.push(`| Throughput | ${dims.throughput.score} | ${TREND_ARROW[dims.throughput.trend]} |`);
  parts.push(
    `| Review Coverage | ${dims.reviewCoverage.score} | ${TREND_ARROW[dims.reviewCoverage.trend]} |`
  );
  parts.push(`| Issue Flow | ${dims.issueFlow.score} | ${TREND_ARROW[dims.issueFlow.trend]} |`);

  if (health.recommendations.length > 0) {
    parts.push('');
    parts.push('### Recommendations');
    parts.push('');
    for (const rec of health.recommendations) {
      parts.push(`- ${rec}`);
    }
  }
}
