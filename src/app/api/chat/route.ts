import type { NextRequest } from "next/server";
import { runAgentLoop } from "@/lib/agents/loop";
import { MCPManager } from "@/lib/mcp/manager";
import { getDefaultModel } from "@/lib/llm/client";
import type { Capabilities, Message, StreamEvent } from "@/lib/types";

// Forzamos runtime Node (no Edge) porque usamos stdio para MCPs.
export const runtime = "nodejs";
// stream largo, sin caché
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  messages: Message[];
  conversationId?: string;
  model?: string;
  capabilities?: Capabilities;
  systemPromptAdditions?: string;
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response("Body inválido", { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response("Falta 'messages'", { status: 400 });
  }

  const conversationId =
    body.conversationId ?? `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // BYOK: cada usuario puede traer su propia API key en headers
  // (ver src/lib/llm/byok.ts). Prioridad: header del usuario > env del servidor.
  // La key del header solo se usa de forma transitoria en esta petición:
  // nunca se guarda ni se loguea.
  const byokApiKey = req.headers.get("x-llm-api-key")?.trim() || undefined;
  const byokBaseURL = req.headers.get("x-llm-base-url")?.trim() || undefined;
  const byokModel = req.headers.get("x-llm-model")?.trim() || undefined;

  if (!byokApiKey && !process.env.MINIMAX_API_KEY) {
    return Response.json(
      {
        error: "missing_api_key",
        message:
          "No hay API key configurada. Abre Ajustes y añade tu propia API key, o define MINIMAX_API_KEY en el servidor.",
      },
      { status: 401 }
    );
  }

  const model = byokModel || body.model || getDefaultModel();

  // SSE: configuramos los headers manualmente
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // el cliente ya desconectó
        }
      };

      // Mantenemos el manager MCP inicializado durante toda la sesión
      try {
        await MCPManager.get().initialize({
          // BYOK: reenviamos la key del usuario al proxy interno de MiniMax
          // para que las tools de medios tampoco gasten la key del servidor.
          minimaxApiKey: byokApiKey,
          minimaxBaseURL: byokBaseURL,
        });
        await runAgentLoop(body.messages, {
          conversationId,
          model,
          signal: req.signal,
          onEvent: send,
          capabilities: body.capabilities,
          systemPromptAdditions: body.systemPromptAdditions,
          llm: { apiKey: byokApiKey, baseURL: byokBaseURL },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Error desconocido";
        send({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // ya estaba cerrado
        }
      }
    },
    cancel() {
      // el cliente canceló la conexión
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
