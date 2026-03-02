import Anthropic from '@anthropic-ai/sdk';
import type { PlaywrightMCPClient } from '../services/mcp.js';
import type { NewDevice } from '../types.js';
import { parseExistingNames, parseLastExistingName } from '../utils/parse.js';
import { ANTHROPIC_API_KEY, CURRENT_YEAR, GSM_ARENA_SAMSUNG_URL } from '../config.js';

const MAX_ITERATIONS = 40;
const MAX_TOOL_RESULT_CHARS = 8000;

function buildTools(mcp: Awaited<ReturnType<PlaywrightMCPClient['listTools']>>): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = mcp.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }));

  tools.push({
    name: 'report_devices',
    description:
      'Call this when you have finished scraping all relevant devices. ' +
      'Report all new Samsung devices found on GSM Arena that are NOT already in the existing list. ' +
      'If no new devices were found, call this with an empty devices array.',
    input_schema: {
      type: 'object' as const,
      properties: {
        devices: {
          type: 'array',
          description: 'List of new devices to add. Empty array if nothing new.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Device name WITHOUT "Samsung " prefix. e.g. "Galaxy S26 Ultra"',
              },
              releaseDate: {
                type: 'string',
                description:
                  'Release date in MM-DD-YYYY format (zero-padded). e.g. "03-06-2026". ' +
                  'Accept both confirmed (Released) and expected (Exp. release) dates.',
              },
              type: {
                type: 'string',
                enum: ['phone', 'tablet', 'watch'],
                description:
                  '"Tab" in name → "tablet". "Watch" in name → "watch". Everything else → "phone".',
              },
              models: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'All SM-XXXX model numbers from the Models row. Include ALL regional variants.',
              },
            },
            required: ['name', 'releaseDate', 'type', 'models'],
          },
        },
      },
      required: ['devices'],
    },
  });

  tools.push({
    name: 'already_up_to_date',
    description:
      'Call this INSTEAD of report_devices when all of the first 10 devices on GSM Arena ' +
      'are already present in our file. No PR will be created.',
    input_schema: {
      type: 'object' as const,
      properties: {
        first_gsm_name: { type: 'string', description: 'Newest device name on GSM Arena' },
        last_file_name: { type: 'string', description: 'Last device name in our repository file' },
      },
      required: ['first_gsm_name', 'last_file_name'],
    },
  });

  return tools;
}

function buildSystemPrompt(existingNames: Set<string>, lastExistingName: string | null): string {
  const earlyExitInstruction = existingNames.size > 0
    ? `
⚡ EARLY EXIT CHECK — Perform this FIRST before visiting any individual device pages:
   1. Navigate to the GSM Arena Samsung listing page (URL provided below).
   2. Read the first 10 devices listed (newest-first).
   3. Strip "Samsung " from each name and check case-insensitively against the existing names list below.
   4. If ALL of the first 10 devices are already in our list → call already_up_to_date immediately and stop.
   5. If ANY device is NOT in our list → continue with the full scraping steps below.
`
    : '';

  return `You are a Samsung device data sync agent. Your job is to detect new Samsung devices on GSM Arena and extract their structured details for our repository file.
${earlyExitInstruction}
═══ FULL SCRAPING STEPS (only run these if the early-exit check fails) ═══

STEP 1 — NAVIGATE to the GSM Arena Samsung listing, sorted newest-first:
   URL: ${GSM_ARENA_SAMSUNG_URL}
   After the page loads, verify the "TIME OF RELEASE" tab is active.
   If not, click it to ensure devices are ordered newest-first.

STEP 2 — READ the first 10 devices shown on the listing page.
   Note the name and URL slug of each device.

STEP 3 — FOR EACH DEVICE, decide whether to scrape its spec page:
   - SKIP if the device name (lowercase, without "Samsung ") is already in our file:
     ${JSON.stringify(Array.from(existingNames))}
   - SKIP if the name matches "${lastExistingName}" — stop processing further devices.
   - Otherwise, navigate to the device's spec page and extract the fields below.

STEP 4 — ON EACH SPEC PAGE, extract:

   a) NAME — main heading, remove "Samsung " prefix.
   b) RELEASE DATE — from LAUNCH section "Status" or "Released" row.
      Format: MM-DD-YYYY with zero-padded month and day.
      Accept expected dates: "Exp. release 2026, March 06" → "03-06-2026"
      If NO date can be found → skip this device entirely.
   c) TYPE — "Tab" in name → "tablet", "Watch" → "watch", else → "phone".
   d) MODELS — all SM-XXXX codes from the Models row in MISC section. Empty array if absent.

STEP 5 — FILTER: Only include devices from the year ${CURRENT_YEAR}.

STEP 6 — WHEN DONE: Call report_devices with all new devices found (empty array if none).

═══ TECHNICAL NOTES ═══
- Use browser_navigate to load pages and browser_snapshot to read their content.
- After navigating, always call browser_snapshot to see the current page state.
- If a page fails to load, try navigating once more before skipping.
- Scrape one device at a time.`;
}

export async function runAgent(
  mcp: PlaywrightMCPClient,
  existingContent: string | null,
): Promise<NewDevice[]> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const existingNames = existingContent ? parseExistingNames(existingContent) : new Set<string>();
  const lastExistingName = existingContent ? parseLastExistingName(existingContent) : null;

  const mcpTools = await mcp.listTools();
  const tools = buildTools(mcpTools);
  const systemPrompt = buildSystemPrompt(existingNames, lastExistingName);

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Please sync Samsung devices from GSM Arena for ${CURRENT_YEAR}. Start with the early-exit check, then proceed with full scraping only if needed.`,
    },
  ];

  let newDevices: NewDevice[] = [];
  let iterations = 0;

  console.log('\nAgent starting...\n');

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`[Iteration ${iterations}/${MAX_ITERATIONS}]`);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        console.log(`[Agent] ${block.text.trim()}`);
      }
    }

    if (response.stop_reason === 'end_turn') {
      console.log('\nAgent ended turn without calling report_devices');
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.MessageParam = { role: 'user', content: [] };

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        console.log(`  Tool called: ${block.name}`);

        if (block.name === 'already_up_to_date') {
          const input = block.input as { first_gsm_name: string; last_file_name: string };
          console.log(`\nAlready up to date!`);
          console.log(`   GSM Arena #1: "${input.first_gsm_name}"`);
          console.log(`   Last in file: "${input.last_file_name}"`);
          console.log(`   No new devices. Exiting without PR.`);

          (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'Early-exit confirmed. Everything is up to date. Task complete.',
          });

          messages.push({ role: 'assistant', content: response.content });
          messages.push(toolResults);
          return [];
        }

        if (block.name === 'report_devices') {
          const input = block.input as { devices: NewDevice[] };
          newDevices = input.devices || [];
          console.log(`\nAgent reported ${newDevices.length} new device(s):`);
          newDevices.forEach((d) =>
            console.log(`   + ${d.name} (${d.type}) — ${d.releaseDate} — ${d.models.length} model(s)`),
          );

          (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Received ${newDevices.length} device(s). Task complete.`,
          });

          messages.push({ role: 'assistant', content: response.content });
          messages.push(toolResults);
          return newDevices;
        }

        try {
          const result = await mcp.callTool(block.name, block.input as Record<string, unknown>);
          (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result.slice(0, MAX_TOOL_RESULT_CHARS),
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`  MCP tool error (${block.name}): ${message}`);
          (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Error in ${block.name}: ${message}. You may retry once or skip this step.`,
            is_error: true,
          });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push(toolResults);
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.warn(`\nAgent hit max iterations (${MAX_ITERATIONS}). Returning ${newDevices.length} partial result(s).`);
  }

  return newDevices;
}
