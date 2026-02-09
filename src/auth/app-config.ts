/**
 * OAuth App Configuration
 *
 * Client IDs and secrets for the registered OAuth applications.
 *
 * GitHub App: Uses device flow — no client secret needed.
 * Jira OAuth: Client secret is shipped in the package. This is standard
 * practice for CLI tools (same pattern as VS Code extensions, Slack CLI,
 * GitHub CLI). The secret authenticates the app, not the user — user
 * authorization happens via the browser redirect flow.
 *
 * Refer to the apps at:
 * - GitHub: https://github.com/settings/apps
 * - Jira: https://developer.atlassian.com/console/myapps/
 */

// ─── GitHub App ────────────────────────────────────────────

/** GitHub App client ID for device flow authentication. */
export const GITHUB_CLIENT_ID = 'Iv23liR2346KoRqEUAyK';

/** OAuth scopes requested during GitHub authentication. */
export const GITHUB_SCOPES = ['repo', 'read:org', 'read:user'];

// ─── Jira OAuth App ────────────────────────────────────────

/** Jira OAuth 2.0 (3LO) client ID. */
export const JIRA_CLIENT_ID = 'CpFTSfXTqJc5JYuMYxsf0KXgbCs8Aeg6';

/** Jira OAuth 2.0 (3LO) client secret. */
export const JIRA_CLIENT_SECRET =
  'ATOAnpwKOU-Nkq8jOd3TKEbYRSnXbB8pIuHNKc15ouBfmuimsywEvWIiGNdo4zbQQElI9ABDB926';

/** OAuth scopes requested during Jira authentication. */
export const JIRA_SCOPES = [
  // Classic scopes (Jira Platform)
  'read:jira-work',
  'read:jira-user',
  'offline_access',
  // Granular scopes — Jira Platform
  'read:issue:jira',
  'read:issue-details:jira',
  'read:issue-status:jira',
  'read:issue-type:jira',
  'read:comment:jira',
  'read:user:jira',
  'read:email-address:jira',
  'read:label:jira',
  'read:project:jira',
  'read:project.component:jira',
  'read:project-type:jira',
  'read:jql:jira',
  'read:dashboard:jira',
  'read:deployment-info:jira',
  'read:dev-info:jira',
  // Granular scopes — Jira Software
  'read:board-scope:jira-software',
  'read:sprint:jira-software',
  'read:epic:jira-software',
  'read:issue:jira-software',
  'read:deployment:jira-software',
];

/** Port for the localhost callback server during Jira OAuth flow. */
export const JIRA_CALLBACK_PORT = 19274;

/** Callback URL for Jira OAuth — must match the registered redirect URI. */
export const JIRA_REDIRECT_URI = `http://localhost:${JIRA_CALLBACK_PORT}/callback`;
