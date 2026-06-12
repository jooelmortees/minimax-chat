"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Wrench, XCircle, CheckCircle2 } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { ToolCall } from "@/lib/types";

interface ToolCallCardProps {
  toolCall: ToolCall;
  defaultExpanded?: boolean;
}

export function ToolCallCard({ toolCall, defaultExpanded = false }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const isRunning = toolCall.status === "running" || toolCall.status === "pending";
  const isError = toolCall.status === "error";
  const isSuccess = toolCall.status === "success";

  const duration =
    toolCall.endedAt && toolCall.startedAt
      ? `${toolCall.endedAt - toolCall.startedAt} ms`
      : null;

  return (
    <div className="my-2 rounded-lg border border-border bg-bg-subtle overflow-hidden text-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-elevated transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-fg-subtle shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-fg-subtle shrink-0" />
        )}

        {isRunning ? (
          <Loader2 size={14} className="animate-spin text-accent shrink-0" />
        ) : isError ? (
          <XCircle size={14} className="text-danger shrink-0" />
        ) : isSuccess ? (
          <CheckCircle2 size={14} className="text-success shrink-0" />
        ) : (
          <Wrench size={14} className="text-fg-muted shrink-0" />
        )}

        <span className="font-mono text-fg truncate flex-1">
          {toolCall.name}
        </span>

        {toolCall.server && (
          <span className="hidden sm:inline text-xs text-fg-subtle bg-bg-elevated border border-border px-1.5 py-0.5 rounded">
            {toolCall.server}
          </span>
        )}

        {duration && (
          <span className="text-xs text-fg-subtle tabular-nums shrink-0">
            {duration}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border bg-bg-elevated px-3 py-2 space-y-2">
          <div>
            <div className="text-xs font-medium text-fg-muted mb-1">Argumentos</div>
            <pre className="text-xs overflow-x-auto bg-bg p-2 rounded border border-border">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>
          {toolCall.result !== undefined && (
            <div>
              <div className="text-xs font-medium text-fg-muted mb-1">
                {isError ? "Error" : "Resultado"}
              </div>
              <pre
                className={cn(
                  "text-xs overflow-x-auto bg-bg p-2 rounded border border-border max-h-96 overflow-y-auto",
                  isError && "border-danger/40 text-danger"
                )}
              >
                {isError
                  ? toolCall.error
                  : truncateForPreview(toolCall.result ?? "")}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function truncateForPreview(s: string): string {
  if (s.length <= 4000) return s;
  return `${s.slice(0, 4000)}\n\n[...truncado, total ${s.length} chars]`;
}
