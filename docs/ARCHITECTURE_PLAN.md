# Prodbeam v2 — Implementation Architecture Plan

**Date:** February 7, 2026
**Status:** Approved
**Scope:** Evolve prodbeam from a passive report formatter into a self-sufficient engineering intelligence MCP server

**Decisions:**
1. No backward compatibility — remove v1 tool names, build clean
2. Config directory: `~/.prodbeam/` (user home) as default; override via `PRODBEAM_HOME` env var
3. Credentials: per-user (`~/.prodbeam/credentials.json`)
4. Single package: dual entry point — `prodbeam` CLI + MCP server (stdio)

---

## 1. Problem Statement

Prodbeam v1 (`0.2.0`) is a stateless formatting layer. Claude Code fetches all data from GitHub/Jira MCPs, structures it, and passes it to prodbeam for markdown rendering. This architecture means:

- **No unique value** — Claude can generate equivalent reports without prodbeam
- **No memory** — no historical trends, no sprint-over-sprint comparison
- **No team awareness** — user must specify username, repos, projects every time
- **No auto-discovery** — repos, sprints, team members all manually provided
- **No insights** — reports are data dumps, not intelligence

## 2. Target Architecture

### 2.1 Design Principles

1. **Prodbeam fetches its own data** — one MCP tool call produces a complete report
2. **All config in `~/.prodbeam/`** — team config, credentials, history in user home directory
3. **Historical metrics stored locally** — `~/.prodbeam/history.db` (SQLite)
4. **Zero data leaves the machine** — no prodbeam cloud, no telemetry
5. **Auto-discovery from emails** — repos, sprints, Jira projects detected automatically
6. **Clean break from v1** — no legacy tool names, no backward compatibility shims
7. **Single package, dual entry** — `prodbeam standup` (CLI) and MCP server (stdio) from one codebase

### 2.2 System Diagram

```
Developer's Machine
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Claude Code / Cursor / Any MCP Host                        │
│       │                                                     │
│       │ MCP (stdio)                                         │
│       ▼                                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Prodbeam MCP Server                                 │   │
│  │                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │   │
│  │  │ Team Config   │  │ Data Fetcher │  │ History   │  │   │
│  │  │ Manager       │  │              │  │ Store     │  │   │
│  │  │               │  │ ┌──────────┐ │  │           │  │   │
│  │  │ reads/writes  │  │ │ GitHub   │ │  │ SQLite    │  │   │
│  │  │ .prodbeam/    │  │ │ Client   │─┼──┼─► metrics │  │   │
│  │  │ team.json     │  │ └──────────┘ │  │           │  │   │
│  │  │               │  │ ┌──────────┐ │  │ snapshots │  │   │
│  │  │ auto-discover │  │ │ Jira     │ │  │ per sprint│  │   │
│  │  │ from emails   │  │ │ Client   │─┼──┼─► per week│  │   │
│  │  │               │  │ └──────────┘ │  │           │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  │   │
│  │         │                 │                 │         │   │
│  │         ▼                 ▼                 ▼         │   │
│  │  ┌──────────────────────────────────────────────────┐│   │
│  │  │              Report Engine                       ││   │
│  │  │                                                  ││   │
│  │  │  Metrics Calculator ─► Insight Engine ─► Renderer││   │
│  │  │        (existing)        (NEW)          (existing)││   │
│  │  └──────────────────────────────────────────────────┘│   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  File System (all under ~/.prodbeam/):                       │
│    ~/.prodbeam/team.json          (team config)             │
│    ~/.prodbeam/credentials.json   (API tokens, 600 perms)  │
│    ~/.prodbeam/history.db         (SQLite metrics history)  │
│                                                             │
│  Override: PRODBEAM_HOME env var or MCP config directory    │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow — Before & After

**v1 (current):** 7 steps, Claude orchestrates everything
```
User ──► Claude ──► GitHub MCP ──► Claude ──► Jira MCP ──► Claude ──► Prodbeam (format)
```

**v2 (target):** 1 step, prodbeam handles everything
```
User ──► Prodbeam ──► [GitHub API + Jira API + Local History] ──► Report
```

---

## 3. Module Design

### 3.1 New Directory Structure

```
src/
├── index.ts                          # MCP server entry point (stdio)
├── cli.ts                            # CLI entry point (prodbeam command)
├── validators.ts                     # Zod schemas (extended)
│
├── config/                           # NEW — Team configuration
│   ├── team-config.ts                # Read/write ~/.prodbeam/team.json
│   ├── credentials.ts                # Read ~/.prodbeam/credentials.json
│   ├── paths.ts                      # Resolve config dir (env → arg → ~/.prodbeam/)
│   └── types.ts                      # TeamConfig, MemberConfig types
│
├── discovery/                        # NEW — Auto-discovery
│   ├── github-discovery.ts           # Resolve emails → usernames, find repos
│   ├── jira-discovery.ts             # Resolve emails → accounts, find projects/sprints
│   └── types.ts                      # DiscoveryResult types
│
├── clients/                          # NEW — API clients
│   ├── github-client.ts              # Direct GitHub REST API calls
│   ├── jira-client.ts                # Direct Jira REST API calls
│   └── types.ts                      # API response types
│
├── history/                          # NEW — Local persistence
│   ├── history-store.ts              # SQLite read/write operations
│   ├── migrations.ts                 # DB schema versioning
│   └── types.ts                      # StoredMetrics, Snapshot types
│
├── insights/                         # NEW — Intelligence layer
│   ├── trend-analyzer.ts             # Compare current vs historical
│   ├── anomaly-detector.ts           # Flag unusual patterns
│   ├── team-health.ts                # Review balance, blockers, load
│   └── types.ts                      # Insight, Alert types
│
├── generators/                       # EXISTING — Report rendering
│   ├── report-generator.ts           # (refactored to accept insights)
│   ├── metrics-calculator.ts         # (kept, used internally)
│   ├── sprint-analyzer.ts            # (kept, used internally)
│   └── *.test.ts                     # Tests
│
└── types/                            # EXISTING — Core data types
    ├── github.ts                     # (kept)
    ├── jira.ts                       # (kept)
    ├── weekly.ts                     # (kept)
    └── retrospective.ts              # (kept)
```

### 3.2 Module Dependency Graph

```
index.ts (MCP server)  ←──┐
cli.ts (CLI)           ←──┤  both call same core modules
                           │
  ├── config/paths.ts            resolves ~/.prodbeam/ or $PRODBEAM_HOME
  ├── config/team-config.ts      reads ~/.prodbeam/team.json
  │     └── config/credentials.ts reads ~/.prodbeam/credentials.json
  │
  ├── discovery/                    auto-setup (uses clients/)
  │     ├── github-discovery.ts     resolves emails → usernames, repos
  │     └── jira-discovery.ts       resolves emails → accounts, sprints
  │
  ├── clients/                      fetches live data
  │     ├── github-client.ts        GitHub REST API (uses credentials)
  │     └── jira-client.ts          Jira REST API (uses credentials)
  │
  ├── generators/                   computes + renders
  │     ├── metrics-calculator.ts   pure metric computation
  │     ├── sprint-analyzer.ts      pure sprint analysis
  │     └── report-generator.ts     markdown rendering
  │
  ├── insights/                     intelligence layer
  │     ├── trend-analyzer.ts       reads history, compares
  │     ├── anomaly-detector.ts     flags outliers
  │     └── team-health.ts          cross-member analysis
  │
  └── history/                      persistence
        └── history-store.ts        SQLite (better-sqlite3)
```

---

## 4. Team Configuration

### 4.1 Config Directory Resolution

Prodbeam resolves its config directory in this order:

1. `PRODBEAM_HOME` environment variable (if set)
2. MCP server config `--config-dir` argument (if passed)
3. `~/.prodbeam/` (default)

```
~/.prodbeam/
├── team.json            # Team config (members, repos, projects)
├── credentials.json     # API tokens (file permissions: 600)
└── history.db           # SQLite metrics (numbers only, no content)
```

### 4.2 `team.json` Schema

```typescript
// src/config/types.ts

interface ProdbeamConfig {
  version: 1;
  configDir: string;                 // resolved absolute path (runtime, not stored)
}

interface TeamConfig {
  version: 1;
  team: {
    name: string;
    members: MemberConfig[];
  };
  github: {
    org?: string;                    // auto-discovered
    repos: string[];                 // auto-discovered, owner/name format
  };
  jira: {
    host: string;                    // e.g., "prodbeam.atlassian.net"
    projects: string[];              // auto-discovered, e.g., ["PA"]
  };
  settings: {
    timezone: string;                // e.g., "America/Denver"
    reportFormat: 'markdown' | 'slack';  // output format
  };
}

interface MemberConfig {
  email: string;                     // the only required input
  name?: string;                     // auto-discovered
  github?: string;                   // auto-discovered
  jiraAccountId?: string;            // auto-discovered
}
```

### 4.3 Minimal Input vs Auto-Discovered

```
User provides (once):          Prodbeam discovers automatically:
────────────────────           ──────────────────────────────────
team name                      GitHub usernames (from email)
member emails                  GitHub org membership
                               Active repos (from commit history)
                               Member display names
                               Jira account IDs (from email)
                               Jira projects (from access)
                               Active/recent sprints
                               Sprint cadence
                               Timezone (from system)
```

### 4.4 Credentials Storage (Per-User)

```typescript
// ~/.prodbeam/credentials.json (file permissions: 600, owner-only)
// Lives alongside team.json in the same ~/.prodbeam/ directory
{
  "github": {
    "token": ""          // populated during setup from env or prompt
  },
  "jira": {
    "host": "prodbeam.atlassian.net",
    "email": "giri@prodbeam.com",
    "apiToken": ""       // populated during setup from env or prompt
  }
}
```

**Credential resolution order:**
1. Environment variables: `GITHUB_TOKEN`, `JIRA_API_TOKEN`, `JIRA_EMAIL`, `JIRA_HOST`
2. `~/.prodbeam/credentials.json` (or `$PRODBEAM_HOME/credentials.json`)
3. Prompt user during `setup_team` if neither found

**Why per-user, not per-project:**
- Credentials are tied to the person, not the codebase
- One setup works across all projects
- No risk of accidentally committing tokens to git (nothing in project dir)

---

## 5. MCP Tool Interface (v2)

### 5.1 Setup Tools

#### `setup_team` — One-time onboarding

```
Input:
  teamName: string (required)
  emails: string[] (required, at least 1)

Process:
  1. Resolve config directory (PRODBEAM_HOME → --config-dir → ~/.prodbeam/)
  2. Create directory if it doesn't exist, set permissions (700)
  3. Resolve credentials (env vars → credentials file → return error asking user to set them)
  4. For each email:
     a. GitHub: GET /search/users?q={email}+in:email → username
     b. Jira: GET /rest/api/3/user/search?query={email} → accountId, displayName
  5. For discovered GitHub users:
     a. GET /users/{username}/repos?sort=pushed&per_page=100 → active repos (last 90 days)
     b. GET /users/{username}/orgs → org membership
  6. For discovered Jira accounts:
     a. Find shared projects across all members
     b. GET /rest/agile/1.0/board → find boards for projects
     c. GET /rest/agile/1.0/board/{id}/sprint?state=active → current sprint
  7. Write ~/.prodbeam/team.json
  8. Return config for user to review

Output:
  Generated team.json content + path where it was written
```

#### `add_member` / `remove_member`

```
Input:  email: string
Process: Resolve identity, update ~/.prodbeam/team.json
Output: Updated config
```

#### `refresh_config`

```
Input:  none
Process: Re-scan repos and sprints for existing members, update ~/.prodbeam/team.json
Output: Updated config with changes highlighted
```

### 5.2 Report Tools (Zero-Config)

#### `standup` — Personal daily standup

```
Input:  none (optional: date override)

Process:
  1. Read ~/.prodbeam/team.json
  2. Identify current user (match system git email to member list)
  3. Fetch last 24h activity:
     a. GitHub: commits, PRs, reviews across all tracked repos
     b. Jira: issues updated by current user
  4. Load yesterday's snapshot from ~/.prodbeam/history.db (for comparison)
  5. Generate insights (new blockers, stale PRs, etc.)
  6. Save today's metrics to ~/.prodbeam/history.db
  7. Render report

Output: Markdown standup with insights
```

#### `team_standup` — Full team daily standup

```
Input:  none

Process:
  1. Read ~/.prodbeam/team.json
  2. For each member: fetch last 24h GitHub + Jira activity
  3. Aggregate and cross-reference (who reviewed whose PRs, etc.)
  4. Generate team-level insights (review balance, blockers)
  5. Render report

Output: Markdown team standup with per-member sections + team insights
```

#### `weekly_summary` — Week-in-review

```
Input:  none (optional: week offset, e.g. -1 for last week)

Process:
  1. Read ~/.prodbeam/team.json
  2. Fetch 7-day activity for all members
  3. Load last week's snapshot from ~/.prodbeam/history.db
  4. Compute week-over-week deltas
  5. Generate insights (velocity trend, PR throughput change)
  6. Save this week's snapshot to ~/.prodbeam/history.db
  7. Render report

Output: Markdown weekly summary with metrics tables + trend comparison
```

#### `sprint_retro` — Sprint retrospective

```
Input:  none (optional: sprint name for specific sprint)

Process:
  1. Read ~/.prodbeam/team.json
  2. Query Jira for current/specified sprint dates
  3. Fetch GitHub activity for sprint period, all members
  4. Fetch Jira issues in sprint
  5. Load previous sprint's snapshot from ~/.prodbeam/history.db
  6. Compute sprint metrics + sprint-over-sprint trends
  7. Generate insights (completion forecast, carryover analysis, merge time trends)
  8. Save sprint snapshot to ~/.prodbeam/history.db
  9. Render report

Output: Full team retrospective with metrics, trends, insights, and recommendations
```

#### `get_capabilities` — (kept from v1, updated)

```
Input:  none
Output: Available tools and current team config status
```

### 5.3 Tool Summary

| Tool | Input Required | Fetches Data | Uses History |
|------|---------------|-------------|-------------|
| `setup_team` | team name + emails | Yes (discovery) | No |
| `add_member` | email | Yes (discovery) | No |
| `remove_member` | name or email | No | No |
| `refresh_config` | none | Yes (re-scan) | No |
| `standup` | none | Yes | Yes (compare) |
| `team_standup` | none | Yes | Yes (compare) |
| `weekly_summary` | none | Yes | Yes (trends) |
| `sprint_retro` | none | Yes | Yes (trends) |
| `get_capabilities` | none | No | No |

### 5.4 CLI Entry Point (Same Package)

The package exposes two binaries:

```json
// package.json
{
  "bin": {
    "prodbeam": "./dist/cli.js",
    "prodbeam-mcp": "./dist/index.js"
  }
}
```

**CLI usage** (standalone, no MCP host needed):
```bash
prodbeam setup --team "Platform Eng" --emails giri@prodbeam.com,alex@prodbeam.com
prodbeam standup
prodbeam team-standup
prodbeam weekly
prodbeam retro
prodbeam retro --sprint "Sprint 11"
prodbeam add-member jane@prodbeam.com
prodbeam refresh
```

**MCP usage** (via Claude Code, Cursor, etc.):
```
"set up prodbeam for my team: giri@prodbeam.com, alex@prodbeam.com"
"standup"
"team standup"
"sprint retro"
```

Both entry points use the same core modules — `cli.ts` parses args and calls the same functions that MCP tool handlers call.

---

## 6. API Client Design

### 6.1 GitHub Client

```typescript
// src/clients/github-client.ts

class GitHubClient {
  constructor(private token: string) {}

  // Discovery
  async searchUserByEmail(email: string): Promise<string | null>
  async getUserOrgs(username: string): Promise<string[]>
  async getRecentRepos(username: string, sinceDays: number): Promise<string[]>

  // Data fetching
  async getCommits(owner: string, repo: string, params: {
    since: string;
    until: string;
    author?: string;
  }): Promise<GitHubCommit[]>

  async getPullRequests(owner: string, repo: string, params: {
    state: 'open' | 'closed' | 'all';
    since?: string;
  }): Promise<GitHubPullRequest[]>

  async getReviews(owner: string, repo: string, prNumber: number): Promise<GitHubReview[]>
}
```

**Rate limiting:** GitHub REST API allows 5,000 requests/hour with a PAT. A team standup for 5 people across 5 repos uses ~30 requests. Well within limits.

### 6.2 Jira Client

```typescript
// src/clients/jira-client.ts

class JiraClient {
  constructor(private host: string, private email: string, private apiToken: string) {}

  // Discovery
  async searchUserByEmail(email: string): Promise<JiraUser | null>
  async getProjects(): Promise<JiraProject[]>
  async getBoards(projectKey: string): Promise<JiraBoard[]>
  async getSprints(boardId: number, state?: 'active' | 'closed'): Promise<JiraSprint[]>

  // Data fetching
  async searchIssues(jql: string, fields: string[]): Promise<JiraIssue[]>
}
```

### 6.3 Error Handling

```typescript
// All API calls wrapped with consistent error handling
class ApiError extends Error {
  constructor(
    message: string,
    public service: 'github' | 'jira',
    public statusCode: number,
    public retryable: boolean
  ) {
    super(message);
  }
}

// Graceful degradation: if Jira is down, still generate GitHub-only report
// with a note: "⚠️ Jira data unavailable — showing GitHub activity only"
```

---

## 7. History Store Design

### 7.1 SQLite Schema

```sql
-- ~/.prodbeam/history.db

CREATE TABLE snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name     TEXT NOT NULL,
  snapshot_type TEXT NOT NULL,  -- 'daily' | 'weekly' | 'sprint'
  period_start  TEXT NOT NULL,  -- ISO date
  period_end    TEXT NOT NULL,  -- ISO date
  sprint_name   TEXT,           -- for sprint snapshots
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),

  -- Aggregate metrics (numbers only, no content)
  total_commits     INTEGER NOT NULL DEFAULT 0,
  total_prs         INTEGER NOT NULL DEFAULT 0,
  prs_merged        INTEGER NOT NULL DEFAULT 0,
  prs_open          INTEGER NOT NULL DEFAULT 0,
  total_additions   INTEGER NOT NULL DEFAULT 0,
  total_deletions   INTEGER NOT NULL DEFAULT 0,
  total_reviews     INTEGER NOT NULL DEFAULT 0,
  avg_merge_time_h  REAL,

  -- Jira metrics
  jira_total        INTEGER DEFAULT 0,
  jira_completed    INTEGER DEFAULT 0,
  jira_completion_pct REAL DEFAULT 0
);

CREATE TABLE member_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id   INTEGER NOT NULL REFERENCES snapshots(id),
  member_github TEXT NOT NULL,

  commits       INTEGER NOT NULL DEFAULT 0,
  prs           INTEGER NOT NULL DEFAULT 0,
  prs_merged    INTEGER NOT NULL DEFAULT 0,
  reviews_given INTEGER NOT NULL DEFAULT 0,
  additions     INTEGER NOT NULL DEFAULT 0,
  deletions     INTEGER NOT NULL DEFAULT 0,
  jira_completed INTEGER DEFAULT 0
);

CREATE INDEX idx_snapshots_type_period ON snapshots(snapshot_type, period_end);
CREATE INDEX idx_member_snapshots ON member_snapshots(snapshot_id);
```

### 7.2 What's Stored vs What's NOT

| Stored (aggregated numbers) | NOT Stored (sensitive content) |
|-----------------------------|-------------------------------|
| Commit count per member | Commit messages |
| PR count, merge time | PR titles, descriptions |
| Lines added/deleted | Code diffs |
| Review count | Review comments |
| Jira issue count by status | Issue summaries, descriptions |
| Completion percentage | Assignee names |

### 7.3 History Operations

```typescript
// src/history/history-store.ts

class HistoryStore {
  constructor(dbPath?: string) // defaults to ~/.prodbeam/history.db

  // Write
  saveSnapshot(snapshot: Snapshot): void
  saveMemberSnapshots(snapshotId: number, members: MemberSnapshot[]): void

  // Read
  getLatestSnapshot(type: string): Snapshot | null
  getPreviousSnapshot(type: string, beforeDate: string): Snapshot | null
  getSprintHistory(limit: number): Snapshot[]
  getWeeklyHistory(limit: number): Snapshot[]
  getMemberTrend(github: string, weeks: number): MemberSnapshot[]
}
```

---

## 8. Insights Engine Design

### 8.1 Trend Analyzer

```typescript
// src/insights/trend-analyzer.ts

interface TrendInsight {
  metric: string;
  current: number;
  previous: number;
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
  severity: 'info' | 'warning' | 'alert';
  message: string;
}

function analyzeTrends(current: Snapshot, previous: Snapshot | null): TrendInsight[]

// Example outputs:
// { metric: "merge_time", current: 2.1, previous: 1.1, changePercent: 91,
//   direction: "up", severity: "warning",
//   message: "Avg PR merge time nearly doubled (1.1h → 2.1h)" }
//
// { metric: "completion_rate", current: 65, previous: 80, changePercent: -19,
//   direction: "down", severity: "alert",
//   message: "Sprint completion dropped to 65% (was 80% last sprint)" }
```

### 8.2 Anomaly Detector

```typescript
// src/insights/anomaly-detector.ts

interface Anomaly {
  type: 'stale_pr' | 'stale_issue' | 'review_imbalance' | 'no_activity' | 'high_churn';
  severity: 'info' | 'warning' | 'alert';
  message: string;
  details: Record<string, unknown>;
}

function detectAnomalies(params: {
  teamConfig: TeamConfig;
  pullRequests: GitHubPullRequest[];
  jiraIssues: JiraIssue[];
  memberActivity: Map<string, MemberActivity>;
}): Anomaly[]

// Example outputs:
// { type: "stale_pr", severity: "warning",
//   message: "PR #15 open for 8 days without review" }
//
// { type: "stale_issue", severity: "alert",
//   message: "PA-94 (Highest priority) hasn't moved in 12 days" }
//
// { type: "review_imbalance", severity: "warning",
//   message: "Alex handled 67% of reviews this week (6 of 9)" }
```

### 8.3 Team Health

```typescript
// src/insights/team-health.ts

interface TeamHealthReport {
  overallScore: number;  // 0-100
  dimensions: {
    velocity: { score: number; trend: 'up' | 'down' | 'stable' };
    throughput: { score: number; trend: 'up' | 'down' | 'stable' };
    reviewCoverage: { score: number; balanced: boolean };
    issueFlow: { score: number; carryoverRate: number };
  };
  recommendations: string[];
}

function assessTeamHealth(params: {
  currentMetrics: Snapshot;
  historicalMetrics: Snapshot[];
  memberSnapshots: MemberSnapshot[];
}): TeamHealthReport
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Prodbeam fetches its own data, team config works

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 1.1 | Add dependencies: `better-sqlite3`, `node-fetch` (or native fetch) | `package.json` | — |
| 1.2 | Create `config/types.ts` — TeamConfig interface | `src/config/types.ts` | — |
| 1.3 | Create `config/team-config.ts` — read/write `.prodbeam/team.json` | `src/config/team-config.ts` | 1.2 |
| 1.4 | Create `config/credentials.ts` — resolve credentials (env → file → null) | `src/config/credentials.ts` | — |
| 1.5 | Create `clients/github-client.ts` — GitHub REST API wrapper | `src/clients/github-client.ts` | 1.4 |
| 1.6 | Create `clients/jira-client.ts` — Jira REST API wrapper | `src/clients/jira-client.ts` | 1.4 |
| 1.7 | Write tests for config and client modules | `src/**/*.test.ts` | 1.3-1.6 |

### Phase 2: Auto-Discovery + Setup (Week 2-3)
**Goal:** `setup_team` works end-to-end from just emails

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 2.1 | Create `discovery/github-discovery.ts` — email→username, find repos | `src/discovery/github-discovery.ts` | 1.5 |
| 2.2 | Create `discovery/jira-discovery.ts` — email→account, find projects/sprints | `src/discovery/jira-discovery.ts` | 1.6 |
| 2.3 | Register `setup_team` MCP tool in `index.ts` | `src/index.ts` | 2.1, 2.2, 1.3 |
| 2.4 | Register `add_member`, `remove_member`, `refresh_config` tools | `src/index.ts` | 2.1, 2.2 |
| 2.5 | Write integration tests for discovery (mock API responses) | `src/**/*.test.ts` | 2.1-2.4 |

### Phase 3: Self-Sufficient Reports (Week 3-4)
**Goal:** `standup` and `team_standup` work with zero input

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 3.1 | Create data orchestrator — coordinates fetching across repos/members | `src/orchestrator.ts` | 1.5, 1.6, 1.3 |
| 3.2 | Remove v1 tools — delete `generate_daily_standup`, `generate_weekly_summary`, `generate_sprint_retrospective` | `src/index.ts` | — |
| 3.3 | Implement `standup` tool — reads config, fetches data, generates report | `src/index.ts` | 3.1, 3.2 |
| 3.4 | Implement `team_standup` tool — per-member + aggregated | `src/index.ts` | 3.1 |
| 3.5 | Implement `weekly_summary` tool — self-sufficient | `src/index.ts` | 3.1 |
| 3.6 | Implement `sprint_retro` tool — auto-detect sprint from Jira | `src/index.ts` | 3.1, 2.2 |
| 3.7 | Create `cli.ts` — CLI entry point parsing args, calling same core functions | `src/cli.ts` | 3.3-3.6 |
| 3.8 | Write tests for orchestrator and tools | `src/**/*.test.ts` | 3.1-3.7 |

### Phase 4: History + Trends (Week 4-5)
**Goal:** Reports include trend comparison

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 4.1 | Create `history/history-store.ts` — SQLite wrapper with migrations | `src/history/` | 1.1 |
| 4.2 | Auto-save snapshots after each report generation | `src/orchestrator.ts` | 4.1, 3.1 |
| 4.3 | Create `insights/trend-analyzer.ts` — current vs previous comparison | `src/insights/trend-analyzer.ts` | 4.1 |
| 4.4 | Inject trend data into report renderer | `src/generators/report-generator.ts` | 4.3 |
| 4.5 | Write tests for history store and trend analysis | `src/**/*.test.ts` | 4.1-4.4 |

### Phase 5: Intelligence (Week 5-6)
**Goal:** Reports surface actionable insights

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 5.1 | Create `insights/anomaly-detector.ts` — stale PRs, stale issues, imbalances | `src/insights/anomaly-detector.ts` | 3.1 |
| 5.2 | Create `insights/team-health.ts` — health score + recommendations | `src/insights/team-health.ts` | 4.1, 5.1 |
| 5.3 | Add "Insights" and "Team Health" sections to report renderer | `src/generators/report-generator.ts` | 5.1, 5.2 |
| 5.4 | Write tests for insight modules | `src/**/*.test.ts` | 5.1-5.3 |

### Phase 6: Polish + v2 Release (Week 6-7)
**Goal:** Production-ready v2.0.0

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 6.1 | Update `get_capabilities` to reflect new tools and config status | `src/index.ts` | all |
| 6.2 | Graceful degradation — GitHub down? Jira down? No config? Handle all | all | all |
| 6.3 | Update README.md with new usage | `README.md` | all |
| 6.4 | Full test suite run, coverage check (target 80%+) | `src/**/*.test.ts` | all |
| 6.5 | Bump to v2.0.0, build, publish | `package.json` | 6.1-6.4 |

---

## 10. New Dependencies

| Package | Purpose | Size | Justification |
|---------|---------|------|---------------|
| `better-sqlite3` | Local history storage | ~2MB | Synchronous, zero-config, no server process, perfect for MCP |
| `@types/better-sqlite3` | TypeScript types | dev only | Type safety |

**No other new dependencies needed.** Node 18+ has native `fetch`, so no HTTP client library required. The existing `zod` handles validation.

---

## 11. v1 Cleanup (No Backward Compatibility)

v1 tools are **removed entirely**. The following are deleted from `index.ts`:

| Removed Tool | Replaced By |
|-------------|-------------|
| `generate_daily_standup` | `standup` |
| `generate_weekly_summary` | `weekly_summary` |
| `generate_sprint_retrospective` | `sprint_retro` |

The old tools required pre-fetched data from Claude. The new tools fetch their own data. Clean break, no shims.

**Migration for existing users:** Update MCP host permissions to allow the new tool names. No data migration needed (v1 stored nothing).

---

## 12. Security Considerations

| Concern | Mitigation |
|---------|------------|
| API tokens in credentials.json | File permissions set to 600 (owner-only read/write) on `~/.prodbeam/credentials.json` |
| Tokens in environment variables | Preferred over file storage, documented as recommended |
| `~/.prodbeam/` directory permissions | Directory created with 700 permissions during `setup_team` |
| Nothing in project directory to accidentally commit | All config in `~/.prodbeam/` (user home), not in project repo |
| SQLite history contains work patterns | Numbers only, no content. File is local, never synced |
| GitHub API token scope | Document minimum required scope: `repo:read`, `user:email` |
| Jira API token scope | Standard API token, read-only operations only |

---

## 13. Testing Strategy

| Layer | Tool | Coverage Target |
|-------|------|-----------------|
| Config read/write | Vitest unit | 90% |
| API clients | Vitest + msw (mock service worker) | 80% |
| Discovery | Vitest + msw | 80% |
| History store | Vitest (in-memory SQLite) | 90% |
| Insight engines | Vitest unit (pure functions) | 90% |
| Report generators | Vitest unit (existing, extend) | 80% |
| MCP tool handlers | Vitest integration | 70% |
| End-to-end | Manual + scripted against real APIs | Key flows |

---

## 14. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GitHub email search doesn't find user (private email) | Medium | Medium | Fallback: prompt for GitHub username directly |
| Jira API differences across versions (Cloud vs Server) | Low | High | Target Cloud only for v2, Server in v3 |
| SQLite not available on all platforms | Very Low | High | `better-sqlite3` has prebuilt binaries for all major OS/arch |
| Rate limiting on GitHub API | Low | Medium | Cache responses for 5 min, batch requests, respect rate limit headers |
| MCP host doesn't support long-running tool calls | Medium | Medium | Fetch timeout at 30s, paginate large result sets |

---

## 15. Success Criteria

| Metric | Target |
|--------|--------|
| `setup_team` from 3 emails to complete config | < 15 seconds |
| `standup` from invocation to report | < 5 seconds |
| `team_standup` for 5 members, 5 repos | < 15 seconds |
| `sprint_retro` with history comparison | < 20 seconds |
| Test coverage | > 80% |
| Zero data sent to external servers (except GitHub/Jira APIs) | 100% verified |

---

## 16. Decisions Log

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Backward compatibility with v1 tools? | **No** — clean break, remove v1 tool names | v1 had no users at scale; clean API is more important than migration |
| 2 | Where to store config? | **`~/.prodbeam/`** (user home) as default | Nothing in project dir = zero git leak risk; `PRODBEAM_HOME` env var for override |
| 3 | Credentials per-project or per-user? | **Per-user** (`~/.prodbeam/credentials.json`) | Tokens are tied to the person, not the codebase; one setup for all projects |
| 4 | Separate CLI package or same? | **Same package**, dual entry point | Shared core logic; `prodbeam` for CLI, `prodbeam-mcp` for stdio MCP server |
