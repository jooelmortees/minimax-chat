// Endpoint TEMPORAL de debug para ver qué env vars llegan al server.
// Se borra tras diagnosticar.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '∅',
    MINIMAX_API_KEY_prefix: (process.env.MINIMAX_API_KEY ?? '').slice(0, 12),
    TAVILY_API_KEY_prefix: (process.env.TAVILY_API_KEY ?? '').slice(0, 12),
    MCP_PROXY_TOKEN_set: !!process.env.MCP_PROXY_TOKEN,
    CONTEXT7_API_KEY_prefix: (process.env.CONTEXT7_API_KEY ?? '').slice(0, 12),
    GROQ_API_KEY_prefix: (process.env.GROQ_API_KEY ?? '').slice(0, 12),
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '∅',
    NEXT_PUBLIC_SUPABASE_ANON_KEY_prefix: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').slice(0, 16),
    timestamp: new Date().toISOString(),
  });
}
