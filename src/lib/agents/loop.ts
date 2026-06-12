import OpenAI from "openai";
import { getMinimaxClient, getDefaultModel } from "@/lib/llm/client";
import { MCPManager } from "@/lib/mcp/manager";
import { buildSystemPrompt, listProjectMarkdownFiles } from "@/lib/agents/system-prompt";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Capabilities, Message, StreamEvent, ToolCall } from "@/lib/types";

const MAX_ITERATIONS = 15;
const MAX_TOOL_RESULT_CHARS = 80_000;

interface RunOptions {
  conversationId: string;
  model?: string;
  signal?: AbortSignal;
  onEvent: (event: StreamEvent) => void;
  capabilities?: Capabilities;
  systemPromptAdditions?: string;
}

/**
 * Construye el system prompt una sola vez por request.
 * Si falla la carga de AGENTS.md, sigue con un prompt básico.
 */
async function buildInitialSystemPrompt(mcpManager: MCPManager) {
  const openAITools = mcpManager.getOpenAITools();

  // Pequeñas tools built-in además de los MCP servers
  const builtinTools = [
    {
      name: "read_project_file",
      description:
        "Lee un fichero .md (markdown) del proyecto activo. Útil para releer AGENTS.md u otros documentos del proyecto cuando cambien. Devuelve el contenido en texto plano.",
      server: "builtin",
    },
    {
      name: "list_project_markdown_files",
      description:
        "Lista los ficheros .md disponibles en el proyecto activo con su ruta relativa y tamaño.",
      server: "builtin",
    },
    {
      name: "transcribe_audio",
      description:
        "Transcribe un audio a texto usando OpenAI Whisper. El argumento dataUrl puede ser un dataURL (data:audio/...;base64,...) o una URL http(s). Devuelve el texto transcrito.",
      server: "builtin",
    },
  ];

  const allToolsForPrompt = [
    ...builtinTools,
    ...openAITools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
    })),
  ];

  return {
    prompt: await buildSystemPrompt({
      mcpTools: allToolsForPrompt,
      cwd: process.env.PROJECT_ROOT ?? process.cwd(),
    }),
    openAITools: [
      // Tool built-in para leer .md del proyecto
      {
        type: "function" as const,
        function: {
          name: "read_project_file",
          description:
            "Lee un fichero .md del proyecto. Ruta relativa al PROJECT_ROOT, p.ej. 'docs/ARQUITECTURA.md'.",
          parameters: {
            type: "object",
            properties: {
              relPath: {
                type: "string",
                description: "Ruta relativa del fichero .md a leer",
              },
              maxChars: {
                type: "number",
                description: "Máximo de caracteres a devolver (default 20000)",
              },
            },
            required: ["relPath"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "list_project_markdown_files",
          description: "Lista los .md del proyecto.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "transcribe_audio",
          description:
            "Transcribe un audio a texto (Whisper). dataUrl puede ser data:audio/...;base64,... o una URL http(s). Opcional: language (código ISO, ej. 'es').",
          parameters: {
            type: "object",
            properties: {
              dataUrl: {
                type: "string",
                description:
                  "dataURL o URL del audio a transcribir (data:audio/...;base64,...)",
              },
              language: {
                type: "string",
                description: "Idioma ISO 639-1 (ej. 'es', 'en'). Opcional.",
              },
            },
            required: ["dataUrl"],
          },
        },
      },
      ...openAITools,
    ],
  };
}

function mcpToolNameParts(fullName: string): { server: string; tool: string } | null {
  if (!fullName.startsWith("mcp__")) return null;
  const rest = fullName.slice(4);
  const i = rest.indexOf("__");
  if (i === -1) return null;
  return { server: rest.slice(0, i), tool: rest.slice(i + 2) };
}

async function executeBuiltin(
  name: string,
  args: Record<string, unknown>
): Promise<{ result: string; error?: string }> {
  try {
    if (name === "list_project_markdown_files") {
      const files = await listProjectMarkdownFiles();
      if (files.length === 0) return { result: "No hay ficheros .md en el proyecto." };
      return {
        result: files
          .map((f) => `- ${f.relPath}  (${f.size} B)`)
          .join("\n"),
      };
    }
    if (name === "read_project_file") {
      const relPath = String(args.relPath ?? "").trim();
      if (!relPath) return { result: "", error: "Falta 'relPath'" };
      if (relPath.includes("..")) {
        return { result: "", error: "Ruta inválida: no se permite '..'" };
      }
      const root = process.env.PROJECT_ROOT ?? ".";
      const abs = path.isAbsolute(root)
        ? path.join(root, relPath)
        : path.resolve(process.cwd(), root, relPath);
      if (!existsSync(abs)) {
        return { result: "", error: `No existe ${relPath}` };
      }
      const s = await stat(abs);
      if (!s.isFile()) return { result: "", error: "No es un fichero" };
      const maxChars = Number(args.maxChars ?? 20_000);
      const content = await readFile(abs, "utf-8");
      const truncated = content.length > maxChars;
      return {
        result:
          content.slice(0, maxChars) +
          (truncated ? `\n\n[...truncado a ${maxChars} chars]` : ""),
      };
    }
    if (name === "transcribe_audio") {
      return await transcribeAudio(args);
    }
    return { result: "", error: `Tool built-in desconocida: ${name}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: "", error: message };
  }
}

/**
 * Transcribe un audio (dataURL o URL) usando Groq Whisper.
 * Requiere GROQ_API_KEY en el entorno. Si no está, devuelve error claro.
 * Groq es OpenAI-compatible y suele ser más rápido y con plan gratuito.
 */
async function transcribeAudio(
  args: Record<string, unknown>
): Promise<{ result: string; error?: string }> {
  const dataUrl = String(args.dataUrl ?? "");
  if (!dataUrl.startsWith("data:audio/") && !dataUrl.startsWith("http")) {
    return {
      result: "",
      error: "Falta 'dataUrl' (dataURL o URL http(s) de un audio).",
    };
  }
  try {
    const { transcribeWithGroq } = await import("@/lib/stt/groq");
    const out = await transcribeWithGroq({
      dataUrl,
      language: args.language ? String(args.language) : undefined,
    });
    return { result: out.text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: "", error: message };
  }
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  mcpManager: MCPManager
): Promise<{ result: string; error?: string }> {
  if (
    name === "read_project_file" ||
    name === "list_project_markdown_files" ||
    name === "transcribe_audio"
  ) {
    return executeBuiltin(name, args);
  }
  const out = await mcpManager.callTool(name, args);
  if (out.result.length > MAX_TOOL_RESULT_CHARS) {
    return {
      result:
        out.result.slice(0, MAX_TOOL_RESULT_CHARS) +
        `\n\n[...truncado a ${MAX_TOOL_RESULT_CHARS} chars]`,
    };
  }
  return out;
}

/**
 * Loop principal del agente. Recibe el historial, lo pasa a MiniMax con
 * streaming, ejecuta tool calls si los hay, y re-itera hasta respuesta final.
 */
export async function runAgentLoop(
  history: Message[],
  options: RunOptions
): Promise<void> {
  const client = getMinimaxClient();
  const mcpManager = MCPManager.get();
  await mcpManager.initialize();

  const { prompt: systemPromptText, openAITools } = await buildInitialSystemPrompt(
    mcpManager
  );
  const model = options.model ?? getDefaultModel();

  // Inyectamos reglas de capacidades + preferencias del usuario
  const capabilitiesBlock = buildCapabilitiesBlock(options.capabilities);
  const finalSystemPrompt = [
    systemPromptText.prompt,
    capabilitiesBlock,
    options.systemPromptAdditions?.trim()
      ? `\n## Instrucciones adicionales del usuario\n\n${options.systemPromptAdditions.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Convertimos historial a formato OpenAI.
  // Importante: NO emitimos system aquí si ya viene en history[0] (lo controla el caller).
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: finalSystemPrompt },
    ...history.map(toOpenAIMessage),
  ];

  options.onEvent({ type: "start", conversationId: options.conversationId, model });

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (options.signal?.aborted) {
      options.onEvent({ type: "error", message: "Cancelado por el usuario" });
      return;
    }

    // 1) Streaming de MiniMax
    const stream = await client.chat.completions.create({
      model,
      messages,
      tools: openAITools,
      tool_choice: "auto",
      stream: true,
      // temperatura: 1.0 es la default recomendada por MiniMax
      temperature: 1.0,
    });

    // Acumuladores
    let rawAcc = ""; // todo lo que llega en content, incluyendo <think>...</think>
    let reasoningAcc = "";
    let textAcc = "";
    const toolCallsByIndex = new Map<
      number,
      {
        id: string;
        name: string;
        args: string;
      }
    >();

    for await (const chunk of stream) {
      if (options.signal?.aborted) {
        try {
          stream.controller.abort();
        } catch {
          // ya estaba cerrado
        }
        break;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (typeof delta.content === "string" && delta.content.length > 0) {
        rawAcc += delta.content;
        // Vamos emitiendo texto/razonamiento por separado en tiempo real
        const { reasoning, text } = splitThinkTags(rawAcc);
        if (reasoning.length > reasoningAcc.length) {
          const deltaR = reasoning.slice(reasoningAcc.length);
          reasoningAcc = reasoning;
          if (deltaR) options.onEvent({ type: "reasoning", delta: deltaR });
        }
        if (text.length > textAcc.length) {
          const deltaT = text.slice(textAcc.length);
          textAcc = text;
          if (deltaT) options.onEvent({ type: "text", delta: deltaT });
        }
      }

      // Tool calls en streaming
      const tcDeltas = delta.tool_calls;
      if (tcDeltas && tcDeltas.length > 0) {
        for (const tcd of tcDeltas) {
          const idx = tcd.index ?? 0;
          const acc = toolCallsByIndex.get(idx) ?? {
            id: tcd.id ?? `call_${Date.now()}_${idx}`,
            name: tcd.function?.name ?? "",
            args: "",
          };
          // OpenAI envía `name` en el primer chunk, pero algunos servidores
          // lo reenvían en chunks posteriores. Sin esta guarda, `acc.name`
          // acaba duplicado y la tool call llega al MCP con un nombre
          // inexistente tipo "resolve-library-idmcp__context7__resolve-library-id".
          if (tcd.id) acc.id = tcd.id;
          if (tcd.function?.name && !acc.name) {
            acc.name = tcd.function.name;
          }
          if (tcd.function?.arguments) acc.args += tcd.function.arguments;
          toolCallsByIndex.set(idx, acc);
        }
      }
    }

    const toolCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }> = [];
    for (const [, acc] of toolCallsByIndex) {
      let parsed: Record<string, unknown> = {};
      if (acc.args.trim().length > 0) {
        try {
          parsed = JSON.parse(acc.args);
        } catch {
          parsed = { _raw: acc.args };
        }
      }
      toolCalls.push({ id: acc.id, name: acc.name, args: parsed });
    }

    // 2) Si no hay tool_calls, terminamos
    if (toolCalls.length === 0) {
      return;
    }

    // 3) Añadimos el mensaje assistant con sus tool_calls al historial
    const assistantMessage: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: textAcc || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args),
        },
      })),
    };
    messages.push(assistantMessage);

    // 4) Ejecutamos las tool calls en paralelo
    const executions = await Promise.all(
      toolCalls.map(async (tc) => {
        const parts = mcpToolNameParts(tc.name);
        const toolCall: ToolCall = {
          id: tc.id,
          name: tc.name,
          server: parts?.server ?? "builtin",
          args: tc.args,
          status: "running",
          startedAt: Date.now(),
        };
        options.onEvent({ type: "tool_call", toolCall });

        const out = await executeTool(tc.name, tc.args, mcpManager);

        toolCall.status = out.error ? "error" : "success";
        toolCall.result = out.result;
        toolCall.error = out.error;
        toolCall.endedAt = Date.now();

        options.onEvent({
          type: "tool_result",
          toolCallId: tc.id,
          result: out.result,
          error: out.error,
        });

        return { tc, out };
      })
    );

    // 5) Volvemos al LLM con los tool results
    for (const { tc, out } of executions) {
      const toolMessage: OpenAI.Chat.Completions.ChatCompletionToolMessageParam = {
        role: "tool",
        tool_call_id: tc.id,
        content: out.error
          ? `Error: ${out.error}`
          : out.result || "(sin resultado)",
      };
      messages.push(toolMessage);
    }

    // siguiente iteración
  }

  options.onEvent({
    type: "error",
    message: `Se alcanzó el límite de ${MAX_ITERATIONS} iteraciones de tool calls.`,
  });
}

function toOpenAIMessage(
  m: Message
): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (m.role === "tool") {
    return {
      role: "tool",
      tool_call_id: m.toolCallId ?? m.id,
      content: m.content,
    };
  }
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    };
  }

  // Mensaje de usuario con adjuntos: content multimodal (text + image_url + video_url)
  if (m.role === "user" && m.attachments && m.attachments.length > 0) {
    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    if (m.content && m.content.trim().length > 0) {
      parts.push({ type: "text", text: m.content });
    }
    for (const att of m.attachments) {
      if (att.kind === "image" && att.dataUrl.startsWith("data:")) {
        parts.push({
          type: "image_url",
          image_url: { url: att.dataUrl },
        } as OpenAI.Chat.Completions.ChatCompletionContentPartImage);
      } else if (att.kind === "video" && att.dataUrl.startsWith("data:")) {
        // MiniMax-M3 soporta video_url. El dataURL se envía tal cual.
        // El modelo analizará el contenido del video.
        parts.push({
          type: "video_url",
          video_url: { url: att.dataUrl },
        } as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart);
      } else if (att.kind === "audio") {
        // El audio se transcribe en backend (tool) y se inyecta como texto.
        // Si llega sin transcribir, lo añadimos como nota para el modelo.
        parts.push({
          type: "text",
          text: `[audio adjunto: ${att.name} (mime=${att.mimeType}, ${att.size} bytes). Si no recibiste transcripción, indica al usuario que no se pudo procesar.]`,
        });
      } else {
        parts.push({
          type: "text",
          text: `[adjunto: ${att.name} (${att.kind}, ${att.mimeType}, ${att.size} bytes)]`,
        });
      }
    }
    return { role: "user", content: parts };
  }

  return {
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  };
}

/**
 * Construye el bloque del system prompt que indica al modelo qué
 * capacidades multimodales tiene ACTIVAS. Si una está desactivada,
 * se le dice explícitamente que NO use las tools asociadas.
 */
function buildCapabilitiesBlock(caps?: Capabilities): string {
  if (!caps) return "";
  const on = (k: keyof Capabilities) => (caps[k] ? "✅" : "❌");
  return `## Capacidades multimodales activas (configuradas por el usuario)

- ${on("image")} Generación de imágenes (tool: \`mcp__minimax__text_to_image\`)
- ${on("audio")} Texto a voz / TTS (tool: \`mcp__minimax__text_to_audio\`)
- ${on("video")} Generación de video (tool: \`mcp__minimax__generate_video\`)
- ${on("voice")} Clonación de voz (tool: \`mcp__minimax__voice_clone\`)
- ${on("music")} Generación de música (tool: \`mcp__minimax__music_generation\`)

Si una capacidad está marcada con ❌, NO la uses aunque el usuario la pida.
Si el usuario pide una capacidad ✅ y la conversación lo requiere, llámala sin dudar.
Si no está claro, pregunta antes de generar.`;
}

/**
 * Separa razonamiento (dentro de y el resto.
 * Maneja etiquetas que cruzan varios chunks de stream devolviendo
 * siempre una vista consistente del acumulado.
 */
function splitThinkTags(raw: string): { reasoning: string; text: string } {
  // Si el modelo emite <think>...</think> (con o sin cierre)
  const openTag = "<think>";
  const closeTag = "</think>";
  const openIdx = raw.indexOf(openTag);
  if (openIdx === -1) {
    return { reasoning: "", text: raw };
  }
  const closeIdx = raw.indexOf(closeTag, openIdx + openTag.length);
  if (closeIdx === -1) {
    // etiqueta abierta, todo es razonamiento provisional
    return {
      reasoning: raw.slice(openIdx + openTag.length),
      text: "",
    };
  }
  const reasoning = raw.slice(openIdx + openTag.length, closeIdx);
  const text = raw.slice(closeIdx + closeTag.length);
  return { reasoning, text };
}
