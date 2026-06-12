"use client";

import { useEffect, useRef, useState, KeyboardEvent } from "react";
import {
  Send,
  Square,
  Paperclip,
  Mic,
  MicOff,
  Image as ImageIcon,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import type { Attachment } from "@/lib/types";

interface ChatInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB (MiniMax-M3 traga dataURLs grandes pero tiene coste)
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ALLOWED_AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/wav", "audio/mp3", "audio/mpeg", "audio/mp4"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder = "Escribe un mensaje… (Shift+Enter para nueva línea)",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  // Auto-resize del textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      stopRecordingStream();
    };
  }, []);

  const submit = () => {
    const text = value.trim();
    if ((!text && attachments.length === 0) || isStreaming || disabled) return;
    onSend(text, attachments);
    setValue("");
    setAttachments([]);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onPickImage = () => fileInputRef.current?.click();
  const onPickVideo = () => videoInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setMediaError(null);
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-seleccionar el mismo
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setMediaError(`Tipo no soportado: ${file.type}. Usa PNG/JPG/WebP/GIF.`);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setMediaError(
        `Imagen demasiado grande (${formatBytes(file.size)}). Máximo ${formatBytes(MAX_IMAGE_BYTES)}.`
      );
      return;
    }
    const dataUrl = await readFileAsDataURL(file);
    const att: Attachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind: "image",
      mimeType: file.type,
      name: file.name,
      dataUrl,
      size: file.size,
    };
    setAttachments((prev) => [...prev, att]);
  };

  const onVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setMediaError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      setMediaError(`Tipo no soportado: ${file.type}. Usa MP4/WebM/OGG/MOV.`);
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setMediaError(
        `Video demasiado grande (${formatBytes(file.size)}). Máximo ${formatBytes(MAX_VIDEO_BYTES)}.`
      );
      return;
    }
    const dataUrl = await readFileAsDataURL(file);
    const att: Attachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind: "video",
      mimeType: file.type,
      name: file.name,
      dataUrl,
      size: file.size,
    };
    setAttachments((prev) => [...prev, att]);
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const startRecording = async () => {
    setMediaError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setMediaError("Tu navegador no soporta grabación de audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      // Elegimos un mimeType compatible
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: mime });
        if (blob.size > MAX_AUDIO_BYTES) {
          setMediaError(
            `Audio demasiado grande (${formatBytes(blob.size)}). Máximo ${formatBytes(MAX_AUDIO_BYTES)}.`
          );
        } else if (blob.size > 0) {
          const dataUrl = await blobToDataURL(blob);
          const ext = mime.includes("ogg")
            ? "ogg"
            : mime.includes("mp4")
            ? "mp4"
            : mime.includes("wav")
            ? "wav"
            : "webm";
          const att: Attachment = {
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            kind: "audio",
            mimeType: mime,
            name: `grabacion.${ext}`,
            dataUrl,
            size: blob.size,
          };
          setAttachments((prev) => [...prev, att]);
        }
        stopRecordingStream();
      };
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setMediaError(
        err instanceof Error
          ? `No se pudo acceder al micrófono: ${err.message}`
          : "No se pudo acceder al micrófono."
      );
      stopRecordingStream();
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
  };

  const stopRecordingStream = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !isStreaming && !disabled;

  return (
    <div className="border-t border-border bg-bg p-2 sm:p-4">
      <div className="max-w-3xl mx-auto space-y-2">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <AttachmentChip
                key={att.id}
                att={att}
                onRemove={() => removeAttachment(att.id)}
                disabled={isStreaming}
              />
            ))}
          </div>
        )}

        {mediaError && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/40 rounded px-2 py-1">
            {mediaError}
          </div>
        )}

        {isRecording && (
          <div className="flex items-center gap-2 text-xs text-danger">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
            </span>
            Grabando… {formatTime(recordingSeconds)}
          </div>
        )}

        <div
          className={cn(
            "flex items-end gap-1.5 sm:gap-2 rounded-2xl border border-border bg-bg-elevated p-2",
            "focus-within:border-accent/60 transition-colors"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            onChange={onFileChange}
            className="hidden"
            disabled={isStreaming}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept={ALLOWED_VIDEO_TYPES.join(",")}
            onChange={onVideoChange}
            className="hidden"
            disabled={isStreaming}
          />

          <button
            type="button"
            onClick={onPickImage}
            disabled={isStreaming || disabled}
            className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg hover:bg-bg-subtle disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Adjuntar imagen"
            title="Adjuntar imagen"
          >
            <ImageIcon size={18} />
          </button>

          <button
            type="button"
            onClick={onPickVideo}
            disabled={isStreaming || disabled}
            className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg hover:bg-bg-subtle disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Adjuntar video"
            title="Adjuntar video"
          >
            <VideoIcon size={18} />
          </button>

          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isStreaming || disabled}
            className={cn(
              "shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
              isRecording
                ? "bg-danger text-white hover:bg-danger/90"
                : "text-fg-muted hover:text-fg hover:bg-bg-subtle"
            )}
            aria-label={isRecording ? "Detener grabación" : "Grabar audio"}
            title={isRecording ? "Detener grabación" : "Grabar audio"}
          >
            {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
            className={cn(
              "flex-1 resize-none bg-transparent text-sm sm:text-base",
              "px-2 py-2 focus:outline-none placeholder:text-fg-subtle",
              "max-h-[200px] overflow-y-auto scrollbar-thin"
            )}
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-danger text-white flex items-center justify-center hover:bg-danger/90 transition-colors"
              aria-label="Detener generación"
            >
              <Square size={14} fill="white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className={cn(
                "shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors",
                canSend
                  ? "bg-accent text-bg hover:bg-accent-hover"
                  : "bg-bg-subtle text-fg-subtle cursor-not-allowed"
              )}
              aria-label="Enviar"
            >
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="hidden sm:block text-[11px] text-fg-subtle text-center mt-1.5">
          MiniMax M3 puede cometer errores. Verifica la información importante.
        </p>
      </div>
    </div>
  );
}

function AttachmentChip({
  att,
  onRemove,
  disabled,
}: {
  att: Attachment;
  onRemove: () => void;
  disabled: boolean;
}) {
  const Icon =
    att.kind === "image"
      ? ImageIcon
      : att.kind === "video"
      ? VideoIcon
      : att.kind === "audio"
      ? Mic
      : ImageIcon;
  return (
    <div className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg border border-border bg-bg-elevated text-xs">
      {att.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={att.dataUrl}
          alt={att.name}
          className="w-8 h-8 rounded object-cover"
        />
      ) : (
        <div className="w-8 h-8 rounded bg-bg-subtle flex items-center justify-center text-fg-muted">
          <Icon size={14} />
        </div>
      )}
      <div className="min-w-0 max-w-[180px]">
        <div className="truncate">{att.name}</div>
        <div className="text-fg-subtle text-[10px]">
          {att.kind} · {formatBytes(att.size)}
        </div>
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 w-5 h-5 rounded flex items-center justify-center text-fg-subtle hover:text-danger hover:bg-bg transition-colors"
          aria-label="Quitar adjunto"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
