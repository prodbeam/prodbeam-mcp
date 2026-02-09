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

This provides three commands:
- `prodbeam` — CLI for reports and setup
- `prodbeam-mcp` — MCP server entry point
- `mcp` — Short alias for `prodbeam-mcp`

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

There are three ways to authenticate. Environment variables always take precedence.

### Option A: OAuth (recommended)

Authenticate via browser — tokens refresh automatically and don't require manual rotation.

```bash
prodbeam auth login
```

This walks you through OAuth for both GitHub and Jira:
- **GitHub:** Device flow — enter a code in your browser, CLI polls for the token
- **Jira:** Authorization code flow — click a link, authorize in browser, CLI receives the callback

OAuth tokens are stored in `~/.prodbeam/credentials.json` with `600` permissions. Access tokens refresh automatically (GitHub: 8h, Jira: 1h). Refresh tokens last months (GitHub: ~6mo, Jira: 90 days of inactivity).

```bash
prodbeam auth status                    # Check token expiry
prodbeam auth logout                    # Remove OAuth tokens
prodbeam auth login --github            # Re-authenticate GitHub only
prodbeam auth login --jira              # Re-authenticate Jira only
```

### Option B: Environment variables

Set these in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export GITHUB_TOKEN=ghp_YOUR_TOKEN
export JIRA_HOST=company.atlassian.net
export JIRA_EMAIL=you@company.com
export JIRA_API_TOKEN=your_jira_token
```

When environment variables are set, they always take precedence over OAuth or saved tokens.

### Option C: Personal access tokens

If you prefer not to use OAuth, you can paste tokens directly:

```bash
prodbeam auth login --method token
```

Or use `prodbeam init` — the wizard prompts for tokens interactively and saves them to `~/.prodbeam/credentials.json`.

### Resolution order

1. Environment variables (`GITHUB_TOKEN`, `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`)
2. OAuth tokens in `~/.prodbeam/credentials.json` (auto-refreshed)
3. Personal access tokens in `~/.prodbeam/credentials.json`

See [SECURITY.md](../SECURITY.md) for details on credential handling and token scopes.

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
| "Show sprint progress" | `sprint_review` (auto-detects active sprint) |

### Via CLI

```bash
# Authentication
prodbeam auth login                       # Authenticate (OAuth or token)
prodbeam auth status                      # Check token expiry
prodbeam auth logout                      # Remove OAuth tokens

# Reports
prodbeam standup                          # Personal standup (last 24h)
prodbeam standup --email alice@co.com     # Standup for a specific member
prodbeam team-standup                     # Full team standup
prodbeam weekly                           # Weekly summary (current week)
prodbeam weekly --weeks-ago 1             # Last week's summary
prodbeam sprint-retro                     # Sprint retro (auto-detect sprint)
prodbeam sprint-retro --sprint "Sprint 12"  # Specific sprint
prodbeam sprint-review                    # Mid-sprint health check

# Info
prodbeam status                           # Check config and credentials
prodbeam help                             # All commands
prodbeam help weekly                      # Detailed help for a command
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
| `GitHub credentials required` | Run `prodbeam auth login`, `prodbeam init`, or set `GITHUB_TOKEN` in your shell |
| `No team config found` | Run `prodbeam init` or create `~/.prodbeam/team.json` manually (see below) |
| MCP server not appearing in `/mcp` | Run `prodbeam init` to re-register, or `claude mcp add` manually. Start a **new** session |
| `No GitHub username for email` | GitHub email may be private. Edit `~/.prodbeam/team.json` to set `github` field manually |
| Empty report | Verify the time range has activity. Try `standup` first (smallest window) |
| Jira not working | Run `prodbeam auth login --jira` for OAuth, or ensure all three PAT fields are set: host, email, API token |
| MCP server won't reconnect | Remove and re-add: `claude mcp remove prodbeam && prodbeam init`. Start a **new** session |
| OAuth callback not working | Run `prodbeam auth login` first — the CLI must be running to receive the browser callback |
| `Authentication expired` | Refresh token has expired. Run `prodbeam auth login` to re-authenticate |
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
