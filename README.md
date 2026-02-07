# 🚧 Prodbeam for Claude Code

**Status:** Work in Progress (Pre-release)
**Target Launch:** March 2026

---

## What is this?

An AI-powered MCP server for Claude Code that generates:
- 📊 **Daily standups** from your commits, PRs, and Jira tickets
- 📈 **Weekly reports** with team metrics and insights
- 🔄 **Sprint retrospectives** with AI-powered analysis

All directly from your terminal. No browser. No context switching.

---

## Example Usage (Coming Soon)

```bash
# Daily standup in 10 seconds
$ claude /daily-report
✓ Generated standup from your last 24h activity

# Weekly team summary
$ claude /weekly-report --team
✓ Generated team summary with metrics

# Sprint retrospective
$ claude /retro --sprint "Sprint 42"
✓ Generated retrospective with insights
```

---

## Features

- ✅ **Terminal-native** - Works directly in Claude Code CLI
- ✅ **Reuses existing MCPs** - No duplicate GitHub/Jira authentication
- ✅ **AI-powered** - Uses Anthropic Claude for natural language generation
- ✅ **Team-focused** - Built for agile scrum teams
- ✅ **Open source** - MIT license

---

## Architecture

Prodbeam MCP orchestrates your existing GitHub and Jira MCP servers:

```
PRODBEAM MCP → GitHub MCP (your existing connection)
              → Jira MCP (your existing connection)
              → Anthropic Claude API (for AI generation)
```

No duplicate authentication needed!

---

## Installation (Not Ready Yet)

Once released, installation will be:

```bash
# Add to your .claude/mcp.json
{
  "mcpServers": {
    "prodbeam": {
      "command": "npx",
      "args": ["-y", "@prodbeam/claude-mcp"]
    }
  }
}

# Run setup
$ claude /prodbeam setup
```

**Prerequisites:**
- GitHub MCP server configured
- Jira MCP server configured (optional)
- Claude Code CLI installed

---

## Roadmap

- [ ] **Phase 1** (Feb-Mar 2026): Daily reports MVP
- [ ] **Phase 2** (Mar 2026): Weekly reports
- [ ] **Phase 3** (Mar 2026): Sprint retrospectives
- [ ] **Launch** (Mar 2026): v1.0 public release

---

## Early Access

Want to try it before launch?

- ⭐ **Star this repo** to get notified when we launch
- 📧 **Email beta@prodbeam.com** for early access
- 🐦 **Follow [@prodbeam](https://twitter.com/prodbeam)** for updates

---

## Why Prodbeam?

Part of the [Prodbeam](https://prodbeam.com) ecosystem - the AI Scrum Master platform for engineering teams.

- **Web App**: Full engineering intelligence platform
- **Claude Plugin**: Terminal-native reports (this repo)

---

## Contributing

Not accepting contributions yet (pre-release). Once launched, we'll welcome:
- Bug reports
- Feature requests
- Pull requests
- Documentation improvements

---

## License

MIT License - See [LICENSE](LICENSE) file

---

## Links

- 🌐 **Website**: [prodbeam.com](https://prodbeam.com)
- 📖 **Docs**: [prodbeam.com/claude-plugin](https://prodbeam.com/claude-plugin) (coming soon)
- 💬 **Support**: [GitHub Issues](https://github.com/prodbeam/claude-mcp/issues)

---

**Built with ❤️ by the Prodbeam team**
