/**
 * Cliente HTTP para la API REST de MiniMax.
 * Se usa desde el server MCP de MiniMax (`./minimax-server.ts`).
 *
 * Endpoints (verificados con el README oficial del paquete `minimax-mcp-js`):
 *   POST /v1/text_to_audio
 *   POST /v1/image_generation
 *   POST /v1/video_generation         (devuelve task_id; consultar luego)
 *   GET  /v1/query/video_generation?task_id=XXX
 *   GET  /v1/voice/list
 *   POST /v1/music_generation
 *
 * Las respuestas incluyen URLs a los archivos generados. El llamante decide
 * qué hacer con ellos (descargar, mostrar, etc.).
 */

const DEFAULT_BASE_URL = 'https://api.minimax.io';

export class MiniMaxApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) {
    super(message);
    this.name = 'MiniMaxApiError';
  }
}

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  /** Override del baseURL (BYOK). Si no viene, se usa MINIMAX_BASE_URL. */
  baseURL?: string;
}

async function request(
  path: string,
  apiKey: string,
  options: RequestOptions = {}
): Promise<unknown> {
  const baseUrl = (options.baseURL?.trim() || process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: options.body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    // Vercel serverless: no cachear.
    cache: 'no-store',
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const message =
      (parsed as { message?: string; error?: string })?.message ||
      (parsed as { error?: string })?.error ||
      `MiniMax API ${res.status}`;
    throw new MiniMaxApiError(res.status, message, parsed);
  }
  return parsed;
}

// ---- Tipos de respuesta ---------------------------------------------------

export interface VoiceInfo {
  voice_id: string;
  voice_name?: string;
  language?: string;
  gender?: string;
}

export interface VideoTask {
  task_id: string;
  status?: string;
  base64_data?: string;
  file_url?: string;
}

// ---- API pública ---------------------------------------------------------

/**
 * Resuelve la API key a usar: primero la aportada por el usuario (BYOK),
 * si no la del servidor. Nunca se loguea el valor.
 */
function resolveKey(overrideKey?: string): string {
  const apiKey = overrideKey?.trim() || process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error(
      'No hay API key de MiniMax: añade la tuya en Ajustes o define MINIMAX_API_KEY en el servidor.'
    );
  }
  return apiKey;
}

/** Campos BYOK aceptados por todas las funciones de esta API. */
export interface ByokOverride {
  apiKey?: string;
  baseURL?: string;
}

export async function textToAudio(params: {
  text: string;
  model?: string;
  voiceId?: string;
  speed?: number;
  vol?: number;
  pitch?: number;
  format?: string;
  sampleRate?: number;
} & ByokOverride): Promise<{ file_url?: string; base64?: string; duration_ms?: number; raw: unknown }> {
  const apiKey = resolveKey(params.apiKey);

  const body = {
    model: params.model ?? 'speech-02-hd',
    text: params.text,
    voice_setting: {
      voice_id: params.voiceId ?? 'male-qn-qingse',
      speed: params.speed ?? 1.0,
      vol: params.vol ?? 1.0,
      pitch: params.pitch ?? 0,
    },
    audio_setting: {
      sample_rate: params.sampleRate ?? 32000,
      format: params.format ?? 'mp3',
      channel: 1,
    },
    stream: false,
  };
  const raw = (await request('/v1/text_to_audio', apiKey, { body, baseURL: params.baseURL })) as Record<string, unknown>;
  // La API suele devolver { audio: { url, duration_ms, ... } } o { file_url, ... } según versión.
  const audio = (raw.audio ?? raw) as { url?: string; file_url?: string; base64?: string; duration_ms?: number };
  return {
    file_url: audio.url ?? audio.file_url,
    base64: audio.base64,
    duration_ms: audio.duration_ms,
    raw,
  };
}

export async function textToImage(params: {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  n?: number;
  subjectReference?: string;
} & ByokOverride): Promise<{ image_urls?: string[]; raw: unknown }> {
  const apiKey = resolveKey(params.apiKey);

  const body: Record<string, unknown> = {
    model: params.model ?? 'image-01',
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio ?? '1:1',
    n: params.n ?? 1,
    prompt_optimizer: true,
  };
  if (params.subjectReference) body.subject_reference = params.subjectReference;
  const raw = (await request('/v1/image_generation', apiKey, { body, baseURL: params.baseURL })) as Record<string, unknown>;
  const urls = (raw.image_urls ?? raw.images) as string[] | undefined;
  return { image_urls: urls, raw };
}

export async function generateVideo(params: {
  prompt: string;
  model?: string;
  firstFrameImage?: string;
  duration?: number;
  resolution?: string;
} & ByokOverride): Promise<VideoTask> {
  const apiKey = resolveKey(params.apiKey);

  const body: Record<string, unknown> = {
    model: params.model ?? 'MiniMax-Hailuo-02',
    prompt: params.prompt,
  };
  if (params.firstFrameImage) body.first_frame_image = params.firstFrameImage;
  if (params.duration) body.duration = params.duration;
  if (params.resolution) body.resolution = params.resolution;
  const raw = (await request('/v1/video_generation', apiKey, { body, baseURL: params.baseURL })) as Record<string, unknown>;
  return {
    task_id: (raw.task_id as string) ?? (raw.taskId as string) ?? '',
    status: raw.status as string | undefined,
    base64_data: raw.base64_data as string | undefined,
    file_url: raw.file_url as string | undefined,
  };
}

export async function queryVideoGeneration(taskId: string, opts?: ByokOverride): Promise<VideoTask> {
  const apiKey = resolveKey(opts?.apiKey);

  const raw = (await request(
    `/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
    apiKey,
    { baseURL: opts?.baseURL }
  )) as Record<string, unknown>;
  return {
    task_id: taskId,
    status: raw.status as string | undefined,
    base64_data: raw.base64_data as string | undefined,
    file_url: raw.file_url as string | undefined,
  };
}

export async function listVoices(opts?: ByokOverride): Promise<VoiceInfo[]> {
  const apiKey = resolveKey(opts?.apiKey);

  const raw = (await request('/v1/voice/list', apiKey, { baseURL: opts?.baseURL })) as
    | { voice_list?: VoiceInfo[]; voices?: VoiceInfo[]; system_voice_list?: VoiceInfo[] }
    | VoiceInfo[];
  if (Array.isArray(raw)) return raw;
  return raw.voice_list ?? raw.voices ?? raw.system_voice_list ?? [];
}

export async function musicGeneration(params: {
  prompt: string;
  lyrics: string;
  model?: string;
  sampleRate?: number;
  format?: string;
} & ByokOverride): Promise<{ file_url?: string; base64?: string; raw: unknown }> {
  const apiKey = resolveKey(params.apiKey);

  const body = {
    model: params.model ?? 'music-1.5',
    prompt: params.prompt,
    lyrics: params.lyrics,
    audio_setting: {
      sample_rate: params.sampleRate ?? 32000,
      format: params.format ?? 'mp3',
      bitrate: 128000,
    },
  };
  const raw = (await request('/v1/music_generation', apiKey, { body, baseURL: params.baseURL })) as Record<string, unknown>;
  const audio = (raw.audio ?? raw) as { url?: string; file_url?: string; base64?: string };
  return {
    file_url: audio.url ?? audio.file_url,
    base64: audio.base64,
    raw,
  };
}
