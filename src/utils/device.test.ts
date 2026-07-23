import { describe, expect, it } from 'vitest';
import { appendToFile, buildNewFile, formatDevice } from './device.js';
import type { NewDevice } from '../types.js';

const WATCH: NewDevice = {
  name: 'Galaxy Watch 9',
  releaseDate: '08-07-2026',
  type: 'watch',
  models: ['SM-R900', 'SM-R905'],
};

const PHONE: NewDevice = {
  name: 'Galaxy S26',
  releaseDate: '02-25-2026',
  type: 'phone',
  models: [],
};

describe('formatDevice', () => {
  it('renders every field with models one per line', () => {
    expect(formatDevice(WATCH)).toBe(`  {
    name: "Galaxy Watch 9",
    releaseDate: "08-07-2026",
    type: "watch",
    models: [
      "SM-R900",
      "SM-R905"
    ],
  }`);
  });

  it('renders an empty models array inline', () => {
    expect(formatDevice(PHONE)).toContain('models: [],');
  });
});

describe('appendToFile', () => {
  it('inserts new entries before the closing bracket', () => {
    const content = `export const devices = [
  {
    name: "Galaxy S25",
  },
];
`;
    const result = appendToFile(content, [PHONE]);
    expect(result).toContain('Galaxy S25');
    expect(result).toContain('Galaxy S26');
    expect(result.indexOf('Galaxy S25')).toBeLessThan(result.indexOf('Galaxy S26'));
    expect(result.trimEnd().endsWith('];')).toBe(true);
  });

  it('adds a separating comma only when the last entry lacks one', () => {
    const withComma = appendToFile('const d = [\n  { name: "X" },\n];', [PHONE]);
    const withoutComma = appendToFile('const d = [\n  { name: "X" }\n];', [PHONE]);
    expect(withComma).not.toContain(',,');
    expect(withoutComma).toContain('{ name: "X" },');
  });

  it('throws when the closing bracket is missing', () => {
    expect(() => appendToFile('const d = [', [PHONE])).toThrow(/closing/);
  });
});

describe('buildNewFile', () => {
  it('produces a complete device file for the current year', () => {
    const year = new Date().getFullYear();
    const result = buildNewFile([PHONE, WATCH]);
    expect(result).toContain(`export const samsungDevices${year}: Device[] = [`);
    expect(result).toContain('Galaxy S26');
    expect(result).toContain('Galaxy Watch 9');
    expect(result.endsWith('];\n')).toBe(true);
  });
});
