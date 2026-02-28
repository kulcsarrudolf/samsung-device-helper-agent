export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: {
    tools?: MCPTool[];
    content?: Array<{ type: string; text?: string }>;
  };
  error?: { code: number; message: string };
}

export interface NewDevice {
  name: string;
  releaseDate: string;
  type: 'phone' | 'tablet' | 'watch';
  models: string[];
}
