/**
 * Report Generator
 *
 * Transforms pre-fetched activity data into structured Markdown reports.
 * All functions are synchronous — no I/O, no API calls.
 */

import type { GitHubActivity, GitHubPullRequest } from '../types/github.js';
import type { JiraActivity, JiraIssue } from '../types/jira.js';
import type { WeeklyReportInput } from '../types/weekly.js';
import type { RetroReportInput, SprintReviewInput } from '../types/retrospective.js';
import type { TrendInsight } from '../insights/types.js';
import type { Anomaly } from '../insights/anomaly-detector.js';
import type { TeamHealthReport } from '../insights/team-health.js';
import type { ContentInsights } from '../insights/content-insights.js';
import { calculateWeeklyMetrics } from './metrics-calculator.js';
import { analyzeSprintActivity } from './sprint-analyzer.js';
import {
  generateContentInsights,
  linkPRsToJira,
  generateAccomplishments,
  calculateInvestmentBalance,
} from '../insights/content-insights.js';

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

const DONE_STATUSES = ['done', 'closed', 'resolved', 'complete', 'completed'];
const IN_PROGRESS_STATUSES = ['in progress', 'in review', 'in development', 'in testing'];
const STALE_PR_DAYS = 2;
const STALE_ISSUE_DAYS = 3;

function isDone(status: string): boolean {
  return DONE_STATUSES.includes(status.toLowerCase());
}

function isInProgress(status: string): boolean {
  return IN_PROGRESS_STATUSES.includes(status.toLowerCase());
}

function formatPrLine(pr: GitHubPullRequest): string {
  const stats = pr.additions !== undefined ? ` (+${pr.additions}/-${pr.deletions ?? 0})` : '';
  return `- #${pr.number}: ${pr.title} [${pr.state}]${stats}`;
}

function formatJiraLine(issue: JiraIssue): string {
  const link = issue.url ? `[${issue.key}](${issue.url})` : issue.key;
  return `- ${link}: ${issue.summary} [${issue.status}]`;
}

function daysSinceNow(dateStr: string): number {
  const date = new Date(dateStr).getTime();
  if (isNaN(date)) return 0;
  return (Date.now() - date) / (1000 * 60 * 60 * 24);
}

/**
 * Generate a daily standup report from pre-fetched data.
 * Structured as: Completed / In Progress / Focus Areas / Blockers & Risks / Activity Summary
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
  parts.push(`**${github.username}**`);
  parts.push('');

  // Classify PRs
  const mergedPRs = github.pullRequests.filter((pr) => pr.state === 'merged');
  const openPRs = github.pullRequests.filter((pr) => pr.state === 'open');
  const stalePRs = openPRs.filter((pr) => daysSinceNow(pr.createdAt) > STALE_PR_DAYS);

  // Classify Jira issues
  const jiraIssues = jira?.issues ?? [];
  const doneIssues = jiraIssues.filter((i) => isDone(i.status));
  const activeIssues = jiraIssues.filter((i) => isInProgress(i.status));
  const otherIssues = jiraIssues.filter((i) => !isDone(i.status) && !isInProgress(i.status));
  const staleHighPriority = jiraIssues.filter(
    (i) =>
      !isDone(i.status) &&
      ['high', 'highest', 'critical', 'blocker'].includes(i.priority.toLowerCase()) &&
      daysSinceNow(i.updatedAt) > STALE_ISSUE_DAYS
  );

  // ── Completed ──
  parts.push('## Completed');
  parts.push('');
  const hasCompleted = mergedPRs.length > 0 || doneIssues.length > 0;
  if (hasCompleted) {
    // Show linked PR-Jira context for completed items
    const links = linkPRsToJira(mergedPRs, doneIssues);
    const accomplishments = generateAccomplishments(mergedPRs, doneIssues, links);
    for (const a of accomplishments) {
      parts.push(`- ${a}`);
    }
  } else {
    parts.push('_No completed items_');
  }
  parts.push('');

  // ── In Progress ──
  parts.push('## In Progress');
  parts.push('');
  const hasInProgress = openPRs.length > 0 || activeIssues.length > 0 || otherIssues.length > 0;
  if (hasInProgress) {
    for (const pr of openPRs) {
      parts.push(formatPrLine(pr));
    }
    for (const issue of [...activeIssues, ...otherIssues]) {
      parts.push(formatJiraLine(issue));
    }
  } else {
    parts.push('_No items in progress_');
  }
  parts.push('');

  // ── Focus Areas ──
  const focusItems = [...activeIssues, ...otherIssues].filter((i) => !isDone(i.status));
  if (focusItems.length > 0) {
    const themes = groupByTheme(focusItems);
    if (themes.length > 0) {
      parts.push('## Focus Areas');
      parts.push('');
      for (const theme of themes) {
        const issueList = theme.issues.map((i) => `${i.key} (${i.summary})`).join(', ');
        parts.push(`- **${theme.name}:** ${issueList} [${theme.issues[0]!.status}]`);
      }
      parts.push('');
    }
  }

  // ── Blockers & Risks ──
  const hasBlockers = stalePRs.length > 0 || staleHighPriority.length > 0;
  if (hasBlockers) {
    parts.push('## Blockers & Risks');
    parts.push('');
    for (const pr of stalePRs) {
      const days = Math.floor(daysSinceNow(pr.createdAt));
      parts.push(`- [!] PR #${pr.number}: ${pr.title} — open ${days} days`);
    }
    for (const issue of staleHighPriority) {
      const days = Math.floor(daysSinceNow(issue.updatedAt));
      const link = issue.url ? `[${issue.key}](${issue.url})` : issue.key;
      parts.push(`- [!] ${link}: ${issue.summary} — ${issue.priority}, no update in ${days} days`);
    }
    parts.push('');
  }

  // ── Activity Summary ──
  parts.push('## Activity Summary');
  parts.push('');
  parts.push('| Metric | Count |');
  parts.push('|--------|-------|');
  parts.push(`| Commits | ${github.commits.length} |`);
  parts.push(`| Pull Requests | ${github.pullRequests.length} |`);
  parts.push(`| Reviews | ${github.reviews.length} |`);
  if (jiraIssues.length > 0) {
    parts.push(`| Jira Issues | ${jiraIssues.length} |`);
  }

  // Commit detail (compact)
  if (github.commits.length > 0) {
    parts.push('');
    parts.push('**Recent Commits**');
    for (const c of github.commits) {
      parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
    }
  }

  // Review detail (compact)
  if (github.reviews.length > 0) {
    parts.push('');
    parts.push('**Reviews Given**');
    for (const r of github.reviews) {
      parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}]`);
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

  // Collect team-level blockers
  const teamBlockers: string[] = [];

  for (const { github, jira } of memberActivities) {
    totalCommits += github.commits.length;
    totalPRs += github.pullRequests.length;
    totalReviews += github.reviews.length;
    if (jira) totalIssues += jira.issues.length;

    // Stale PRs
    for (const pr of github.pullRequests) {
      if (pr.state === 'open' && daysSinceNow(pr.createdAt) > STALE_PR_DAYS) {
        const days = Math.floor(daysSinceNow(pr.createdAt));
        teamBlockers.push(
          `- [!] PR #${pr.number}: ${pr.title} (${github.username}) — open ${days} days`
        );
      }
    }

    // Stale high-priority Jira issues
    if (jira) {
      for (const issue of jira.issues) {
        if (
          !isDone(issue.status) &&
          ['high', 'highest', 'critical', 'blocker'].includes(issue.priority.toLowerCase()) &&
          daysSinceNow(issue.updatedAt) > STALE_ISSUE_DAYS
        ) {
          const days = Math.floor(daysSinceNow(issue.updatedAt));
          const link = issue.url ? `[${issue.key}](${issue.url})` : issue.key;
          teamBlockers.push(
            `- [!] ${link}: ${issue.summary} (${github.username}) — ${issue.priority}, no update in ${days} days`
          );
        }
      }
    }
  }

  parts.push('## Summary');
  parts.push('');
  parts.push('| Metric | Count |');
  parts.push('|--------|-------|');
  parts.push(`| Team Members | ${memberActivities.length} |`);
  parts.push(`| Total Commits | ${totalCommits} |`);
  parts.push(`| Total PRs | ${totalPRs} |`);
  parts.push(`| Total Reviews | ${totalReviews} |`);
  if (totalIssues > 0) {
    parts.push(`| Total Jira Issues | ${totalIssues} |`);
  }
  parts.push('');

  // Team-level blockers
  if (teamBlockers.length > 0) {
    parts.push('## Blockers & Risks');
    parts.push('');
    for (const b of teamBlockers) {
      parts.push(b);
    }
    parts.push('');
  }

  // Per-member sections
  for (const { github, jira } of memberActivities) {
    parts.push(`## ${github.username}`);
    parts.push('');

    const mergedPRs = github.pullRequests.filter((pr) => pr.state === 'merged');
    const openPRs = github.pullRequests.filter((pr) => pr.state === 'open');
    const jiraIssues = jira?.issues ?? [];
    const doneIssues = jiraIssues.filter((i) => isDone(i.status));
    const activeIssues = jiraIssues.filter((i) => !isDone(i.status));

    const hasActivity =
      github.commits.length > 0 ||
      github.pullRequests.length > 0 ||
      github.reviews.length > 0 ||
      jiraIssues.length > 0;

    if (!hasActivity) {
      parts.push('_No activity in the last 24 hours_');
      parts.push('');
      continue;
    }

    // Completed (with PR-Jira linking)
    if (mergedPRs.length > 0 || doneIssues.length > 0) {
      parts.push('**Completed**');
      const links = linkPRsToJira(mergedPRs, doneIssues);
      const accomplishments = generateAccomplishments(mergedPRs, doneIssues, links);
      for (const a of accomplishments) {
        parts.push(`- ${a}`);
      }
      parts.push('');
    }

    // In Progress
    if (openPRs.length > 0 || activeIssues.length > 0) {
      parts.push('**In Progress**');
      for (const pr of openPRs) {
        parts.push(formatPrLine(pr));
      }
      for (const issue of activeIssues) {
        parts.push(formatJiraLine(issue));
      }
      parts.push('');
    }

    // Commits
    if (github.commits.length > 0) {
      parts.push(`**Commits:** ${github.commits.length}`);
      for (const c of github.commits) {
        parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
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
  }

  parts.push('---');
  return parts.join('\n');
}

/**
 * Generate a weekly summary report from pre-fetched data.
 * Structure: Highlights → Delivery Metrics → Key Deliverables → Investment Balance
 *   → PR Size Distribution → Repo Breakdown → Jira Flow → Trends → Insights → Health → Appendix
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
  parts.push(`**${github.username}** — Last 7 Days`);
  parts.push('');

  // ── Highlights ──
  const highlights = generateHighlights(github, jira, metrics.avgMergeTimeHours);
  if (highlights.length > 0) {
    parts.push('## Highlights');
    parts.push('');
    for (const h of highlights) {
      parts.push(`- ${h}`);
    }
    parts.push('');
  }

  // ── Delivery Metrics ──
  parts.push('## Delivery Metrics');
  parts.push('');
  parts.push('| Metric | Value |');
  parts.push('|--------|-------|');
  parts.push(`| Commits | ${metrics.totalCommits} |`);
  parts.push(
    `| Pull Requests | ${metrics.pullRequests.total} (${metrics.pullRequests.merged} merged, ${metrics.pullRequests.open} open, ${metrics.pullRequests.closed} closed) |`
  );
  parts.push(`| Code Changes | +${metrics.additions}/-${metrics.deletions} |`);
  if (metrics.avgMergeTimeHours !== null) {
    parts.push(`| Cycle Time (avg) | ${metrics.avgMergeTimeHours} hours |`);
  }
  parts.push(
    `| Reviews | ${metrics.reviews.total} (${metrics.reviews.approved} approved, ${metrics.reviews.changesRequested} changes requested) |`
  );
  parts.push('');

  // ── Key Deliverables ──
  const jiraIssues = jira?.issues ?? [];
  const mergedPRs = github.pullRequests.filter((pr) => pr.state === 'merged');
  const doneIssues = jiraIssues.filter((i) => isDone(i.status));
  if (mergedPRs.length > 0 || doneIssues.length > 0) {
    const links = linkPRsToJira(github.pullRequests, jiraIssues);
    const accomplishments = generateAccomplishments(mergedPRs, doneIssues, links);
    if (accomplishments.length > 0) {
      parts.push('## Key Deliverables');
      parts.push('');
      for (const a of accomplishments) {
        parts.push(`- ${a}`);
      }
      parts.push('');
    }
  }

  // ── Investment Balance ──
  if (jiraIssues.length > 0) {
    const balance = calculateInvestmentBalance(jiraIssues);
    if (Object.keys(balance).length > 0) {
      parts.push('## Investment Balance');
      parts.push('');
      parts.push('| Type | Count |');
      parts.push('|------|-------|');
      for (const [type, count] of Object.entries(balance)) {
        parts.push(`| ${type} | ${count} |`);
      }
      parts.push('');
    }
  }

  // ── PR Size Distribution ──
  const dist = metrics.prSizeDistribution;
  if (dist.small + dist.medium + dist.large > 0) {
    parts.push('## PR Size Distribution');
    parts.push('');
    parts.push('| Size | Lines Changed | Count |');
    parts.push('|------|--------------|-------|');
    parts.push(`| Small | 1-100 | ${dist.small} |`);
    parts.push(`| Medium | 101-500 | ${dist.medium} |`);
    parts.push(`| Large | 501+ | ${dist.large} |`);
    parts.push('');
  }

  // ── Repository Breakdown ──
  if (metrics.repoBreakdown.length > 0) {
    parts.push('## Repository Breakdown');
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

  // ── Jira Flow ──
  if (jira && jira.issues.length > 0 && metrics.jira) {
    parts.push(`## Jira Issues: ${metrics.jira.totalIssues}`);
    parts.push('');

    // By Status table
    parts.push('| Status | Count |');
    parts.push('|--------|-------|');
    for (const [status, count] of Object.entries(metrics.jira.byStatus)) {
      parts.push(`| ${status} | ${count} |`);
    }
    parts.push('');

    // By Type table
    if (Object.keys(metrics.jira.byType).length > 0) {
      parts.push('| Type | Count |');
      parts.push('|------|-------|');
      for (const [type, count] of Object.entries(metrics.jira.byType)) {
        parts.push(`| ${type} | ${count} |`);
      }
      parts.push('');
    }

    for (const issue of jira.issues) {
      parts.push(formatJiraLine(issue));
    }
    parts.push('');
  }

  // ── Trends ──
  if (trends && trends.length > 0) {
    renderTrends(parts, trends);
  }

  // ── Anomalies / Insights ──
  if (anomalies && anomalies.length > 0) {
    renderAnomalies(parts, anomalies);
  }

  // ── Team Health ──
  if (health) {
    renderTeamHealth(parts, health);
  }

  // ── Appendix ──
  const hasAppendix =
    github.commits.length > 0 || github.pullRequests.length > 0 || github.reviews.length > 0;
  if (hasAppendix) {
    parts.push('## Appendix');
    parts.push('');

    if (github.commits.length > 0) {
      parts.push(`### Commits: ${github.commits.length}`);
      for (const c of github.commits) {
        parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
      }
      parts.push('');
    }

    if (github.pullRequests.length > 0) {
      parts.push(`### Pull Requests: ${github.pullRequests.length}`);
      for (const pr of github.pullRequests) {
        parts.push(formatPrLine(pr));
      }
      parts.push('');
    }

    if (github.reviews.length > 0) {
      parts.push(`### Reviews: ${github.reviews.length}`);
      for (const r of github.reviews) {
        parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}]`);
      }
      parts.push('');
    }
  }

  parts.push('---');

  return parts.join('\n');
}

/**
 * Generate a sprint retrospective report from pre-fetched data.
 * Structure: Sprint Goal → Sprint Scorecard → What Went Well → What Needs Improvement
 *   → Action Items → Delivery Metrics → Developer Contributions → Jira → Trends → Health → Appendix
 */
export function generateRetrospective(input: RetroReportInput, extras?: ReportExtras): string {
  const { github, jira, sprintName, dateRange, sprintGoal, perMember } = input;
  const metrics = analyzeSprintActivity(github, jira);
  const trends = extras?.trends;
  const anomalies = extras?.anomalies ?? [];
  const health = extras?.health;

  const parts: string[] = [];

  parts.push(`# Sprint Retrospective: ${sprintName}`);
  parts.push('');
  parts.push(`**Period:** ${dateRange.from} to ${dateRange.to}`);
  parts.push(`**Developer:** ${github.username}`);
  parts.push('');

  // ── Sprint Goal ──
  if (sprintGoal) {
    parts.push('## Sprint Goal');
    parts.push('');
    parts.push(`> ${sprintGoal}`);
    parts.push('');
  }

  // ── Sprint Scorecard ──
  parts.push('## Sprint Scorecard');
  parts.push('');
  parts.push('| Metric | Value |');
  parts.push('|--------|-------|');
  if (metrics.jira) {
    parts.push(
      `| Completion Rate | ${metrics.jira.completed}/${metrics.jira.totalIssues} (${metrics.jira.completionRate}%) |`
    );
    const carryover = metrics.jira.totalIssues - metrics.jira.completed;
    parts.push(`| Carryover | ${carryover} issues |`);
  }
  parts.push(`| Merge Rate | ${metrics.pullRequests.mergeRate}% |`);
  if (metrics.avgMergeTimeHours !== null) {
    parts.push(`| Avg Merge Time | ${metrics.avgMergeTimeHours} hours |`);
  }
  parts.push('');

  // ── Content Insights (What Went Well / Needs Improvement / Action Items) ──
  const jiraIssues = jira?.issues ?? [];
  const contentInsights = generateContentInsights({
    github,
    jiraIssues,
    anomalies,
    metrics,
    perMember,
    sprintGoal,
  });

  if (contentInsights.wentWell.length > 0) {
    parts.push('## What Went Well');
    parts.push('');
    for (const item of contentInsights.wentWell) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }

  if (contentInsights.needsImprovement.length > 0) {
    parts.push('## What Needs Improvement');
    parts.push('');
    for (const item of contentInsights.needsImprovement) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }

  if (contentInsights.actionItems.length > 0) {
    parts.push('## Action Items');
    parts.push('');
    for (const item of contentInsights.actionItems) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }

  // ── Delivery Metrics ──
  parts.push('## Delivery Metrics');
  parts.push('');
  parts.push('| Metric | Value |');
  parts.push('|--------|-------|');
  parts.push(`| Commits | ${metrics.totalCommits} |`);
  parts.push(
    `| Pull Requests | ${metrics.pullRequests.total} (${metrics.pullRequests.merged} merged, ${metrics.pullRequests.open} open, ${metrics.pullRequests.closed} closed) |`
  );
  parts.push(`| Code Changes | +${metrics.additions}/-${metrics.deletions} |`);
  parts.push(
    `| Reviews | ${metrics.reviews.total} (${metrics.reviews.approved} approved, ${metrics.reviews.changesRequested} changes requested) |`
  );
  parts.push('');

  // ── Developer Contributions ──
  if (contentInsights.developerSummaries.length > 0) {
    parts.push('## Developer Contributions');
    parts.push('');
    renderDeveloperSummaries(parts, contentInsights);
  }

  // ── Jira Breakdown ──
  if (metrics.jira && jira && jira.issues.length > 0) {
    parts.push('## Jira Issues');
    parts.push('');

    // By Status
    const byStatus: Record<string, number> = {};
    for (const issue of jira.issues) {
      byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;
    }
    parts.push('| Status | Count |');
    parts.push('|--------|-------|');
    for (const [status, count] of Object.entries(byStatus)) {
      parts.push(`| ${status} | ${count} |`);
    }
    parts.push('');

    // By Type
    if (Object.keys(metrics.jira.byType).length > 0) {
      parts.push('| Type | Count |');
      parts.push('|------|-------|');
      for (const [type, count] of Object.entries(metrics.jira.byType)) {
        parts.push(`| ${type} | ${count} |`);
      }
      parts.push('');
    }

    // By Priority
    if (Object.keys(metrics.jira.byPriority).length > 0) {
      parts.push('| Priority | Count |');
      parts.push('|----------|-------|');
      for (const [priority, count] of Object.entries(metrics.jira.byPriority)) {
        parts.push(`| ${priority} | ${count} |`);
      }
      parts.push('');
    }

    for (const issue of jira.issues) {
      parts.push(formatJiraLine(issue));
    }
    parts.push('');
  }

  // ── Trends ──
  if (trends && trends.length > 0) {
    renderTrends(parts, trends);
  }

  // ── Anomalies / Insights ──
  if (anomalies.length > 0) {
    renderAnomalies(parts, anomalies);
  }

  // ── Team Health ──
  if (health) {
    renderTeamHealth(parts, health);
  }

  // ── Appendix ──
  const hasAppendix =
    github.commits.length > 0 || github.pullRequests.length > 0 || github.reviews.length > 0;
  if (hasAppendix) {
    parts.push('## Appendix');
    parts.push('');

    if (github.commits.length > 0) {
      parts.push(`### Commits: ${github.commits.length}`);
      for (const c of github.commits) {
        parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
      }
      parts.push('');
    }

    if (github.pullRequests.length > 0) {
      parts.push(`### Pull Requests: ${github.pullRequests.length}`);
      for (const pr of github.pullRequests) {
        parts.push(formatPrLine(pr));
      }
      parts.push('');
    }

    if (github.reviews.length > 0) {
      parts.push(`### Reviews: ${github.reviews.length}`);
      for (const r of github.reviews) {
        parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}]`);
      }
      parts.push('');
    }
  }

  parts.push('---');

  return parts.join('\n');
}

/**
 * Generate a sprint review report — mid-sprint health check.
 * Structure: Sprint Goal → Progress Summary → Key Deliverables → In Progress
 *   → Risks & Blockers → Developer Progress → Delivery Metrics
 */
export function generateSprintReview(input: SprintReviewInput, extras?: ReportExtras): string {
  const { github, jira, sprintName, dateRange, sprintGoal, perMember, daysElapsed, daysTotal } =
    input;
  const metrics = analyzeSprintActivity(github, jira);
  const anomalies = extras?.anomalies ?? [];

  const parts: string[] = [];

  parts.push(`# Sprint Review: ${sprintName}`);
  parts.push('');
  parts.push(`**Period:** ${dateRange.from} to ${dateRange.to}`);
  const progressPct = daysTotal > 0 ? Math.round((daysElapsed / daysTotal) * 100) : 0;
  parts.push(`**Sprint Progress:** Day ${daysElapsed} of ${daysTotal} (${progressPct}%)`);
  parts.push('');

  // ── Sprint Goal ──
  if (sprintGoal) {
    parts.push('## Sprint Goal');
    parts.push('');
    parts.push(`> ${sprintGoal}`);
    parts.push('');
  }

  // ── Progress Summary ──
  const jiraIssues = jira?.issues ?? [];
  const doneIssues = jiraIssues.filter((i) => isDone(i.status));
  const inProgressIssues = jiraIssues.filter((i) => isInProgress(i.status));
  const notStarted = jiraIssues.filter((i) => !isDone(i.status) && !isInProgress(i.status));
  const openPRs = github.pullRequests.filter((pr) => pr.state === 'open');
  const mergedPRs = github.pullRequests.filter((pr) => pr.state === 'merged');

  parts.push('## Progress Summary');
  parts.push('');
  parts.push('| Metric | Value |');
  parts.push('|--------|-------|');
  parts.push(`| Days Elapsed | ${daysElapsed} of ${daysTotal} |`);
  if (jiraIssues.length > 0) {
    parts.push(
      `| Issues Completed | ${doneIssues.length} of ${jiraIssues.length} (${jiraIssues.length > 0 ? Math.round((doneIssues.length / jiraIssues.length) * 100) : 0}%) |`
    );
    parts.push(`| Issues In Progress | ${inProgressIssues.length} |`);
    parts.push(`| Issues Not Started | ${notStarted.length} |`);
  }
  parts.push(`| PRs Merged | ${mergedPRs.length} |`);
  parts.push(`| PRs Awaiting Review | ${openPRs.length} |`);
  parts.push('');

  // ── Key Deliverables ──
  if (mergedPRs.length > 0 || doneIssues.length > 0) {
    const links = linkPRsToJira(github.pullRequests, jiraIssues);
    const accomplishments = generateAccomplishments(mergedPRs, doneIssues, links);
    if (accomplishments.length > 0) {
      parts.push('## Key Deliverables');
      parts.push('');
      for (const a of accomplishments) {
        parts.push(`- ${a}`);
      }
      parts.push('');
    }
  }

  // ── In Progress ──
  if (inProgressIssues.length > 0 || openPRs.length > 0) {
    parts.push('## In Progress');
    parts.push('');
    const links = linkPRsToJira(openPRs, inProgressIssues);
    for (const link of links) {
      if (link.jiraIssue) {
        const days = Math.floor(daysSinceNow(link.pr.createdAt));
        parts.push(
          `- ${link.jiraKey}: ${link.jiraIssue.summary} → PR #${link.pr.number} (open ${days} days)`
        );
      } else {
        const days = Math.floor(daysSinceNow(link.pr.createdAt));
        parts.push(`- PR #${link.pr.number}: ${link.pr.title} (open ${days} days)`);
      }
    }
    // Unlinked in-progress Jira issues
    const linkedKeys = new Set(links.filter((l) => l.jiraKey).map((l) => l.jiraKey));
    for (const issue of inProgressIssues) {
      if (!linkedKeys.has(issue.key)) {
        parts.push(formatJiraLine(issue));
      }
    }
    parts.push('');
  }

  // ── Risks & Blockers ──
  const risks: string[] = [];
  const stalePRs = anomalies.filter((a) => a.type === 'stale_pr');
  if (stalePRs.length > 0) {
    risks.push(
      `${stalePRs.length} PR${stalePRs.length === 1 ? '' : 's'} open for extended period — may not merge before sprint end`
    );
  }
  const daysRemaining = daysTotal - daysElapsed;
  const incomplete = jiraIssues.length - doneIssues.length;
  if (daysRemaining <= 3 && incomplete > 0) {
    risks.push(
      `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining with ${incomplete} incomplete items`
    );
  }
  const staleIssues = anomalies.filter((a) => a.type === 'stale_issue');
  if (staleIssues.length > 0) {
    risks.push(
      `${staleIssues.length} high-priority issue${staleIssues.length === 1 ? '' : 's'} stalled`
    );
  }

  if (risks.length > 0) {
    parts.push('## Risks & Blockers');
    parts.push('');
    for (const risk of risks) {
      parts.push(`- [!] ${risk}`);
    }
    parts.push('');
  }

  // ── Developer Progress ──
  if (perMember && perMember.length > 0) {
    parts.push('## Developer Progress');
    parts.push('');
    for (const member of perMember) {
      const memberMerged = member.pullRequests.filter((pr) => pr.state === 'merged').length;
      const memberOpen = member.pullRequests.filter((pr) => pr.state === 'open').length;
      parts.push(`### ${member.username}`);
      parts.push(`- Completed: ${memberMerged} PRs merged`);
      parts.push(`- In Progress: ${memberOpen} PRs open`);
      parts.push(`- Reviews Given: ${member.reviews.length}`);
      parts.push('');
    }
  }

  // ── Delivery Metrics ──
  parts.push('## Delivery Metrics');
  parts.push('');
  parts.push('| Metric | Value |');
  parts.push('|--------|-------|');
  parts.push(`| Commits | ${metrics.totalCommits} |`);
  parts.push(
    `| Pull Requests | ${metrics.pullRequests.total} (${metrics.pullRequests.merged} merged, ${metrics.pullRequests.open} open) |`
  );
  parts.push(`| Code Changes | +${metrics.additions}/-${metrics.deletions} |`);
  parts.push(
    `| Reviews | ${metrics.reviews.total} (${metrics.reviews.approved} approved, ${metrics.reviews.changesRequested} changes requested) |`
  );
  parts.push('');

  parts.push('---');

  return parts.join('\n');
}

// ─── Highlights Generator ───────────────────────────────────

function generateHighlights(
  github: GitHubActivity,
  jira: JiraActivity | undefined,
  avgMergeTimeHours: number | null
): string[] {
  const highlights: string[] = [];

  const mergedPRs = github.pullRequests.filter((pr) => pr.state === 'merged');
  if (mergedPRs.length > 0) {
    highlights.push(`Merged ${mergedPRs.length} PR${mergedPRs.length === 1 ? '' : 's'} this week`);
  }

  const doneIssues = jira?.issues.filter((i) => isDone(i.status)) ?? [];
  if (doneIssues.length > 0) {
    highlights.push(
      `Completed ${doneIssues.length} Jira issue${doneIssues.length === 1 ? '' : 's'}`
    );
  }

  if (avgMergeTimeHours !== null) {
    if (avgMergeTimeHours <= 24) {
      highlights.push(`Average cycle time: ${avgMergeTimeHours}h — healthy turnaround`);
    } else {
      highlights.push(`Average cycle time: ${avgMergeTimeHours}h — consider reviewing bottlenecks`);
    }
  }

  return highlights.slice(0, 3);
}

// ─── Focus Area Grouping ────────────────────────────────────

interface ThemeGroup {
  name: string;
  issues: JiraIssue[];
}

/**
 * Group Jira issues into theme groups by extracting common keywords from summaries.
 */
function groupByTheme(issues: JiraIssue[]): ThemeGroup[] {
  if (issues.length === 0) return [];

  // Group by labels first if available
  const labelGroups = new Map<string, JiraIssue[]>();
  const ungrouped: JiraIssue[] = [];

  for (const issue of issues) {
    if (issue.labels && issue.labels.length > 0) {
      const label = issue.labels[0]!;
      const group = labelGroups.get(label) ?? [];
      group.push(issue);
      labelGroups.set(label, group);
    } else {
      ungrouped.push(issue);
    }
  }

  const themes: ThemeGroup[] = [];
  for (const [label, group] of labelGroups) {
    if (group.length > 0) {
      themes.push({ name: label, issues: group });
    }
  }

  // Group ungrouped by issue type
  if (ungrouped.length > 0) {
    const typeGroups = new Map<string, JiraIssue[]>();
    for (const issue of ungrouped) {
      const group = typeGroups.get(issue.issueType) ?? [];
      group.push(issue);
      typeGroups.set(issue.issueType, group);
    }
    for (const [type, group] of typeGroups) {
      themes.push({ name: type, issues: group });
    }
  }

  return themes.slice(0, 5);
}

// ─── Developer Summary Rendering ────────────────────────────

function renderDeveloperSummaries(parts: string[], insights: ContentInsights): void {
  for (const dev of insights.developerSummaries) {
    parts.push(`### ${dev.username}`);
    parts.push('');
    parts.push('| Commits | PRs Authored | PRs Merged | Reviews Given |');
    parts.push('|---------|-------------|------------|---------------|');
    parts.push(`| ${dev.commits} | ${dev.prsAuthored} | ${dev.prsMerged} | ${dev.reviewsGiven} |`);
    parts.push('');

    if (dev.keyDeliverables.length > 0) {
      parts.push('**Key Deliverables:**');
      for (const d of dev.keyDeliverables) {
        parts.push(`- ${d}`);
      }
      parts.push('');
    }

    if (dev.inProgress.length > 0) {
      parts.push('**In Progress:**');
      for (const ip of dev.inProgress) {
        parts.push(`- ${ip}`);
      }
      parts.push('');
    }

    if (dev.carryover.length > 0) {
      parts.push('**Carryover:**');
      for (const c of dev.carryover) {
        parts.push(`- ${c}`);
      }
      parts.push('');
    }
  }
}

// ─── Trend Rendering ─────────────────────────────────────────

const SEVERITY_ICON: Record<TrendInsight['severity'], string> = {
  alert: '[!!]',
  warning: '[!]',
  info: '[i]',
};

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
  parts.push('');
}

const ANOMALY_ICON: Record<Anomaly['severity'], string> = {
  alert: '[!!]',
  warning: '[!]',
  info: '[i]',
};

function renderAnomalies(parts: string[], anomalies: Anomaly[]): void {
  parts.push('## Insights');
  parts.push('');
  for (const a of anomalies) {
    parts.push(`- ${ANOMALY_ICON[a.severity]} **${a.severity}:** ${a.message}`);
  }
  parts.push('');
}

const TREND_ARROW: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  stable: 'Stable',
};

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
  parts.push('');
}
