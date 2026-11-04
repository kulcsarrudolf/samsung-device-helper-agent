import { CURRENT_YEAR } from '../config.js';
import type { ListingEntry } from '../services/listing.js';

/**
 * The agent no longer decides which devices are new; that diff is deterministic (see
 * services/listing.ts). It receives the exact spec-page URLs to visit and only extracts
 * fields, which is the one genuinely fuzzy part (page layout can drift).
 */
export function buildSystemPrompt(candidates: ListingEntry[]): string {
  const deviceList = candidates.map((c, i) => `${String(i + 1)}. ${c.name}: ${c.url}`).join('\n');

  return `You are a Samsung device data sync agent. New devices were detected on the GSM Arena listing. Visit each device's spec page below and extract its structured details for our repository file.

=== DEVICES TO SCRAPE (visit each URL, one at a time) ===
${deviceList}

=== FOR EACH DEVICE IN THE LIST ===

STEP 1. NAVIGATE to the device's spec page URL with browser_navigate,
   then read the page with browser_snapshot.

STEP 2. EXTRACT:
   a) NAME: main heading, remove "Samsung " prefix.
   b) RELEASE DATE: from LAUNCH section "Status" or "Released" row.
      Format: MM-DD-YYYY with zero-padded month and day.
      Accept expected dates: "Exp. release 2026, March 06" becomes "03-06-2026".
      If NO date can be found, skip this device entirely.
   c) TYPE: "Tab" in name becomes "tablet", "Watch" becomes "watch", else "phone".
   d) MODELS: all SM-XXXX codes from the Models row in MISC section. Empty array if absent.

STEP 3. FILTER: Only include devices from the year ${String(CURRENT_YEAR)}.

STEP 4. WHEN EVERY LISTED DEVICE IS DONE: Return your final answer as structured output with
   upToDate=false and the list of extracted devices (empty devices array if none qualify).

=== TECHNICAL NOTES ===
- Do NOT navigate to the listing page; only visit the spec page URLs listed above.
- If a page fails to load, try navigating once more before skipping that device.
- Scrape one device at a time.
- Do NOT ask the user questions; when you have gathered everything, return the structured result.`;
}

export function buildUserMessage(): string {
  return `Please extract the spec details for every device listed in the system prompt, then return the structured result.`;
}
