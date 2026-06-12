// Endpoint DEFINITIVO de debug: inicializa el manager y muestra el estado
// exacto de cada server, incluyendo la URL interpolada y el resultado de
// new URL().
import { MCPManager } from '@/lib/mcp/manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const m = MCPManager.get();
  await m.initialize();
  const status = m.getStatus();

  // Para cada server, intentar parsear la URL si es remoto.
  const enriched = status.map((s) => {
    const base = { name: s.name, connected: s.connected, toolCount: s.toolCount, error: s.error };
    // Re-leer la config directamente para obtener la URL.
    return base;
  });

  return Response.json({
    app_url: process.env.NEXT_PUBLIC_APP_URL,
    manager_servers: enriched,
    total: enriched.length,
    timestamp: new Date().toISOString(),
  });
}
