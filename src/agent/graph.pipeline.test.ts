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
vi.mock('../services/github.js', () => ({
  fetchCurrentFile: vi.fn(),
  fetchPreviousYearFile: vi.fn(),
  createPR: vi.fn(),
}));
vi.mock('../services/format.js', () => ({
  formatForTarget: (content: string) => Promise.resolve(content),
}));

const { buildGraph } = await import('./graph.js');
const { runScrapeAgent } = await import('./scrape-agent.js');
const { fetchCurrentFile, fetchPreviousYearFile, createPR } = await import('../services/github.js');

const device = (name: string): NewDevice => ({
  name,
  releaseDate: '02-25-2026',
  type: 'phone',
  models: [],
});

const EXISTING_FILE = `import { Device } from '../types';\n\nexport const devices: Device[] = [\n];\n`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPreviousYearFile).mockResolvedValue(null);
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
