/**
 * BYOK (Bring Your Own Key): cada persona usa su propia API key de IA.
 *
 * La configuración se guarda SOLO en el localStorage del navegador:
 * nunca se envía a Supabase ni se almacena en el servidor. En cada
 * petición a /api/chat viaja como header y el servidor la usa de forma
 * transitoria, solo para esa petición. Así nadie gasta los créditos
 * de la key del que despliega la app.
 */

export interface ByokConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export const BYOK_STORAGE_KEY = "minimax-chat:byok";
export const DEFAULT_BASE_URL = "https://api.minimax.io/v1";
export const DEFAULT_MODEL = "MiniMax-M3";

export function getByokConfig(): ByokConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ByokConfig>;
    const apiKey = (parsed.apiKey ?? "").trim();
    if (!apiKey) return null;
    return {
      apiKey,
      baseURL: (parsed.baseURL ?? "").trim() || DEFAULT_BASE_URL,
      model: (parsed.model ?? "").trim() || DEFAULT_MODEL,
    };
  } catch {
    return null;
  }
}

export function saveByokConfig(cfg: ByokConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    BYOK_STORAGE_KEY,
    JSON.stringify({
      apiKey: cfg.apiKey.trim(),
      baseURL: cfg.baseURL.trim() || DEFAULT_BASE_URL,
      model: cfg.model.trim() || DEFAULT_MODEL,
    })
  );
}

export function clearByokConfig(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(BYOK_STORAGE_KEY);
}

/** Headers con los que el cliente envía su config BYOK al servidor. */
export function byokHeaders(): Record<string, string> {
  const cfg = getByokConfig();
  if (!cfg) return {};
  return {
    "x-llm-api-key": cfg.apiKey,
    "x-llm-base-url": cfg.baseURL,
    "x-llm-model": cfg.model,
  };
}
