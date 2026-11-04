import { describe, expect, it } from 'vitest';
import { parseListingResult, selectNewEntries, type ListingEntry } from './listing.js';

const entry = (name: string): ListingEntry => ({
  name,
  url: `https://www.gsmarena.com/${name.toLowerCase().replaceAll(' ', '_')}.php`,
});

describe('parseListingResult', () => {
  it('parses the JSON under the "### Result" heading', () => {
    const text = [
      '### Result',
      '[',
      '  {',
      '    "name": "Galaxy F70",',
      '    "url": "https://www.gsmarena.com/samsung_galaxy_f70_5g-15014.php"',
      '  }',
      ']',
      '### Ran Playwright code',
      '```js',
      "await page.evaluate('() => [1, 2]');",
      '```',
    ].join('\n');
    expect(parseListingResult(text)).toEqual([
      { name: 'Galaxy F70', url: 'https://www.gsmarena.com/samsung_galaxy_f70_5g-15014.php' },
    ]);
  });

  it('parses a result section at the end of the output', () => {
    const text = '### Result\n[]\n';
    expect(parseListingResult(text)).toEqual([]);
  });

  it('throws when there is no result section', () => {
    expect(() => parseListingResult('### Error\nsomething broke')).toThrow('### Result');
  });

  it('throws when the result is not a listing array', () => {
    expect(() => parseListingResult('### Result\n{"name": "x"}')).toThrow();
  });
});

describe('selectNewEntries', () => {
  const known = new Set(['galaxy a07s', 'galaxy s26 fe']);

  it('keeps only unknown entries within the device limit', () => {
    const entries = [entry('Galaxy F70'), entry('Galaxy A07s'), entry('Galaxy Tab S12+')];
    const selected = selectNewEntries(entries, known, null, 10);
    expect(selected.map((e) => e.name)).toEqual(['Galaxy F70', 'Galaxy Tab S12+']);
  });

  it('normalizes names before comparing (case, Samsung prefix)', () => {
    const entries = [entry('Samsung Galaxy S26 FE'), entry('GALAXY A07S')];
    expect(selectNewEntries(entries, known, null, 10)).toEqual([]);
  });

  it('stops at the stop marker and ignores everything after it', () => {
    const entries = [entry('Galaxy F70'), entry('Galaxy A07s'), entry('Galaxy Old New')];
    const selected = selectNewEntries(entries, known, 'galaxy a07s', 10);
    expect(selected.map((e) => e.name)).toEqual(['Galaxy F70']);
  });

  it('checks no more entries than the device limit', () => {
    const entries = [entry('Galaxy New 1'), entry('Galaxy New 2'), entry('Galaxy New 3')];
    const selected = selectNewEntries(entries, new Set(), null, 2);
    expect(selected.map((e) => e.name)).toEqual(['Galaxy New 1', 'Galaxy New 2']);
  });
});
