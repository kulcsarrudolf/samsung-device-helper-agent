/**
 * Parses the optional positional device limit from CLI args (`yarn sync 5`).
 * Flags (`--dry-run`) are skipped. Returns undefined when no positional argument is
 * present, so the state default applies. Throws on anything that is not a positive
 * integer so a typo fails loudly instead of silently scraping the default amount.
 */
export function parseDeviceLimit(args: string[]): number | undefined {
  const positional = args.find((a) => !a.startsWith('--'));
  if (positional === undefined) return undefined;
  const limit = Number(positional);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(
      `Invalid device limit "${positional}". Expected a positive integer, e.g. "yarn sync 5".`,
    );
  }
  return limit;
}
