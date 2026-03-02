import 'dotenv/config';
import { Octokit } from '@octokit/rest';
import { PlaywrightMCPClient } from '../services/mcp.js';
import { fetchCurrentFile, createPR } from '../services/github.js';
import { appendToFile, buildNewFile } from '../utils/device.js';
import { sortByReleaseDate, parseExistingNames } from '../utils/parse.js';
import { GITHUB_TOKEN, ANTHROPIC_API_KEY, REPO_OWNER, REPO_NAME, TARGET_FILE_PATH, CURRENT_YEAR } from '../config.js';
import { runAgent } from './agent.js';

async function main(): Promise<void> {
  console.log(`\nSamsung Device Sync Agent — ${CURRENT_YEAR}`);
  console.log(`Target: ${REPO_OWNER}/${REPO_NAME}/${TARGET_FILE_PATH}\n`);

  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN environment variable is required.');
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY environment variable is required.');

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  console.log('Fetching current device file from GitHub...');
  const existing = await fetchCurrentFile(octokit);

  const existingNames = existing ? parseExistingNames(existing.content) : new Set<string>();

  if (existing) {
    console.log(`   Found existing file (sha: ${existing.sha.slice(0, 7)}) — ${existingNames.size} known device(s):`);
    Array.from(existingNames).forEach((name) => console.log(`     - ${name}`));
  } else {
    console.log('   No existing file — will create from scratch if new devices are found.');
  }

  console.log('\nStarting Playwright MCP server (headless Chromium)...');
  const mcp = new PlaywrightMCPClient();
  await mcp.initialize();
  console.log('   MCP server ready');

  let newDevices;

  try {
    newDevices = await runAgent(mcp, existing?.content ?? null);
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
