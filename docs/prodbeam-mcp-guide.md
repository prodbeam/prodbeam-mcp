# Prodbeam MCP — Setup & Usage Guide

Engineering intelligence reports from GitHub and Jira, delivered through Claude Code or the standalone CLI.

---

## Prerequisites

| Requirement | How to verify |
|-------------|---------------|
| Node.js 18+ | `node --version` |
| Claude Code CLI | `claude --version` |
| GitHub PAT | [Create one](https://github.com/settings/tokens) with `repo`, `read:user`, `read:org` scopes |
| Jira API Token | [Create one](https://id.atlassian.com/manage-profile/security/api-tokens) |

---

## Setup — Production (npm)

Install from npm and set up in two commands. No cloning or building required.

### 1. Install globally

```bash
npm install -g @prodbeam/mcp
```

This provides two commands:
- `prodbeam` — CLI for reports and setup
- `prodbeam-mcp` — MCP server entry point

### 2. Run the setup wizard

```bash
prodbeam init
```

The wizard walks you through everything:

1. **Detects credentials** — checks environment variables and `~/.prodbeam/credentials.json`
2. **Prompts for missing credentials** — GitHub token and Jira host/email/token
3. **Validates credentials** — tests against live APIs with retry on failure
4. **Prompts for team** — team name and member emails
5. **Runs auto-discovery** — resolves GitHub usernames, repos, Jira accounts, and projects
6. **Saves config** — writes `credentials.json` (if prompted) and `team.json`
7. **Registers MCP server** — runs `claude mcp add` automatically

### 3. Start using it

Open a **new** Claude Code session (MCP servers connect at startup), then:

```
Generate my standup using prodbeam
```

### Alternative: npx (zero install)

If you prefer not to install globally, register the MCP server directly with npx:

```bash
claude mcp add prodbeam \
  -e GITHUB_TOKEN=ghp_YOUR_TOKEN_HERE \
  -e JIRA_HOST=company.atlassian.net \
  -e JIRA_EMAIL=your@email.com \
  -e JIRA_API_TOKEN=your_jira_token \
  -- npx -y @prodbeam/mcp
```

Then set up your team in a Claude Code session:

```
Set up my prodbeam team. Team name: "My Team", emails: alice@company.com, bob@company.com
```

### Alternative: MCP client config file

For MCP clients that use a JSON config file (Cursor, Windsurf, etc.), add this to your MCP config:

```json
{
  "mcpServers": {
    "prodbeam": {
      "command": "npx",
      "args": ["-y", "@prodbeam/mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_YOUR_TOKEN_HERE",
        "JIRA_HOST": "company.atlassian.net",
        "JIRA_EMAIL": "your@email.com",
        "JIRA_API_TOKEN": "your_jira_token"
      }
    }
  }
}
```

---

## Setup — Local Development

For contributors or anyone working from the source repo.

### 1. Build

```bash
cd /path/to/prodbeam-mcp
npm install
npm run build
```

This produces two entry points in `dist/`:
- `dist/index.js` — MCP server (stdio transport)
- `dist/cli.js` — standalone CLI

### 2. Run the setup wizard

```bash
node dist/cli.js init
```

Same interactive wizard as production — detects credentials, validates, discovers team, and registers the MCP server.

### 3. Start using it

Open a **new** Claude Code session, then:

```
Generate my standup using prodbeam
```

### Manual MCP registration (local)

If you prefer to register manually instead of using `prodbeam init`:

```bash
claude mcp add prodbeam \
  -e GITHUB_TOKEN=ghp_YOUR_TOKEN_HERE \
  -e JIRA_HOST=company.atlassian.net \
  -e JIRA_EMAIL=your@email.com \
  -e JIRA_API_TOKEN=your_jira_token \
  -- node /path/to/prodbeam-mcp/dist/index.js
```

---

## Setting Up Credentials

There are two ways to provide credentials. You can use either or both — environment variables take precedence.

### Option A: Environment variables

Set these in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export GITHUB_TOKEN=ghp_YOUR_TOKEN_HERE
export JIRA_HOST=company.atlassian.net
export JIRA_EMAIL=your@email.com
export JIRA_API_TOKEN=your_jira_token
```

When `prodbeam init` detects these, it uses them directly and does not write them to disk.

### Option B: Credentials file

If you don't set environment variables, `prodbeam init` prompts you interactively and saves tokens to `~/.prodbeam/credentials.json` with `600` permissions (owner read/write only).

---

## Generating Reports

### Via Claude Code (MCP)

In a Claude Code session, ask naturally:

| What to say | Tool called |
|-------------|-------------|
| "Generate my standup" | `standup` |
| "Generate a team standup" | `team_standup` |
| "Generate a weekly summary" | `weekly_summary` |
| "Generate a weekly summary for last week" | `weekly_summary` (weeksAgo: 1) |
| "Generate a sprint retro" | `sprint_retro` (auto-detects active sprint) |
| "Generate a sprint retro for Sprint 12" | `sprint_retro` (sprintName: "Sprint 12") |

### Via CLI

Production install:

```bash
prodbeam status                           # Check config
prodbeam standup                           # Personal standup
prodbeam standup --email colleague@co.com  # Standup for a specific member
prodbeam team-standup                      # Team standup
prodbeam weekly                            # Weekly summary
prodbeam weekly --weeks-ago 1              # Last week
prodbeam sprint-retro                      # Sprint retro (auto-detect)
prodbeam sprint-retro --sprint "Sprint 12" # Specific sprint
prodbeam help                              # All commands
```

Local development (replace `prodbeam` with `node dist/cli.js`):

```bash
node dist/cli.js status
node dist/cli.js standup
# etc.
```

---

## Managing Your Team

### Via MCP tools

| Action | What to say |
|--------|-------------|
| Add a member | "Use prodbeam add_member with email: colleague@company.com" |
| Remove a member | "Use prodbeam remove_member with email: colleague@company.com" |
| Refresh repos/sprints | "Use prodbeam refresh_config" |
| Check status | "Use prodbeam get_capabilities" |

### Re-running init

You can run `prodbeam init` again at any time. If `~/.prodbeam/team.json` already exists, it asks for confirmation before overwriting. Credentials are merged — updating Jira credentials won't overwrite your GitHub token.

---

## Architecture

Prodbeam v2 is **self-sufficient** — it fetches data directly from GitHub and Jira APIs. No separate MCP servers needed.

```
Claude Code / Cursor / Any MCP Host
  |
  +-- Prodbeam MCP Server
        |
        +-- GitHub REST API (your token)
        +-- Jira REST API (your token)
        +-- ~/.prodbeam/history.db (local metrics history)
```

**One tool call = one complete report.** No multi-step orchestration.

### Config directory

All data lives in `~/.prodbeam/`:

| File | Purpose |
|------|---------|
| `team.json` | Team members, repos, projects |
| `credentials.json` | API tokens (600 permissions) |
| `history.db` | SQLite metrics for trend comparison |

Override location with `PRODBEAM_HOME` env var.

### Credential resolution order

1. Environment variables (`GITHUB_TOKEN`, `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`)
2. `~/.prodbeam/credentials.json`

Environment variables always take precedence.

---

## Tool Reference

### Setup Tools

#### `setup_team` — One-time team onboarding

Provide your team name and member emails. Prodbeam auto-discovers GitHub usernames, Jira accounts, active repos, projects, and sprints.

**Parameters:**
| Name | Required | Description |
|------|----------|-------------|
| `teamName` | Yes | Team name (e.g., "Platform Engineering") |
| `emails` | Yes | Array of team member email addresses |

**How to run in Claude Code:**
```
Set up my prodbeam team called "Platform Engineering" with these emails:
alice@company.com, bob@company.com, carol@company.com
```

**CLI equivalent:**
```bash
prodbeam init
```

---

#### `add_member` — Add a team member

Adds a new member by email. Prodbeam auto-discovers their GitHub and Jira identities.

**Parameters:**
| Name | Required | Description |
|------|----------|-------------|
| `email` | Yes | Email address of the new member |

**How to run in Claude Code:**
```
Add dave@company.com to my prodbeam team
```

---

#### `remove_member` — Remove a team member

Removes a member from the team by email.

**Parameters:**
| Name | Required | Description |
|------|----------|-------------|
| `email` | Yes | Email address of the member to remove |

**How to run in Claude Code:**
```
Remove dave@company.com from my prodbeam team
```

---

#### `refresh_config` — Re-scan repos and sprints

Re-scans repositories and sprints for all existing team members. Use this when new repos have been created or sprint names have changed.

**Parameters:** None

**How to run in Claude Code:**
```
Refresh my prodbeam config
```

---

#### `get_capabilities` — Check plugin status

Shows current team config, credential status, tracked repos, and available tools.

**Parameters:** None

**How to run in Claude Code:**
```
Show my prodbeam status
```

---

### Report Tools

#### `standup` — Personal daily standup

Fetches your GitHub commits, PRs, reviews, and Jira issues from the last 24 hours. Generates a ready-to-paste standup update.

**Parameters:**
| Name | Required | Description |
|------|----------|-------------|
| `email` | No | Email of a specific team member. Defaults to first member in config |

**How to run in Claude Code:**
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

---

#### `team_standup` — Full team standup

Shows per-member activity from the last 24 hours with aggregate stats across the entire team.

**Parameters:** None

**How to run in Claude Code:**
```
Generate a team standup using prodbeam
```

**CLI equivalent:**
```bash
prodbeam team-standup
```

---

#### `weekly_summary` — Weekly engineering summary

Generates a weekly engineering summary with metrics, repo breakdown, and Jira stats. Covers the last 7 days by default.

**Parameters:**
| Name | Required | Description |
|------|----------|-------------|
| `weeksAgo` | No | Offset in weeks. `0` = current week (default), `1` = last week, `2` = two weeks ago, etc. |

**How to run in Claude Code:**
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

---

#### `sprint_retro` — Sprint retrospective

Generates a sprint retrospective report with merge time analysis, completion rates, and Jira metrics. Auto-detects the active sprint from Jira if no sprint name is given.

**Parameters:**
| Name | Required | Description |
|------|----------|-------------|
| `sprintName` | No | Sprint name (e.g., "Sprint 12"). Auto-detects active sprint if omitted |

**How to run in Claude Code:**
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

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `GitHub credentials required` | Run `prodbeam init` or set `GITHUB_TOKEN` in your shell |
| `No team config found` | Run `prodbeam init` or create `~/.prodbeam/team.json` manually |
| MCP server not appearing in `/mcp` | Run `prodbeam init` to re-register, or `claude mcp add` manually. Start a **new** session |
| `No GitHub username for email` | GitHub email may be private. Edit `~/.prodbeam/team.json` to set `github` field manually |
| Empty report | Verify the time range has activity. Try `standup` first (smallest window) |
| Jira not working | All three fields required: host, email, API token. Run `prodbeam init` to reconfigure |
| Build errors (local dev) | Run `npm install && npm run build`. Requires Node 18+ |
| MCP server won't reconnect | Remove and re-add: `claude mcp remove prodbeam && prodbeam init`. Start a **new** session |
| npx uses stale version | Clear cache: `npx clear-npx-cache` or `npm cache clean --force`, then retry |

### Manual team.json

If auto-discovery doesn't work for your setup, create `~/.prodbeam/team.json` manually:

```json
{
  "version": 1,
  "team": {
    "name": "My Team",
    "members": [
      {
        "email": "your@email.com",
        "name": "Your Name",
        "github": "your-github-username",
        "jiraAccountId": "your-jira-account-id"
      }
    ]
  },
  "github": {
    "org": "your-org",
    "repos": ["your-org/repo-one", "your-org/repo-two"]
  },
  "jira": {
    "host": "yourcompany.atlassian.net",
    "projects": ["PROJ"]
  },
  "settings": {
    "timezone": "America/Denver",
    "reportFormat": "markdown"
  }
}
```

You can find your Jira account ID from your Jira profile URL.
