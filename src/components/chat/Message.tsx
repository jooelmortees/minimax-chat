"use client";

import { Bot, Brain, User, Image as ImageIcon, Mic } from "lucide-react";
import { Markdown } from "./Markdown";
import { ToolCallCard } from "./ToolCallCard";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import { useAttachmentSrc } from "@/lib/hooks/useAttachmentSrc";
import type { Attachment, Message } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  showReasoning: boolean;
  isStreaming?: boolean;
}

export function MessageBubble({ message, showReasoning, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isAssistant = message.role === "assistant";

  if (isTool) {
    return (
      <div className="flex justify-start pl-2 sm:pl-10">
        <div className="max-w-full text-xs text-fg-subtle border-l-2 border-border pl-3 italic">
          resultado de tool: {truncate(message.content, 200)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2 sm:gap-3",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
          <Bot size={14} className="text-accent sm:hidden" />
          <Bot size={16} className="text-accent hidden sm:block" />
        </div>
      )}

      <div
        className={cn(
          "min-w-0 max-w-[88%] sm:max-w-[80%] md:max-w-[75%] rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3",
          isUser
            ? "bg-user-bubble text-white"
            : "bg-assistant-bubble border border-border"
        )}
      >
        {/* Adjuntos del usuario (input multimodal) */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <UserAttachmentView key={att.id} att={att} />
            ))}
          </div>
        )}

        {isAssistant && showReasoning && message.reasoning && (
          <details className="mb-2 text-xs text-fg-muted">
            <summary className="cursor-pointer hover:text-fg flex items-center gap-1.5 select-none">
              <Brain size={12} />
              <span>Razonamiento</span>
            </summary>
            <div className="mt-2 pl-3 border-l-2 border-border whitespace-pre-wrap">
              {message.reasoning}
            </div>
          </details>
        )}

        {isAssistant && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {message.content ? (
          isUser ? (
            <div className="whitespace-pre-wrap text-[0.95rem]">
              {renderUserContentWithMedia(message.content)}
            </div>
          ) : (
            <AssistantContentWithMedia content={message.content} />
          )
        ) : isAssistant && isStreaming ? (
          <TypingIndicator />
        ) : null}

        {message.createdAt && (
          <div
            className={cn(
              "text-[10px] mt-1.5 opacity-60",
              isUser ? "text-blue-100" : "text-fg-subtle"
            )}
          >
            {formatRelativeTime(message.createdAt)}
          </div>
        )}
      </div>

      {isUser && (
        <div className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-accent text-bg flex items-center justify-center">
          <User size={14} className="sm:hidden" />
          <User size={16} className="hidden sm:block" />
        </div>
      )}
    </div>
  );
}

function UserAttachmentView({ att }: { att: Attachment }) {
  const src = useAttachmentSrc(att);
  const displaySrc = src ?? att.dataUrl;
  if (att.kind === "image") {
    return (
      <a
        href={displaySrc}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg overflow-hidden border border-white/20 hover:border-white/40 transition-colors"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displaySrc}
          alt={att.name}
          className="max-w-[200px] max-h-[200px] object-cover"
        />
      </a>
    );
  }
  if (att.kind === "video") {
    return (
      <video
        src={displaySrc}
        controls
        className="max-w-[220px] max-h-[200px] rounded-lg border border-white/20"
        preload="metadata"
      />
    );
  }
  if (att.kind === "audio") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5">
        <Mic size={14} />
        <audio
          src={displaySrc}
          controls
          className="h-8 max-w-[220px]"
          preload="metadata"
        />
        <span className="text-[10px] opacity-70">{formatBytes(att.size)}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs">
      <ImageIcon size={12} />
      {att.name} ({formatBytes(att.size)})
    </div>
  );
}

/**
 * Detecta URLs en el contenido del assistant y las renderiza como media
 * (imagen, audio, video) cuando proceda. El resto se pasa por Markdown.
 */
function AssistantContentWithMedia({ content }: { content: string }) {
  const mediaUrls = extractMediaUrls(content);
  if (mediaUrls.length === 0) {
    return <Markdown>{content}</Markdown>;
  }
  // Quitamos las URLs del texto Markdown (ya las renderizamos abajo)
  const stripped = mediaUrls.reduce(
    (acc, u) => acc.split(u).join(""),
    content
  ).trim();
  return (
    <>
      {stripped && <Markdown>{stripped}</Markdown>}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {mediaUrls.map((u, i) => (
          <MediaEmbed key={`${u}_${i}`} url={u} />
        ))}
      </div>
    </>
  );
}

function renderUserContentWithMedia(content: string) {
  const urls = extractMediaUrls(content);
  if (urls.length === 0) return content;
  const stripped = urls.reduce((acc, u) => acc.split(u).join(""), content).trim();
  return (
    <>
      {stripped && <div>{stripped}</div>}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {urls.map((u, i) => (
          <MediaEmbed key={`${u}_${i}`} url={u} compact />
        ))}
      </div>
    </>
  );
}

function extractMediaUrls(text: string): string[] {
  const urlRe = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a|mp4|webm)(?:\?\S*)?/gi;
  return Array.from(new Set(text.match(urlRe) ?? []));
}

function MediaEmbed({ url, compact }: { url: string; compact?: boolean }) {
  const lower = url.toLowerCase();
  const isVideo = /\.(mp4|webm|m4v)(\?|$)/.test(lower);
  const isAudio = /\.(mp3|wav|ogg|m4a)(\?|$)/.test(lower);
  const isImage = !isVideo && !isAudio;

  if (isImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg overflow-hidden border border-border hover:border-accent/40 transition-colors"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="media generada"
          className={cn(
            "w-full object-cover",
            compact ? "max-h-40" : "max-h-80"
          )}
          loading="lazy"
        />
      </a>
    );
  }
  if (isVideo) {
    return (
      <video
        src={url}
        controls
        className="w-full rounded-lg border border-border"
        preload="metadata"
      />
    );
  }
  if (isAudio) {
    return (
      <audio
        src={url}
        controls
        className="w-full"
        preload="metadata"
      />
    );
  }
  return null;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-fg-muted" />
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-fg-muted" />
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-fg-muted" />
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}
