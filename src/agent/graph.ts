import {
  StateGraph,
  START,
  END,
  type BaseCheckpointSaver,
  type RetryPolicy,
} from '@langchain/langgraph';
import { Octokit } from '@octokit/rest';
import { SyncState, type SyncStateType } from './state.js';
import { createPlaywrightMcpClient } from './tools.js';
import { runScrapeAgent } from './scrape-agent.js';
import { fetchCurrentFile, fetchPreviousYearFile, createPR } from '../services/github.js';
import { regenerateTargetFiles } from '../services/generate.js';
import { appendToFile, buildNewFile } from '../domain/device.js';
import {
  sortByReleaseDate,
  parseExistingNames,
  parseLastExistingName,
  normalizeName,
} from '../domain/parse.js';
import { fetchListingEntries, selectNewEntries } from '../services/listing.js';
import { extractDeviceSpecs } from '../services/spec.js';
import type { NewDevice } from './schema.js';
import { GITHUB_TOKEN, CURRENT_YEAR, PREVIOUS_YEAR_FILE_PATH } from '../config.js';

/** Fetch the current-year file from the target repo and derive existing names + stop marker. */
async function fetchExisting(): Promise<Partial<SyncStateType>> {
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  console.log('Fetching current device file from GitHub...');
  const existing = await fetchCurrentFile(octokit);

  if (!existing) {
    console.log(`   No ${String(CURRENT_YEAR)} file found. Will create from scratch.`);
    return { existingContent: null, existingSha: null, existingNames: [], stopAtName: null };
  }

  const existingNames = [...parseExistingNames(existing.content)];
  console.log(
    `   Found existing file (sha: ${existing.sha.slice(0, 7)}), ${String(existingNames.length)} known device(s).`,
  );
  return {
    existingContent: existing.content,
    existingSha: existing.sha,
    existingNames,
    stopAtName: parseLastExistingName(existing.content),
  };
}

/**
 * Build the set of names the agent treats as known. Includes the previous-year file when the
 * current-year file is missing or has fewer than deviceLimit devices (the checked top of the
 * GSM Arena listing will then contain previous-year entries).
 */
async function resolveKnownNames(state: SyncStateType): Promise<Partial<SyncStateType>> {
  const hasExisting = state.existingContent !== null;
  const knownNames = new Set(state.existingNames);
  let stopAtName = state.stopAtName;

  if (!hasExisting || state.existingNames.length < state.deviceLimit) {
    console.log(`\nFetching previous year file (${PREVIOUS_YEAR_FILE_PATH})...`);
    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const previousYear = await fetchPreviousYearFile(octokit);
    if (previousYear) {
      const prevNames = parseExistingNames(previousYear.content);
      prevNames.forEach((n) => knownNames.add(n));
      if (!hasExisting) {
        stopAtName = parseLastExistingName(previousYear.content);
        console.log(
          `   Found previous year file (${String(prevNames.size)} device(s)), stop marker: "${stopAtName ?? ''}"`,
        );
      } else {
        console.log(
          `   Found previous year file, added ${String(prevNames.size)} device(s) to known set.`,
        );
      }
    } else {
      console.log(`   No previous year file found.`);
    }
  }

  return { knownNames: [...knownNames], stopAtName };
}

/**
 * Detect and extract new devices deterministically; the agent is a fallback only.
 * The listing diff (which of the newest entries are missing from our file) is pure string
 * matching, and the spec fields sit behind stable data-spec attributes, so both run in
 * code. The LLM is called only for pages the deterministic extraction cannot parse, so a
 * normal sync, up to date or not, spends no API credits at all.
 */
async function scrape(state: SyncStateType): Promise<Partial<SyncStateType>> {
  console.log('\nStarting Playwright MCP server (headless Chromium)...');
  const mcpClient = createPlaywrightMcpClient();
  try {
    const tools = await mcpClient.getTools();
    console.log('   MCP server ready');

    console.log('\nReading the GSM Arena listing...');
    const entries = await fetchListingEntries(tools);
    const candidates = selectNewEntries(
      entries,
      new Set(state.knownNames),
      state.stopAtName,
      state.deviceLimit,
    );
    console.log(
      `   ${String(entries.length)} entries; ${String(candidates.length)} new within the first ${String(state.deviceLimit)}.`,
    );

    if (candidates.length === 0) {
      console.log('   All checked devices are already known. Nothing to extract (no LLM calls).');
      return { newDevices: [] };
    }
    candidates.forEach((c) => {
      console.log(`   ? ${c.name}`);
    });

    console.log('\nExtracting spec pages deterministically...');
    const { devices, deferred, fallback } = await extractDeviceSpecs(tools, candidates);
    devices.forEach((d) => {
      console.log(
        `   + ${d.name} (${d.type}) ${d.releaseDate} ${String(d.models.length)} model(s)`,
      );
    });
    deferred.forEach((d) => {
      console.log(
        `   ~ ${d.name}: no model codes on GSM Arena yet; deferred until a future sync finds them.`,
      );
    });

    let agentDevices: NewDevice[] = [];
    if (fallback.length > 0) {
      console.log(
        `   ${String(fallback.length)} page(s) resisted deterministic extraction; falling back to the agent.`,
      );
      agentDevices = await runScrapeAgent(tools, fallback);
    }

    const currentYear = String(CURRENT_YEAR);
    const newDevices = [
      ...devices.filter((d) => d.releaseDate.endsWith(currentYear)),
      ...agentDevices,
    ];
    return { newDevices };
  } finally {
    await mcpClient.close();
    console.log('\nPlaywright MCP server stopped');
  }
}

/** Drop anything the agent reported that is already in the current-year file. */
function hardDedup(state: SyncStateType): Partial<SyncStateType> {
  if (state.existingNames.length === 0) return { newDevices: state.newDevices };
  const existing = new Set(state.existingNames);
  const before = state.newDevices.length;
  const newDevices = state.newDevices.filter((d) => !existing.has(normalizeName(d.name)));
  const skipped = before - newDevices.length;
  if (skipped > 0) console.log(`   Skipped ${String(skipped)} device(s) already in file.`);
  console.log(`\nResult: ${String(newDevices.length)} new device(s) to add`);
  return { newDevices };
}

/** Sort the surviving devices oldest to newest. */
function sort(state: SyncStateType): Partial<SyncStateType> {
  const sorted = sortByReleaseDate(state.newDevices);
  console.log('\nNew devices (sorted oldest to newest):');
  sorted.forEach((d) => {
    console.log(`  + ${d.name} (${d.type}): ${d.releaseDate}`);
  });
  return { sorted };
}

/** Generate the updated file content (append to existing, or build a fresh file). */
function buildContent(state: SyncStateType): Partial<SyncStateType> {
  const content =
    state.existingContent !== null
      ? appendToFile(state.existingContent, state.sorted)
      : buildNewFile(state.sorted);
  return { content };
}

/**
 * Regenerate the full set of files the PR must contain: the per-year data file plus the target's
 * derived `src/generated/*` modules, formatted and validated with the target's own tooling.
 */
async function generate(state: SyncStateType): Promise<Partial<SyncStateType>> {
  const outputFiles = await regenerateTargetFiles(state.content);
  return { outputFiles };
}

/** Commit the files and open the PR, unless running in dry-run mode. */
async function publish(state: SyncStateType): Promise<Partial<SyncStateType>> {
  if (state.dryRun) {
    console.log('\n[dry-run] Skipping PR creation. Files that would be committed:');
    for (const file of state.outputFiles) {
      console.log(`\n----- ${file.path} -----`);
      console.log(file.content);
    }
    console.log(
      `\n[dry-run] Would open a PR committing ${String(state.outputFiles.length)} file(s) for ${String(state.sorted.length)} device(s).`,
    );
    return { prUrl: null };
  }

  console.log('\nCreating GitHub Pull Request...');
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const prUrl = await createPR(octokit, state.outputFiles, state.sorted);
  return { prUrl };
}

/** Route to END when there is nothing to add, otherwise continue to publishing. */
function hasNewDevices(state: SyncStateType): typeof END | 'sort' {
  return state.newDevices.length === 0 ? END : 'sort';
}

export {
  fetchExisting,
  resolveKnownNames,
  scrape,
  hardDedup,
  sort,
  buildContent,
  generate,
  publish,
};

// Retry transient failures on the network-bound nodes (GitHub reads, target-repo clone, PR).
const NETWORK_RETRY: RetryPolicy = { maxAttempts: 3 };

/**
 * Build and compile the sync pipeline graph. Pass a checkpointer to make the run resumable
 * across restarts; omit it (e.g. in tests) for a one-shot, in-memory run.
 */
export function buildGraph(checkpointer?: BaseCheckpointSaver) {
  return new StateGraph(SyncState)
    .addNode('fetchExisting', fetchExisting, { retryPolicy: NETWORK_RETRY })
    .addNode('resolveKnownNames', resolveKnownNames, { retryPolicy: NETWORK_RETRY })
    .addNode('scrape', scrape)
    .addNode('hardDedup', hardDedup)
    .addNode('sort', sort)
    .addNode('buildContent', buildContent)
    .addNode('generate', generate, { retryPolicy: NETWORK_RETRY })
    .addNode('publish', publish, { retryPolicy: NETWORK_RETRY })
    .addEdge(START, 'fetchExisting')
    .addEdge('fetchExisting', 'resolveKnownNames')
    .addEdge('resolveKnownNames', 'scrape')
    .addEdge('scrape', 'hardDedup')
    .addConditionalEdges('hardDedup', hasNewDevices, { sort: 'sort', [END]: END })
    .addEdge('sort', 'buildContent')
    .addEdge('buildContent', 'generate')
    .addEdge('generate', 'publish')
    .addEdge('publish', END)
    .compile(checkpointer ? { checkpointer } : undefined);
}
