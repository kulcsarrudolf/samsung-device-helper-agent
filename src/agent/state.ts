import { Annotation } from '@langchain/langgraph';
import type { NewDevice } from './schema.js';

/**
 * Pipeline state for the sync graph. Every channel is JSON-serializable (plain strings,
 * arrays, and NewDevice objects) so the graph can be checkpointed to SQLite in a later PR.
 * Device-name sets are kept as string[] for that reason; nodes convert to Set locally when
 * they need fast lookups.
 *
 * Non-serializable clients (Octokit, the MCP client) are intentionally NOT stored in state.
 * The nodes that need them construct them locally.
 */
export const SyncState = Annotation.Root({
  /** Raw content of the current-year file in the target repo, or null when it does not exist. */
  existingContent: Annotation<string | null>({ reducer: (_p, n) => n, default: () => null }),
  /** Blob SHA of the current-year file (needed to update it), or null. */
  existingSha: Annotation<string | null>({ reducer: (_p, n) => n, default: () => null }),
  /** Normalized names already in the current-year file (used for hard dedup). */
  existingNames: Annotation<string[]>({ reducer: (_p, n) => n, default: () => [] }),
  /** Names the agent should treat as known (current year + previous year for early-exit). */
  knownNames: Annotation<string[]>({ reducer: (_p, n) => n, default: () => [] }),
  /** Name at which the agent should stop scrolling further back, or null. */
  stopAtName: Annotation<string | null>({ reducer: (_p, n) => n, default: () => null }),
  /** Devices reported by the agent (pre hard-dedup). */
  newDevices: Annotation<NewDevice[]>({ reducer: (_p, n) => n, default: () => [] }),
  /** Devices to add, sorted oldest to newest. */
  sorted: Annotation<NewDevice[]>({ reducer: (_p, n) => n, default: () => [] }),
  /** Generated (and later formatted) content of the per-year data file. */
  content: Annotation<string>({ reducer: (_p, n) => n, default: () => '' }),
  /**
   * Every file the PR must commit: the per-year data file plus the regenerated `src/generated/*`
   * modules, each as `{ path, content }`. Populated by the `generate` node.
   */
  outputFiles: Annotation<{ path: string; content: string }[]>({
    reducer: (_p, n) => n,
    default: () => [],
  }),
  /** URL of the opened PR, or null when nothing was published. */
  prUrl: Annotation<string | null>({ reducer: (_p, n) => n, default: () => null }),
  /** When true, the publish node prints the generated file instead of opening a PR. */
  dryRun: Annotation<boolean>({ reducer: (_p, n) => n, default: () => false }),
});

export type SyncStateType = typeof SyncState.State;
