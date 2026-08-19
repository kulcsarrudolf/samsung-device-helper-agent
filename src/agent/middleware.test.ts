import { describe, expect, it } from 'vitest';
import { ToolMessage } from '@langchain/core/messages';
import { GraphInterrupt } from '@langchain/langgraph';
import { truncateToolOutputMiddleware } from './middleware.js';

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
