# Prodbeam MCP Server

Engineering intelligence reports from GitHub and Jira, delivered through any MCP client or the standalone CLI.

- **Daily standups** from your commits, PRs, reviews, and Jira issues
- **Weekly summaries** with team metrics, repo breakdowns, and insights
- **Sprint retrospectives** with merge time analysis and completion rates
- **Team health scoring** with anomaly detection and trend analysis

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
prodbeam standup                           # Personal standup (last 24h)
prodbeam standup --email alice@co.com      # Standup for a specific member
prodbeam team-standup                      # Full team standup
prodbeam weekly                            # Weekly summary
prodbeam weekly --weeks-ago 1              # Last week's summary
prodbeam sprint-retro                      # Sprint retro (auto-detect sprint)
prodbeam sprint-retro --sprint "Sprint 12" # Specific sprint
```

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

## Development

```bash
git clone https://github.com/prodbeam/prodbeam-mcp.git
cd prodbeam-mcp
npm install
npm run build
npm test
```

### Project Structure

```
src/
├── index.ts              # MCP server entry point
├── cli.ts                # Standalone CLI
├── clients/              # GitHub and Jira REST API clients
├── commands/             # CLI commands (init wizard)
├── config/               # Credentials, team config, paths
├── discovery/            # GitHub/Jira auto-discovery
├── generators/           # Report generation
├── history/              # SQLite metrics persistence
├── insights/             # Anomaly detection, team health, trends
├── orchestrator/         # Data fetching and time ranges
└── validators.ts         # Input validation
```

### Commands

```bash
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm test             # Run tests (vitest)
npm run lint         # Lint (eslint)
npm run type-check   # Type check (tsc --noEmit)
```

---

## Documentation

See [docs/prodbeam-mcp-guide.md](docs/prodbeam-mcp-guide.md) for the full setup and usage guide.

---

## Contributing

Bug reports and feature requests welcome via [GitHub Issues](https://github.com/prodbeam/prodbeam-mcp/issues).

Pull requests accepted — please follow conventional commit format (`feat:`, `fix:`, `docs:`, etc.).

---

## License

MIT — See [LICENSE](LICENSE).
