export const CURRENT_YEAR = new Date().getFullYear();
export const TARGET_FILE_PATH = `src/data/samsung-devices-${CURRENT_YEAR}.ts`;
export const EXPORT_CONST_NAME = `samsungDevices${CURRENT_YEAR}`;

export const REPO_OWNER = process.env.REPO_OWNER || 'kulcsarrudolf';
export const REPO_NAME = process.env.REPO_NAME || 'samsung-device-helper';
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

export const GSM_ARENA_SAMSUNG_URL = 'https://www.gsmarena.com/samsung-phones-9.php#anchor';
