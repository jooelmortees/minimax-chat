// Endpoint DEFINITIVO de debug: lee el config TAL COMO el manager lo ve
// (después de interpolar env vars) y muestra el estado de cada server.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function interpolateEnv(value: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/g, (_, name, def) => {
    const v = process.env[name];
    if (v !== undefined) return v;
    if (def !== undefined) return def;
    return '';
  });
}

function deepInterpolate(value: unknown): unknown {
  if (typeof value === 'string') return interpolateEnv(value);
  if (Array.isArray(value)) return value.map(deepInterpolate);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepInterpolate(v);
    }
    return out;
  }
  return value;
}

async function loadConfig() {
  const configPath = process.env.MCP_SERVERS_CONFIG ?? './mcp_servers.json';
  const absolute = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);
  if (!existsSync(absolute)) return { error: `not found: ${absolute}` };
  const raw = await readFile(absolute, 'utf-8');
  const parsed = JSON.parse(raw);
  // Filtrar comentarios.
  if (parsed.mcpServers) {
    for (const k of Object.keys(parsed.mcpServers)) {
      if (k.startsWith('_')) delete parsed.mcpServers[k];
    }
  }
  return deepInterpolate(parsed);
}

export async function GET() {
  const config = await loadConfig();
  return Response.json({
    app_url: process.env.NEXT_PUBLIC_APP_URL,
    mcp_proxy_token_set: !!process.env.MCP_PROXY_TOKEN,
    config,
    timestamp: new Date().toISOString(),
  });
}
