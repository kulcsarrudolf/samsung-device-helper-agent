import { describe, expect, it } from 'vitest';
import { selectNewDevices } from './scrape-agent.js';
import type { NewDevice, ScrapeResult } from './schema.js';

const CURRENT_YEAR = new Date().getFullYear();

const device = (name: string, releaseDate: string): NewDevice => ({
  name,
  releaseDate,
  type: 'phone',
  models: [],
});

describe('selectNewDevices', () => {
  it('returns an empty array when the agent reports upToDate', () => {
    const result: ScrapeResult = {
      upToDate: true,
      devices: [device('Galaxy S99', `01-01-${CURRENT_YEAR}`)],
    };
    expect(selectNewDevices(result)).toEqual([]);
  });

  it('keeps only devices released in the current year', () => {
    const result: ScrapeResult = {
      upToDate: false,
      devices: [
        device('Current A', `03-06-${CURRENT_YEAR}`),
        device('Last year', `12-31-${CURRENT_YEAR - 1}`),
        device('Current B', `11-20-${CURRENT_YEAR}`),
      ],
    };
    expect(selectNewDevices(result).map((d) => d.name)).toEqual(['Current A', 'Current B']);
  });

  it('returns an empty array when no devices qualify', () => {
    const result: ScrapeResult = { upToDate: false, devices: [] };
    expect(selectNewDevices(result)).toEqual([]);
  });
});
