# Prodbeam MCP Server

**Status:** Work in Progress (Pre-release)
**Target Launch:** March 2026

---

## What is this?

An MCP server that generates AI-powered engineering reports. Works with any MCP client (Claude Code, Cursor, Windsurf, Cline, etc.):

- **Daily standups** from your commits, PRs, and Jira tickets
- **Weekly reports** with team metrics and insights
- **Sprint retrospectives** with AI-powered analysis

No browser. No context switching. Reuses your existing GitHub and Jira MCP connections.

---

## How It Works

Prodbeam orchestrates your existing MCP servers. It spawns GitHub and Jira MCP servers as subprocesses using the same tokens you already have configured:

```
Claude Code
  |
  +-- Prodbeam MCP (this plugin)
        |
        +-- GitHub MCP (your token, spawned as subprocess)
        +-- Jira MCP (your token, spawned as subprocess)
        +-- Anthropic Claude API (for AI generation)
```

No duplicate authentication. No new OAuth flows.

---

## Installation

### Prerequisites

- An MCP-compatible client (Claude Code, Cursor, Windsurf, Cline, etc.)
- A GitHub Personal Access Token ([create one](https://github.com/settings/tokens))
- Optionally: Jira API Token ([create one](https://id.atlassian.com/manage/api-tokens))

### Setup

Add to your MCP client config (example for Claude Code `.claude/mcp.json`):

```json
{
  "mcpServers": {
    "prodbeam": {
      "command": "npx",
      "args": ["-y", "@prodbeam/mcp"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-github-token>",
        "ANTHROPIC_API_KEY": "<your-anthropic-key>"
      }
    }
  }
}
```

**Optional Jira integration** - add these env vars to the same block:

```json
{
  "JIRA_API_TOKEN": "<your-jira-token>",
  "JIRA_EMAIL": "<your-jira-email>",
  "JIRA_URL": "https://<company>.atlassian.net"
}
```

### Already have GitHub/Jira MCP servers?

Use the same tokens. If you have this in your config:

```json
{
  "mcpServers": {
    "github": {
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_abc123" }
    }
  }
}
```

Just copy that same token to the Prodbeam config. No new tokens needed.

### Not sure what you need?

Run the setup check after installing:

```
claude> use the setup_check tool
```

Prodbeam will detect which integrations are configured and provide step-by-step instructions for anything missing.

---

## Usage (Coming Soon)

```bash
# Daily standup
$ claude
> use generate_daily_report

# Weekly team summary
> use generate_weekly_report with team=true

# Sprint retrospective
> use generate_retrospective with sprint="Sprint 42"
```

---

## Features

- **MCP-native** - Works with any MCP client
- **Reuses existing tokens** - Same GitHub/Jira tokens you already have
- **AI-powered** - Uses Anthropic Claude for natural language reports
- **Graceful fallback** - Works with GitHub only, Jira is optional
- **Setup guidance** - Built-in diagnostics if configuration is missing
- **Open source** - MIT license

---

## Roadmap

- [ ] **Phase 0** (Feb 2026): Foundation and architecture validation
- [ ] **Phase 1** (Feb-Mar 2026): Daily reports MVP
- [ ] **Phase 2** (Mar 2026): Weekly reports with team support
- [ ] **Phase 3** (Mar 2026): Sprint retrospectives
- [ ] **v1.0 Launch** (Apr 2026): Public release

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Lint
npm run lint

# Type check
npm run type-check
```

### Project Structure

```
src/
├── index.ts              # MCP server entry point
├── adapters/
│   └── github-mcp.ts     # GitHub MCP client adapter
└── types/
    └── github.ts          # TypeScript type definitions
```

---

## Contributing

Not accepting contributions yet (pre-release). Once launched, we welcome:
- Bug reports
- Feature requests
- Pull requests
- Documentation improvements

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Part of the Prodbeam Ecosystem

[Prodbeam](https://prodbeam.com) is an AI-powered Engineering Intelligence Platform.

- **Web App**: Full engineering intelligence platform at [prodbeam.com](https://prodbeam.com)
- **MCP Server**: Engineering intelligence for any MCP client (this repo)

---

## License

MIT License - See [LICENSE](LICENSE) file.

---

## Links

- Website: [prodbeam.com](https://prodbeam.com)
- Docs: [prodbeam.com/docs](https://prodbeam.com/docs) (coming soon)
- Issues: [GitHub Issues](https://github.com/prodbeam/prodbeam-mcp/issues)
