import { describe, expect, it } from 'vitest';
import { hardDedup, sort, buildContent } from './graph.js';
import type { SyncStateType } from './state.js';
import type { NewDevice } from './schema.js';

const device = (name: string, releaseDate: string): NewDevice => ({
  name,
  releaseDate,
  type: 'phone',
  models: [],
});

const baseState = (overrides: Partial<SyncStateType>): SyncStateType => ({
  existingContent: null,
  existingSha: null,
  existingNames: [],
  knownNames: [],
  stopAtName: null,
  newDevices: [],
  sorted: [],
  content: '',
  prUrl: null,
  ...overrides,
});

describe('hardDedup', () => {
  it('passes devices through when there are no existing names', () => {
    const state = baseState({ newDevices: [device('Galaxy S26', '02-25-2026')] });
    expect(hardDedup(state).newDevices).toHaveLength(1);
  });

  it('drops devices already present in the file (case-insensitive, Samsung prefix stripped)', () => {
    const state = baseState({
      existingNames: ['galaxy s26'],
      newDevices: [
        device('Samsung Galaxy S26', '02-25-2026'),
        device('Galaxy S26 Ultra', '02-25-2026'),
      ],
    });
    expect(hardDedup(state).newDevices?.map((d) => d.name)).toEqual(['Galaxy S26 Ultra']);
  });
});

describe('sort', () => {
  it('sorts devices oldest to newest', () => {
    const state = baseState({
      newDevices: [device('c', '11-05-2026'), device('a', '01-20-2026'), device('b', '01-03-2026')],
    });
    expect(sort(state).sorted?.map((d) => d.name)).toEqual(['b', 'a', 'c']);
  });
});

describe('buildContent', () => {
  const s26 = device('Galaxy S26', '02-25-2026');

  it('builds a fresh file when there is no existing content', () => {
    const year = new Date().getFullYear();
    const { content } = buildContent(baseState({ existingContent: null, sorted: [s26] }));
    expect(content).toContain(`export const samsungDevices${String(year)}: Device[] = [`);
    expect(content).toContain('Galaxy S26');
  });

  it('appends to the existing file when content is present', () => {
    const existingContent = `export const devices = [\n  {\n    name: 'Galaxy S25',\n  },\n];\n`;
    const { content } = buildContent(baseState({ existingContent, sorted: [s26] }));
    expect(content).toContain('Galaxy S25');
    expect(content).toContain('Galaxy S26');
    expect(content?.trimEnd().endsWith('];')).toBe(true);
  });
});
