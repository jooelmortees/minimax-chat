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
  const model = body.model ?? getDefaultModel();

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
        await MCPManager.get().initialize();
        await runAgentLoop(body.messages, {
          conversationId,
          model,
          signal: req.signal,
          onEvent: send,
          capabilities: body.capabilities,
          systemPromptAdditions: body.systemPromptAdditions,
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
