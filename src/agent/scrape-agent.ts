import { createAgent } from 'langchain';
import { HumanMessage } from '@langchain/core/messages';
import type { ClientTool, ServerTool } from '@langchain/core/tools';
import { createModel } from './model.js';
import {
  createProgressLoggingMiddleware,
  retryMalformedModelResponseMiddleware,
  truncateToolOutputMiddleware,
} from './middleware.js';
import { buildSystemPrompt, buildUserMessage } from './prompts.js';
import { ScrapeResultSchema, type NewDevice, type ScrapeResult } from './schema.js';
import type { ListingEntry } from '../services/listing.js';
import { CURRENT_YEAR } from '../config.js';

// The old bespoke loop capped model turns at 40. recursionLimit counts graph super-steps
// (a model call plus its tool executions), so ~2x preserves the same number of scraping rounds.
const MAX_MODEL_ITERATIONS = 40;
const RECURSION_LIMIT = MAX_MODEL_ITERATIONS * 2;

/**
 * Maps the agent's structured result to the devices we will actually add.
 * `upToDate` short-circuits to an empty list; otherwise we keep only CURRENT_YEAR devices
 * (releaseDate is MM-DD-YYYY, so it must end with the current year) that have at least one
 * model code: the target repo's validate-data script rejects devices without models, so a
 * device whose codes GSM Arena has not published yet is deferred to a future sync (it stays
 * missing from the file, so the listing diff will flag it again).
 */
export function selectNewDevices(result: ScrapeResult): NewDevice[] {
  if (result.upToDate) return [];
  return result.devices.filter(
    (d) => d.releaseDate.endsWith(String(CURRENT_YEAR)) && d.models.length > 0,
  );
}

/** The current-year devices selectNewDevices drops for having no model codes yet. */
export function selectDeferredDevices(result: ScrapeResult): NewDevice[] {
  if (result.upToDate) return [];
  return result.devices.filter(
    (d) => d.releaseDate.endsWith(String(CURRENT_YEAR)) && d.models.length === 0,
  );
}

/**
 * Runs the scraping agent: a ReAct agent (createAgent) over the Playwright MCP tools that
 * returns structured output (ScrapeResultSchema) instead of the old synthetic terminal tools.
 *
 * The caller (the graph's scrape node) has already diffed the listing deterministically;
 * `candidates` are the spec pages to visit. Returns the extracted devices for CURRENT_YEAR.
 * The caller owns the MCP client lifecycle and passes its tools in.
 */
export async function runScrapeAgent(
  tools: (ServerTool | ClientTool)[],
  candidates: ListingEntry[],
): Promise<NewDevice[]> {
  const agent = createAgent({
    model: createModel(),
    tools,
    systemPrompt: buildSystemPrompt(candidates),
    responseFormat: ScrapeResultSchema,
    // Logging first: the first middleware is outermost, so it sees tool errors after the
    // truncation middleware has converted them into error ToolMessages. The malformed-
    // response retry goes last (innermost) so a retried call still logs as one turn.
    middleware: [
      createProgressLoggingMiddleware(),
      truncateToolOutputMiddleware,
      retryMalformedModelResponseMiddleware,
    ],
  });

  console.log(`\nAgent starting (${String(candidates.length)} spec page(s) to scrape)...\n`);

  const result = await agent.invoke(
    { messages: [new HumanMessage(buildUserMessage())] },
    { recursionLimit: RECURSION_LIMIT },
  );

  const newDevices = selectNewDevices(result.structuredResponse);
  const deferred = selectDeferredDevices(result.structuredResponse);

  if (result.structuredResponse.upToDate) {
    // Should not happen anymore (the deterministic diff already found candidates),
    // but honor the schema's contract if the model returns it.
    console.log('\nAgent reported upToDate despite candidates; treating as no new devices.');
    return [];
  }

  console.log(`\nAgent reported ${newDevices.length} new device(s):`);
  newDevices.forEach((d) => {
    console.log(`   + ${d.name} (${d.type}) ${d.releaseDate} ${d.models.length} model(s)`);
  });
  deferred.forEach((d) => {
    console.log(
      `   ~ ${d.name}: no model codes on GSM Arena yet; deferred until a future sync finds them.`,
    );
  });

  return newDevices;
}
