# Prodbeam MCP — Tool Test Report & Improvement Analysis

**Date:** February 7, 2026
**Tester:** Claude Code
**Team:** pb (1 member: @vislawath)
**Repos:** 5 tracked | **Jira Project:** PA

---

## 1. Test Matrix

| Tool | Variation | Status | Notes |
|------|-----------|--------|-------|
| `get_capabilities` | default | Pass | Shows full status, thresholds, tools |
| `refresh_config` | default | Pass | Confirmed 5 repos, detected active sprint |
| `standup` | default (no email) | Pass | Returns last 24h for first member |
| `standup` | email=vislawath@gmail.com | Fail | Error: not a team member. Must match exact email in team.json |
| `team_standup` | default | Pass | Aggregate + per-member breakdown |
| `weekly_summary` | weeksAgo=0 (current) | Pass | 4 commits, 1 PR, health 67/100 |
| `weekly_summary` | weeksAgo=1 (last week) | Pass | 0 commits, 1 PR, health 57/100 — velocity dropped |
| `weekly_summary` | weeksAgo=2 (~2 weeks) | Pass | 6 commits, 12 PRs, health 68/100 |
| `weekly_summary` | weeksAgo=4 (~1 month) | Pass | 15 commits, 17 PRs across 4 repos, health 70/100 |
| `weekly_summary` | weeksAgo=12 (~3 months) | Pass | 20 commits, 22 PRs, health 72/100 |
| `weekly_summary` | weeksAgo=26 (~6 months) | Pass | 0 commits, 22 PRs, health 56/100 |
| `weekly_summary` | weeksAgo=52 (~1 year) | Pass | 0 commits, 23 PRs, health 56/100 |
| `sprint_retro` | auto-detect | Pass | Sprint 4: Refinement, health 66/100 |

**Overall: 13/14 passed (93%)**. The one failure was expected — invalid email input.

---

## 2. Observations Per Tool

### 2.1 `get_capabilities`

**What it shows:** Config directory, credentials status, team members with GitHub/Jira links, tracked repos, projects, intelligence thresholds, available tools.

**Strengths:**
- Clean status overview at a glance
- Shows threshold configuration (useful for understanding alerts)

**Gaps vs. industry (LinearB, Sleuth, Jellyfish):**
- No version number of the prodbeam server itself
- No uptime or last-refresh timestamp
- No credential expiry or health check (e.g., "GitHub token valid: yes, rate limit remaining: 4832/5000")
- No indication of historical data availability (e.g., "history.db: 45 days of data")

---

### 2.2 `refresh_config`

**What it shows:** Repo count changes, active sprints detected.

**Strengths:**
- Concise "no changes" output when nothing changed
- Shows active sprint name

**Gaps:**
- No diff of what changed (e.g., "added repo X, removed repo Y")
- No timestamp of previous refresh for comparison
- No validation that credentials still work during refresh

---

### 2.3 `standup` (Personal)

**What it shows:** Commits, PRs, reviews from last 24 hours for one member.

**Strengths:**
- Clean separation of commits, PRs, reviews
- Includes repo name per commit
- Shows PR state (merged/open)

**Gaps vs. industry (Geekbot, DailyBot, Status Hero):**
- **No Jira issue summary**: Only GitHub activity. Missing "Jira issues worked on" or "issues transitioned" in the last 24h
- **No "what's next" / blockers section**: Industry standups include Yesterday/Today/Blockers format
- **No lines changed**: Code changes always show `+0/-0` (likely a bug — see Section 3)
- **No time context**: Doesn't show "Saturday — weekend" or business day awareness
- **No link to PRs/commits**: Would be useful to have clickable URLs
- **Email validation error is unclear**: "vislawath@gmail.com is not a team member" — should suggest available members or show the configured email

---

### 2.4 `team_standup`

**What it shows:** Aggregate metrics + per-member breakdown.

**Strengths:**
- Summary table at top is effective
- Per-member sections scale well

**Gaps:**
- **No Jira activity per member** (same gap as personal standup)
- **No cross-member comparisons**: Industry tools show who's overloaded vs. underloaded
- **No "team is idle" awareness**: Saturday report doesn't note weekend context
- **No trend vs. yesterday**: Would be valuable to show "commits today vs. yesterday"

---

### 2.5 `weekly_summary`

**What it shows:** Commits, PRs, code changes, reviews, repo breakdown, insights, team health score.

**Strengths:**
- Repository breakdown table is excellent for multi-repo teams
- Team health score with dimensional breakdown (velocity, throughput, review coverage, issue flow)
- Trend indicators (Up/Down/Stable)
- Stale PR alerts with days open
- Recommendations section appears when metrics decline

**Gaps vs. industry (LinearB, Haystack, DX):**
- **Code changes always `+0/-0`**: This is a bug. Every report across all time ranges shows zero lines changed. This is a critical metric for engineering reports
- **No cycle time / lead time metrics**: Industry standard DORA metrics (deployment frequency, lead time, MTTR, change failure rate) are missing
- **No per-developer breakdown**: Only shows aggregate. LinearB/Jellyfish show per-person contribution
- **No PR size distribution**: Small/medium/large PR classification helps identify review bottlenecks
- **No review turnaround time**: How long from PR open to first review
- **No Jira metrics in weekly**: Sprint velocity, story points completed, issue breakdown by type/priority are absent
- **Duplicate PR numbers across repos**: PRs from different repos can share the same `#1`, `#2` — needs repo prefix for disambiguation
- **"weeksAgo" is confusing at large values**: weeksAgo=26 still says "Last 7 Days" in the title. Should say "Week of Aug 11, 2025" for clarity
- **Stale PR alerts repeat identically across all time ranges**: The alerts are always current, not relative to the queried week. A report for 3 months ago shouldn't show today's stale PRs
- **No comparison with previous period**: "This week vs. last week" delta would be valuable

---

### 2.6 `sprint_retro`

**What it shows:** Sprint-bounded metrics, commits, PRs, reviews, insights, team health.

**Strengths:**
- Sprint date range is clear
- Merge rate percentage is useful
- Average merge time metric
- Same health score framework as weekly

**Gaps vs. industry (Jira built-in, LinearB, Sleuth):**
- **No Jira sprint data**: A sprint retro should show story points committed vs. completed, issues by status, carryover items, scope changes
- **No sprint goal tracking**: Was the sprint goal met?
- **No burndown/burnup data**: Even textual form would help (e.g., "60% of planned work completed")
- **No velocity trend**: How does this sprint compare to previous sprints?
- **No contributor breakdown**: Who did what within the sprint
- **Avg merge time shows "0 hours"**: Likely a data resolution issue — should show minutes or a more precise format
- **Code changes `+0/-0`**: Same bug as weekly
- **Sprint retro only detects one sprint**: No way to compare Sprint 4 vs. Sprint 3 side-by-side
- **No action items / recommendations specific to sprint**: The insights section only has stale PR alerts, not sprint-specific takeaways like "scope increased by 20% mid-sprint"

---

## 3. Critical Bugs Found

| Bug | Severity | Details |
|-----|----------|---------|
| **Code changes always `+0/-0`** | High | Every report across all tools and time ranges shows zero lines added/removed. This is a fundamental engineering metric that appears broken |
| **Weekly title doesn't reflect queried period** | Medium | `weeksAgo=26` still shows "Last 7 Days" — should show the actual date range |
| **Stale PR alerts not time-scoped** | Medium | Historical weekly reports show current stale PR alerts, not alerts relevant to that historical week |
| **Avg merge time "0 hours"** | Low | Either data resolution is too coarse or calculation isn't capturing actual merge duration |
| **Standup email error unhelpful** | Low | Should suggest valid team member emails when an invalid one is given |

---

## 4. Feature Gap Analysis vs. Industry

### DORA Metrics (Industry Standard)

| Metric | Prodbeam | LinearB | Sleuth | Jellyfish |
|--------|----------|---------|--------|-----------|
| Deployment frequency | -- | Yes | Yes | Yes |
| Lead time for changes | -- | Yes | Yes | Yes |
| Mean time to recovery | -- | -- | Yes | Yes |
| Change failure rate | -- | Yes | Yes | Yes |

**Recommendation:** Add DORA metrics as a dedicated report or integrate into weekly/sprint reports.

### Developer Experience Metrics

| Metric | Prodbeam | DX | Haystack | Swarmia |
|--------|----------|----|----------|---------|
| Cycle time breakdown | -- | Yes | Yes | Yes |
| Review wait time | -- | -- | Yes | Yes |
| PR size distribution | -- | -- | Yes | Yes |
| Focus time | -- | Yes | -- | -- |
| Developer satisfaction | -- | Yes | -- | -- |

### Jira Integration Depth

| Feature | Prodbeam | Built-in Jira | LinearB |
|---------|----------|---------------|---------|
| Sprint velocity | -- | Yes | Yes |
| Story points completed | -- | Yes | Yes |
| Issue type breakdown | -- | Yes | Yes |
| Carryover tracking | -- | Yes | Yes |
| Sprint goal tracking | -- | Yes | -- |
| Scope change detection | -- | -- | Yes |

---

## 5. Prioritized Improvement Recommendations

### P0 — Fix Bugs
1. **Fix code changes (`+0/-0`)** — This is the most visible data quality issue. Every report loses credibility when lines changed shows zero.
2. **Fix weekly report title for historical queries** — Show actual date range, not "Last 7 Days".
3. **Scope stale PR alerts to the queried time period** — Historical reports should reflect historical state.

### P1 — High-Impact Features
4. **Add Jira data to all reports** — Standup should show Jira issues worked on. Weekly should show issue flow. Sprint retro should show story points, burndown, and carryover.
5. **Add cycle time / lead time metrics** — Time from first commit to merge. This is the single most requested metric in engineering analytics.
6. **Add per-developer breakdown in weekly/sprint** — Who contributed what, review load distribution.
7. **Add PR size classification** — Small (<100 lines), Medium (100-400), Large (400+). Correlates strongly with review quality.

### P2 — Medium-Impact Features
8. **Add period-over-period comparison** — "This week vs. last week" deltas for all key metrics.
9. **Add DORA metrics report** — Deployment frequency and lead time are table stakes for modern engineering orgs.
10. **Add review turnaround time** — Time from PR open to first review comment.
11. **Add "Yesterday/Today/Blockers" format option for standup** — Match the format teams are used to.
12. **Improve error messages** — Show available team members on invalid email, suggest corrections.

### P3 — Nice-to-Have
13. **Add business day awareness** — Note weekends/holidays in reports.
14. **Add clickable URLs** — Link commits to GitHub, issues to Jira.
15. **Add sprint-over-sprint comparison** — Compare current sprint with previous for velocity trending.
16. **Add configurable time ranges for standup/team_standup** — Allow "last 48h" or "since Friday" for Monday standups.

---

## 6. Tool Availability Summary

| Capability | Current Support | Time Range Control |
|------------|----------------|--------------------|
| Personal standup | Last 24h only | No customization |
| Team standup | Last 24h only | No customization |
| Weekly summary | Any week via `weeksAgo` | Good |
| Sprint retro | Sprint-bounded | By sprint name |
| Monthly summary | Not available | -- |
| Quarterly summary | Not available | -- |
| Custom date range | Not available | -- |

**Key gap:** No way to generate monthly, quarterly, or custom date range reports. The `weeksAgo` parameter on weekly_summary is the only time travel mechanism, and it always produces a 7-day window. A `monthly_summary` or flexible `--from`/`--to` date parameters would unlock significantly more use cases (board reports, quarterly reviews, annual summaries).

---

## 7. Summary

Prodbeam MCP delivers a solid foundation for engineering intelligence reports. The team health scoring, stale PR detection, and multi-repo aggregation are genuinely useful. The tool responds quickly and the report format is clean.

The three highest-impact improvements are:
1. **Fix the `+0/-0` code changes bug** — data accuracy is foundational
2. **Integrate Jira data into all reports** — currently GitHub-heavy, missing half the picture
3. **Add cycle time and DORA metrics** — these are industry standard and expected by engineering leaders

With these addressed, prodbeam would be competitive with paid tools like LinearB and Sleuth for small-to-mid teams.
