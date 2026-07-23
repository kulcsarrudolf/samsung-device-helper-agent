import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cloneTargetRepo, formatWithTargetConfig } from './format.js';
import { TARGET_FILE_PATH, GENERATED_FILES } from '../config.js';

const execFileAsync = promisify(execFile);

export interface OutputFile {
  path: string;
  content: string;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Locate this package's `node_modules/.bin` by walking up from the compiled module. Works for both
 * `tsx src/...` (dir under the repo root) and `node dist/...` (dir under the Docker WORKDIR).
 */
function agentBinDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const bin = path.join(dir, 'node_modules', '.bin');
    if (existsSync(bin)) return bin;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not locate node_modules/.bin for tsx/prettier');
    dir = parent;
  }
}

/** Surface a subprocess failure with its captured output so validation errors are readable. */
async function run(bin: string, args: string[], cwd: string): Promise<void> {
  try {
    await execFileAsync(bin, args, { cwd });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = [e.stderr, e.stdout].filter(Boolean).join('\n').trim();
    const body = detail.length > 0 ? detail : (e.message ?? '');
    throw new Error(`Command failed: ${path.basename(bin)} ${args.join(' ')}\n${body}`.trim());
  }
}

/**
 * Regenerate the full set of files the PR must contain, using the target repo's own generator.
 *
 * The target's `scripts/generate-data.ts` derives `src/generated/*` from the aggregate device
 * list, so the derived modules must be regenerated whenever the per-year data changes, or the
 * target's CI (`git diff --exit-code src/generated`) rejects the PR. We shallow-clone the target
 * as a scratch tree, write the new per-year data file into it, run the target's own generator and
 * validator with this package's `tsx`/`prettier`, and read every file back.
 *
 * `scripts/validate-data.ts` mirrors the target's pre-commit and CI checks; a non-zero exit throws
 * here so a bad scrape fails the run instead of opening a broken PR.
 */
export async function regenerateTargetFiles(dataContent: string): Promise<OutputFile[]> {
  const binDir = agentBinDir();
  const tsx = path.join(binDir, 'tsx');
  const prettierBin = path.join(binDir, 'prettier');

  const tmp = await mkdtemp(path.join(tmpdir(), 'sdh-gen-'));
  try {
    console.log('\nCloning target repo to regenerate derived data...');
    await cloneTargetRepo(tmp);

    // Write the updated per-year data file and format it with the target's own Prettier config.
    const dataAbs = path.join(tmp, TARGET_FILE_PATH);
    await mkdir(path.dirname(dataAbs), { recursive: true });
    await writeFile(dataAbs, dataContent, 'utf-8');
    try {
      await formatWithTargetConfig(dataAbs);
    } catch (err: unknown) {
      // A visible, human-fixable PR beats aborting; Prettier drift is cosmetic, not correctness.
      console.warn(
        `   [generate] Prettier failed on data file, committing unformatted: ${message(err)}`,
      );
    }

    // Regenerate src/generated with the target's own generator, then format it exactly as the
    // target's `generate-data` npm script does (`&& prettier --write 'src/generated/**/*.ts'`).
    console.log('   Running target generate-data...');
    await run(tsx, [path.join(tmp, 'scripts', 'generate-data.ts')], tmp);
    await run(prettierBin, ['--write', 'src/generated/**/*.ts'], tmp);

    // Fail fast on malformed data, mirroring the target's pre-commit + CI.
    console.log('   Validating device data...');
    await run(tsx, [path.join(tmp, 'scripts', 'validate-data.ts')], tmp);

    const relPaths = [TARGET_FILE_PATH, ...GENERATED_FILES];
    const outputFiles = await Promise.all(
      relPaths.map(async (rel) => ({
        path: rel,
        content: await readFile(path.join(tmp, rel), 'utf-8'),
      })),
    );
    console.log(`   Prepared ${String(outputFiles.length)} file(s) for the PR.`);
    return outputFiles;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
