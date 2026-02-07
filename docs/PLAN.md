# Prodbeam for Claude Code - Project Plan

**Version**: 2.0
**Date**: February 7, 2026
**Status**: Phase 0 (Foundation) - In Progress

---

## 1. Executive Summary

**Name**: Prodbeam for Claude Code
**Package**: `@prodbeam/claude-mcp`
**Type**: Claude Code MCP Server
**Purpose**: Generate AI-powered daily standups, weekly summaries, and sprint retrospectives from the terminal by orchestrating existing GitHub and Jira MCP servers.

### Value Proposition

```bash
# Daily standup in 10 seconds
$ claude /daily-report

# Weekly team summary
$ claude /weekly-report --team

# Sprint retrospective
$ claude /retro --sprint "Sprint 42"
```

### Key Differentiators

| Feature | Prodbeam for Claude Code | Spinach.io | Teamline |
|---------|--------------------------|------------|----------|
| Terminal-native | Yes | No (Web/Slack) | No (Web/Slack) |
| GitHub + Jira unified | Single command | Separate | Jira only |
| Reuses existing MCPs | No duplicate auth | N/A | N/A |
| Open source | MIT license | Proprietary | Proprietary |

### Target Market

- **Primary**: Engineering teams at startups/SMBs using Claude Code (5-50 devs)
- **Secondary**: Individual developers using Claude Code CLI
- **Focus**: Organizations already running agile scrum with GitHub + Jira + Claude Code

---

## 2. Problem Statement

1. **Context switching**: Developers leave their terminal to compile standups (5-10 min/day)
2. **Manual data gathering**: Reviewing commits, PRs, Jira tickets manually (15-30 min/report)
3. **No single source of truth**: Activity scattered across GitHub, Jira, Slack
4. **Generic AI responses**: ChatGPT/Claude.ai lack access to work context

---

## 3. Technical Architecture

### Architecture Overview

```
+-----------------------------------------------------------+
|                    CLAUDE CODE CLI                         |
|  (User runs: claude /daily-report)                        |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|           PRODBEAM MCP SERVER (Node.js/TypeScript)        |
|                                                           |
|  Env vars received from Claude Code MCP config:           |
|  - GITHUB_PERSONAL_ACCESS_TOKEN                           |
|  - JIRA_API_TOKEN, JIRA_EMAIL, JIRA_URL (optional)       |
|  - ANTHROPIC_API_KEY                                      |
|                                                           |
|  Tools:                                                   |
|  - generate_daily_report                                  |
|  - generate_weekly_report                                 |
|  - generate_retrospective                                 |
|  - setup_check                                            |
+-----------------------------+-----------------------------+
                              |
          +-------------------+-------------------+
          v                   v                   v
+-----------------+  +-----------------+  +-----------------+
| GITHUB MCP      |  | JIRA MCP        |  | ANTHROPIC API   |
| (subprocess)    |  | (subprocess)    |  | (direct HTTP)   |
|                 |  |                 |  |                 |
| Spawned with    |  | Spawned with    |  | AI report       |
| user's token    |  | user's token    |  | generation      |
+-----------------+  +-----------------+  +-----------------+
```

### How MCP Reuse Works

Prodbeam reuses the same authentication tokens the user already has for their GitHub and Jira MCP servers. The tokens are passed via environment variables in the Claude Code MCP configuration.

**Primary flow (MCP orchestration):**
1. Claude Code starts Prodbeam MCP server with env vars (tokens)
2. Prodbeam spawns GitHub/Jira MCP servers as subprocesses, passing tokens through
3. Prodbeam calls tools on those MCP servers via the MCP Client SDK
4. Results are aggregated, formatted, and returned

**Fallback flow (MCP not available):**
1. If GitHub/Jira MCP subprocess fails to start or tokens are missing
2. Prodbeam returns setup instructions guiding the user to configure tokens
3. Graceful degradation: partial reports with available data only

### GitHub MCP Server - Verified Tool Names

Based on the official [GitHub MCP Server](https://github.com/github/github-mcp-server), the available tools are:

**Commits and Code:**
- `list_commits` - List commits in a repository (supports `since`/`until` params)
- `get_commit` - Get details of a single commit
- `search_code` - Search code across repositories
- `get_file_contents` - Get contents of a file

**Pull Requests:**
- `list_pull_requests` - List PRs in a repository
- `search_pull_requests` - Search PRs across repositories
- `pull_request_read` - Read full PR details (includes reviews)
- `create_pull_request` - Create a new PR

**Issues:**
- `list_issues` - List issues in a repository
- `search_issues` - Search issues across repositories
- `issue_read` - Read full issue details

**Context:**
- `get_me` - Get the authenticated user's information
- `get_teams` - Get teams for the authenticated user

> **Note**: There is no dedicated `search_commits` or `search_reviews` tool.
> Commits are fetched via `list_commits` per repository.
> Reviews are accessed through `pull_request_read`.

### Jira MCP Server - Tool Names

Based on common Jira MCP implementations:
- `jira_search_issues` - Search issues via JQL
- `jira_get_issue` - Get issue details
- `jira_get_my_issues` - Get issues assigned to current user

### Component Breakdown

#### 1. MCP Server (`src/index.ts`)

Registers tools and dispatches to handlers:
- `generate_daily_report` - Fetch last 24h activity, generate standup
- `generate_weekly_report` - Fetch last 7 days, generate summary
- `generate_retrospective` - Fetch sprint data, generate retro
- `setup_check` - Validate MCP connections and provide setup guidance

#### 2. GitHub MCP Adapter (`src/adapters/github-mcp.ts`)

Manages lifecycle of GitHub MCP subprocess:
- Spawns `@github/github-mcp-server` (or `@modelcontextprotocol/server-github`) via StdioClientTransport
- Passes `GITHUB_PERSONAL_ACCESS_TOKEN` from environment
- Calls verified tool names: `list_commits`, `list_pull_requests`, `pull_request_read`, `search_issues`, `get_me`
- Parses MCP responses into typed interfaces
- Handles connection errors with fallback instructions

#### 3. Jira MCP Adapter (`src/adapters/jira-mcp.ts`) [Planned]

Same pattern as GitHub adapter:
- Spawns Jira MCP server subprocess
- Passes `JIRA_API_TOKEN`, `JIRA_EMAIL`, `JIRA_URL` from environment
- Calls tools: `jira_search_issues`, `jira_get_issue`
- Optional - reports work without Jira

#### 4. AI Report Generator (`src/generators/report-generator.ts`) [Planned]

Transforms raw activity data into human-readable reports:
- Uses Anthropic Claude API (`ANTHROPIC_API_KEY`)
- Prompt templates for daily/weekly/retro formats
- Structured output with Yesterday/Today/Blockers format

### Installation Configuration

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@github/github-mcp-server"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<token>"
      }
    },
    "jira": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-atlassian"],
      "env": {
        "JIRA_API_TOKEN": "<token>",
        "JIRA_EMAIL": "<email>",
        "JIRA_URL": "https://<company>.atlassian.net"
      }
    },
    "prodbeam": {
      "command": "npx",
      "args": ["-y", "@prodbeam/claude-mcp"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<same-token-as-github>",
        "JIRA_API_TOKEN": "<same-token-as-jira>",
        "JIRA_EMAIL": "<same-email-as-jira>",
        "JIRA_URL": "<same-url-as-jira>",
        "ANTHROPIC_API_KEY": "<key>"
      }
    }
  }
}
```

> **Token reuse**: The same tokens used for existing GitHub/Jira MCP servers are passed to Prodbeam. No separate OAuth apps, no new auth flows.

### Fallback: MCP Setup Instructions

When Prodbeam detects missing tokens or failed MCP connections, the `setup_check` tool returns actionable guidance:

```markdown
## Prodbeam Setup Status

### GitHub MCP: Not Configured
GITHUB_PERSONAL_ACCESS_TOKEN is not set.

To configure:
1. Create a GitHub Personal Access Token at https://github.com/settings/tokens
   - Required scopes: repo, read:user
2. Add to your .claude/mcp.json under the "prodbeam" server env:
   "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-token>"

### Jira MCP: Not Configured (Optional)
JIRA_API_TOKEN is not set.

To configure:
1. Create a Jira API Token at https://id.atlassian.com/manage/api-tokens
2. Add to your .claude/mcp.json under the "prodbeam" server env:
   "JIRA_API_TOKEN": "<your-token>"
   "JIRA_EMAIL": "<your-email>"
   "JIRA_URL": "https://<company>.atlassian.net"

### Anthropic API: Configured
ANTHROPIC_API_KEY is set.
```

---

## 4. Feature Specifications

### Phase 1: MVP - Daily Report (`/daily-report`)

**User Story**: As a developer, I want to generate my daily standup from the terminal so I can save 10 minutes every morning.

**Acceptance Criteria:**
- Fetches commits from last 24h via `list_commits` (per tracked repo)
- Fetches PRs via `list_pull_requests` / `search_pull_requests`
- Fetches reviews via `pull_request_read`
- Fetches Jira issues via `jira_search_issues` (if configured)
- Generates AI-powered standup in Yesterday/Today/Blockers format
- Execution time: < 15 seconds

**Example Output:**
```markdown
# Daily Standup - February 7, 2026

## Yesterday
- Merged PR #142: Add user authentication with OAuth2 flow
- Reviewed PR #138: Fix login redirect bug (approved with suggestions)
- Committed 8 changes across authentication module
- Completed PROJ-45: Implement OAuth2 flow (Jira)

## Today
- Continue work on PR #144: Implement password reset flow
- Review PR #140: Update user profile endpoint
- Address feedback on PROJ-46: API rate limiting

## Blockers
- None currently. Password reset testing depends on email service setup.
```

### Phase 2: Weekly Report (`/weekly-report`)

**Acceptance Criteria:**
- Fetches last 7 days of activity
- Metrics: commits, PRs merged, reviews given, avg cycle time
- `--team` flag for team-wide report
- Saves to `~/reports/week-[date].md`
- AI-generated summary of key accomplishments

### Phase 3: Sprint Retrospective (`/retro`)

**Acceptance Criteria:**
- Supports `--sprint`, `--from`, `--to` flags
- Auto-detects sprint dates from Jira (if configured)
- Sections: What went well, What didn't, Action items
- Metrics: Velocity, completed vs planned, cycle time
- AI-generated insights and recommendations

### Setup Check (`setup_check`)

**Acceptance Criteria:**
- Validates GitHub token by calling `get_me`
- Validates Jira connection by calling `jira_get_my_issues`
- Reports which integrations are configured/missing
- Provides step-by-step setup instructions for missing integrations
- Non-blocking: works with partial configuration (GitHub only, no Jira)

---

## 5. Development Plan

### Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| MCP Server | Node.js + TypeScript (strict) | MCP SDK requires Node.js |
| MCP Client SDK | @modelcontextprotocol/sdk | Connect to existing GitHub/Jira MCPs |
| AI Provider | Anthropic Claude API | High-quality report generation |
| Validation | zod | Runtime input validation |
| Testing | vitest | Fast, ESM-native, TypeScript-first |
| CI/CD | GitHub Actions | Free for open source |
| Distribution | npm registry | `npx @prodbeam/claude-mcp` |

### Phase 0: Foundation (Current - Week 1)

**Goal**: Working MCP server that connects to GitHub MCP and validates the architecture.

**Tasks:**
- [x] Project setup (TypeScript, MCP SDK, ESLint, Prettier)
- [x] MCP server boilerplate with tool registration
- [x] GitHub MCP adapter skeleton
- [x] TypeScript type definitions
- [ ] Verify GitHub MCP connection (spawn subprocess, call `get_me`)
- [ ] Verify correct tool names and response formats
- [ ] Implement response parsers for `list_commits`, `list_pull_requests`
- [ ] Add `setup_check` tool with fallback instructions
- [ ] Add vitest and write smoke tests
- [ ] Add GitHub Actions CI pipeline

**Deliverable**: MCP server that connects to GitHub MCP, fetches real data, and returns it.

### Phase 1: Daily Report MVP (Weeks 2-3)

**Goal**: Ship the core `generate_daily_report` tool.

**Tasks:**
- [ ] Complete GitHub adapter: `list_commits`, `list_pull_requests`, `pull_request_read`
- [ ] Integrate Anthropic Claude API for report generation
- [ ] Write prompt template for daily standups
- [ ] Handle `get_me` to identify current user for filtering
- [ ] Add Jira adapter (optional integration)
- [ ] Unit tests for adapters (mock MCP responses)
- [ ] Integration test: full report generation flow
- [ ] Manual testing with real GitHub/Jira MCPs

**Deliverable**: Users can run the daily report tool and get a standup.

### Phase 2: Weekly Reports (Week 4)

**Goal**: Add `generate_weekly_report` with team support.

**Tasks:**
- [ ] Fetch 7 days of activity
- [ ] Calculate metrics (commits, PRs, cycle time)
- [ ] Team report logic (aggregate team members via `get_team_members`)
- [ ] AI weekly summary prompt template
- [ ] Save report to file

### Phase 3: Sprint Retrospectives (Weeks 5-6)

**Goal**: Add `generate_retrospective` with Jira sprint integration.

**Tasks:**
- [ ] Jira sprint data fetching
- [ ] Retrospective AI prompt engineering
- [ ] Sprint metrics calculation
- [ ] DORA metrics (if Vercel/deployment data available)

### Phase 4: Polish and Launch (Weeks 7-8)

**Goal**: Publish to npm, documentation, launch.

**Tasks:**
- [ ] Comprehensive error handling and edge cases
- [ ] Performance optimization (parallel fetching, connection reuse)
- [ ] Documentation (README, examples, setup guide)
- [ ] Publish to npm: `npm publish --access public`
- [ ] Launch: Hacker News, Reddit, Twitter, Product Hunt

---

## 6. Testing Strategy

### Test Framework: vitest

**Coverage Target**: 80%+ for critical paths.

**Test Structure:**
```
src/
├── adapters/
│   ├── github-mcp.ts
│   └── github-mcp.test.ts      # Mock MCP client, test parsing
├── generators/
│   ├── report-generator.ts
│   └── report-generator.test.ts # Mock AI API, test formatting
├── types/
│   └── github.ts
├── index.ts
└── index.test.ts                # Smoke test: server starts, tools register
```

**Test Categories:**
- **Unit**: Adapter parsing, report formatting, date calculations
- **Integration**: Full flow with mocked MCP responses
- **Smoke**: Server starts, tools register, handles unknown tools gracefully

---

## 7. Distribution

### npm Package

**Package**: `@prodbeam/claude-mcp`
**Installation**: `npx -y @prodbeam/claude-mcp`

### Claude Code Integration

Users add to `.claude/mcp.json`:
```json
{
  "mcpServers": {
    "prodbeam": {
      "command": "npx",
      "args": ["-y", "@prodbeam/claude-mcp"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<token>",
        "ANTHROPIC_API_KEY": "<key>"
      }
    }
  }
}
```

---

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| GitHub MCP tool names change | Low | High | Pin MCP server version, test in CI |
| MCP subprocess spawn is slow | Medium | Medium | Connection pooling, lazy initialization |
| AI report quality inconsistent | Medium | Medium | Prompt engineering, user feedback loop |
| Token configuration friction | High | Medium | Clear setup instructions, `setup_check` tool |
| `@modelcontextprotocol/server-github` deprecated | Confirmed | Medium | Migrate to `@github/github-mcp-server` |

---

## 9. Success Metrics

### Launch Goals (First 30 Days)

| Metric | Target |
|--------|--------|
| npm installs | 1,000+ |
| Active users | 200+ |
| Reports generated | 5,000+ |
| GitHub stars | 500+ |

### Quality Metrics

| Metric | Target |
|--------|--------|
| Report generation time | < 15 seconds (p95) |
| Error rate | < 2% |
| Test coverage | 80%+ |

---

## 10. Open Questions

1. **GitHub MCP server package**: Should we use `@github/github-mcp-server` (official, maintained) or `@modelcontextprotocol/server-github` (deprecated but widely used)? Need to test both.

2. **Connection lifecycle**: Should we keep MCP subprocess alive between tool calls or spawn fresh each time? Alive = faster but more complex process management.

3. **Token sharing UX**: Is passing the same token in two env var blocks (github + prodbeam) acceptable friction? Or should we find a way to read the user's existing MCP config?

4. **Anthropic API key**: Claude Code already has an API key. Can the MCP server access it, or does the user need to provide a separate key?

---

*Document maintained by: Prodbeam Team*
*Repository: https://github.com/prodbeam/claude-mcp*
