# Prodbeam MCP Server

[![npm version](https://img.shields.io/npm/v/@prodbeam/mcp)](https://www.npmjs.com/package/@prodbeam/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org)

Engineering intelligence reports from GitHub and Jira, delivered through any MCP client or the standalone CLI.

- **Daily standups** from your commits, PRs, reviews, and Jira issues
- **Weekly summaries** with team metrics, repo breakdowns, and trend analysis
- **Sprint retrospectives** with merge time analysis and completion rates
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

### Option 1: npx (zero install)

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

### Option 2: Global install with setup wizard

```bash
npm install -g @prodbeam/mcp
prodbeam init
```

The wizard detects credentials, validates them, discovers your repos and projects, and registers the MCP server automatically.

### Option 3: MCP client config file

For Cursor, Windsurf, or other MCP clients that use a JSON config:

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

For more setup options, see the [Setup & Usage Guide](docs/guide.md).

---

## Prerequisites

| Requirement | How to get it |
|-------------|---------------|
| Node.js 18+ | [nodejs.org](https://nodejs.org) |
| GitHub PAT | [Create token](https://github.com/settings/tokens) — scopes: `repo`, `read:user`, `read:org` |
| Jira API Token | [Create token](https://id.atlassian.com/manage-profile/security/api-tokens) |

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

### CLI

```bash
prodbeam status                           # Check config and credentials
prodbeam standup                          # Personal standup (last 24h)
prodbeam standup --email alice@co.com     # Standup for a specific member
prodbeam team-standup                     # Full team standup
prodbeam weekly                           # Weekly summary
prodbeam weekly --weeks-ago 1             # Last week's summary
prodbeam sprint-retro                     # Sprint retro (auto-detect sprint)
prodbeam sprint-retro --sprint "Sprint 12"  # Specific sprint
```

---

## Sample Output

<details>
<summary>Daily Standup</summary>

```markdown
# Daily Standup - Friday, February 7, 2026

**alice**

## Completed

- #142: Fix webhook retry logic [merged] (+187/-43)
- [ENG-431](https://company.atlassian.net/browse/ENG-431): Webhook retry failures [Done]

## In Progress

- #89: Update shared ESLint config [open] (+45/-22)
- [ENG-445](https://company.atlassian.net/browse/ENG-445): Upgrade ESLint to v9 [In Progress]

## Activity Summary

| Metric | Count |
|--------|-------|
| Commits | 3 |
| Pull Requests | 2 |
| Reviews | 1 |
| Jira Issues | 2 |

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

| Type | Count |
|------|-------|
| Story | 3 |
| Bug | 2 |
| Task | 1 |

## Trends vs Previous Period

| Metric | Change | Direction | Severity |
|--------|--------|-----------|----------|
| Commits | +25% | Up | [i] info |
| PRs Merged | -15% | Down | [!] warning |

- [i] Commit volume up 25% — consistent with sprint mid-point
- [!] PR merge rate declined 15% — may indicate review bottleneck

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

## Sprint Scorecard

| Metric | Value |
|--------|-------|
| Completion Rate | 8/11 (73%) |
| Carryover | 3 issues |
| Merge Rate | 78% |
| Avg Merge Time | 14.2 hours |

## Delivery Metrics

| Metric | Value |
|--------|-------|
| Commits | 24 |
| Pull Requests | 9 (7 merged, 1 open, 1 closed) |
| Code Changes | +2,145/-876 |
| Reviews | 15 (12 approved, 3 changes requested) |

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
| `weekly_summary` | weeksAgo (optional) | Weekly engineering summary with metrics |
| `sprint_retro` | sprintName (optional) | Sprint retrospective with completion rates |

For full parameter documentation and sample output for every tool, see the [Tool Reference](docs/tool-reference.md).

---

## Architecture

Prodbeam is **self-sufficient** — it fetches data directly from GitHub and Jira APIs. No separate MCP servers or API keys needed.

```
MCP Client (Claude Code, Cursor, Windsurf, etc.)
  └── Prodbeam MCP Server (stdio)
        ├── GitHub REST API (your token)
        ├── Jira REST API (your token)
        └── ~/.prodbeam/history.db (local SQLite)
```

**One tool call = one complete report.** No multi-step orchestration.

### Config directory

All data lives in `~/.prodbeam/`:

| File | Purpose |
|------|---------|
| `team.json` | Team members, repos, Jira projects |
| `credentials.json` | API tokens (600 permissions) |
| `history.db` | SQLite metrics for trend comparison |

Override location with `PRODBEAM_HOME` env var.

---

## Security

- All data stays on your machine — no telemetry, no Prodbeam cloud
- Credentials resolve from environment variables (preferred) or a local file with `600` permissions
- History database stores only aggregate numbers — never commit messages, PR descriptions, or code
- GitHub and Jira operations are read-only — nothing is created, modified, or deleted
- Network access limited to `api.github.com` and your Jira instance

For details on token scopes, credential storage, and CI security checks, see [SECURITY.md](SECURITY.md).

---

## Known Limitations

- **Code changes may show `+0/-0`** — line count metrics depend on GitHub API diff stats availability
- **Weekly report title shows "Last 7 Days"** for historical queries — the data is correct; the title doesn't reflect the `weeksAgo` offset
- **Stale PR alerts are current-state** — historical reports show today's stale PRs, not the state during that historical week
- **Standup email must match team.json exactly** — use `prodbeam init` or edit `team.json` to correct mismatches
- **Sprint retro requires Jira sprints** — teams not using Jira sprints will have limited retrospective data

---

## Documentation

| Document | Description |
|----------|-------------|
| [Setup & Usage Guide](docs/guide.md) | Detailed setup paths, credentials, team management, troubleshooting |
| [Tool Reference](docs/tool-reference.md) | Per-tool parameters, examples, and sample output |
| [Security](SECURITY.md) | Data handling, credentials, network access |
| [Contributing](CONTRIBUTING.md) | Development setup, code style, PR process |
| [Changelog](CHANGELOG.md) | Version history |

---

## Contributing

Bug reports and feature requests welcome via [GitHub Issues](https://github.com/prodbeam/prodbeam-mcp/issues).

Pull requests accepted — see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

## License

MIT — See [LICENSE](LICENSE).
