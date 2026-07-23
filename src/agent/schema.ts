import { z } from 'zod';

/**
 * The device shape is defined once, here, in Zod. Everything else derives from it:
 * the TypeScript type (via z.infer), the agent's structured-output schema, and
 * runtime validation of scraped rows before they are written to the target file.
 *
 * The `.describe()` text doubles as guidance for the LLM when this schema is used
 * as the agent's structured-output format.
 */
export const DeviceSchema = z.object({
  name: z.string().describe('Device name WITHOUT the "Samsung " prefix. e.g. "Galaxy S26 Ultra"'),
  releaseDate: z
    .string()
    .describe(
      'Release date in MM-DD-YYYY format (zero-padded). e.g. "03-06-2026". ' +
        'Accept both confirmed (Released) and expected (Exp. release) dates.',
    ),
  type: z
    .enum(['phone', 'tablet', 'watch'])
    .describe('"Tab" in name -> "tablet". "Watch" in name -> "watch". Everything else -> "phone".'),
  models: z
    .array(z.string())
    .describe('All SM-XXXX model numbers from the Models row. Include ALL regional variants.'),
});

export type NewDevice = z.infer<typeof DeviceSchema>;

/**
 * Terminal result of the scraping agent. `upToDate: true` means the first devices
 * on GSM Arena are all already in our file (no PR needed); otherwise `devices`
 * holds the new devices found (empty array if none qualify).
 */
export const ScrapeResultSchema = z.object({
  upToDate: z
    .boolean()
    .describe(
      'True when all of the first 10 devices on GSM Arena are already in our file. ' +
        'When true, no PR is created and `devices` should be empty.',
    ),
  devices: z
    .array(DeviceSchema)
    .describe('New devices to add. Empty array when nothing new qualifies.'),
});

export type ScrapeResult = z.infer<typeof ScrapeResultSchema>;
