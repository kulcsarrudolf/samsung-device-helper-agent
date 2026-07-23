import '../env.js';
import { buildGraph } from '../agent/graph.js';
import { CURRENT_YEAR, REPO_OWNER, REPO_NAME, TARGET_FILE_PATH } from '../config.js';

async function main(): Promise<void> {
  console.log(`\nSamsung Device Sync Agent: ${String(CURRENT_YEAR)}`);
  console.log(`Target: ${REPO_OWNER}/${REPO_NAME}/${TARGET_FILE_PATH}\n`);

  const graph = buildGraph();
  const result = await graph.invoke({});

  if (result.prUrl) {
    console.log(`\nDone! Pull Request opened: ${result.prUrl}`);
  } else {
    console.log('\nFile is already up to date. No PR needed. Exiting.');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
