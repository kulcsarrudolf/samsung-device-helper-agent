import { createMiddleware } from 'langchain';
import { ToolMessage, type AIMessage } from '@langchain/core/messages';
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

// Keep logged tool args to one readable line; snapshots and long selectors get elided.
const MAX_LOGGED_ARG_CHARS = 200;

// JSON.stringify returns undefined at runtime for undefined input despite its lib typing.
const safeStringify: (value: unknown) => string | undefined = JSON.stringify;

function formatToolArgs(args: unknown): string {
  let json: string | undefined;
  try {
    json = safeStringify(args);
  } catch {
    return '<unserializable args>';
  }
  if (json === undefined) return '';
  return json.length > MAX_LOGGED_ARG_CHARS ? `${json.slice(0, MAX_LOGGED_ARG_CHARS)}...` : json;
}

function messageText(content: AIMessage['content'] | undefined): string {
  if (typeof content === 'string') return content.trim();
  // The typings promise string | blocks[], but gateway responses can leave content
  // undefined at runtime (seen on the final structured-output message), so verify.
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .join(' ')
    .trim();
}

// Errors escaping wrapModelCall/wrapToolCall middleware abort the whole graph, so
// logging is strictly best-effort: a surprise response shape must never kill a run.
function safeLog(log: () => void): void {
  try {
    log();
  } catch {
    // Swallow: losing one log line is better than losing the run.
  }
}

function elapsedSeconds(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

// CometAPI sometimes answers HTTP 200 with an empty `choices` array (its way of swallowing
// an upstream error). ChatOpenAI then crashes with a TypeError at `generations[0][0].message`
// before any usable response exists, and the openai client's maxRetries never fires because
// there was no HTTP error. The fault is bursty and can outlast short waits (a run died after
// 2s+5s backoff), so back off up to half a minute. Bounded so a persistent fault still fails.
const MALFORMED_RESPONSE_MAX_ATTEMPTS = 5;
const MALFORMED_RESPONSE_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Retries model calls that die on a malformed gateway response. A TypeError escaping the
 * model call means the response shape was unusable (empty choices), not that the request
 * failed, so a fresh attempt usually succeeds. Any other error is rethrown untouched, and
 * after the last attempt the TypeError propagates and aborts the run as before.
 *
 * Place this last in the middleware list (innermost): the progress logger then logs one
 * turn per logical model call, with retries happening beneath it.
 */
export const retryMalformedModelResponseMiddleware = createMiddleware({
  name: 'RetryMalformedModelResponse',
  wrapModelCall: async (request, handler) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await handler(request);
      } catch (error) {
        if (!(error instanceof TypeError) || attempt >= MALFORMED_RESPONSE_MAX_ATTEMPTS) {
          throw error;
        }
        const backoffMs = MALFORMED_RESPONSE_BACKOFF_MS[attempt - 1] ?? 5_000;
        safeLog(() => {
          console.log(
            `  Model response was malformed (${error.message}); retrying in ${String(backoffMs / 1000)}s (attempt ${String(attempt + 1)}/${String(MALFORMED_RESPONSE_MAX_ATTEMPTS)})...`,
          );
        });
        await sleep(backoffMs);
      }
    }
  },
});

/**
 * Logs every model turn and tool call so the terminal shows live progress, mirroring the
 * old bespoke loop's per-iteration output. Without this, agent.invoke runs the whole
 * scrape silently and a slow gateway call is indistinguishable from a hang. The
 * "calling model..." / "Tool:" lines print before each await, so if the run stalls the
 * last line names the exact step it is stuck on.
 *
 * A factory (not a shared instance) so the turn counter starts at 1 for every run.
 * Place this before truncateToolOutputMiddleware: the first middleware is outermost, so
 * tool failures arrive here as already-converted error ToolMessages.
 */
export function createProgressLoggingMiddleware() {
  let turn = 0;
  return createMiddleware({
    name: 'ProgressLogging',
    wrapModelCall: async (request, handler) => {
      turn += 1;
      const thisTurn = turn;
      safeLog(() => {
        console.log(`\n[Turn ${String(thisTurn)}] calling model...`);
      });
      const startedAt = Date.now();
      const response = await handler(request);
      safeLog(() => {
        const toolCalls = response.tool_calls?.length ?? 0;
        console.log(
          `[Turn ${String(thisTurn)}] model responded in ${elapsedSeconds(startedAt)} (${String(toolCalls)} tool call(s))`,
        );
        const text = messageText(response.content);
        if (text) console.log(`[Agent] ${text}`);
      });
      return response;
    },
    wrapToolCall: async (request, handler) => {
      const { name, args } = request.toolCall;
      safeLog(() => {
        console.log(`  Tool: ${name} ${formatToolArgs(args)}`);
      });
      const startedAt = Date.now();
      const result = await handler(request);
      safeLog(() => {
        if (result instanceof ToolMessage && result.status === 'error') {
          const firstLine =
            typeof result.content === 'string' ? (result.content.split('\n')[0] ?? '') : '';
          console.log(`  Tool ${name} FAILED in ${elapsedSeconds(startedAt)}: ${firstLine}`);
        } else {
          const size =
            result instanceof ToolMessage && typeof result.content === 'string'
              ? `, ${String(result.content.length)} chars`
              : '';
          console.log(`  Tool ${name} ok in ${elapsedSeconds(startedAt)}${size}`);
        }
      });
      return result;
    },
  });
}
