import { describe, expect, it } from 'vitest';
import { parseExistingNames, parseLastExistingName, sortByReleaseDate } from './parse.js';
import type { NewDevice } from '../agent/schema.js';

const FILE_CONTENT = `import { Device } from "../types";

export const samsungDevices2026: Device[] = [
  {
    name: "Galaxy S26 Ultra",
    releaseDate: "02-25-2026",
    type: "phone",
    models: ["SM-S948B"],
  },
  {
    name: "Galaxy Tab S11 FE",
    releaseDate: "04-10-2026",
    type: "tablet",
    models: [],
  },
];
`;

describe('parseExistingNames', () => {
  it('extracts all names, lowercased', () => {
    expect(parseExistingNames(FILE_CONTENT)).toEqual(
      new Set(['galaxy s26 ultra', 'galaxy tab s11 fe']),
    );
  });

  it('strips a leading "Samsung " prefix case-insensitively', () => {
    const content = `name: "samsung Galaxy A57"`;
    expect(parseExistingNames(content)).toEqual(new Set(['galaxy a57']));
  });

  it('handles single-quoted and unquoted keys', () => {
    const content = `{ "name": 'Galaxy Watch 8' }`;
    expect(parseExistingNames(content)).toEqual(new Set(['galaxy watch 8']));
  });

  it('returns an empty set when no names are present', () => {
    expect(parseExistingNames('export const empty = [];')).toEqual(new Set());
  });
});

describe('parseLastExistingName', () => {
  it('returns the last name in file order, normalized', () => {
    expect(parseLastExistingName(FILE_CONTENT)).toBe('galaxy tab s11 fe');
  });

  it('returns null when the content has no names', () => {
    expect(parseLastExistingName('')).toBeNull();
  });
});

describe('sortByReleaseDate', () => {
  const device = (name: string, releaseDate: string): NewDevice => ({
    name,
    releaseDate,
    type: 'phone',
    models: [],
  });

  it('sorts MM-DD-YYYY dates oldest first', () => {
    const sorted = sortByReleaseDate([
      device('c', '11-05-2026'),
      device('a', '01-20-2026'),
      device('b', '01-03-2026'),
    ]);
    expect(sorted.map((d) => d.name)).toEqual(['b', 'a', 'c']);
  });

  it('sorts across year boundaries', () => {
    const sorted = sortByReleaseDate([device('new', '01-01-2026'), device('old', '12-31-2025')]);
    expect(sorted.map((d) => d.name)).toEqual(['old', 'new']);
  });

  it('does not mutate the input array', () => {
    const input = [device('b', '06-01-2026'), device('a', '05-01-2026')];
    const sorted = sortByReleaseDate(input);
    expect(input.map((d) => d.name)).toEqual(['b', 'a']);
    expect(sorted).not.toBe(input);
  });
});
