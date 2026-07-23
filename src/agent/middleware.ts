import { createMiddleware } from 'langchain';
import { ToolMessage } from '@langchain/core/messages';

// Browser snapshots can be huge. Cap each tool result so a single page cannot blow the
// context window. Mirrors the old loop's MAX_TOOL_RESULT_CHARS truncation.
const MAX_TOOL_RESULT_CHARS = 8000;

/**
 * Truncates oversized string tool results before they are appended to the message history.
 * Non-string content (structured/artifact output) is passed through untouched.
 */
export const truncateToolOutputMiddleware = createMiddleware({
  name: 'TruncateToolOutput',
  wrapToolCall: async (request, handler) => {
    const result = await handler(request);
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
