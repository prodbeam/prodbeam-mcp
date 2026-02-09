# Security

Prodbeam MCP runs entirely on your local machine. This document explains what data is accessed, how credentials are stored, and what network calls are made.

## Data Model

| Category | What's accessed | What's stored locally | What's never stored |
|----------|----------------|----------------------|---------------------|
| GitHub | Commits, PRs, reviews across tracked repos | Aggregate counts (commit count, PR count, merge time) | Commit messages, PR descriptions, code diffs |
| Jira | Issues in tracked projects/sprints | Issue counts by status/type, completion rates | Issue summaries, descriptions, comments |
| Credentials | GitHub PAT or OAuth token, Jira API token or OAuth token | Tokens in `credentials.json` (600 permissions) or env vars | Tokens are never logged or transmitted to third parties |

## Credential Storage

Credentials are resolved in this order:

1. **Environment variables** — `GITHUB_TOKEN`, `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN` (always take precedence)
2. **OAuth tokens** in `~/.prodbeam/credentials.json` (auto-refreshed)
3. **Personal access tokens** in `~/.prodbeam/credentials.json`

The credentials file is created with `600` permissions (owner read/write only). The `~/.prodbeam/` directory is created with `700` permissions.

Environment variables avoid writing tokens to disk entirely. When `prodbeam init` detects environment variables, it skips writing them to the credentials file.

### OAuth Tokens

OAuth tokens are stored in `~/.prodbeam/credentials.json` alongside any PAT credentials. The `method` field discriminates the format — entries with `method: "oauth"` contain access and refresh tokens with expiry timestamps. Entries without a `method` field are treated as PATs for backward compatibility.

Access tokens are short-lived (GitHub: 8 hours, Jira: 1 hour) and refresh automatically when they expire. Refresh tokens are long-lived (GitHub: ~6 months, Jira: 90 days of inactivity). When a refresh token expires, the user is prompted to re-authenticate.

### Jira OAuth Client Secret

The Jira OAuth client secret is shipped in the npm package. This is standard practice for CLI tools (same pattern as GitHub CLI, VS Code extensions, Slack CLI). The secret authenticates the *application*, not the user — user authorization happens via the browser redirect flow. The secret cannot be used to access any user data without the user explicitly authorizing the application in their browser.

## Required Token Scopes

### GitHub

**Personal Access Token (PAT):**

| Scope | Why it's needed |
|-------|----------------|
| `repo` | Read commits, pull requests, and reviews across private repositories |
| `read:user` | Resolve email addresses to GitHub usernames during team setup |
| `read:org` | Discover organization membership and repositories |

**OAuth (GitHub App — device flow):** Requests the same scopes (`repo`, `read:user`, `read:org`). The device flow does not require a client secret — only a client ID is used.

All operations are **read-only**. Prodbeam never creates, modifies, or deletes any GitHub resources.

### Jira

**API Token:** A standard Jira API token (created at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)) is used with your Jira email for Basic Auth.

**OAuth (3LO — authorization code flow):** Requests read-only scopes across Jira Platform and Jira Software:

| Category | Scopes |
|----------|--------|
| Classic | `read:jira-work`, `read:jira-user`, `offline_access` |
| Issues | `read:issue:jira`, `read:issue-details:jira`, `read:issue-status:jira`, `read:issue-type:jira` |
| Users & Projects | `read:user:jira`, `read:email-address:jira`, `read:project:jira`, `read:project.component:jira`, `read:project-type:jira` |
| Other Platform | `read:comment:jira`, `read:label:jira`, `read:jql:jira`, `read:dashboard:jira`, `read:deployment-info:jira`, `read:dev-info:jira` |
| Jira Software | `read:board-scope:jira-software`, `read:sprint:jira-software`, `read:epic:jira-software`, `read:issue:jira-software`, `read:deployment:jira-software` |

All scopes are **read-only**. Prodbeam never creates, modifies, or deletes Jira resources.

## Network Access

Prodbeam contacts these external services:

| Destination | Purpose | When |
|-------------|---------|------|
| `api.github.com` | Fetch commits, PRs, reviews, resolve users | Every report |
| `<your-host>.atlassian.net` | Fetch Jira issues, sprints, resolve accounts | Every report (PAT auth) |
| `github.com/login/device/code` | GitHub OAuth device flow | During `auth login` only |
| `github.com/login/oauth/access_token` | GitHub OAuth token exchange and refresh | During login and token refresh |
| `auth.atlassian.com` | Jira OAuth authorization and token exchange | During `auth login` only |
| `api.atlassian.com` | Jira OAuth resource discovery and API access | During login and every report (OAuth auth) |

**No telemetry.** No analytics. No data is sent to Prodbeam servers or any third party. There is no Prodbeam cloud service.

## Local Storage

All data lives in `~/.prodbeam/` (override with `PRODBEAM_HOME` env var):

| File | Contents | Sensitivity |
|------|----------|-------------|
| `team.json` | Team name, member emails, GitHub usernames, tracked repos, Jira projects | Low — organizational metadata |
| `credentials.json` | API tokens and/or OAuth tokens | **High** — protected by 600 file permissions |
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
