import { z } from 'zod';
import type { ClientTool, ServerTool } from '@langchain/core/tools';
import { DeviceSchema, type NewDevice } from '../agent/schema.js';
import { findTool, parseResultJson } from './browser.js';
import type { ListingEntry } from './listing.js';

/**
 * Deterministic spec-page extraction. GSM Arena marks the fields we need with stable
 * data-spec attributes (modelname, released-hl, status, models), so for a normally
 * structured page no LLM is involved; the agent only gets the pages this pass cannot
 * parse. LLM extraction of model codes proved unreliable (two runs returned two
 * different model lists, both missing /DS variants the target file includes).
 */

const SPEC_EXTRACT_FN = `() => ({
  name: document.querySelector('[data-spec="modelname"]')?.textContent ?? null,
  released: document.querySelector('[data-spec="released-hl"]')?.textContent ?? null,
  status: document.querySelector('[data-spec="status"]')?.textContent ?? null,
  models: document.querySelector('[data-spec="models"]')?.textContent ?? null,
})`;

export const RawSpecSchema = z.object({
  name: z.string().nullable(),
  released: z.string().nullable(),
  status: z.string().nullable(),
  models: z.string().nullable(),
});

export type RawSpec = z.infer<typeof RawSpecSchema>;

const MONTHS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

/**
 * Parses "Released 2026, October 07" or "Exp. release 2026, March 06" into MM-DD-YYYY.
 * A missing day becomes "01" (GSM Arena sometimes lists only year and month).
 */
export function parseReleaseDate(text: string | null): string | null {
  if (text === null) return null;
  const match = /(?:Released|Exp\.\s*release)\s+(\d{4}),\s+([A-Za-z]+)(?:\s+(\d{1,2}))?/.exec(text);
  if (!match) return null;
  const [, year, monthName, day] = match;
  if (year === undefined || monthName === undefined) return null;
  const month = MONTHS[monthName.toLowerCase()];
  if (month === undefined) return null;
  return `${month}-${(day ?? '1').padStart(2, '0')}-${year}`;
}

/** Splits the Models row ("SM-A185F, SM-A185F/DS, ...") into individual codes. */
export function parseModels(text: string | null): string[] {
  if (text === null) return [];
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * Builds a NewDevice from the raw data-spec strings, or returns null when the page did
 * not yield a usable name and release date (those pages go to the agent fallback).
 * A device without model codes is still returned; the caller defers it.
 */
export function specToDevice(raw: RawSpec): NewDevice | null {
  const name = (raw.name ?? '').replace(/^Samsung\s+/i, '').trim();
  const releaseDate = parseReleaseDate(raw.released) ?? parseReleaseDate(raw.status);
  if (name === '' || releaseDate === null) return null;
  const type = name.includes('Tab') ? 'tablet' : name.includes('Watch') ? 'watch' : 'phone';
  return DeviceSchema.parse({ name, releaseDate, type, models: parseModels(raw.models) });
}

export interface SpecExtractionResult {
  /** Fully extracted devices with at least one model code. */
  devices: NewDevice[];
  /** Extracted devices GSM Arena lists no model codes for yet (target validation rejects them). */
  deferred: NewDevice[];
  /** Candidates whose page could not be parsed deterministically; the agent handles these. */
  fallback: ListingEntry[];
}

/** Visits each candidate's spec page and extracts its fields deterministically. */
export async function extractDeviceSpecs(
  tools: (ServerTool | ClientTool)[],
  candidates: ListingEntry[],
): Promise<SpecExtractionResult> {
  const navigate = findTool(tools, 'browser_navigate');
  const evaluate = findTool(tools, 'browser_evaluate');
  const result: SpecExtractionResult = { devices: [], deferred: [], fallback: [] };

  for (const candidate of candidates) {
    try {
      await navigate.invoke({ url: candidate.url });
      const evaluated = await evaluate.invoke({ function: SPEC_EXTRACT_FN });
      const raw = RawSpecSchema.parse(parseResultJson(String(evaluated)));
      const device = specToDevice(raw);
      if (device === null) {
        result.fallback.push(candidate);
      } else if (device.models.length === 0) {
        result.deferred.push(device);
      } else {
        result.devices.push(device);
      }
    } catch (error) {
      console.log(`   ! ${candidate.name}: deterministic extraction failed (${String(error)})`);
      result.fallback.push(candidate);
    }
  }
  return result;
}
