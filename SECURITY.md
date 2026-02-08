# Security

Prodbeam MCP runs entirely on your local machine. This document explains what data is accessed, how credentials are stored, and what network calls are made.

## Data Model

| Category | What's accessed | What's stored locally | What's never stored |
|----------|----------------|----------------------|---------------------|
| GitHub | Commits, PRs, reviews across tracked repos | Aggregate counts (commit count, PR count, merge time) | Commit messages, PR descriptions, code diffs |
| Jira | Issues in tracked projects/sprints | Issue counts by status/type, completion rates | Issue summaries, descriptions, comments |
| Credentials | GitHub PAT, Jira API token | Tokens in `credentials.json` (600 permissions) or env vars | Tokens are never logged or transmitted to third parties |

## Credential Storage

Credentials are resolved in this order:

1. **Environment variables** (recommended) — `GITHUB_TOKEN`, `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
2. **Credentials file** — `~/.prodbeam/credentials.json`

The credentials file is created with `600` permissions (owner read/write only). The `~/.prodbeam/` directory is created with `700` permissions.

Environment variables are preferred because they avoid writing tokens to disk entirely. When `prodbeam init` detects environment variables, it skips writing them to the credentials file.

## Required Token Scopes

### GitHub Personal Access Token

| Scope | Why it's needed |
|-------|----------------|
| `repo` | Read commits, pull requests, and reviews across private repositories |
| `read:user` | Resolve email addresses to GitHub usernames during team setup |
| `read:org` | Discover organization membership and repositories |

All operations are **read-only**. Prodbeam never creates, modifies, or deletes any GitHub resources.

### Jira API Token

A standard Jira API token (created at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)) is used with your Jira email for Basic Auth.

All operations are **read-only**: searching issues, listing sprints, and resolving user accounts. Prodbeam never creates, modifies, or deletes Jira resources.

## Network Access

Prodbeam only contacts two external services:

| Destination | Purpose |
|-------------|---------|
| `api.github.com` | Fetch commits, PRs, reviews, resolve users |
| `<your-host>.atlassian.net` | Fetch Jira issues, sprints, resolve accounts |

**No telemetry.** No analytics. No data is sent to Prodbeam servers or any third party. There is no Prodbeam cloud service.

## Local Storage

All data lives in `~/.prodbeam/` (override with `PRODBEAM_HOME` env var):

| File | Contents | Sensitivity |
|------|----------|-------------|
| `team.json` | Team name, member emails, GitHub usernames, tracked repos, Jira projects | Low — organizational metadata |
| `credentials.json` | API tokens | **High** — protected by 600 file permissions |
| `history.db` | SQLite database with aggregate metrics (counts, percentages, averages) | Low — numbers only, no content |

The history database stores **only aggregate numbers** (commit counts, PR counts, merge times, completion rates). It never stores commit messages, PR descriptions, code content, issue summaries, or any textual content from GitHub or Jira.

## CI Security

The project CI pipeline includes:

- **npm audit** — dependency vulnerability scanning
- **Gitleaks** — secret detection in commits
- **CodeQL** — static analysis for security vulnerabilities
- **License checks** — dependency license compliance

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately:

- Email: security@prodbeam.com
- Or open a [GitHub Security Advisory](https://github.com/prodbeam/prodbeam-mcp/security/advisories/new)

Please do not open public issues for security vulnerabilities.
