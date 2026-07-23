import { describe, expect, it } from 'vitest';
import { DeviceSchema, ScrapeResultSchema } from './schema.js';

describe('DeviceSchema', () => {
  it('accepts a well-formed device', () => {
    const device = {
      name: 'Galaxy S26',
      releaseDate: '02-25-2026',
      type: 'phone',
      models: ['SM-S948B'],
    };
    expect(DeviceSchema.parse(device)).toEqual(device);
  });

  it('rejects a type outside the enum', () => {
    expect(() =>
      DeviceSchema.parse({ name: 'X', releaseDate: '01-01-2026', type: 'laptop', models: [] }),
    ).toThrow();
  });

  it('rejects a missing required field', () => {
    expect(() => DeviceSchema.parse({ name: 'X', type: 'phone', models: [] })).toThrow();
  });

  it('rejects non-string model entries', () => {
    expect(() =>
      DeviceSchema.parse({ name: 'X', releaseDate: '01-01-2026', type: 'phone', models: [123] }),
    ).toThrow();
  });
});

describe('ScrapeResultSchema', () => {
  it('parses a valid empty result', () => {
    const result = { upToDate: true, devices: [] };
    expect(ScrapeResultSchema.parse(result)).toEqual(result);
  });

  it('rejects a result containing a malformed device', () => {
    expect(() => ScrapeResultSchema.parse({ upToDate: false, devices: [{ name: 'X' }] })).toThrow();
  });
});
