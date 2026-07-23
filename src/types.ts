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
    content?: { type: string; text?: string }[];
  };
  error?: { code: number; message: string };
}
