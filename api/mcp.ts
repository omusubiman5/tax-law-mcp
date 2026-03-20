import type { VercelRequest, VercelResponse } from '@vercel/node';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from '../src/server.js';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
};

function toWebRequest(req: VercelRequest): Request {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const url = `${protocol}://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else {
        headers.set(key, value);
      }
    }
  }

  const init: RequestInit = {
    method: req.method || 'GET',
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = JSON.stringify(req.body);
  }

  return new Request(url, init);
}

async function writeWebResponse(webRes: Response, res: VercelResponse): Promise<void> {
  res.status(webRes.status);

  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!webRes.body) {
    res.end();
    return;
  }

  const reader = webRes.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createServer();
    await server.connect(transport);

    const webReq = toWebRequest(req);
    const webRes = await transport.handleRequest(webReq);

    for (const [key, value] of Object.entries(corsHeaders)) {
      if (!webRes.headers.has(key)) {
        webRes.headers.set(key, value);
      }
    }

    await writeWebResponse(webRes, res);
  } catch (error) {
    console.error('MCP handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
