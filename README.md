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

- Node.js 22+ (Docker image uses Node 24 LTS)
- Yarn 4 (via Corepack; pinned to 4.17.1 by the `packageManager` field)

## Setup

```bash
yarn install
yarn init:env   # creates .env from .env.example, or backfills any missing keys into an existing .env
```

## Environment variables

| Variable         | Required | Default                       | Description                                                                             |
| ---------------- | -------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`   | Yes      | (none)                        | GitHub PAT with `repo` read/write access                                                |
| `COMET_API_KEY`  | Yes      | (none)                        | API key from [cometapi.com](https://www.cometapi.com/) (single key for all models)      |
| `COMET_BASE_URL` | No       | `https://api.cometapi.com/v1` | OpenAI-compatible LLM endpoint; override to use another gateway                         |
| `LLM_MODEL`      | No       | `claude-haiku-4-5-20251001`   | Model id passed to the endpoint (any model Comet exposes)                               |
| `REPO_OWNER`     | No       | `kulcsarrudolf`               | GitHub username of the target repo                                                      |
| `REPO_NAME`      | No       | `samsung-device-helper`       | Target repository name                                                                  |
| `DRY_RUN`        | No       | `false`                       | When `true`, run the full pipeline but print the generated file instead of opening a PR |

### Generating the GitHub token

`GITHUB_TOKEN` is a Personal Access Token (PAT) the agent uses to read the device file, create a branch, commit, and open the PR. To create a classic PAT:

1. Open [github.com/settings/tokens](https://github.com/settings/tokens) (GitHub, then Settings, then Developer settings, then Personal access tokens, then Tokens (classic)).
2. Click **Generate new token**, then **Generate new token (classic)**.
3. Set a **Note** (e.g. `samsung-device-helper-agent`) and an **Expiration**.
4. Under **Select scopes**, check **`repo`** (full control of repositories; covers contents and pull requests).
5. Click **Generate token**, then copy it immediately (`ghp_...`). GitHub shows it only once.
6. Add it to your `.env` as `GITHUB_TOKEN=ghp_...`.

> Prefer a fine-grained token? Create one scoped to the target repository with **Contents: Read and write** and **Pull requests: Read and write** permissions instead.

## Usage

```bash
yarn sync
```

Tokens are loaded automatically from `.env`. To override inline:

```bash
GITHUB_TOKEN=... COMET_API_KEY=... yarn sync
```

Environment variables are loaded natively via `process.loadEnvFile()` (no dotenv dependency).
When no `.env` file exists, the process environment is used as-is, which is how Docker supplies them.

### Dry run

Run the full pipeline (fetch, scrape, build, format) without committing or opening a PR. The generated file is printed instead:

```bash
yarn sync --dry-run      # or: DRY_RUN=true yarn sync
```

### Resuming an interrupted run

The pipeline is a LangGraph `StateGraph` checkpointed to `.langgraph/checkpoints.json`. Each run uses a thread id that is stable within a calendar day. If a run fails partway (e.g. the GitHub PR step errors after scraping), re-running `yarn sync` the same day resumes from the failed step without re-scraping. A new day starts a fresh run.

## Other scripts

```bash
yarn build          # Compile TypeScript to dist/
yarn typecheck      # Type-check without emitting
yarn lint           # Run ESLint (type-aware, whole repo)
yarn lint:fix       # Run ESLint with auto-fix
yarn format         # Format with Prettier
yarn test           # Run unit tests (Vitest)
yarn test:watch     # Run tests in watch mode
yarn check          # Run typecheck + lint + format check + tests
```

## Git hooks

Hooks are managed by [Lefthook](https://github.com/evilmartians/lefthook) and installed automatically by `yarn install`.

- **pre-commit**: ESLint (auto-fix) and Prettier on staged files
- **pre-push**: full typecheck and test suite

## Docker

```bash
docker compose up sync   # reads tokens from .env automatically
```
