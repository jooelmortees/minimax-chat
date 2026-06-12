/**
 * Cliente STT (speech-to-text) usando Groq Whisper.
 *
 * Groq ofrece una API compatible con OpenAI para transcripción,
 * con plan gratuito generoso. Es más rápido y barato que la API
 * directa de OpenAI para Whisper.
 *
 * Docs: https://console.groq.com/docs/speech-text
 *
 * Variables de entorno:
 *   GROQ_API_KEY  — requerida
 *   GROQ_STT_MODEL — opcional, default: whisper-large-v3
 */

const GROQ_TRANSCRIPTIONS_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_MODEL = "whisper-large-v3";

export interface TranscribeOptions {
  /** dataURL (data:audio/...;base64,...) o URL http(s) */
  dataUrl: string;
  /** Código ISO 639-1 (ej. "es", "en"). Opcional pero ayuda a la calidad. */
  language?: string;
}

export interface TranscribeResult {
  text: string;
  model: string;
  duration?: number;
}

export async function transcribeWithGroq(
  options: TranscribeOptions
): Promise<TranscribeResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY no definida. Crea una gratis en https://console.groq.com y añádela a .env.local"
    );
  }
  const model = process.env.GROQ_STT_MODEL ?? DEFAULT_MODEL;

  // Construimos un Blob a partir del dataURL o descargamos la URL
  let blob: Blob;
  let filename = "audio.webm";
  if (options.dataUrl.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(options.dataUrl);
    if (!match) {
      throw new Error("dataURL mal formado");
    }
    const mime = match[1];
    const buf = Buffer.from(match[2], "base64");
    const ext =
      mime.includes("webm")
        ? "webm"
        : mime.includes("ogg")
        ? "ogg"
        : mime.includes("wav")
        ? "wav"
        : mime.includes("mpeg")
        ? "mp3"
        : mime.includes("mp4")
        ? "mp4"
        : "bin";
    filename = `audio.${ext}`;
    blob = new Blob([buf], { type: mime });
  } else if (options.dataUrl.startsWith("http")) {
    const res = await fetch(options.dataUrl);
    if (!res.ok) {
      throw new Error(`No se pudo descargar el audio: HTTP ${res.status}`);
    }
    blob = await res.blob();
    const ct = res.headers.get("content-type") ?? "audio/mpeg";
    const ext = ct.includes("webm")
      ? "webm"
      : ct.includes("ogg")
      ? "ogg"
      : ct.includes("wav")
      ? "wav"
      : "mp3";
    filename = `audio.${ext}`;
  } else {
    throw new Error("dataUrl debe ser un dataURL o http(s) URL");
  }

  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", model);
  form.append("response_format", "verbose_json");
  if (options.language) form.append("language", options.language);

  const res = await fetch(GROQ_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq Whisper HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    text?: string;
    duration?: number;
  };
  if (!data.text) throw new Error("Groq Whisper devolvió respuesta vacía");
  return { text: data.text, model, duration: data.duration };
}
