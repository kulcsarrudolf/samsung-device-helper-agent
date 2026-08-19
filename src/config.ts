export const CURRENT_YEAR = new Date().getFullYear();

/** How many of the newest GSM Arena listing entries the agent checks by default. */
export const DEFAULT_DEVICE_LIMIT = 10;
export const TARGET_FILE_PATH = `src/data/samsung-devices-${CURRENT_YEAR}.ts`;
export const PREVIOUS_YEAR_FILE_PATH = `src/data/samsung-devices-${CURRENT_YEAR - 1}.ts`;
export const EXPORT_CONST_NAME = `samsungDevices${CURRENT_YEAR}`;

/**
 * Derived data modules the target repo commits alongside the per-year data file. They are
 * produced from the data by the target's `scripts/generate-data.ts` and must be regenerated
 * and included in every PR, or the target's CI (`git diff --exit-code src/generated`) fails.
 */
export const GENERATED_FILES = [
  'src/generated/phones.ts',
  'src/generated/tablets.ts',
  'src/generated/watches.ts',
  'src/generated/model-names.ts',
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const REPO_OWNER = process.env.REPO_OWNER ?? 'kulcsarrudolf';
export const REPO_NAME = process.env.REPO_NAME ?? 'samsung-device-helper';
export const GITHUB_TOKEN = requireEnv('GITHUB_TOKEN');
export const COMET_API_KEY = requireEnv('COMET_API_KEY');
export const COMET_BASE_URL = process.env.COMET_BASE_URL ?? 'https://api.cometapi.com/v1';
export const LLM_MODEL = process.env.LLM_MODEL ?? 'claude-haiku-4-5-20251001';
export const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

// LangChain/LangGraph read the LANGSMITH_* env vars directly; this is only used for a startup log.
export const LANGSMITH_TRACING = process.env.LANGSMITH_TRACING === 'true';

export const GSM_ARENA_SAMSUNG_URL = 'https://www.gsmarena.com/samsung-phones-9.php#anchor';
