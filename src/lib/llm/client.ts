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

export interface LlmOverrides {
  /**
   * API key aportada por el usuario (BYOK). Cuando se pasa, el cliente
   * se crea de cero para esa petición y NUNCA se cachea, para no
   * mezclar claves entre usuarios.
   */
  apiKey?: string;
  baseURL?: string;
}

export function getMinimaxClient(overrides?: LlmOverrides): OpenAI {
  const apiKey = overrides?.apiKey?.trim() || process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No hay API key configurada. Añade la tuya en Ajustes o define MINIMAX_API_KEY en el servidor."
    );
  }

  const baseURL =
    overrides?.baseURL?.trim() ||
    process.env.MINIMAX_BASE_URL ||
    "https://api.minimax.io/v1";

  // El SDK de OpenAI reintenta por defecto; lo desactivamos porque
  // queremos que el error suba rápido al cliente.
  const opts = { apiKey, baseURL, maxRetries: 0, timeout: 120_000 };

  if (overrides?.apiKey?.trim()) {
    return new OpenAI(opts);
  }

  if (cached) return cached;
  cached = new OpenAI(opts);
  return cached;
}

/** ¿El servidor tiene su propia key configurada? */
export function hasServerKey(): boolean {
  return !!process.env.MINIMAX_API_KEY;
}

export function getDefaultModel(): string {
  return process.env.MINIMAX_MODEL ?? "MiniMax-M3";
}
