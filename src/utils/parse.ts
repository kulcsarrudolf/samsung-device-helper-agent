import type { NewDevice } from '../types.js';

function normalizeName(name: string): string {
  return name.replace(/^Samsung\s+/i, '').toLowerCase().trim();
}

export function parseExistingNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(/"?name"?\s*:\s*["'`]([^"'`]+)["'`]/g)) {
    names.add(normalizeName(match[1]));
  }
  return names;
}

export function parseLastExistingName(content: string): string | null {
  const matches = [...content.matchAll(/"?name"?\s*:\s*["'`]([^"'`]+)["'`]/g)];
  if (matches.length === 0) return null;
  return normalizeName(matches[matches.length - 1][1]);
}

export function sortByReleaseDate(devices: NewDevice[]): NewDevice[] {
  return [...devices].sort((a, b) => {
    const toMs = (d: string) => {
      const [mm, dd, yyyy] = d.split('-');
      return new Date(`${yyyy}-${mm}-${dd}`).getTime();
    };
    return toMs(a.releaseDate) - toMs(b.releaseDate);
  });
}
