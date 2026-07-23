import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import * as prettier from 'prettier';
import { REPO_OWNER, REPO_NAME, GITHUB_TOKEN } from '../config.js';

const execFileAsync = promisify(execFile);

/**
 * Shallow-clone the target repo into `destDir`.
 *
 * The target files are committed through the GitHub API, so no persistent checkout exists; we
 * clone into a throwaway dir only to run the target's own generator and resolve its Prettier
 * config faithfully (config file form, `extends`, `.editorconfig`, plugins).
 *
 * Basic auth is what GitHub accepts for both classic and fine-grained tokens over git HTTPS.
 * The token is passed via an ephemeral header so it is never persisted in the clone's git config,
 * and is redacted from any error message before it can reach logs (git echoes the full command).
 */
export async function cloneTargetRepo(destDir: string): Promise<void> {
  const cloneUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;
  const basicAuth = Buffer.from(`x-access-token:${GITHUB_TOKEN}`).toString('base64');
  try {
    await execFileAsync('git', [
      '-c',
      `http.extraHeader=AUTHORIZATION: basic ${basicAuth}`,
      'clone',
      '--depth',
      '1',
      '--single-branch',
      cloneUrl,
      destDir,
    ]);
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(raw.split(basicAuth).join('***').split(GITHUB_TOKEN).join('***'));
  }
}

/**
 * Format a file in place using the Prettier configuration resolved from its own location inside
 * the cloned target tree. No-op when the path is Prettier-ignored. Throws on read/parse errors so
 * the caller can decide policy (e.g. warn and commit unformatted).
 */
export async function formatWithTargetConfig(absPath: string): Promise<void> {
  const info = await prettier.getFileInfo(absPath, { resolveConfig: true });
  if (info.ignored) return;
  const source = await readFile(absPath, 'utf-8');
  const options = await prettier.resolveConfig(absPath, { editorconfig: true });
  const formatted = await prettier.format(source, { ...options, filepath: absPath });
  await writeFile(absPath, formatted, 'utf-8');
}
