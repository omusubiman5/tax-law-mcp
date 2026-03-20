/**
 * Vercel Serverless Function — Node.js Streamable HTTP transport
 *
 * 各リクエストごとにサーバー + トランスポートを新規作成（ステートレス）
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../src/server.js';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORSヘッダーを設定
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    console.log('MCP handler called:', req.method, req.url);
    console.log('Body type:', typeof (req as any).body, 'Body:', JSON.stringify((req as any).body));

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    const server = createServer();
    await server.connect(transport);

    // Vercel pre-parses the request body, so the raw stream is empty.
    // Pass the pre-parsed body as the third argument.
    await transport.handleRequest(req, res, (req as any).body);
  } catch (error) {
    console.error('MCP handler error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: null,
    }));
  }
}
