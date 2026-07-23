import type { NewDevice } from '../agent/schema.js';

function normalizeName(name: string): string {
  return name
    .replace(/^Samsung\s+/i, '')
    .toLowerCase()
    .trim();
}

export function parseExistingNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(/"?name"?\s*:\s*["'`]([^"'`]+)["'`]/g)) {
    const name = match[1];
    if (name !== undefined) names.add(normalizeName(name));
  }
  return names;
}

export function parseLastExistingName(content: string): string | null {
  const matches = [...content.matchAll(/"?name"?\s*:\s*["'`]([^"'`]+)["'`]/g)];
  const lastName = matches.at(-1)?.[1];
  return lastName === undefined ? null : normalizeName(lastName);
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
