import { z } from 'zod';
import type { ClientTool, ServerTool } from '@langchain/core/tools';
import { normalizeName } from '../domain/parse.js';
import { findTool, parseResultJson } from './browser.js';
import { GSM_ARENA_SAMSUNG_URL } from '../config.js';

/**
 * Deterministic replacement for the agent's old "early exit check". Deciding which of the
 * newest GSM Arena listing entries are missing from our file is pure string matching, and
 * trusting the LLM with it produced false "up to date" runs (it once skipped 7 new devices).
 * This module reads the listing with the same Playwright MCP tools the agent uses, extracts
 * the entries with a fixed selector, and diffs them against the known names in code. The
 * agent is only involved afterwards, to extract spec details for the entries found here.
 */

export const ListingEntrySchema = z.object({
  /** Device name as shown on the listing, without the "Samsung " prefix. */
  name: z.string(),
  /** Absolute URL of the device's spec page. */
  url: z.string(),
});

export type ListingEntry = z.infer<typeof ListingEntrySchema>;

/**
 * Runs inside the page via browser_evaluate. `.makers li` is GSM Arena's classic maker
 * listing container, `.section-body li` the newer layout; innerText (not textContent)
 * because names can contain <br> ("Galaxy F70<br>5G") and textContent would glue the parts.
 */
const LISTING_EXTRACT_FN = `() => {
  const selectors = ['.makers li', '.section-body li'];
  let items = [];
  for (const sel of selectors) {
    items = Array.from(document.querySelectorAll(sel));
    if (items.length > 0) break;
  }
  return items
    .map((li) => {
      const a = li.querySelector('a');
      const nameEl = li.querySelector('strong') ?? a;
      const name = nameEl ? nameEl.innerText.replace(/\\s+/g, ' ').trim() : '';
      const url = a ? a.href : '';
      return { name, url };
    })
    .filter((d) => d.name !== '' && d.url !== '');
}`;

/** Extracts and validates the listing entries from a browser_evaluate tool result. */
export function parseListingResult(text: string): ListingEntry[] {
  return z.array(ListingEntrySchema).parse(parseResultJson(text));
}

/**
 * The deterministic diff: take the first `deviceLimit` entries (the listing is sorted
 * newest-first), stop at the newest device we already have, and keep the unknown rest.
 * `knownNames` must hold normalized names (as produced by parseExistingNames).
 */
export function selectNewEntries(
  entries: ListingEntry[],
  knownNames: Set<string>,
  stopAtName: string | null,
  deviceLimit: number,
): ListingEntry[] {
  const selected: ListingEntry[] = [];
  for (const entry of entries.slice(0, deviceLimit)) {
    const normalized = normalizeName(entry.name);
    if (stopAtName !== null && normalized === stopAtName) break;
    if (!knownNames.has(normalized)) selected.push(entry);
  }
  return selected;
}

/** Loads the GSM Arena Samsung listing and returns its entries, newest first. */
export async function fetchListingEntries(
  tools: (ServerTool | ClientTool)[],
): Promise<ListingEntry[]> {
  const navigate = findTool(tools, 'browser_navigate');
  const evaluate = findTool(tools, 'browser_evaluate');
  await navigate.invoke({ url: GSM_ARENA_SAMSUNG_URL });
  const result = await evaluate.invoke({ function: LISTING_EXTRACT_FN });
  return parseListingResult(String(result));
}
