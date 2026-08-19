import '../env.js';
import { buildGraph } from '../agent/graph.js';
import { createCheckpointer, syncThreadId } from '../agent/checkpointer.js';
import { parseDeviceLimit } from './args.js';
import {
  CURRENT_YEAR,
  REPO_OWNER,
  REPO_NAME,
  TARGET_FILE_PATH,
  DRY_RUN,
  LANGSMITH_TRACING,
} from '../config.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = DRY_RUN || args.includes('--dry-run');

  let deviceLimit: number | undefined;
  try {
    deviceLimit = parseDeviceLimit(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`\nSamsung Device Sync Agent: ${String(CURRENT_YEAR)}`);
  console.log(`Target: ${REPO_OWNER}/${REPO_NAME}/${TARGET_FILE_PATH}`);
  if (dryRun) console.log('Mode: DRY RUN (no PR will be created)');
  if (deviceLimit !== undefined) {
    console.log(`Limit: checking only the ${String(deviceLimit)} newest listing entries`);
  }
  if (LANGSMITH_TRACING) console.log('LangSmith tracing: enabled');
  console.log('');

  const checkpointer = createCheckpointer();
  const threadId = syncThreadId();
  const graph = buildGraph(checkpointer);

  const result = await graph.invoke(
    { dryRun, ...(deviceLimit !== undefined && { deviceLimit }) },
    { configurable: { thread_id: threadId } },
  );

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
