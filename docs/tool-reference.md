# Tool Reference

Complete reference for all Prodbeam MCP tools. Each tool can be invoked via an MCP client (Claude Code, Cursor, Windsurf) or the standalone CLI.

---

## Setup Tools

### `setup_team`

One-time team onboarding. Provide your team name and member emails — Prodbeam auto-discovers GitHub usernames, Jira accounts, active repos, projects, and sprints.

**Parameters:**

| Name | Required | Type | Description |
|------|----------|------|-------------|
| `teamName` | Yes | string | Team name (e.g., "Platform Engineering") |
| `emails` | Yes | string[] | Email addresses of team members |

**MCP prompt:**
```
Set up my prodbeam team called "Platform Engineering" with emails:
alice@company.com, bob@company.com, carol@company.com
```

**CLI equivalent:**
```bash
prodbeam init
```

The CLI wizard walks through credential detection, validation, team setup, and MCP server registration interactively.

---

### `add_member`

Add a new member to the team. Prodbeam auto-discovers their GitHub and Jira identities.

**Parameters:**

| Name | Required | Type | Description |
|------|----------|------|-------------|
| `email` | Yes | string | Email address of the new team member |

**MCP prompt:**
```
Add dave@company.com to my prodbeam team
```

---

### `remove_member`

Remove a member from the team by email address.

**Parameters:**

| Name | Required | Type | Description |
|------|----------|------|-------------|
| `email` | Yes | string | Email address of the member to remove |

**MCP prompt:**
```
Remove dave@company.com from my prodbeam team
```

---

### `refresh_config`

Re-scan repos and sprints for existing team members. Use this when new repos have been created or sprint names have changed.

**Parameters:** None

**MCP prompt:**
```
Refresh my prodbeam config
```

---

### `get_capabilities`

Show current team config, credential status, tracked repos, and available tools.

**Parameters:** None

**MCP prompt:**
```
Show my prodbeam status
```

---

## Report Tools

### `standup`

Personal daily standup. Fetches GitHub commits, PRs, reviews, and Jira issues from the last 24 hours.

**Parameters:**

| Name | Required | Type | Description |
|------|----------|------|-------------|
| `email` | No | string | Email of a specific team member. Defaults to first member in config |

**MCP prompt:**
```
Generate my standup using prodbeam
```

For a specific team member:
```
Generate a prodbeam standup for alice@company.com
```

**CLI equivalent:**
```bash
prodbeam standup
prodbeam standup --email alice@company.com
```

<details>
<summary>Sample output</summary>

```markdown
# Daily Standup - Friday, February 7, 2026

**alice**

## Completed

- #142: Fix webhook retry logic [merged] (+187/-43)
- [ENG-431](https://company.atlassian.net/browse/ENG-431): Webhook retry failures in production [Done]

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

---

### `team_standup`

Full team standup with per-member breakdown and aggregate stats.

**Parameters:** None

**MCP prompt:**
```
Generate a team standup using prodbeam
```

**CLI equivalent:**
```bash
prodbeam team-standup
```

<details>
<summary>Sample output</summary>

```markdown
# Team Standup: Platform Engineering - Friday, February 7, 2026

## Summary

| Metric | Count |
|--------|-------|
| Team Members | 3 |
| Total Commits | 7 |
| Total PRs | 4 |
| Total Reviews | 5 |
| Total Jira Issues | 6 |

## alice

**Completed**
- #142: Fix webhook retry logic [merged] (+187/-43)
- [ENG-431](https://company.atlassian.net/browse/ENG-431): Webhook retry failures in production [Done]

**In Progress**
- #89: Update shared ESLint config [open] (+45/-22)
- [ENG-445](https://company.atlassian.net/browse/ENG-445): Upgrade ESLint to v9 [In Progress]

**Commits:** 3
- `a1b2c3d` fix: resolve race condition in webhook handler (acme/api-gateway)
- `d4e5f6a` test: add integration tests for retry logic (acme/api-gateway)
- `b7c8d9e` chore: update eslint config (acme/shared-config)

**Reviews:** 1
- PR #137: Add rate limiting middleware [APPROVED]

## bob

**Completed**
- #137: Add rate limiting middleware [merged] (+312/-45)
- [ENG-428](https://company.atlassian.net/browse/ENG-428): Implement API rate limiting [Done]
- [ENG-442](https://company.atlassian.net/browse/ENG-442): API rate limit documentation [Done]

**In Progress**
- #143: Fix Redis pool exhaustion [open] (+94/-12)
- [ENG-440](https://company.atlassian.net/browse/ENG-440): Redis connection pool tuning [In Progress]

**Commits:** 4
- `e1f2a3b` feat: add rate limiting middleware (acme/api-gateway)
- `c4d5e6f` feat: add Redis-backed rate limiter (acme/api-gateway)
- `a7b8c9d` docs: add rate limiting section to API docs (acme/docs)
- `f1e2d3c` fix: correct Redis connection pool size (acme/api-gateway)

**Reviews:** 3
- PR #142: Fix webhook retry logic [APPROVED]
- PR #89: Update shared ESLint config [CHANGES_REQUESTED]
- PR #141: Migrate auth to OAuth2 [APPROVED]

## carol

_No activity in the last 24 hours_

---
```

</details>

---

### `weekly_summary`

Weekly engineering summary with metrics, repo breakdown, trends, and team health scoring.

**Parameters:**

| Name | Required | Type | Description |
|------|----------|------|-------------|
| `weeksAgo` | No | number | Offset in weeks. `0` = current week (default), `1` = last week, etc. |

**MCP prompt:**
```
Generate a weekly summary using prodbeam
```

For a previous week:
```
Generate a prodbeam weekly summary for last week
```

**CLI equivalent:**
```bash
prodbeam weekly
prodbeam weekly --weeks-ago 1
```

<details>
<summary>Sample output</summary>

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

- [ENG-431](https://company.atlassian.net/browse/ENG-431): Webhook retry failures [Done]
- [ENG-428](https://company.atlassian.net/browse/ENG-428): API rate limiting [Done]
- ...

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
- #89: Update shared ESLint config [open] (+45/-22)
- ...

### Reviews: 8
- PR #137: Add rate limiting middleware [APPROVED]
- PR #141: Migrate auth to OAuth2 [APPROVED]
- ...

---
```

</details>

---

### `sprint_retro`

Sprint retrospective with merge time analysis, completion rates, Jira metrics, and team health.

**Parameters:**

| Name | Required | Type | Description |
|------|----------|------|-------------|
| `sprintName` | No | string | Sprint name (e.g., "Sprint 12"). Auto-detects active sprint if omitted |

**MCP prompt:**
```
Generate a sprint retro using prodbeam
```

For a specific sprint:
```
Generate a prodbeam sprint retro for "Sprint 12"
```

**CLI equivalent:**
```bash
prodbeam sprint-retro
prodbeam sprint-retro --sprint "Sprint 12"
```

<details>
<summary>Sample output</summary>

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

- [ENG-431](https://company.atlassian.net/browse/ENG-431): Webhook retry failures [Done]
- [ENG-428](https://company.atlassian.net/browse/ENG-428): API rate limiting [Done]
- [ENG-435](https://company.atlassian.net/browse/ENG-435): Redis connection pooling [Done]
- [ENG-445](https://company.atlassian.net/browse/ENG-445): Upgrade ESLint to v9 [In Progress]
- ...

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
- #143: Fix Redis pool exhaustion [open] (+94/-12)
- ...

### Reviews: 15
- PR #137: Add rate limiting middleware [APPROVED]
- PR #141: Migrate auth to OAuth2 [APPROVED]
- ...

---
```

</details>
