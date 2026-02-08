# Setup & Usage Guide

Detailed guide for setting up and using Prodbeam MCP. For a quick overview, see the [README](../README.md).

---

## Table of Contents

- [Setup — Global Install](#setup--global-install)
- [Setup — npx (Zero Install)](#setup--npx-zero-install)
- [Setup — MCP Config File](#setup--mcp-config-file)
- [Setup — Local Development](#setup--local-development)
- [Credentials](#credentials)
- [Generating Reports](#generating-reports)
- [Managing Your Team](#managing-your-team)
- [Troubleshooting](#troubleshooting)
- [Manual team.json](#manual-teamjson)

---

## Setup — Global Install

Install from npm and set up in two commands.

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

The wizard walks through:

1. **Detects credentials** — checks environment variables and `~/.prodbeam/credentials.json`
2. **Prompts for missing credentials** — GitHub token and Jira host/email/token
3. **Validates credentials** — tests against live APIs with retry on failure
4. **Prompts for team** — team name and member emails
5. **Runs auto-discovery** — resolves GitHub usernames, repos, Jira accounts, projects, and sprints
6. **Saves config** — writes `credentials.json` (if prompted) and `team.json`
7. **Registers MCP server** — runs `claude mcp add` automatically

### 3. Start using it

Open a **new** MCP client session (servers connect at startup):

```
Generate my standup using prodbeam
```

---

## Setup — npx (Zero Install)

Register the MCP server without installing anything:

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

---

## Setup — MCP Config File

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

---

## Setup — Local Development

For contributors working from the source repo. See also [CONTRIBUTING.md](../CONTRIBUTING.md).

### 1. Build

```bash
git clone https://github.com/prodbeam/prodbeam-mcp.git
cd prodbeam-mcp
npm install
npm run build
```

### 2. Run the setup wizard

```bash
node dist/cli.js init
```

Same interactive wizard as the global install.

### 3. Manual MCP registration (local)

```bash
claude mcp add prodbeam \
  -e GITHUB_TOKEN=ghp_YOUR_TOKEN \
  -e JIRA_HOST=company.atlassian.net \
  -e JIRA_EMAIL=you@company.com \
  -e JIRA_API_TOKEN=your_jira_token \
  -- node /path/to/prodbeam-mcp/dist/index.js
```

---

## Credentials

There are two ways to provide credentials. You can use either or both — environment variables take precedence.

### Option A: Environment variables (recommended)

Set these in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export GITHUB_TOKEN=ghp_YOUR_TOKEN
export JIRA_HOST=company.atlassian.net
export JIRA_EMAIL=you@company.com
export JIRA_API_TOKEN=your_jira_token
```

When `prodbeam init` detects these, it uses them directly and does not write them to disk.

### Option B: Credentials file

If you don't set environment variables, `prodbeam init` prompts you interactively and saves tokens to `~/.prodbeam/credentials.json` with `600` permissions (owner read/write only).

### Resolution order

1. Environment variables (`GITHUB_TOKEN`, `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`)
2. `~/.prodbeam/credentials.json`

Environment variables always take precedence. See [SECURITY.md](../SECURITY.md) for details on credential handling and token scopes.

---

## Generating Reports

### Via MCP client

Ask naturally in any MCP client — the client invokes the right tool:

| Prompt | Tool |
|--------|------|
| "Generate my standup" | `standup` |
| "Generate a team standup" | `team_standup` |
| "Generate a weekly summary" | `weekly_summary` |
| "Generate a weekly summary for last week" | `weekly_summary` (weeksAgo: 1) |
| "Generate a sprint retro" | `sprint_retro` (auto-detects active sprint) |
| "Generate a sprint retro for Sprint 12" | `sprint_retro` (sprintName: "Sprint 12") |

### Via CLI

```bash
prodbeam status                           # Check config and credentials
prodbeam standup                          # Personal standup (last 24h)
prodbeam standup --email alice@co.com     # Standup for a specific member
prodbeam team-standup                     # Full team standup
prodbeam weekly                           # Weekly summary
prodbeam weekly --weeks-ago 1             # Last week's summary
prodbeam sprint-retro                     # Sprint retro (auto-detect sprint)
prodbeam sprint-retro --sprint "Sprint 12"  # Specific sprint
prodbeam help                             # All commands
```

Local development (replace `prodbeam` with `node dist/cli.js`):

```bash
node dist/cli.js standup
```

For full parameter documentation and sample output, see the [Tool Reference](tool-reference.md).

---

## Managing Your Team

### Via MCP

| Action | Prompt |
|--------|--------|
| Add a member | "Add dave@company.com to my prodbeam team" |
| Remove a member | "Remove dave@company.com from my prodbeam team" |
| Refresh repos/sprints | "Refresh my prodbeam config" |
| Check status | "Show my prodbeam status" |

### Re-running init

You can run `prodbeam init` again at any time. If `~/.prodbeam/team.json` already exists, it asks for confirmation before overwriting. Credentials are merged — updating Jira credentials won't overwrite your GitHub token.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `GitHub credentials required` | Run `prodbeam init` or set `GITHUB_TOKEN` in your shell |
| `No team config found` | Run `prodbeam init` or create `~/.prodbeam/team.json` manually (see below) |
| MCP server not appearing in `/mcp` | Run `prodbeam init` to re-register, or `claude mcp add` manually. Start a **new** session |
| `No GitHub username for email` | GitHub email may be private. Edit `~/.prodbeam/team.json` to set `github` field manually |
| Empty report | Verify the time range has activity. Try `standup` first (smallest window) |
| Jira not working | All three fields required: host, email, API token. Run `prodbeam init` to reconfigure |
| MCP server won't reconnect | Remove and re-add: `claude mcp remove prodbeam && prodbeam init`. Start a **new** session |
| npx uses stale version | Clear cache: `npx clear-npx-cache` or `npm cache clean --force`, then retry |

### Known Limitations

- **Code changes may show `+0/-0`** — line count metrics depend on the GitHub API returning diff stats, which varies by endpoint and repository size
- **Weekly report title always says "Last 7 Days"** — even when using `weeksAgo` for historical periods. The data is correct; only the title is misleading
- **Stale PR alerts are current-state** — historical weekly reports show today's stale PRs, not the state during that historical week
- **Standup email must match team.json exactly** — if a member's email doesn't match, edit `~/.prodbeam/team.json` to correct it
- **Sprint retro requires Jira sprints** — if your team doesn't use Jira sprints, this tool will have limited data

---

## Manual team.json

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

Override the config directory location with the `PRODBEAM_HOME` environment variable.
