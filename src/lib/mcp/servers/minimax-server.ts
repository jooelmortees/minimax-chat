/**
 * Servidor MCP de MiniMax expuesto como tool HTTP streamable.
 * Se monta en Next.js en `src/app/api/mcp/minimax/route.ts`.
 *
 * Implementa las tools de generación de MiniMax contra la API REST oficial
 * (no usa el paquete stdio `minimax-mcp`). Esto permite que funcione en
 * Vercel y en local sin procesos largos.
 *
 * Tools:
 *  - text_to_audio:     texto → URL de audio MP3
 *  - text_to_image:     prompt → URLs de imágenes
 *  - generate_video:    prompt → task_id (async; el cliente debe llamar a
 *                       query_video_generation después)
 *  - query_video_generation: task_id → estado + URL cuando termine
 *  - list_voices:       todas las voces disponibles
 *  - music_generation:  prompt + lyrics → URL de audio
 *
 * Las claves se leen de `process.env.MINIMAX_API_KEY` y `MINIMAX_BASE_URL` en
 * el server. El cliente MCP debe enviar el header `X-MCP-Proxy-Token` que
 * coincida con `process.env.MCP_PROXY_TOKEN` (si está definido) para evitar
 * uso no autorizado de tus claves.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  generateVideo,
  listVoices,
  musicGeneration,
  queryVideoGeneration,
  textToAudio,
  textToImage,
  type VoiceInfo,
} from '../minimax-api';

export function createMiniMaxMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'minimax',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // --- text_to_audio -------------------------------------------------------
  server.tool(
    'text_to_audio',
    'Convierte texto a voz usando MiniMax Speech 02. Devuelve la URL del audio MP3 generado.',
    {
      text: z.string().min(1).max(10000).describe('Texto a sintetizar.'),
      voice_id: z
        .string()
        .default('male-qn-qingse')
        .describe('ID de la voz. Usa list_voices para ver las disponibles.'),
      model: z
        .enum(['speech-02-hd', 'speech-02-turbo', 'speech-01-hd', 'speech-01-turbo'])
        .default('speech-02-hd')
        .describe('Modelo TTS a usar.'),
      speed: z.number().min(0.5).max(2.0).default(1.0).describe('Velocidad (0.5-2.0).'),
      pitch: z.number().int().min(-12).max(12).default(0).describe('Tono (-12 a 12).'),
    },
    async (args) => {
      try {
        const result = await textToAudio({
          text: args.text,
          voiceId: args.voice_id,
          model: args.model,
          speed: args.speed,
          pitch: args.pitch,
        });
        const lines = [
          result.file_url ? `URL del audio: ${result.file_url}` : 'Audio generado (sin URL pública).',
          result.duration_ms ? `Duración: ${result.duration_ms} ms` : '',
        ].filter(Boolean);
        return {
          content: [
            { type: 'text' as const, text: lines.join('\n') },
            { type: 'text' as const, text: JSON.stringify(result.raw, null, 2) },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `text_to_audio error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  // --- text_to_image -------------------------------------------------------
  server.tool(
    'text_to_image',
    'Genera una o varias imágenes a partir de un prompt con MiniMax Image. Devuelve URLs a los archivos.',
    {
      prompt: z.string().min(1).describe('Descripción de la imagen a generar.'),
      aspect_ratio: z
        .enum(['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9'])
        .default('1:1')
        .describe('Relación de aspecto.'),
      n: z.number().int().min(1).max(9).default(1).describe('Número de imágenes (1-9).'),
      subject_reference: z
        .string()
        .url()
        .optional()
        .describe('URL de una imagen de referencia para el sujeto (opcional).'),
    },
    async (args) => {
      try {
        const result = await textToImage({
          prompt: args.prompt,
          aspectRatio: args.aspect_ratio,
          n: args.n,
          subjectReference: args.subject_reference,
        });
        const urls = result.image_urls ?? [];
        return {
          content: [
            ...(urls.length > 0
              ? [{ type: 'text' as const, text: `URLs de las imágenes:\n${urls.join('\n')}` }]
              : []),
            { type: 'text' as const, text: JSON.stringify(result.raw, null, 2) },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `text_to_image error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  // --- generate_video ------------------------------------------------------
  server.tool(
    'generate_video',
    'Inicia la generación de un vídeo a partir de un prompt (puede tardar minutos). Devuelve un task_id.',
    {
      prompt: z.string().min(1).describe('Descripción del vídeo a generar.'),
      model: z
        .enum(['MiniMax-Hailuo-02', 'T2V-01', 'T2V-01-Director', 'I2V-01', 'I2V-01-Director', 'I2V-01-live', 'S2V-01'])
        .default('MiniMax-Hailuo-02')
        .describe('Modelo de generación de vídeo.'),
      duration: z
        .union([z.literal(6), z.literal(10)])
        .optional()
        .describe('Duración en segundos (solo MiniMax-Hailuo-02: 6 o 10).'),
      resolution: z
        .enum(['768P', '1080P'])
        .optional()
        .describe('Resolución (solo MiniMax-Hailuo-02).'),
      first_frame_image: z
        .string()
        .url()
        .optional()
        .describe('URL de la imagen para el primer fotograma (opcional).'),
    },
    async (args) => {
      try {
        const task = await generateVideo({
          prompt: args.prompt,
          model: args.model,
          duration: args.duration,
          resolution: args.resolution,
          firstFrameImage: args.first_frame_image,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `Tarea creada. task_id: ${task.task_id}\n` +
                `Usa la tool query_video_generation con este task_id para consultar el estado. ` +
                `Los vídeos pueden tardar varios minutos.`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `generate_video error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  // --- query_video_generation ---------------------------------------------
  server.tool(
    'query_video_generation',
    'Consulta el estado de una tarea de generación de vídeo iniciada con generate_video.',
    {
      task_id: z.string().describe('ID de la tarea devuelto por generate_video.'),
    },
    async (args) => {
      try {
        const task = await queryVideoGeneration(args.task_id);
        const status = task.status ?? 'desconocido';
        if (task.file_url) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Estado: ${status}\nURL del vídeo: ${task.file_url}`,
              },
            ],
          };
        }
        return {
          content: [
            { type: 'text' as const, text: `Estado: ${status}. Aún no está listo, vuelve a intentarlo en unos segundos.` },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `query_video_generation error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  // --- list_voices ---------------------------------------------------------
  server.tool(
    'list_voices',
    'Lista todas las voces disponibles para text_to_audio.',
    {},
    async () => {
      try {
        const voices = await listVoices();
        const text = voices
          .map(
            (v: VoiceInfo) =>
              `- ${v.voice_id}${v.voice_name ? ` (${v.voice_name})` : ''}${
                v.language ? ` · ${v.language}` : ''
              }${v.gender ? ` · ${v.gender}` : ''}`
          )
          .join('\n');
        return {
          content: [
            { type: 'text' as const, text: text || 'No hay voces disponibles.' },
            { type: 'text' as const, text: JSON.stringify(voices, null, 2) },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `list_voices error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  // --- music_generation ----------------------------------------------------
  server.tool(
    'music_generation',
    'Genera una pista de música a partir de un prompt y letra. Devuelve la URL del audio.',
    {
      prompt: z
        .string()
        .min(10)
        .max(300)
        .describe('Descripción del estilo: "Pop melancólico, adecuado para noches lluviosas".'),
      lyrics: z
        .string()
        .min(10)
        .max(600)
        .describe('Letra de la canción. Separa cada verso con \\n. Soporta [Intro], [Verse], [Chorus], etc.'),
    },
    async (args) => {
      try {
        const result = await musicGeneration({ prompt: args.prompt, lyrics: args.lyrics });
        return {
          content: [
            { type: 'text' as const, text: result.file_url ? `URL del audio: ${result.file_url}` : 'Música generada (sin URL pública).' },
            { type: 'text' as const, text: JSON.stringify(result.raw, null, 2) },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `music_generation error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  return server;
}
