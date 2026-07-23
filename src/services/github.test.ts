import { describe, expect, it, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { createPR, type CommitFile } from './github.js';
import type { NewDevice } from '../agent/schema.js';

/** Minimal Octokit stub recording the Git Data API calls createPR makes. */
function fakeOctokit() {
  const createBlob = vi.fn((args: { content: string }) =>
    Promise.resolve({ data: { sha: `blob-${args.content.slice(0, 6)}` } }),
  );
  const createTree = vi.fn((_args: { base_tree: string; tree: { path: string }[] }) =>
    Promise.resolve({ data: { sha: 'tree-sha' } }),
  );
  const createCommit = vi.fn((_args: { tree: string; parents: string[] }) =>
    Promise.resolve({ data: { sha: 'commit-sha' } }),
  );
  const createRef = vi.fn((_args: { sha: string }) => Promise.resolve({ data: {} }));
  const updateRef = vi.fn((_args: { sha: string; force: boolean }) =>
    Promise.resolve({ data: {} }),
  );
  const pullsCreate = vi.fn((_args: Record<string, unknown>) =>
    Promise.resolve({ data: { html_url: 'https://github.com/o/r/pull/7' } }),
  );

  const octokit = {
    repos: { get: vi.fn(() => Promise.resolve({ data: { default_branch: 'main' } })) },
    git: {
      getRef: vi.fn(() => Promise.resolve({ data: { object: { sha: 'base-commit' } } })),
      getCommit: vi.fn(() => Promise.resolve({ data: { tree: { sha: 'base-tree' } } })),
      createBlob,
      createTree,
      createCommit,
      createRef,
      updateRef,
    },
    pulls: { create: pullsCreate },
  };

  return {
    octokit: octokit as unknown as Octokit,
    spies: { createBlob, createTree, createCommit, createRef, updateRef, pullsCreate },
  };
}

const files: CommitFile[] = [
  { path: 'src/data/samsung-devices-2026.ts', content: 'export const a = [];' },
  { path: 'src/generated/phones.ts', content: 'export const phones = [];' },
  { path: 'src/generated/model-names.ts', content: 'export const modelNameGroups = [];' },
];

const devices: NewDevice[] = [
  { name: 'Galaxy S26', releaseDate: '02-25-2026', type: 'phone', models: [] },
];

describe('createPR', () => {
  it('commits every file as one commit via the Git Data API and opens a PR', async () => {
    const { octokit, spies } = fakeOctokit();

    const url = await createPR(octokit, files, devices);

    // One blob per file, tree layered on the base commit tree, one commit off the base commit.
    expect(spies.createBlob).toHaveBeenCalledTimes(files.length);
    expect(spies.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        base_tree: 'base-tree',
        tree: files.map((f): unknown => expect.objectContaining({ path: f.path, type: 'blob' })),
      }),
    );
    expect(spies.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ tree: 'tree-sha', parents: ['base-commit'] }),
    );

    // Branch ref points at the new commit; PR returns its URL.
    expect(spies.createRef).toHaveBeenCalledWith(expect.objectContaining({ sha: 'commit-sha' }));
    expect(url).toBe('https://github.com/o/r/pull/7');
  });

  it('force-updates the branch when it already exists (422)', async () => {
    const { octokit, spies } = fakeOctokit();
    spies.createRef.mockRejectedValueOnce(Object.assign(new Error('exists'), { status: 422 }));

    await createPR(octokit, files, devices);

    expect(spies.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ sha: 'commit-sha', force: true }),
    );
  });
});
