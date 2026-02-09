# Prodbeam MCP Server

[![npm version](https://img.shields.io/npm/v/@prodbeam/mcp)](https://www.npmjs.com/package/@prodbeam/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org)

Engineering intelligence reports from GitHub and Jira, delivered through any MCP client or the standalone CLI.

- **Daily standups** from your commits, PRs, reviews, and Jira issues
- **Weekly summaries** with delivery metrics, repo breakdowns, and trend analysis
- **Sprint retrospectives** with merge time analysis, completion rates, and action items
- **Sprint reviews** with mid-sprint progress, risks, blockers, and per-developer status
- **Team health scoring** with anomaly detection and recommendations

---

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Usage](#usage)
- [Sample Output](#sample-output)
- [Available Tools](#available-tools)
- [Architecture](#architecture)
- [Security](#security)
- [Known Limitations](#known-limitations)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

### Option 1: Global install with setup wizard

```bash
npm install -g @prodbeam/mcp
prodbeam init
```

The wizard walks you through authentication (OAuth or tokens), discovers your repos and projects, and registers the MCP server automatically.

### Option 2: npx (zero install)

```bash
claude mcp add prodbeam \
  -e GITHUB_TOKEN=ghp_YOUR_TOKEN \
  -e JIRA_HOST=company.atlassian.net \
  -e JIRA_EMAIL=you@company.com \
  -e JIRA_API_TOKEN=your_jira_token \
  -- npx -y @prodbeam/mcp
```

Then set up your team in a Claude Code session:

```
Set up my prodbeam team called "My Team" with emails: alice@company.com, bob@company.com
```

### Option 3: MCP client config file

For Cursor, Windsurf, VS Code, or other MCP clients that use a JSON config:

```json
{
  "mcpServers": {
    "prodbeam": {
      "command": "npx",
      "args": ["-y", "@prodbeam/mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_YOUR_TOKEN",
        "JIRA_HOST": "company.atlassian.net",
        "JIRA_EMAIL": "you@company.com",
        "JIRA_API_TOKEN": "your_jira_token"
      }
    }
  }
}
```

**Config file locations:**

| Client | Path |
|--------|------|
| Claude Code (project) | `.claude/mcp.json` |
| Claude Code (user) | `~/.claude/mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Windsurf | `.windsurf/mcp.json` |

For more setup options, see the [Setup & Usage Guide](docs/guide.md).

---

## Prerequisites

| Requirement | How to get it |
|-------------|---------------|
| Node.js 18+ | [nodejs.org](https://nodejs.org) |
| GitHub credentials | OAuth via `prodbeam auth login`, or [create a PAT](https://github.com/settings/tokens) (scopes: `repo`, `read:user`, `read:org`) |
| Jira credentials (optional) | OAuth via `prodbeam auth login`, or [create an API token](https://id.atlassian.com/manage-profile/security/api-tokens) |

Jira is optional — reports work with GitHub alone, with Jira sections omitted.

---

## Usage

### In any MCP client

Ask naturally — the client invokes the right tool:

| Prompt | Tool |
|--------|------|
| "Generate my standup" | `standup` |
| "Generate a team standup" | `team_standup` |
| "Generate a weekly summary" | `weekly_summary` |
| "Generate a weekly summary for last week" | `weekly_summary` (weeksAgo: 1) |
| "Generate a sprint retro" | `sprint_retro` |
| "Show sprint progress" | `sprint_review` |

### CLI

```bash
prodbeam auth login                        # Authenticate (OAuth or token)
prodbeam auth status                       # Check token expiry
prodbeam standup                           # Personal standup (last 24h)
prodbeam standup --email alice@co.com      # Standup for a specific member
prodbeam team-standup                      # Full team standup
prodbeam weekly                            # Weekly summary (current week)
prodbeam weekly --weeks-ago 1              # Last week's summary
prodbeam sprint-retro                      # Sprint retro (auto-detect sprint)
prodbeam sprint-retro --sprint "Sprint 12" # Specific sprint
prodbeam sprint-review                     # Mid-sprint health check
prodbeam status                            # Check config and credentials
prodbeam help                              # All commands
prodbeam help weekly                       # Detailed help for a command
```

---

## Sample Output

<details>
<summary>Daily Standup</summary>

```markdown
# Daily Standup - Friday, February 7, 2026

**alice**

## Completed

- ENG-431: Webhook retry failures → PR #142 (merged, +187/-43)
- [ENG-428](https://company.atlassian.net/browse/ENG-428): Implement API rate limiting [Done]

## In Progress

- #89: Update shared ESLint config [open] (+45/-22)
- [ENG-445](https://company.atlassian.net/browse/ENG-445): Upgrade ESLint to v9 [In Progress]

## Blockers & Risks

- [!] PR #134: Refactor auth middleware — open 9 days

## Activity Summary

| Metric | Count |
|--------|-------|
| Commits | 3 |
| Pull Requests | 2 |
| Reviews | 1 |
| Jira Issues | 3 |

**Recent Commits**
- `a1b2c3d` fix: resolve race condition in webhook handler (acme/api-gateway)
- `d4e5f6a` test: add integration tests for retry logic (acme/api-gateway)
- `b7c8d9e` chore: update eslint config (acme/shared-config)

**Reviews Given**
- PR #137: Add rate limiting middleware [APPROVED]

---
```

</details>

<details>
<summary>Weekly Summary (with trends and team health)</summary>

```markdown
# Weekly Engineering Summary - Friday, February 7, 2026

**alice** — Last 7 Days

## Highlights

- Merged 3 PRs this week
- Completed 3 Jira issues
- Average cycle time: 14.2h — healthy turnaround

## Delivery Metrics

| Metric | Value |
|--------|-------|
| Commits | 12 |
| Pull Requests | 5 (3 merged, 1 open, 1 closed) |
| Code Changes | +847/-312 |
| Cycle Time (avg) | 14.2 hours |
| Reviews | 8 (6 approved, 2 changes requested) |

## Key Deliverables

- ENG-431: Webhook retry failures → PR #142 (merged, +187/-43)
- ENG-428: API rate limiting → PR #137 (merged, +312/-45)
- ENG-435: Redis connection pooling → PR #139 (merged, +94/-12)

## Investment Balance

| Type | Count |
|------|-------|
| Story | 3 |
| Bug | 2 |
| Task | 1 |

## PR Size Distribution

| Size | Lines Changed | Count |
|------|--------------|-------|
| Small | 1-100 | 2 |
| Medium | 101-500 | 2 |
| Large | 501+ | 1 |

## Repository Breakdown

| Repository | Commits | PRs | Merged | +/- | Reviews |
|------------|---------|-----|--------|-----|---------|
| acme/api-gateway | 8 | 3 | 2 | +612/-198 | 5 |
| acme/shared-config | 2 | 1 | 1 | +45/-22 | 1 |
| acme/docs | 2 | 1 | 0 | +190/-92 | 2 |

## Jira Issues: 6

| Status | Count |
|--------|-------|
| Done | 3 |
| In Progress | 2 |
| In Review | 1 |

## Trends vs Previous Period

| Metric | Change | Direction | Severity |
|--------|--------|-----------|----------|
| Commits | +25% | Up | [i] info |
| PRs Merged | -15% | Down | [!] warning |
| Merge Time | +40% | Up | [!] warning |

- [i] Commit volume up 25% — consistent with sprint mid-point
- [!] PR merge rate declined 15% — may indicate review bottleneck
- [!] Average merge time increased to 18h (was 12.8h last week)

## Insights

- [!] **warning:** PR #134 open for 9 days without review
- [i] **info:** 3 PRs merged same-day — healthy turnaround

## Team Health: 72/100

| Dimension | Score | Trend |
|-----------|-------|-------|
| Velocity | 78 | Up |
| Throughput | 70 | Down |
| Review Coverage | 65 | Stable |
| Issue Flow | 74 | Up |

### Recommendations

- Review coverage below 75% — consider distributing reviews more evenly
- 1 PR has been open >7 days — prioritize review to unblock work

## Appendix

### Commits: 12
- `a1b2c3d` fix: resolve race condition in webhook handler (acme/api-gateway)
- `d4e5f6a` test: add integration tests for retry logic (acme/api-gateway)
- ...

### Pull Requests: 5
- #142: Fix webhook retry logic [merged] (+187/-43)
- #139: Refactor auth middleware [merged] (+312/-155)
- ...

### Reviews: 8
- PR #137: Add rate limiting middleware [APPROVED]
- PR #141: Migrate auth to OAuth2 [APPROVED]
- ...

---
```

</details>

<details>
<summary>Sprint Retrospective</summary>

```markdown
# Sprint Retrospective: Sprint 12

**Period:** 2026-01-27 to 2026-02-07
**Developer:** alice

## Sprint Goal

> Deliver webhook reliability improvements and API rate limiting

## Sprint Scorecard

| Metric | Value |
|--------|-------|
| Completion Rate | 8/11 (73%) |
| Carryover | 3 issues |
| Merge Rate | 78% |
| Avg Merge Time | 14.2 hours |

## What Went Well

- 8 of 11 sprint issues completed (73%) — above team average
- 5 of 7 merged PRs had same-day reviews
- Sprint goal partially achieved: webhook reliability improvements shipped

## What Needs Improvement

- Average merge time of 14.2h exceeds 8h target
- PR #134 blocked on review for 12 days
- 3 issues carried over from previous sprint

## Action Items

- Set up daily review rotation to reduce merge time
- Break down large issues to improve estimation accuracy
- Address PR #134 review bottleneck

## Delivery Metrics

| Metric | Value |
|--------|-------|
| Commits | 24 |
| Pull Requests | 9 (7 merged, 1 open, 1 closed) |
| Code Changes | +2,145/-876 |
| Reviews | 15 (12 approved, 3 changes requested) |

## Developer Contributions

### alice
- PRs: 3 merged, 1 open
- Reviews given: 4
- Focus: webhook reliability (ENG-431, ENG-433)

### bob
- PRs: 3 merged, 0 open
- Reviews given: 8
- Focus: API rate limiting (ENG-428)

## Jira Issues

| Status | Count |
|--------|-------|
| Done | 8 |
| In Progress | 2 |
| In Review | 1 |

| Type | Count |
|------|-------|
| Story | 5 |
| Bug | 3 |
| Task | 2 |
| Spike | 1 |

| Priority | Count |
|----------|-------|
| High | 4 |
| Medium | 5 |
| Low | 2 |

## Trends vs Previous Period

| Metric | Change | Direction | Severity |
|--------|--------|-----------|----------|
| Commits | +14% | Up | [i] info |
| Merge Rate | -8% | Down | [!] warning |
| Completion Rate | +5% | Up | [i] info |

- [i] Commit volume increased 14% over previous sprint
- [!] Merge rate dropped 8% — 2 PRs blocked on review for 3+ days
- [i] Jira completion improved to 73% (was 68% last sprint)

## Insights

- [!] **warning:** PR #134 open for 12 days — oldest unmerged PR in sprint
- [i] **info:** 5 of 7 merged PRs had same-day reviews

## Team Health: 70/100

| Dimension | Score | Trend |
|-----------|-------|-------|
| Velocity | 76 | Up |
| Throughput | 68 | Stable |
| Review Coverage | 62 | Down |
| Issue Flow | 73 | Up |

### Recommendations

- Review coverage declining — consider pairing sessions to distribute knowledge
- 3 issues carried over from previous sprint — review estimation accuracy

## Appendix

### Commits: 24
- `a1b2c3d` fix: resolve race condition in webhook handler (acme/api-gateway)
- `d4e5f6a` test: add integration tests for retry logic (acme/api-gateway)
- ...

### Pull Requests: 9
- #142: Fix webhook retry logic [merged] (+187/-43)
- #139: Refactor auth middleware [merged] (+312/-155)
- ...

### Reviews: 15
- PR #137: Add rate limiting middleware [APPROVED]
- PR #141: Migrate auth to OAuth2 [APPROVED]
- ...

---
```

</details>

<details>
<summary>Sprint Review (mid-sprint health check)</summary>

```markdown
# Sprint Review: Sprint 12

**Period:** 2026-01-27 to 2026-02-07
**Sprint Progress:** Day 8 of 14 (57%)

## Sprint Goal

> Deliver webhook reliability improvements and API rate limiting

## Progress Summary

| Metric | Value |
|--------|-------|
| Days Elapsed | 8 of 14 |
| Issues Completed | 5 of 11 (45%) |
| Issues In Progress | 4 |
| Issues Not Started | 2 |
| PRs Merged | 6 |
| PRs Awaiting Review | 2 |

## Key Deliverables

- ENG-431: Webhook retry failures → PR #142 (merged)
- ENG-428: API rate limiting → PR #137 (merged)
- ENG-435: Redis connection pooling → PR #139 (merged)

## In Progress

- ENG-445: Upgrade ESLint to v9 → PR #89 (open 3 days)
- ENG-440: Redis connection pool tuning → PR #143 (open 1 day)
- ENG-450: Add monitoring dashboard
- ENG-452: Update deployment runbook

## Risks & Blockers

- [!] 1 PR open for extended period — may not merge before sprint end
- [!] 6 days remaining with 6 incomplete items
- [!] 1 high-priority issue stalled

## Developer Progress

### alice
- Completed: 3 PRs merged
- In Progress: 1 PRs open
- Reviews Given: 4

### bob
- Completed: 2 PRs merged
- In Progress: 1 PRs open
- Reviews Given: 6

### carol
- Completed: 1 PRs merged
- In Progress: 0 PRs open
- Reviews Given: 2

## Delivery Metrics

| Metric | Value |
|--------|-------|
| Commits | 18 |
| Pull Requests | 8 (6 merged, 2 open) |
| Code Changes | +1,547/-623 |
| Reviews | 12 (10 approved, 2 changes requested) |

---
```

</details>

---

## Available Tools

### Setup

| Tool | Parameters | Description |
|------|-----------|-------------|
| `setup_team` | teamName, emails | One-time onboarding with auto-discovery |
| `add_member` | email | Add a team member |
| `remove_member` | email | Remove a team member |
| `refresh_config` | — | Re-scan repos and sprints |
| `get_capabilities` | — | Show config status and available tools |

### Reports

| Tool | Parameters | Description |
|------|-----------|-------------|
| `standup` | email (optional) | Personal daily standup (last 24h) |
| `team_standup` | — | Full team standup with per-member breakdown |
| `weekly_summary` | weeksAgo (optional) | Weekly engineering summary with metrics and trends |
| `sprint_retro` | sprintName (optional) | Sprint retrospective with completion rates and action items |
| `sprint_review` | sprintName (optional) | Mid-sprint health check with risks and developer progress |

For full parameter documentation and sample output for every tool, see the [Tool Reference](docs/tool-reference.md).

---

## Architecture

Prodbeam is **self-sufficient** — it fetches data directly from GitHub and Jira APIs. No separate MCP servers needed. One tool call produces one complete report with no multi-step orchestration.

### End-to-End Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MCP Client / CLI                                    │
│              (Claude Code, Cursor, Windsurf, CLI)                          │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │ tool call (stdio / argv)
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Prodbeam MCP Server                                   │
│                                                                            │
│  ┌──────────────┐    ┌──────────────────────────────────────────────────┐  │
│  │ Auth Provider │───▶│               Data Fetcher                      │  │
│  │              │    │                                                  │  │
│  │ env vars     │    │  ┌─────────────┐       ┌─────────────┐          │  │
│  │   ▼ OAuth    │    │  │ GitHub REST  │       │  Jira REST  │          │  │
│  │   ▼ PAT      │    │  │   Client    │       │   Client    │          │  │
│  └──────────────┘    │  └──────┬──────┘       └──────┬──────┘          │  │
│                      │         │                     │                  │  │
│  ┌──────────────┐    │         └──────────┬──────────┘                  │  │
│  │ Team Config  │───▶│      Promise.allSettled (parallel, per-repo)     │  │
│  │ ~/.prodbeam/ │    └──────────────────┬───────────────────────────────┘  │
│  │ team.json    │                       │                                  │
│  └──────────────┘                       ▼                                  │
│                      ┌──────────────────────────────────────────────────┐  │
│                      │           Metrics Calculator                     │  │
│                      │                                                  │  │
│                      │  Raw activity ──▶ aggregate metrics              │  │
│                      │  (pure functions, no I/O)                        │  │
│                      └──────────────────┬───────────────────────────────┘  │
│                                         │                                  │
│                                         ▼                                  │
│                      ┌──────────────────────────────────────────────────┐  │
│                      │        ★ Intelligence Engine ★                   │  │
│                      │        (best-effort, try-catch wrapped)          │  │
│                      │                                                  │  │
│                      │  ┌──────────────┐  ┌──────────────────────────┐  │  │
│                      │  │   Trend      │  │   Anomaly                │  │  │
│                      │  │   Analyzer   │  │   Detector               │  │  │
│                      │  │  7 metrics   │  │  5 anomaly types         │  │  │
│                      │  └──────────────┘  └──────────────────────────┘  │  │
│                      │  ┌──────────────┐  ┌──────────────────────────┐  │  │
│                      │  │  Team Health │  │   Content Insights       │  │  │
│                      │  │   Scorer     │  │   Engine                 │  │  │
│                      │  │  4 dimensions│  │  qualitative analysis    │  │  │
│                      │  └──────────────┘  └──────────────────────────┘  │  │
│                      └──────────────────┬───────────────────────────────┘  │
│                                         │                                  │
│                                         ▼                                  │
│                      ┌──────────────────────────────────────────────────┐  │
│                      │          Report Generator                        │  │
│                      │                                                  │  │
│                      │  metrics + intelligence ──▶ Markdown report      │  │
│                      │  (pure functions, no I/O)                        │  │
│                      └──────────────────┬───────────────────────────────┘  │
│                                         │                                  │
│                                         ▼                                  │
│                      ┌──────────────────────────────────────────────────┐  │
│                      │          History Store                           │  │
│                      │                                                  │  │
│                      │  SQLite (WAL mode) ── aggregate snapshots only   │  │
│                      │  (fire-and-forget, feeds future trend analysis)  │  │
│                      └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Details

#### Auth Provider

Resolves credentials through a three-tier chain: **environment variables** (highest priority, always wins), **OAuth tokens** (auto-refreshed before expiry), **personal access tokens** (fallback). OAuth supports GitHub Device Flow and Jira OAuth 2.0 (3LO). Token refresh happens transparently — if an access token expires within 5 minutes, the provider silently exchanges the refresh token for a new one. Users only re-authenticate when refresh tokens expire (GitHub: 6 months, Jira: 90 days of inactivity).

#### Data Fetcher

Orchestrates parallel API calls across all configured repos and projects using `Promise.allSettled`. In team mode, each repo is fetched once and activity is split by member (avoiding N×M API calls). Individual repo failures are silently skipped — a 404 on one repo doesn't block the rest of the report. GitHub and Jira fetching run concurrently.

#### Metrics Calculator

Pure functions that transform raw API responses into aggregate metrics: commit counts, PR states (merged/open/closed), code churn (additions + deletions), review counts, average merge time, and Jira completion rates. No I/O — deterministic given the same input.

#### Report Generator

Pure Markdown renderers for all five report types (daily standup, team standup, weekly summary, sprint retro, sprint review). Each generator takes pre-computed metrics and optional intelligence extras (trends, anomalies, health scores) and returns a Markdown string. No API calls, no side effects, no randomness — testable with mock data.

#### History Store

SQLite database (via better-sqlite3, WAL mode) that persists aggregate metric snapshots. Each snapshot captures 16 team-level fields (commits, PRs, merge rates, code churn, reviews, Jira counts) and 7 per-member fields. Snapshots are saved fire-and-forget after report generation and feed the trend analyzer for period-over-period comparisons. The database never stores textual content — no commit messages, PR descriptions, or code.

### Intelligence Engine

The intelligence engine is Prodbeam's core differentiator. It transforms raw metrics into actionable insights through four independent analyzers. Each runs in a try-catch wrapper — if any fails, the report still generates without that section.

#### Trend Analyzer

Compares the current period against the previous snapshot stored in SQLite. Tracks **7 metrics** with directional awareness:

| Metric | Direction | "Up" means |
|--------|-----------|------------|
| Commits | up is good | More activity |
| PRs Merged | up is good | Higher throughput |
| Open PRs | up is bad | Growing backlog |
| Code Churn | up is bad | Potential instability |
| Reviews Given | up is good | Better coverage |
| Avg Merge Time | up is bad | Slower delivery |
| Jira Completion | up is good | More items shipped |

Each metric change is classified by configurable thresholds: **info** (<25% change), **warning** (25-50%), **alert** (>50%). The direction awareness means a 40% increase in merge time is a warning, while a 40% increase in PRs merged is just info. Results are sorted by severity so alerts surface first.

#### Anomaly Detector

Scans current activity for five anomaly patterns, each with configurable thresholds:

| Anomaly | Default Threshold | What it catches |
|---------|-------------------|-----------------|
| **Stale PR** | Warning: 1 day, Alert: 2 days | Open PRs exceeding the configured age threshold without merge or close |
| **Stale Issue** | 7 days | High-priority Jira issues marked "In Progress" with no updates for 7+ days |
| **Review Imbalance** | 60% | One reviewer handling more than 60% of all reviews — indicates bus factor risk |
| **No Activity** | Any team member | Members with zero commits, PRs, and reviews in the period — flags potential blockers |
| **High Churn** | 3× average, minimum 1000 lines | Individual code churn exceeding 3× team average and 1000+ lines — suggests rework |

Review imbalance uses a Gini coefficient concept to detect concentration, only triggering when the team has at least 2 active reviewers to avoid false positives on small teams.

#### Team Health Scorer

Produces a composite health score (0-100) across four weighted dimensions:

```
Overall Score = Velocity × 0.20 + Throughput × 0.30 + Review Coverage × 0.25 + Issue Flow × 0.25
```

| Dimension | Weight | Measures | How it's scored |
|-----------|--------|----------|-----------------|
| **Velocity** | 20% | Development pace | Commit count compared against historical average from SQLite snapshots |
| **Throughput** | 30% | Delivery effectiveness | PR merge rate, penalized for slow merge times (warning >24h, alert >48h) |
| **Review Coverage** | 25% | Review distribution fairness | Gini coefficient across reviewers — 1.0 means perfectly equal distribution, 0.0 means one person does all reviews |
| **Issue Flow** | 25% | Work completion | Jira completion percentage with trend detection (improving or declining) |

Each dimension includes a **trend indicator** (up/down/stable) comparing against the previous snapshot. The scorer generates context-aware **recommendations** when dimension scores fall below healthy thresholds — e.g., review coverage below 75% triggers a suggestion to distribute reviews more evenly.

#### Content Insights Engine

Derives qualitative analysis from raw activity data:

- **PR-Jira Linking** — Regex pattern matching (`[A-Z]+-\d+`) extracts Jira issue keys from PR titles, linking code changes to tracked work items. Linked items appear together in reports for traceability.
- **Accomplishments** — Identifies completed deliverables by matching merged PRs to resolved Jira issues. Linked pairs (PR + issue) display together; unlinked items listed separately.
- **What Went Well** — Detects positive patterns: fast merge cycles (<24h average), high completion rates (>70%), strong merge rates (>80%), clean sprint boards.
- **What Needs Improvement** — Surfaces friction: stale PRs, PRs without approvals, high carryover (>30% of sprint), low Jira completion (<50%), review imbalance.
- **Action Items** — Generates specific follow-ups: triage stale PRs, establish approval workflows, review team capacity, rotate review assignments.
- **Investment Balance** — Groups Jira issues by type (Story, Bug, Task, Spike) to show where sprint effort was allocated.
- **Developer Summaries** — Per-member breakdown: commits, PRs, reviews given, deliverables, in-progress items, and carryover count.

### Graceful Degradation

Prodbeam follows a **partial data > no data** principle at every layer:

| Failure | Impact |
|---------|--------|
| One GitHub repo returns 404 | Other repos still included in the report |
| Jira credentials not configured | Report generates with GitHub data only, Jira sections omitted |
| SQLite history empty (first run) | Trends section skipped, all other sections render normally |
| Trend analyzer throws | Report generates without trend comparisons |
| Anomaly detector throws | Report generates without anomaly alerts |
| Team health scorer throws | Report generates without health scores |
| Snapshot persistence fails | Report already returned to user, failure is silent |

### Config directory

All data lives in `~/.prodbeam/` (override with `PRODBEAM_HOME`):

| File | Permissions | Purpose |
|------|-------------|---------|
| `team.json` | standard | Team members, repos, Jira projects, threshold overrides |
| `credentials.json` | 600 | OAuth tokens and/or personal access tokens |
| `history.db` | standard | SQLite — aggregate metric snapshots for trend comparison |

---

## Security

- **Local-only** — all data stays on your machine. No telemetry, no Prodbeam cloud, no third-party services
- **Three auth methods** — OAuth (tokens refresh automatically), environment variables, or personal access tokens
- **Read-only** — all GitHub and Jira operations are read-only. Nothing is created, modified, or deleted
- **Minimal storage** — history database stores only aggregate numbers (counts, percentages, averages). Never commit messages, PR descriptions, or code
- **Credential isolation** — `credentials.json` is created with `600` permissions (owner read/write only)
- **Network scope** — `api.github.com`, your Jira instance, and OAuth endpoints (`github.com/login`, `auth.atlassian.com`) during authentication only

For details on token scopes, credential storage, and CI security checks, see [SECURITY.md](SECURITY.md).

---

## Known Limitations

- **Code changes may show `+0/-0`** — line count metrics depend on GitHub API diff stats availability
- **Weekly report title shows "Last 7 Days"** for historical queries — the data is correct; the title doesn't reflect the `weeksAgo` offset
- **Stale PR alerts are current-state** — historical reports show today's stale PRs, not the state during that historical week
- **Standup email must match team.json exactly** — use `prodbeam init` or edit `team.json` to correct mismatches
- **Sprint tools require Jira sprints** — teams not using Jira Scrum boards will have limited sprint data

---

## Documentation

| Document | Description |
|----------|-------------|
| [Setup & Usage Guide](docs/guide.md) | Detailed setup paths, credentials, team management, troubleshooting |
| [Tool Reference](docs/tool-reference.md) | Per-tool parameters, examples, and sample output |
| [Security](SECURITY.md) | Data handling, credentials, network access, token scopes |
| [Contributing](CONTRIBUTING.md) | Development setup, code style, PR process |
| [Changelog](CHANGELOG.md) | Version history |

---

## Contributing

Bug reports and feature requests welcome via [GitHub Issues](https://github.com/prodbeam/prodbeam-mcp/issues).

Pull requests accepted — see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

## License

MIT — See [LICENSE](LICENSE).
