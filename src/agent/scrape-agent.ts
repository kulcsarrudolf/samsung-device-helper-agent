import { createAgent } from 'langchain';
import { HumanMessage } from '@langchain/core/messages';
import type { ClientTool, ServerTool } from '@langchain/core/tools';
import { createModel } from './model.js';
import { createProgressLoggingMiddleware, truncateToolOutputMiddleware } from './middleware.js';
import { buildSystemPrompt, buildUserMessage } from './prompts.js';
import { ScrapeResultSchema, type NewDevice, type ScrapeResult } from './schema.js';
import { CURRENT_YEAR } from '../config.js';

// The old bespoke loop capped model turns at 40. recursionLimit counts graph super-steps
// (a model call plus its tool executions), so ~2x preserves the same number of scraping rounds.
const MAX_MODEL_ITERATIONS = 40;
const RECURSION_LIMIT = MAX_MODEL_ITERATIONS * 2;

/**
 * Maps the agent's structured result to the devices we will actually add.
 * `upToDate` short-circuits to an empty list; otherwise we keep only CURRENT_YEAR devices
 * (releaseDate is MM-DD-YYYY, so it must end with the current year).
 */
export function selectNewDevices(result: ScrapeResult): NewDevice[] {
  if (result.upToDate) return [];
  return result.devices.filter((d) => d.releaseDate.endsWith(String(CURRENT_YEAR)));
}

/**
 * Runs the scraping agent: a ReAct agent (createAgent) over the Playwright MCP tools that
 * returns structured output (ScrapeResultSchema) instead of the old synthetic terminal tools.
 *
 * Returns the new devices for the CURRENT_YEAR, or an empty array when the file is already
 * up to date. The caller owns the MCP client lifecycle and passes its tools in.
 */
export async function runScrapeAgent(
  tools: (ServerTool | ClientTool)[],
  knownNames: Set<string>,
  stopAtName: string | null,
): Promise<NewDevice[]> {
  const agent = createAgent({
    model: createModel(),
    tools,
    systemPrompt: buildSystemPrompt(knownNames, stopAtName),
    responseFormat: ScrapeResultSchema,
    // Logging first: the first middleware is outermost, so it sees tool errors after the
    // truncation middleware has converted them into error ToolMessages.
    middleware: [createProgressLoggingMiddleware(), truncateToolOutputMiddleware],
  });

  console.log('\nAgent starting...\n');

  const result = await agent.invoke(
    { messages: [new HumanMessage(buildUserMessage())] },
    { recursionLimit: RECURSION_LIMIT },
  );

  const newDevices = selectNewDevices(result.structuredResponse);

  if (result.structuredResponse.upToDate) {
    console.log('\nAlready up to date. No new devices. Exiting without PR.');
    return [];
  }

  console.log(`\nAgent reported ${newDevices.length} new device(s):`);
  newDevices.forEach((d) => {
    console.log(`   + ${d.name} (${d.type}) ${d.releaseDate} ${d.models.length} model(s)`);
  });

  return newDevices;
}
