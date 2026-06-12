import OpenAI from "openai";

// Cliente MiniMax usando la API compatible con OpenAI.
// Docs: https://platform.minimax.io/docs/api-reference/text-chat-openai
// Modelos: MiniMax-M3, MiniMax-M2.7, M2-her
//
// Notas:
// - La API soporta tool calling estándar de OpenAI.
// - Soporta streaming con SSE.
// - reasoning_split=True extrae el pensamiento a un campo aparte
//   (lo gestionamos manualmente en el loop).

let cached: OpenAI | null = null;

export function getMinimaxClient(): OpenAI {
  if (cached) return cached;

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MINIMAX_API_KEY no está definida. Crea un .env.local con tu clave de https://platform.minimaxi.com"
    );
  }

  const baseURL = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1";

  cached = new OpenAI({
    apiKey,
    baseURL,
    // El SDK de OpenAI reintenta por defecto; lo desactivamos porque
    // queremos que el error suba rápido al cliente.
    maxRetries: 0,
    timeout: 120_000,
  });

  return cached;
}

export function getDefaultModel(): string {
  return process.env.MINIMAX_MODEL ?? "MiniMax-M3";
}
