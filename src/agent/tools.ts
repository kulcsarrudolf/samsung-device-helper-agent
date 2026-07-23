import { MultiServerMCPClient } from '@langchain/mcp-adapters';

// Same user agent the old bespoke client used, so GSM Arena serves the desktop layout.
const PLAYWRIGHT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Creates an MCP client that spawns the Playwright MCP server over stdio and exposes its
 * browser tools as LangChain tools (via @langchain/mcp-adapters).
 *
 * The name prefixes are disabled so tool names stay as the model expects them
 * (`browser_navigate`, `browser_snapshot`, ...), matching the scraping prompt.
 *
 * The caller owns the lifecycle: call `getTools()` to load the tools and `close()` when done.
 */
export function createPlaywrightMcpClient(): MultiServerMCPClient {
  return new MultiServerMCPClient({
    prefixToolNameWithServerName: false,
    additionalToolNamePrefix: '',
    mcpServers: {
      playwright: {
        transport: 'stdio',
        command: 'npx',
        args: [
          '@playwright/mcp',
          '--browser',
          'chromium',
          '--headless',
          '--user-agent',
          PLAYWRIGHT_USER_AGENT,
        ],
        stderr: 'inherit',
      },
    },
  });
}
