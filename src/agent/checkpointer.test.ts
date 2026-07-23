import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { FileCheckpointSaver } from './checkpointer.js';

describe('FileCheckpointSaver', () => {
  it('persists progress and resumes on a fresh instance without re-running completed nodes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ckpt-'));
    const file = join(dir, 'cp.json');

    try {
      const S = Annotation.Root({
        a: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),
        b: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),
      });

      let aRuns = 0;
      let failNext = true;
      const build = (saver: FileCheckpointSaver) =>
        new StateGraph(S)
          .addNode('nodeA', () => {
            aRuns += 1;
            return { a: 1 };
          })
          .addNode('nodeB', () => {
            if (failNext) {
              failNext = false;
              throw new Error('boom');
            }
            return { b: 2 };
          })
          .addEdge(START, 'nodeA')
          .addEdge('nodeA', 'nodeB')
          .addEdge('nodeB', END)
          .compile({ checkpointer: saver });

      const cfg = { configurable: { thread_id: 't1' } };

      // First run: nodeA succeeds and is checkpointed, nodeB throws.
      await expect(build(new FileCheckpointSaver(file)).invoke({}, cfg)).rejects.toThrow('boom');
      expect(aRuns).toBe(1);

      // A brand-new saver loads the checkpoint from disk (simulating a process restart) and
      // resumes: nodeB runs again and succeeds, nodeA is NOT re-executed.
      const resumed = build(new FileCheckpointSaver(file));
      const result = await resumed.invoke(null, cfg);
      expect(aRuns).toBe(1);
      expect(result).toMatchObject({ a: 1, b: 2 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
