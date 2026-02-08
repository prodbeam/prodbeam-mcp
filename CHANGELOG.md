# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-08

### Added

- **MCP Server** — stdio-based server compatible with Claude Code, Cursor, Windsurf, and any MCP client
- **GitHub integration** — direct REST API client with typed responses, rate limiting, and retry logic
- **Jira integration** — direct REST API client for Cloud instances with basic auth
- **Daily standup** (`standup`) — personal activity report from the last 24 hours
- **Team standup** (`team_standup`) — per-member breakdown with aggregate metrics
- **Weekly summary** (`weekly_summary`) — 7-day engineering summary with repo breakdown and team health scoring
- **Sprint retrospective** (`sprint_retro`) — sprint-bounded report with merge rate, review coverage, and insights
- **Team setup** (`setup_team`) — one-time onboarding with auto-discovery of GitHub usernames, repos, Jira accounts, and projects
- **Team management** — `add_member`, `remove_member`, `refresh_config` tools
- **Interactive CLI** — `prodbeam init` setup wizard with credential validation and MCP server registration
- **CLI reports** — `prodbeam standup`, `team-standup`, `weekly`, `sprint-retro`, `status` commands
- **Intelligence layer** — anomaly detection, team health scoring (velocity, throughput, review coverage, issue flow), trend analysis
- **History store** — SQLite-backed metrics persistence for trend comparison across reports
- **Credential resolution** — two-tier system (environment variables > `~/.prodbeam/credentials.json`) with 600 file permissions
- **Auto-discovery** — resolves GitHub usernames/repos and Jira accounts/projects from email addresses
- **Stale PR detection** — configurable thresholds for warning and alert levels
- **CI/CD** — GitHub Actions for build/test (Node 18/20/22), security scanning (npm audit, Gitleaks, CodeQL, license check), conventional commits, and PR size labeling
- **213 tests** across 18 test suites

[0.1.0]: https://github.com/prodbeam/prodbeam-mcp/releases/tag/v0.1.0
