import { describe, expect, it } from 'vitest';
import { parseReleaseDate, parseModels, specToDevice, type RawSpec } from './spec.js';

const raw = (overrides: Partial<RawSpec>): RawSpec => ({
  name: 'Samsung Galaxy A18 4G',
  released: 'Released 2026, September 18',
  status: 'Available. Released 2026, September 18',
  models: 'SM-A185F, SM-A185F/DS, SM-A185M',
  ...overrides,
});

describe('parseReleaseDate', () => {
  it('parses a released date into MM-DD-YYYY', () => {
    expect(parseReleaseDate('Released 2026, October 07')).toBe('10-07-2026');
  });

  it('parses an expected release date', () => {
    expect(parseReleaseDate('Exp. release 2026, March 06')).toBe('03-06-2026');
  });

  it('defaults a missing day to 01', () => {
    expect(parseReleaseDate('Released 2026, October')).toBe('10-01-2026');
  });

  it('zero-pads a single-digit day', () => {
    expect(parseReleaseDate('Released 2026, October 7')).toBe('10-07-2026');
  });

  it('returns null for null or unparseable text', () => {
    expect(parseReleaseDate(null)).toBeNull();
    expect(parseReleaseDate('Coming soon')).toBeNull();
    expect(parseReleaseDate('Released 2026, Octembruary 07')).toBeNull();
  });
});

describe('parseModels', () => {
  it('splits the models row into trimmed codes, keeping variants', () => {
    expect(parseModels('SM-A185F, SM-A185F/DS, SM-A185M/DS')).toEqual([
      'SM-A185F',
      'SM-A185F/DS',
      'SM-A185M/DS',
    ]);
  });

  it('returns an empty array for a missing row', () => {
    expect(parseModels(null)).toEqual([]);
  });
});

describe('specToDevice', () => {
  it('builds a device, stripping the Samsung prefix', () => {
    expect(specToDevice(raw({}))).toEqual({
      name: 'Galaxy A18 4G',
      releaseDate: '09-18-2026',
      type: 'phone',
      models: ['SM-A185F', 'SM-A185F/DS', 'SM-A185M'],
    });
  });

  it('derives tablet and watch types from the name', () => {
    expect(specToDevice(raw({ name: 'Samsung Galaxy Tab S12 Ultra' }))?.type).toBe('tablet');
    expect(specToDevice(raw({ name: 'Samsung Galaxy Watch9' }))?.type).toBe('watch');
  });

  it('falls back to the status row when the released highlight is missing', () => {
    expect(specToDevice(raw({ released: null }))?.releaseDate).toBe('09-18-2026');
  });

  it('returns null without a usable name or date (agent fallback)', () => {
    expect(specToDevice(raw({ name: null }))).toBeNull();
    expect(specToDevice(raw({ released: null, status: null }))).toBeNull();
  });

  it('keeps a device with no model codes (deferred by the caller)', () => {
    expect(specToDevice(raw({ models: null }))?.models).toEqual([]);
  });
});
