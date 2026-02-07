/**
 * AI Report Generator
 *
 * Uses Anthropic Claude API to transform raw activity data into
 * human-readable standup reports.
 *
 * Falls back to raw data formatting if ANTHROPIC_API_KEY is not configured.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { GitHubActivity } from '../types/github.js';
import type { JiraActivity } from '../types/jira.js';

interface DailyReportInput {
  github: GitHubActivity;
  jira?: JiraActivity;
}

/**
 * Check if AI report generation is available
 */
export function isAIConfigured(): boolean {
  return Boolean(process.env['ANTHROPIC_API_KEY']);
}

/**
 * Generate a daily standup report using AI
 */
export async function generateDailyReport(input: DailyReportInput): Promise<string> {
  const rawSummary = buildRawSummary(input);

  if (!isAIConfigured()) {
    return buildFallbackReport(input, rawSummary);
  }

  try {
    return await generateWithAI(rawSummary, input);
  } catch (error) {
    console.error('[prodbeam] AI generation failed, using fallback:', error);
    return buildFallbackReport(input, rawSummary);
  }
}

/**
 * Build a text summary of raw activity data for the AI prompt
 */
function buildRawSummary(input: DailyReportInput): string {
  const { github, jira } = input;
  const parts: string[] = [];

  // Commits
  parts.push(`**GitHub Commits (${github.commits.length}):**`);
  if (github.commits.length > 0) {
    for (const c of github.commits) {
      parts.push(`- ${c.message} (${c.sha} in ${c.repo})`);
    }
  } else {
    parts.push('- No commits');
  }

  parts.push('');

  // Pull Requests
  parts.push(`**GitHub Pull Requests (${github.pullRequests.length}):**`);
  if (github.pullRequests.length > 0) {
    for (const pr of github.pullRequests) {
      const stats = pr.additions !== undefined ? ` (+${pr.additions}/-${pr.deletions})` : '';
      parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]${stats} (${pr.repo})`);
    }
  } else {
    parts.push('- No pull requests');
  }

  parts.push('');

  // Reviews
  parts.push(`**GitHub Reviews (${github.reviews.length}):**`);
  if (github.reviews.length > 0) {
    for (const r of github.reviews) {
      parts.push(
        `- Reviewed PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}] (${r.repo})`
      );
    }
  } else {
    parts.push('- No reviews');
  }

  // Jira
  if (jira && jira.issues.length > 0) {
    parts.push('');
    parts.push(`**Jira Issues (${jira.issues.length}):**`);
    for (const issue of jira.issues) {
      parts.push(`- ${issue.key}: ${issue.summary} [${issue.status}]`);
    }
  }

  return parts.join('\n');
}

/**
 * Generate report using Anthropic Claude API
 */
async function generateWithAI(rawSummary: string, input: DailyReportInput): Promise<string> {
  const anthropic = new Anthropic();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: `You are a concise technical writer generating daily standup reports for software developers.

Rules:
- Use bullet points, be concise
- Focus on accomplishments (what was done), not process
- Identify blockers from stale PRs (open > 2 days) or stuck tickets
- Be professional, not cheerful
- Do NOT invent work that isn't in the data
- For "Today" section, infer from open PRs and in-progress tickets
- Output only the report in Markdown, no extra commentary`,

    messages: [
      {
        role: 'user',
        content: `Generate a daily standup report for ${today} based on this activity from the last 24 hours by GitHub user "${input.github.username}":

${rawSummary}

Format:
# Daily Standup - ${today}

## Yesterday
- [accomplishments based on merged PRs, commits, completed tickets]

## Today
- [planned work based on open PRs, in-progress tickets]

## Blockers
- [any blockers, or "None" if clear]`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in AI response');
  }

  return textBlock.text;
}

/**
 * Build a structured report without AI (fallback)
 */
function buildFallbackReport(input: DailyReportInput, rawSummary: string): string {
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

  if (!isAIConfigured()) {
    parts.push('_Set ANTHROPIC_API_KEY for AI-powered standup summaries._');
  }

  // Include raw summary as debug info
  void rawSummary;

  return parts.join('\n');
}
