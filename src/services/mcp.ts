import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import type { MCPTool, MCPResponse } from '../types.js';

export class PlaywrightMCPClient {
  private process: ChildProcess;
  private rl: readline.Interface;
  private pendingRequests = new Map<
    number,
    { resolve: (v: MCPResponse) => void; reject: (e: Error) => void }
  >();
  private requestId = 1;

  constructor() {
    this.process = spawn(
      'npx',
      [
        '@playwright/mcp',
        '--browser',
        'chromium',
        '--headless',
        '--user-agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    this.rl = readline.createInterface({ input: this.process.stdout! });

    this.rl.on('line', (line) => {
      try {
        const msg: MCPResponse = JSON.parse(line);
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message));
          } else {
            pending.resolve(msg);
          }
        }
      } catch {
        // non-JSON startup lines — ignore
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (!msg.includes('Listening') && !msg.includes('ready')) {
        console.error('[MCP stderr]', msg.trim());
      }
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.process.stdin!.write(msg + '\n');
  }

  private send(method: string, params: Record<string, unknown>): Promise<MCPResponse> {
    const id = this.requestId++;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.process.stdin!.write(msg + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async initialize(): Promise<void> {
    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'samsung-sync-agent', version: '1.0.0' },
    });
    this.notify('notifications/initialized', {});
  }

  async listTools(): Promise<MCPTool[]> {
    const res = await this.send('tools/list', {});
    return res.result?.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const res = await this.send('tools/call', { name, arguments: args });
    const content = res.result?.content || [];
    return content
      .filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('\n');
  }

  close(): void {
    this.process.kill();
  }
}
