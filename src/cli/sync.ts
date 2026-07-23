import '../env.js';
import { buildGraph } from '../agent/graph.js';
import { createCheckpointer, syncThreadId } from '../agent/checkpointer.js';
import { CURRENT_YEAR, REPO_OWNER, REPO_NAME, TARGET_FILE_PATH, DRY_RUN } from '../config.js';

async function main(): Promise<void> {
  const dryRun = DRY_RUN || process.argv.includes('--dry-run');

  console.log(`\nSamsung Device Sync Agent: ${String(CURRENT_YEAR)}`);
  console.log(`Target: ${REPO_OWNER}/${REPO_NAME}/${TARGET_FILE_PATH}`);
  if (dryRun) console.log('Mode: DRY RUN (no PR will be created)');
  console.log('');

  const checkpointer = createCheckpointer();
  const threadId = syncThreadId();
  const graph = buildGraph(checkpointer);

  const result = await graph.invoke({ dryRun }, { configurable: { thread_id: threadId } });

  if (result.prUrl) {
    console.log(`\nDone! Pull Request opened: ${result.prUrl}`);
  } else if (dryRun) {
    console.log('\nDry run complete. No PR created.');
  } else {
    console.log('\nFile is already up to date. No PR needed. Exiting.');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
