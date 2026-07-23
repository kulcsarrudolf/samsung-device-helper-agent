# samsung-device-helper-agent

An agentic tool that automatically detects new Samsung devices on GSM Arena and opens a Pull Request to update the [`samsung-device-helper`](https://www.npmjs.com/package/samsung-device-helper) library.

## How it works

`yarn sync` runs a [LangGraph](https://langchain-ai.github.io/langgraphjs/) `StateGraph` pipeline:

```
START
  -> fetchExisting        read current year's device file from GitHub
  -> resolveKnownNames    add previous-year names when needed (early-exit check)
  -> scrape               LangChain agent drives GSM Arena, returns structured devices
  -> hardDedup            drop devices already in the file
        |
        +-- no new devices --> END
        |
  -> sort                 order new devices by release date
  -> buildContent         generate the updated TypeScript file
  -> format               apply the target repo's own Prettier config
  -> publish              commit + open a GitHub PR (skipped in --dry-run)
  -> END
```

The **scrape** node is a LangChain agent (`createAgent`) that talks to Claude through [CometAPI](https://www.cometapi.com/) (an OpenAI-compatible gateway) via `ChatOpenAI`, and drives a headless Chromium browser through [Playwright MCP](https://github.com/microsoft/playwright-mcp) tools loaded by [`@langchain/mcp-adapters`](https://www.npmjs.com/package/@langchain/mcp-adapters). It returns structured output (the new devices, or a signal that the file is already up to date) instead of free-form text. The GitHub API (via Octokit) handles reading the existing file, committing, and opening the PR.

The run is checkpointed to `.langgraph/` so it can resume after a failure without re-scraping (see [Resuming an interrupted run](#resuming-an-interrupted-run)).

## Project structure

```
src/
├── cli/sync.ts        Entry point: resolve flags, build + invoke the graph
├── agent/
│   ├── graph.ts       The StateGraph pipeline (nodes + wiring)
│   ├── state.ts       Graph state channels
│   ├── scrape-agent.ts  createAgent scraping agent + result mapping
│   ├── model.ts       ChatOpenAI factory (CometAPI)
│   ├── tools.ts       Playwright MCP client (via @langchain/mcp-adapters)
│   ├── prompts.ts     System + user prompts
│   ├── middleware.ts  Tool-output truncation
│   ├── schema.ts      Zod device schema (single source of truth)
│   └── checkpointer.ts  File-based checkpoint saver
├── services/          GitHub (Octokit) and target-repo formatting
├── domain/            Device-file generation and parsing (pure)
└── config.ts          Env-derived configuration
```

## Requirements

- Node.js 22+ (Docker image uses Node 24 LTS)
- Yarn 4 (via Corepack; pinned to 4.17.1 by the `packageManager` field)

## Setup

```bash
yarn install
yarn init:env   # creates .env from .env.example, or backfills any missing keys into an existing .env
```

## Environment variables

| Variable            | Required | Default                       | Description                                                                                                    |
| ------------------- | -------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`      | Yes      | (none)                        | GitHub PAT with `repo` read/write access                                                                       |
| `COMET_API_KEY`     | Yes      | (none)                        | API key from [cometapi.com](https://www.cometapi.com/) (single key for all models)                             |
| `COMET_BASE_URL`    | No       | `https://api.cometapi.com/v1` | OpenAI-compatible LLM endpoint; override to use another gateway                                                |
| `LLM_MODEL`         | No       | `claude-haiku-4-5-20251001`   | Model id passed to the endpoint (any model Comet exposes)                                                      |
| `REPO_OWNER`        | No       | `kulcsarrudolf`               | GitHub username of the target repo                                                                             |
| `REPO_NAME`         | No       | `samsung-device-helper`       | Target repository name                                                                                         |
| `DRY_RUN`           | No       | `false`                       | When `true`, run the full pipeline but print the generated file instead of opening a PR                        |
| `LANGSMITH_TRACING` | No       | (unset)                       | Set to `true` to send run traces to [LangSmith](https://smith.langchain.com/) (also needs `LANGSMITH_API_KEY`) |
| `LANGSMITH_API_KEY` | No       | (unset)                       | LangSmith API key; only used when `LANGSMITH_TRACING=true`                                                     |
| `LANGSMITH_PROJECT` | No       | `default`                     | LangSmith project name for the traces                                                                          |

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

### Tracing (optional)

LangChain and LangGraph emit traces to [LangSmith](https://smith.langchain.com/) automatically when the standard env vars are set. Tracing is off by default and adds nothing when unset. To enable it, add to your `.env`:

```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=samsung-device-helper-agent   # optional
```

The next `yarn sync` sends a full trace of the agent's model calls and tool use to your LangSmith project.

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
