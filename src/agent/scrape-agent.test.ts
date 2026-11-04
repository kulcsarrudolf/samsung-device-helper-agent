import { describe, expect, it } from 'vitest';
import { selectNewDevices, selectDeferredDevices } from './scrape-agent.js';
import type { NewDevice, ScrapeResult } from './schema.js';

const CURRENT_YEAR = new Date().getFullYear();

const device = (name: string, releaseDate: string, models: string[] = ['SM-X000']): NewDevice => ({
  name,
  releaseDate,
  type: 'phone',
  models,
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

  it('drops devices without model codes (target validation rejects them)', () => {
    const result: ScrapeResult = {
      upToDate: false,
      devices: [
        device('Has models', `10-07-${CURRENT_YEAR}`),
        device('No models yet', `10-20-${CURRENT_YEAR}`, []),
      ],
    };
    expect(selectNewDevices(result).map((d) => d.name)).toEqual(['Has models']);
  });

  it('returns an empty array when no devices qualify', () => {
    const result: ScrapeResult = { upToDate: false, devices: [] };
    expect(selectNewDevices(result)).toEqual([]);
  });
});

describe('selectDeferredDevices', () => {
  it('returns only current-year devices that are missing model codes', () => {
    const result: ScrapeResult = {
      upToDate: false,
      devices: [
        device('Has models', `10-07-${CURRENT_YEAR}`),
        device('No models yet', `10-20-${CURRENT_YEAR}`, []),
        device('Old and empty', `12-31-${CURRENT_YEAR - 1}`, []),
      ],
    };
    expect(selectDeferredDevices(result).map((d) => d.name)).toEqual(['No models yet']);
  });
});
