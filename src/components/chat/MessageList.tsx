"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./Message";
import { ToolCallCard } from "./ToolCallCard";
import type { Message, ToolCall } from "@/lib/types";
import { Sparkles } from "lucide-react";

interface MessageListProps {
  messages: Message[];
  showReasoning: boolean;
  isStreaming: boolean;
  streamingReasoning: string;
  streamingContent: string;
  activeToolCalls: ToolCall[];
  error: string | null;
}

export function MessageList({
  messages,
  showReasoning,
  isStreaming,
  streamingReasoning,
  streamingContent,
  activeToolCalls,
  error,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingContent, activeToolCalls.length]);

  const isEmpty = messages.length === 0;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6"
    >
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        {isEmpty && !isStreaming && <EmptyState />}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            showReasoning={showReasoning}
          />
        ))}

        {isStreaming && (
          <div className="flex justify-start gap-2 sm:gap-3">
            <div className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
              <Sparkles size={14} className="text-accent sm:hidden animate-pulse" />
              <Sparkles size={16} className="text-accent hidden sm:block animate-pulse" />
            </div>
            <div className="min-w-0 max-w-[88%] sm:max-w-[80%] md:max-w-[75%] space-y-2">
              {activeToolCalls.map((tc) => (
                <ToolCallCard
                  key={tc.id}
                  toolCall={tc}
                  defaultExpanded={true}
                />
              ))}

              {showReasoning && streamingReasoning && (
                <details className="text-xs text-fg-muted" open>
                  <summary className="cursor-pointer hover:text-fg flex items-center gap-1.5 select-none">
                    Razonando…
                  </summary>
                  <div className="mt-2 pl-3 border-l-2 border-border whitespace-pre-wrap">
                    {streamingReasoning}
                  </div>
                </details>
              )}

              {streamingContent && (
                <div className="rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 bg-assistant-bubble border border-border">
                  <div className="prose-chat whitespace-pre-wrap">
                    {streamingContent}
                    <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse" />
                  </div>
                </div>
              )}

              {!streamingContent && activeToolCalls.length === 0 && (
                <div className="rounded-2xl px-4 py-3 bg-assistant-bubble border border-border text-fg-muted text-sm">
                  <div className="flex items-center gap-1">
                    <span className="typing-dot w-1.5 h-1.5 rounded-full bg-fg-muted" />
                    <span className="typing-dot w-1.5 h-1.5 rounded-full bg-fg-muted" />
                    <span className="typing-dot w-1.5 h-1.5 rounded-full bg-fg-muted" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center mb-4">
        <Sparkles size={22} className="text-white sm:hidden" />
        <Sparkles size={26} className="text-white hidden sm:block" />
      </div>
      <h1 className="text-xl sm:text-2xl font-semibold mb-2">MiniMax Chat</h1>
      <p className="text-fg-muted text-sm max-w-md">
        M3 con acceso a MCPs, AGENTS.md como system prompt, y streaming
        transparente. Empieza escribiendo abajo.
      </p>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg text-left">
        {[
          "Resume el estado de los MCPs conectados",
          "Refactoriza src/lib/agents/loop.ts",
          "Busca en context7 la doc de Zod 4",
          "Lista los .md del proyecto y lée AGENTS.md",
        ].map((s) => (
          <div
            key={s}
            className="text-xs border border-border rounded-lg px-3 py-2 text-fg-muted bg-bg-elevated"
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
