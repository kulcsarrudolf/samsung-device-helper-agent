import type { NewDevice } from '../types.js';

export function parseExistingNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(/name:\s*["']([^"']+)["']/g)) {
    names.add(match[1].toLowerCase().trim());
  }
  return names;
}

export function parseLastExistingName(content: string): string | null {
  const matches = [...content.matchAll(/name:\s*["']([^"']+)["']/g)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1].toLowerCase().trim();
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
