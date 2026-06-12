// Endpoint TEMPORAL de debug para ver qué env vars llegan al server.
// Se borra tras diagnosticar.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const tavilyUrl = `${appUrl}/api/mcp/tavily`;
  const minimaxUrl = `${appUrl}/api/mcp/minimax`;

  // Probar si la URL es parseable
  let tavilyParse: { ok: boolean; reason?: string };
  try {
    new URL(tavilyUrl);
    tavilyParse = { ok: true };
  } catch (err) {
    tavilyParse = { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  let minimaxParse: { ok: boolean; reason?: string };
  try {
    new URL(minimaxUrl);
    minimaxParse = { ok: true };
  } catch (err) {
    minimaxParse = { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  return Response.json({
    NEXT_PUBLIC_APP_URL: appUrl,
    NEXT_PUBLIC_APP_URL_len: appUrl.length,
    NEXT_PUBLIC_APP_URL_chars: Array.from(appUrl).map((c) => c.charCodeAt(0)),
    computed_tavily_url: tavilyUrl,
    tavily_url_parse: tavilyParse,
    computed_minimax_url: minimaxUrl,
    minimax_url_parse: minimaxParse,
    timestamp: new Date().toISOString(),
  });
}
