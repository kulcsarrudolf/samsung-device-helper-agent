import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MemorySaver } from '@langchain/langgraph';
import { CURRENT_YEAR } from '../config.js';

const CHECKPOINT_DIR = '.langgraph';
const CHECKPOINT_FILE = join(CHECKPOINT_DIR, 'checkpoints.json');

// MemorySaver stores serialized checkpoints as Uint8Array leaves, which JSON cannot hold.
// We tag them as base64 on the way out and rebuild them on the way in.
const U8_TAG = '__u8b64__';

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { [U8_TAG]: Buffer.from(value).toString('base64') };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && U8_TAG in value) {
    const b64 = (value as Record<string, unknown>)[U8_TAG];
    if (typeof b64 === 'string') return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  return value;
}

/**
 * A checkpoint saver that persists MemorySaver's in-memory maps to a JSON file so a graph run
 * resumes across process restarts. It reuses all of MemorySaver's checkpoint logic (versioning,
 * pending writes, prototype-pollution guards) and only adds load-on-construct plus save-after-write.
 *
 * Adequate for this single-process CLI: there is one writer, so no locking is needed. Backed by
 * node:fs, so there is no native or experimental dependency (works on Node >=22 and in the slim
 * Docker image without a toolchain).
 */
export class FileCheckpointSaver extends MemorySaver {
  readonly #filePath: string;

  constructor(filePath: string) {
    super();
    this.#filePath = filePath;
    this.#load();
  }

  #load(): void {
    if (!existsSync(this.#filePath)) return;
    const raw = readFileSync(this.#filePath, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw, reviver) as {
      storage?: MemorySaver['storage'];
      writes?: MemorySaver['writes'];
    };
    if (parsed.storage) this.storage = parsed.storage;
    if (parsed.writes) this.writes = parsed.writes;
  }

  #save(): void {
    mkdirSync(dirname(this.#filePath), { recursive: true });
    writeFileSync(
      this.#filePath,
      JSON.stringify({ storage: this.storage, writes: this.writes }, replacer),
    );
  }

  override async put(...args: Parameters<MemorySaver['put']>): Promise<RunnableConfigResult> {
    const result = await super.put(...args);
    this.#save();
    return result;
  }

  override async putWrites(...args: Parameters<MemorySaver['putWrites']>): Promise<void> {
    await super.putWrites(...args);
    this.#save();
  }

  override async deleteThread(threadId: string): Promise<void> {
    await super.deleteThread(threadId);
    this.#save();
  }
}

type RunnableConfigResult = Awaited<ReturnType<MemorySaver['put']>>;

/** Create the file-backed checkpointer at the default location. */
export function createCheckpointer(): FileCheckpointSaver {
  return new FileCheckpointSaver(CHECKPOINT_FILE);
}

/**
 * Stable thread id for a sync run. Stable within a calendar day so an interrupted run resumes
 * on re-run (e.g. after a GitHub failure) without re-scraping; a new day starts a fresh thread.
 */
export function syncThreadId(): string {
  const date = new Date().toISOString().split('T')[0] ?? 'unknown';
  return `sync-${String(CURRENT_YEAR)}-${date}`;
}
