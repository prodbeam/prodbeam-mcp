# Contributing

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/prodbeam/prodbeam-mcp/issues). Pull requests are accepted — please follow the guidelines below.

## Development Setup

```bash
git clone https://github.com/prodbeam/prodbeam-mcp.git
cd prodbeam-mcp
npm install
npm run build
npm test
```

Requires Node.js 18+.

### Register the local build as an MCP server

```bash
claude mcp add prodbeam \
  -e GITHUB_TOKEN=ghp_YOUR_TOKEN \
  -e JIRA_HOST=company.atlassian.net \
  -e JIRA_EMAIL=you@company.com \
  -e JIRA_API_TOKEN=your_jira_token \
  -- node /path/to/prodbeam-mcp/dist/index.js
```

Or use the setup wizard: `node dist/cli.js init`

## Project Structure

```
src/
├── index.ts              # MCP server entry point (stdio)
├── cli.ts                # Standalone CLI entry point
├── auth/                 # OAuth flows (GitHub device, Jira 3LO), token storage, auth provider
├── clients/              # GitHub and Jira REST API clients
├── commands/             # CLI commands (init wizard, auth login/status/logout)
├── config/               # Credentials, team config, path resolution
├── discovery/            # GitHub/Jira auto-discovery from emails
├── generators/           # Report generation and metrics calculation
├── history/              # SQLite metrics persistence
├── insights/             # Anomaly detection, team health, trends
├── orchestrator/         # Data fetching coordination and time ranges
├── types/                # Shared TypeScript type definitions
└── validators.ts         # Zod input validation schemas
```

Build output goes to `dist/`. Two entry points:
- `dist/index.js` — MCP server (stdio transport)
- `dist/cli.js` — Standalone CLI

## Commands

```bash
npm run build        # Compile TypeScript
npm run dev          # Watch mode (recompile on change)
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint (ESLint)
npm run lint:fix     # Lint and auto-fix
npm run format       # Format (Prettier)
npm run type-check   # Type check (tsc --noEmit)
```

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- No `any` types — use `unknown` with type guards
- Zod for runtime input validation

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add cycle time metrics to weekly report
fix: resolve stale PR detection for archived repos
docs: update tool reference with sample output
refactor: extract metrics calculation into shared module
test: add edge case coverage for empty sprint data
chore: update dependencies
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all checks pass: `npm run build && npm test && npm run lint && npm run type-check`
4. Open a PR against `main` with a clear description
5. Address review feedback

## Testing

Tests use [Vitest](https://vitest.dev/). The test suite covers:

- Unit tests for report generators, metrics calculators, and insight engines
- Integration tests for API clients (with mocked responses)
- Validation tests for input schemas

Run the full suite:

```bash
npm test
```

Run a specific test file:

```bash
npx vitest run src/generators/report-generator.test.ts
```
