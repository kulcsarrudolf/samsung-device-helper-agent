import { createMiddleware } from 'langchain';
import { ToolMessage } from '@langchain/core/messages';
import { isGraphInterrupt } from '@langchain/langgraph';

// Browser snapshots can be huge. Cap each tool result so a single page cannot blow the
// context window. Mirrors the old loop's MAX_TOOL_RESULT_CHARS truncation.
const MAX_TOOL_RESULT_CHARS = 8000;

/**
 * Truncates oversized string tool results before they are appended to the message history.
 * Non-string content (structured/artifact output) is passed through untouched.
 *
 * Also converts thrown tool errors (e.g. a stale-ref ToolException from the Playwright MCP
 * server) into error ToolMessages. ToolNode treats errors escaping a wrapToolCall middleware
 * as fatal middleware errors and crashes the graph, so catching here restores the default
 * self-correction loop where the model sees the error and retries. Graph interrupts are
 * rethrown: they are control flow for human-in-the-loop, not tool failures.
 */
export const truncateToolOutputMiddleware = createMiddleware({
  name: 'TruncateToolOutput',
  wrapToolCall: async (request, handler) => {
    let result;
    try {
      result = await handler(request);
    } catch (error) {
      if (isGraphInterrupt(error)) throw error;
      result = new ToolMessage({
        name: request.toolCall.name,
        tool_call_id: request.toolCall.id ?? '',
        status: 'error',
        content: `${String(error)}\n Please fix your mistakes.`,
      });
    }
    if (
      result instanceof ToolMessage &&
      typeof result.content === 'string' &&
      result.content.length > MAX_TOOL_RESULT_CHARS
    ) {
      result.content = result.content.slice(0, MAX_TOOL_RESULT_CHARS);
    }
    return result;
  },
});
