import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NewDevice } from './schema.js';

// Mock the IO boundaries so the whole graph runs with no network, browser, or LLM.
vi.mock('./tools.js', () => ({
  createPlaywrightMcpClient: () => ({
    getTools: () => Promise.resolve([]),
    close: () => Promise.resolve(),
  }),
}));
vi.mock('./scrape-agent.js', () => ({ runScrapeAgent: vi.fn() }));
vi.mock('../services/listing.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/listing.js')>()),
  fetchListingEntries: vi.fn(),
}));
vi.mock('../services/spec.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/spec.js')>()),
  extractDeviceSpecs: vi.fn(),
}));
vi.mock('../services/github.js', () => ({
  fetchCurrentFile: vi.fn(),
  fetchPreviousYearFile: vi.fn(),
  createPR: vi.fn(),
}));
vi.mock('../services/generate.js', () => ({
  regenerateTargetFiles: (content: string) =>
    Promise.resolve([{ path: 'src/data/samsung-devices-2026.ts', content }]),
}));

const { buildGraph } = await import('./graph.js');
const { runScrapeAgent } = await import('./scrape-agent.js');
const { fetchListingEntries } = await import('../services/listing.js');
const { extractDeviceSpecs } = await import('../services/spec.js');
const { fetchCurrentFile, fetchPreviousYearFile, createPR } = await import('../services/github.js');

const device = (name: string): NewDevice => ({
  name,
  releaseDate: '02-25-2026',
  type: 'phone',
  models: [],
});

const EXISTING_FILE = `import { Device } from '../types';\n\nexport const devices: Device[] = [\n];\n`;

const S26_ENTRY = { name: 'Galaxy S26', url: 'https://www.gsmarena.com/samsung_galaxy_s26.php' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPreviousYearFile).mockResolvedValue(null);
  // The deterministic listing diff must find a candidate, or extraction is skipped.
  vi.mocked(fetchListingEntries).mockResolvedValue([S26_ENTRY]);
  // Default: deterministic extraction cannot parse the page, so the agent fallback runs.
  vi.mocked(extractDeviceSpecs).mockResolvedValue({
    devices: [],
    deferred: [],
    fallback: [S26_ENTRY],
  });
});

describe('sync graph pipeline', () => {
  it('opens a PR when the agent finds new devices', async () => {
    vi.mocked(fetchCurrentFile).mockResolvedValue({ content: EXISTING_FILE, sha: 'abc1234' });
    vi.mocked(runScrapeAgent).mockResolvedValue([device('Galaxy S26')]);
    vi.mocked(createPR).mockResolvedValue('https://github.com/owner/repo/pull/1');

    const result = await buildGraph().invoke({ dryRun: false });

    expect(runScrapeAgent).toHaveBeenCalledOnce();
    expect(createPR).toHaveBeenCalledOnce();
    expect(result.prUrl).toBe('https://github.com/owner/repo/pull/1');
  });

  it('opens a PR from deterministic extraction without calling the agent', async () => {
    vi.mocked(fetchCurrentFile).mockResolvedValue({ content: EXISTING_FILE, sha: 'abc1234' });
    vi.mocked(extractDeviceSpecs).mockResolvedValue({
      devices: [{ ...device('Galaxy S26'), models: ['SM-S941B'] }],
      deferred: [],
      fallback: [],
    });
    vi.mocked(createPR).mockResolvedValue('https://github.com/owner/repo/pull/2');

    const result = await buildGraph().invoke({ dryRun: false });

    expect(runScrapeAgent).not.toHaveBeenCalled();
    expect(createPR).toHaveBeenCalledOnce();
    expect(result.prUrl).toBe('https://github.com/owner/repo/pull/2');
  });

  it('skips the agent entirely when the listing has no unknown devices', async () => {
    const fileWithS26 = `import { Device } from '../types';\n\nexport const devices: Device[] = [\n  {\n    name: 'Galaxy S26',\n  },\n];\n`;
    vi.mocked(fetchCurrentFile).mockResolvedValue({ content: fileWithS26, sha: 'abc1234' });

    const result = await buildGraph().invoke({ dryRun: false });

    expect(runScrapeAgent).not.toHaveBeenCalled();
    expect(createPR).not.toHaveBeenCalled();
    expect(result.prUrl).toBeNull();
  });

  it('ends without a PR when the agent reports nothing new', async () => {
    vi.mocked(fetchCurrentFile).mockResolvedValue({ content: EXISTING_FILE, sha: 'abc1234' });
    vi.mocked(runScrapeAgent).mockResolvedValue([]);

    const result = await buildGraph().invoke({ dryRun: false });

    expect(createPR).not.toHaveBeenCalled();
    expect(result.prUrl).toBeNull();
  });

  it('does not open a PR in dry-run mode even when devices are found', async () => {
    vi.mocked(fetchCurrentFile).mockResolvedValue({ content: EXISTING_FILE, sha: 'abc1234' });
    vi.mocked(runScrapeAgent).mockResolvedValue([device('Galaxy S26')]);

    const result = await buildGraph().invoke({ dryRun: true });

    expect(createPR).not.toHaveBeenCalled();
    expect(result.prUrl).toBeNull();
  });
});
