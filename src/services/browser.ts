import type { ClientTool, ServerTool } from '@langchain/core/tools';

/**
 * Minimal programmatic access to the Playwright MCP browser tools. The deterministic
 * scraping steps (listing diff, spec extraction) drive the same tools the agent uses,
 * invoked directly instead of through model calls.
 */

export interface InvokableTool {
  name: string;
  invoke: (input: Record<string, unknown>) => Promise<unknown>;
}

export function findTool(tools: (ServerTool | ClientTool)[], name: string): InvokableTool {
  for (const tool of tools) {
    const candidate = tool as unknown as Partial<InvokableTool>;
    if (candidate.name === name && typeof candidate.invoke === 'function') {
      return candidate as InvokableTool;
    }
  }
  throw new Error(`Playwright MCP tool "${name}" not found`);
}

/**
 * Extracts the JSON value from a browser_evaluate tool result. The Playwright MCP server
 * renders the evaluated return value as pretty-printed JSON under a "### Result" heading,
 * followed by other sections ("### Ran Playwright code", ...).
 */
export function parseResultJson(text: string): unknown {
  const match = /### Result\s*\n([\s\S]*?)(?=\n### |$)/.exec(text);
  if (!match?.[1]) {
    throw new Error(`browser_evaluate output has no "### Result" section:\n${text.slice(0, 500)}`);
  }
  return JSON.parse(match[1]);
}
