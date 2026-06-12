"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Attachment,
  Capabilities,
  Message,
  StreamEvent,
  ToolCall,
} from "@/lib/types";

interface UseChatOptions {
  model: string;
  capabilities?: Capabilities;
  systemPromptAdditions?: string;
  onMessagesChange?: (messages: Message[]) => void;
}

export interface UseChatReturn {
  isStreaming: boolean;
  streamingReasoning: string;
  streamingContent: string;
  activeToolCalls: ToolCall[];
  error: string | null;
  send: (
    history: Message[],
    userText: string,
    attachments?: Attachment[]
  ) => Promise<Message[]>;
  stop: () => void;
  reset: () => void;
}

/**
 * Cliente de chat con streaming SSE manual.
 * Envía el historial a /api/chat y procesa los eventos `data: {...}`.
 */
export function useChat({
  model,
  capabilities,
  systemPromptAdditions,
  onMessagesChange,
}: UseChatOptions): UseChatReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStreamingReasoning("");
    setStreamingContent("");
    setActiveToolCalls([]);
    setError(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (
      history: Message[],
      userText: string,
      attachments: Attachment[] = []
    ): Promise<Message[]> => {
      if (isStreaming) return history;
      setIsStreaming(true);
      setError(null);
      reset();

      const controller = new AbortController();
      abortRef.current = controller;

      // Construimos el historial a enviar (solo el contenido del usuario nuevo)
      const userMessage: Message = {
        id: `msg_${Date.now()}_u`,
        role: "user",
        content: userText,
        attachments: attachments.length > 0 ? attachments : undefined,
        createdAt: Date.now(),
      };
      const messagesToSend: Message[] = [...history, userMessage];

      onMessagesChange?.(messagesToSend);

      const toolCallsAcc: ToolCall[] = [];
      // Acumulador de tool results (mensajes tool)
      const toolResultsAcc: Message[] = [];
      // El mensaje assistant final (texto + tool_calls)
      let finalAssistantMessage: Message | null = null;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messagesToSend,
            model,
            capabilities,
            systemPromptAdditions,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accReasoning = "";
        let accContent = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Procesamos los eventos completos (terminados en \n\n)
          let sep;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const line = raw.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(payload) as StreamEvent;
            } catch {
              continue;
            }

            switch (event.type) {
              case "start":
                // noop
                break;
              case "reasoning":
                accReasoning += event.delta;
                setStreamingReasoning(accReasoning);
                break;
              case "text":
                accContent += event.delta;
                setStreamingContent(accContent);
                break;
              case "tool_call":
                toolCallsAcc.push(event.toolCall);
                setActiveToolCalls([...toolCallsAcc]);
                break;
              case "tool_result": {
                const tc = toolCallsAcc.find((t) => t.id === event.toolCallId);
                if (tc) {
                  tc.status = event.error ? "error" : "success";
                  tc.result = event.result;
                  tc.error = event.error;
                  tc.endedAt = Date.now();
                  setActiveToolCalls([...toolCallsAcc]);
                }
                toolResultsAcc.push({
                  id: `msg_${Date.now()}_t_${event.toolCallId}`,
                  role: "tool",
                  content: event.error
                    ? `Error: ${event.error}`
                    : event.result || "(sin resultado)",
                  toolCallId: event.toolCallId,
                  createdAt: Date.now(),
                });
                break;
              }
              case "attachment_transcribed":
                // informativo: el modelo ha transcrito un audio
                // (no añadimos nada al historial aquí, se hace como tool result)
                break;
              case "error":
                setError(event.message);
                break;
              case "done":
                // noop
                break;
            }
          }
        }

        // Construimos el mensaje assistant final
        finalAssistantMessage = {
          id: `msg_${Date.now()}_a`,
          role: "assistant",
          content: accContent,
          reasoning: accReasoning,
          toolCalls: toolCallsAcc.length > 0 ? toolCallsAcc : undefined,
          createdAt: Date.now(),
        };

        // Historial completo a devolver: history original + user msg + tool results + assistant
        const next: Message[] = [
          ...history,
          messagesToSend[messagesToSend.length - 1],
          ...toolResultsAcc,
          finalAssistantMessage,
        ].filter((m): m is Message => !!m);

        onMessagesChange?.(next);
        return next;
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // usuario canceló: devolvemos lo que tengamos hasta ahora
          if (finalAssistantMessage || toolResultsAcc.length > 0) {
            const partial: Message[] = [
              ...history,
              messagesToSend[messagesToSend.length - 1],
              ...toolResultsAcc,
              ...(finalAssistantMessage ? [finalAssistantMessage] : []),
            ].filter((m): m is Message => !!m);
            onMessagesChange?.(partial);
            return partial;
          }
          return history;
        }
        const msg = err instanceof Error ? err.message : "Error de red";
        setError(msg);
        return history;
      } finally {
        setIsStreaming(false);
        setTimeout(() => {
          setStreamingContent("");
          setStreamingReasoning("");
          setActiveToolCalls([]);
        }, 100);
      }
    },
    [isStreaming, model, capabilities, systemPromptAdditions, onMessagesChange, reset]
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    isStreaming,
    streamingReasoning,
    streamingContent,
    activeToolCalls,
    error,
    send,
    stop,
    reset,
  };
}
