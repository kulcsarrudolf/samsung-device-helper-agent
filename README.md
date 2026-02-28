# samsung-device-helper-agent

A data validation tool that scrapes Samsung device data from GSMArena and compares it against the [`samsung-device-helper`](https://www.npmjs.com/package/samsung-device-helper) library to identify missing or new devices.

## What it does

1. **Scrape** — Fetches Samsung phone listings from GSMArena (device name, release date, model numbers)
2. **Compare** — Matches scraped devices against the `samsung-device-helper` library and reports which ones are missing

## Requirements

- Node.js 24+
- Yarn 4+

## Setup

```bash
yarn install
```

## Usage

### 1. Scrape devices from GSMArena

```bash
yarn scrape
```

Output is saved to `.output/` as JSON files.

**Optional environment variables:**

| Variable | Default | Description |
|---|---|---|
| `SCRAPER_PAGES` | `1` | Number of GSMArena listing pages to scrape |
| `SCRAPER_MAX_MODELS` | `8` | Max model numbers to extract per device |

Example:

```bash
SCRAPER_PAGES=3 yarn scrape
```

### 2. Compare against the library

```bash
yarn compare
```

Reads the scraped data from `.output/` and generates a report of devices missing from `samsung-device-helper`.

## Other scripts

```bash
yarn build          # Compile TypeScript to dist/
yarn typecheck      # Type-check without emitting
yarn lint           # Run ESLint
yarn lint:fix       # Run ESLint with auto-fix
yarn format         # Format with Prettier
yarn check          # Run typecheck + lint + format check
```
