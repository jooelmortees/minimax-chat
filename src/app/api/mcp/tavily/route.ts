/**
 * Endpoint MCP HTTP para Tavily, expuesto como server streamable stateless.
 *
 * El cliente MCP del usuario (`mcp_servers.json`) apunta a esta URL con
 * `type: "remote"`. Cada request crea un server + transport nuevo (stateless),
 * lo que es compatible con serverless (Vercel).
 *
 * Autenticación:
 *  - Si MCP_PROXY_TOKEN está definido en el server, se compara con el header
 *    `X-MCP-Proxy-Token` enviado por el cliente. Si no coincide, 401.
 *  - Tavily no necesita header: la API key se lee de process.env en el server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createTavilyMcpServer } from '@/lib/mcp/servers/tavily-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorize(req: Request): Response | null {
  const expected = process.env.MCP_PROXY_TOKEN;
  if (!expected) return null; // sin token configurado → abierto (no recomendado en prod)
  const got = req.headers.get('x-mcp-proxy-token');
  if (got !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}

async function handleMcpRequest(req: Request, getServer: () => McpServer): Promise<Response> {
  const unauthorized = authorize(req);
  if (unauthorized) return unauthorized;

  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = getServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleMcpRequest(req, createTavilyMcpServer);
}

export async function GET(req: Request): Promise<Response> {
  return handleMcpRequest(req, createTavilyMcpServer);
}

export async function DELETE(req: Request): Promise<Response> {
  return handleMcpRequest(req, createTavilyMcpServer);
}
