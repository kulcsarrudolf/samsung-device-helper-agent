import 'dotenv/config';
import { Octokit } from '@octokit/rest';
import { PlaywrightMCPClient } from '../services/mcp.js';
import { fetchCurrentFile, fetchPreviousYearFile, createPR } from '../services/github.js';
import { appendToFile, buildNewFile } from '../utils/device.js';
import { sortByReleaseDate, parseExistingNames, parseLastExistingName } from '../utils/parse.js';
import { GITHUB_TOKEN, ANTHROPIC_API_KEY, REPO_OWNER, REPO_NAME, TARGET_FILE_PATH, PREVIOUS_YEAR_FILE_PATH, CURRENT_YEAR } from '../config.js';
import { runAgent } from './agent.js';

async function main(): Promise<void> {
  console.log(`\nSamsung Device Sync Agent — ${CURRENT_YEAR}`);
  console.log(`Target: ${REPO_OWNER}/${REPO_NAME}/${TARGET_FILE_PATH}\n`);

  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN environment variable is required.');
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY environment variable is required.');

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  console.log('Fetching current device file from GitHub...');
  const existing = await fetchCurrentFile(octokit);

  // existingNames = current year only (used for hard dedup at the end)
  const existingNames = existing ? parseExistingNames(existing.content) : new Set<string>();
  let stopAtName: string | null = existing ? parseLastExistingName(existing.content) : null;

  if (existing) {
    console.log(`   Found existing file (sha: ${existing.sha.slice(0, 7)}) — ${existingNames.size} known device(s):`);
    Array.from(existingNames).forEach((name) => console.log(`     - ${name}`));
  } else {
    console.log(`   No ${CURRENT_YEAR} file found — will create from scratch.`);
  }

  // knownNames = current year + previous year (used by the agent for skip/early-exit).
  // We include previous year when: current year file is missing OR has fewer than 10 devices
  // (in both cases the GSM Arena top-10 listing will contain previous-year entries).
  const knownNames = new Set(existingNames);
  if (!existing || existingNames.size < 10) {
    console.log(`\nFetching previous year file (${PREVIOUS_YEAR_FILE_PATH})...`);
    const previousYear = await fetchPreviousYearFile(octokit);
    if (previousYear) {
      const prevNames = parseExistingNames(previousYear.content);
      prevNames.forEach((n) => knownNames.add(n));
      if (!existing) {
        stopAtName = parseLastExistingName(previousYear.content);
        console.log(`   Found previous year file (${prevNames.size} device(s)) — stop marker: "${stopAtName}"`);
      } else {
        console.log(`   Found previous year file — added ${prevNames.size} device(s) to known set for early-exit check.`);
      }
    } else {
      console.log(`   No previous year file found.`);
    }
  }

  console.log('\nStarting Playwright MCP server (headless Chromium)...');
  const mcp = new PlaywrightMCPClient();
  await mcp.initialize();
  console.log('   MCP server ready');

  let newDevices;

  try {
    newDevices = await runAgent(mcp, knownNames, stopAtName);
  } finally {
    mcp.close();
    console.log('\nPlaywright MCP server stopped');
  }

  // Hard deduplication — filter out anything already in the file,
  // regardless of what the agent reported.
  if (existingNames.size > 0) {
    const before = newDevices.length;
    newDevices = newDevices.filter((d) => !existingNames.has(d.name.replace(/^Samsung\s+/i, '').toLowerCase().trim()));
    const skipped = before - newDevices.length;
    if (skipped > 0) console.log(`   Skipped ${skipped} device(s) already in file.`);
  }

  console.log(`\nResult: ${newDevices.length} new device(s) to add`);

  if (newDevices.length === 0) {
    console.log('File is already up to date — no PR needed. Exiting.');
    return;
  }

  const sorted = sortByReleaseDate(newDevices);

  console.log('\nNew devices (sorted oldest → newest):');
  sorted.forEach((d) => console.log(`  + ${d.name} (${d.type}) — ${d.releaseDate}`));

  const updatedContent = existing ? appendToFile(existing.content, sorted) : buildNewFile(sorted);

  console.log('\nCreating GitHub Pull Request...');
  const prUrl = await createPR(octokit, updatedContent, existing?.sha ?? null, sorted);

  console.log(`\nDone! Pull Request opened: ${prUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
