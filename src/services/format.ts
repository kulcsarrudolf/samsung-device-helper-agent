import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as prettier from 'prettier';
import { REPO_OWNER, REPO_NAME, GITHUB_TOKEN } from '../config.js';

const execFileAsync = promisify(execFile);

/**
 * Format generated file content with the *target repo's own* Prettier configuration.
 *
 * The target file is committed through the GitHub API, so no local checkout exists and the
 * target's own hooks never run. To resolve its Prettier config faithfully (config file form,
 * `extends`, `.editorconfig`, plugins), we shallow-clone the target into a temp dir, write the
 * content at its real path, and let Prettier resolve config from that tree.
 *
 * On any failure (git/network/plugin/parse) we log a loud warning and return the content
 * unchanged: a visible, human-fixable PR is preferable to a silent no-op.
 */
export async function formatForTarget(content: string, targetFilePath: string): Promise<string> {
  let tmp: string | null = null;
  try {
    tmp = await mkdtemp(path.join(tmpdir(), 'sdh-fmt-'));

    const cloneUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;
    // Basic auth is what GitHub accepts for both classic and fine-grained tokens over git HTTPS.
    // Pass it via an ephemeral header so the token is never persisted in the clone's git config.
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
        tmp,
      ]);
    } catch (err: unknown) {
      // Redact the token before rethrowing so it never reaches logs (git echoes the full command).
      const raw = err instanceof Error ? err.message : String(err);
      throw new Error(raw.split(basicAuth).join('***').split(GITHUB_TOKEN).join('***'));
    }

    const absPath = path.join(tmp, targetFilePath);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, content, 'utf-8');

    const info = await prettier.getFileInfo(absPath, { resolveConfig: true });
    if (info.ignored) return content;

    const options = await prettier.resolveConfig(absPath, { editorconfig: true });
    return await prettier.format(content, { ...options, filepath: absPath });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[format] Prettier formatting failed, committing UNFORMATTED: ${message}`);
    return content;
  } finally {
    if (tmp) {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
