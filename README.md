# samsung-device-helper-agent

An agentic tool that automatically detects new Samsung devices on GSM Arena and opens a Pull Request to update the [`samsung-device-helper`](https://www.npmjs.com/package/samsung-device-helper) library.

## How it works

```
yarn sync
    │
    ├─ 1. Read current year's device file from GitHub
    │
    ├─ 2. Start Playwright MCP (headless Chromium)
    │
    ├─ 3. Claude agent checks GSM Arena
    │       ├─ Early exit: newest device already in file → done
    │       └─ New devices found → scrape name, date, type, models
    │
    ├─ 4. Sort new devices by release date
    │
    └─ 5. Commit updated file + open GitHub PR
```

Claude controls the browser via the [Playwright MCP](https://github.com/microsoft/playwright-mcp) server, communicating over JSON-RPC/stdio. The GitHub API (via Octokit) handles reading the existing file, creating a branch, committing the update, and opening the PR.

## Requirements

- Node.js 24+
- Yarn 4+

## Setup

```bash
yarn install
yarn init:env   # creates .env with placeholder values — replace them with your actual tokens
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | Yes | — | GitHub PAT with `repo` read/write access |
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key from [console.anthropic.com](https://console.anthropic.com) |
| `REPO_OWNER` | No | `kulcsarrudolf` | GitHub username of the target repo |
| `REPO_NAME` | No | `samsung-device-helper` | Target repository name |

## Usage

```bash
yarn sync
```

Tokens are loaded automatically from `.env`. To override inline:

```bash
GITHUB_TOKEN=... ANTHROPIC_API_KEY=... yarn sync
```

## Other scripts

```bash
yarn build          # Compile TypeScript to dist/
yarn typecheck      # Type-check without emitting
yarn lint           # Run ESLint
yarn lint:fix       # Run ESLint with auto-fix
yarn format         # Format with Prettier
yarn check          # Run typecheck + lint + format check
```

## Docker

```bash
docker compose up sync   # reads tokens from .env automatically
```
