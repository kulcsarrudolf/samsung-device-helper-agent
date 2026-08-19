import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { GraphInterrupt } from '@langchain/langgraph';
import { createProgressLoggingMiddleware, truncateToolOutputMiddleware } from './middleware.js';

type WrapToolCall = NonNullable<typeof truncateToolOutputMiddleware.wrapToolCall>;
type ToolCallRequest = Parameters<WrapToolCall>[0];
type ToolCallHandler = Parameters<WrapToolCall>[1];

const { wrapToolCall } = truncateToolOutputMiddleware;
if (!wrapToolCall) throw new Error('truncateToolOutputMiddleware must define wrapToolCall');

const request = {
  toolCall: { name: 'browser_click', id: 'call-1', args: {} },
} as ToolCallRequest;

const toolMessage = (content: string): ToolMessage =>
  new ToolMessage({ name: 'browser_click', tool_call_id: 'call-1', content });

const succeedWith = (message: ToolMessage): ToolCallHandler => {
  return () => Promise.resolve(message);
};

const failWith = (error: Error): ToolCallHandler => {
  return () => Promise.reject(error);
};

describe('truncateToolOutputMiddleware', () => {
  it('passes through short string results untouched', async () => {
    const result = await wrapToolCall(request, succeedWith(toolMessage('clicked')));
    expect(result).toBeInstanceOf(ToolMessage);
    expect((result as ToolMessage).content).toBe('clicked');
  });

  it('truncates oversized string results to the cap', async () => {
    const result = await wrapToolCall(request, succeedWith(toolMessage('x'.repeat(10_000))));
    expect((result as ToolMessage).content).toHaveLength(8000);
  });

  it('converts a thrown tool error into an error ToolMessage instead of crashing', async () => {
    const result = await wrapToolCall(
      request,
      failWith(new Error('"listitem [ref=e85]" does not match any elements.')),
    );
    expect(result).toBeInstanceOf(ToolMessage);
    const message = result as ToolMessage;
    expect(message.status).toBe('error');
    expect(message.tool_call_id).toBe('call-1');
    expect(message.content).toContain('does not match any elements');
    expect(message.content).toContain('Please fix your mistakes');
  });

  it('truncates oversized error messages too', async () => {
    const result = await wrapToolCall(request, failWith(new Error('y'.repeat(10_000))));
    expect((result as ToolMessage).status).toBe('error');
    expect((result as ToolMessage).content).toHaveLength(8000);
  });

  it('rethrows graph interrupts so human-in-the-loop still works', async () => {
    await expect(wrapToolCall(request, failWith(new GraphInterrupt()))).rejects.toBeInstanceOf(
      GraphInterrupt,
    );
  });
});

describe('createProgressLoggingMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const loggedLines = (spy: { mock: { calls: unknown[][] } }): string[] =>
    spy.mock.calls.map((call) => String(call[0]));

  const getHooks = () => {
    const middleware = createProgressLoggingMiddleware();
    const { wrapModelCall: modelHook, wrapToolCall: toolHook } = middleware;
    if (!modelHook || !toolHook) throw new Error('logging middleware must define both hooks');
    return { modelHook, toolHook };
  };

  it('logs numbered model turns and the agent text', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { modelHook } = getHooks();
    const respond = () =>
      Promise.resolve(new AIMessage({ content: 'Navigating to GSM Arena.', tool_calls: [] }));

    await modelHook({} as Parameters<typeof modelHook>[0], respond);
    await modelHook({} as Parameters<typeof modelHook>[0], respond);

    const lines = loggedLines(log);
    expect(lines.some((l) => l.includes('[Turn 1] calling model...'))).toBe(true);
    expect(lines.some((l) => l.includes('[Turn 2] calling model...'))).toBe(true);
    expect(lines.some((l) => l.includes('[Agent] Navigating to GSM Arena.'))).toBe(true);
  });

  it('logs tool calls with truncated args and a success line', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { toolHook } = getHooks();
    const bigArgs = {
      toolCall: { name: 'browser_click', id: 'call-1', args: { element: 'z'.repeat(500) } },
    } as unknown as Parameters<typeof toolHook>[0];

    await toolHook(bigArgs, succeedWith(toolMessage('clicked')));

    const lines = loggedLines(log);
    const callLine = lines.find((l) => l.includes('Tool: browser_click'));
    expect(callLine).toBeDefined();
    expect(callLine?.length).toBeLessThan(300);
    expect(callLine?.endsWith('...')).toBe(true);
    expect(lines.some((l) => l.includes('Tool browser_click ok in') && l.includes('7 chars'))).toBe(
      true,
    );
  });

  it('logs a FAILED line for error ToolMessages', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { toolHook } = getHooks();
    const errorMessage = new ToolMessage({
      name: 'browser_click',
      tool_call_id: 'call-1',
      status: 'error',
      content: 'Error: stale ref\n Please fix your mistakes.',
    });

    await toolHook(request, succeedWith(errorMessage));

    const lines = loggedLines(log);
    expect(
      lines.some((l) => l.includes('Tool browser_click FAILED in') && l.includes('stale ref')),
    ).toBe(true);
  });
});
