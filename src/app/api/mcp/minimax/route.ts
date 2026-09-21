/**
 * Endpoint MCP HTTP para MiniMax (text-to-audio, text-to-image, video, music, voices).
 * Mismo patrón que tavily/route.ts: server streamable stateless.
 *
 * Autenticación: si MCP_PROXY_TOKEN está definido, se valida vía header
 * `X-MCP-Proxy-Token`. La API key de MiniMax se lee de process.env en el server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMiniMaxMcpServer } from '@/lib/mcp/servers/minimax-server';
import type { MiniMaxServerOverrides } from '@/lib/mcp/servers/minimax-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorize(req: Request): Response | null {
  const expected = process.env.MCP_PROXY_TOKEN;
  if (!expected) return null;
  const got = req.headers.get('x-mcp-proxy-token');
  if (got !== expected) return new Response('Unauthorized', { status: 401 });
  return null;
}

async function handleMcpRequest(req: Request): Promise<Response> {
  const unauthorized = authorize(req);
  if (unauthorized) return unauthorized;

  // BYOK: si el llamante trae su propia key (la reenvía el chat route),
  // las tools de medios la usan en lugar de la del servidor.
  const overrides: MiniMaxServerOverrides = {
    apiKey: req.headers.get('x-llm-api-key')?.trim() || undefined,
    baseURL: req.headers.get('x-llm-base-url')?.trim() || undefined,
  };

  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMiniMaxMcpServer(overrides);
  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleMcpRequest(req);
}

export async function GET(req: Request): Promise<Response> {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return handleMcpRequest(req);
}
