// Tipos compartidos cliente/servidor

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  server: string;
  args: Record<string, unknown>;
  result?: string;
  error?: string;
  status: "pending" | "running" | "success" | "error";
  startedAt: number;
  endedAt?: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  // Razonamiento extraído del modelo (etiquetas <think>)
  reasoning?: string;
  // Solo en assistant: lista de tool calls emitidas
  toolCalls?: ToolCall[];
  // Solo en tool: id de la tool call a la que responde
  toolCallId?: string;
  // Adjuntos del usuario (imágenes, audio, etc.) - dataURL
  attachments?: Attachment[];
  createdAt: number;
}

export type AttachmentKind = "image" | "audio" | "video" | "file";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  mimeType: string;
  name: string;
  /**
   * Contenido del adjunto. Para imágenes, dataURL (data:image/...;base64,...).
   * Para audio, dataURL o un blob URL que apunte a un endpoint del backend.
   */
  dataUrl: string;
  size: number;
}

/** Preferencias de capacidades multimodales (en localStorage). */
export interface Capabilities {
  image: boolean;
  audio: boolean; // TTS
  video: boolean;
  voice: boolean; // voice cloning
  music: boolean;
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  image: true,
  audio: true,
  video: true,
  voice: true,
  music: true,
};

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Config de un servidor MCP. Soporta dos tipos:
 *  - "stdio" (default): arranca un proceso local con command + args.
 *  - "remote": se conecta por HTTP streamable a una URL.
 *
 * El campo `enabled` (default true) permite apagar un servidor sin borrarlo.
 * Los campos `_note` y `_comment` son metadatos ignorados por el manager.
 */
export type MCPServerConfig =
  | {
      type?: "stdio";
      command: string;
      args: string[];
      env?: Record<string, string>;
      description?: string;
      enabled?: boolean;
      timeout?: number;
      _note?: string;
      _comment?: string;
    }
  | {
      type: "remote";
      url: string;
      description?: string;
      enabled?: boolean;
      timeout?: number;
      headers?: Record<string, string>;
      _note?: string;
      _comment?: string;
    };

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [k: string]: unknown;
  };
}

export interface MCPServerStatus {
  name: string;
  description?: string;
  connected: boolean;
  toolCount: number;
  error?: string;
}

// ---- Eventos SSE del chat ----
export type StreamEvent =
  | { type: "start"; conversationId: string; model: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_result"; toolCallId: string; result: string; error?: string }
  | { type: "usage"; promptTokens: number; completionTokens: number }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string }
  // Adjuntos transcritos (audio→texto) que el modelo recibe como mensaje user
  | { type: "attachment_transcribed"; attachmentId: string; text: string };

export const DEFAULT_MODEL = "MiniMax-M3";
export const AVAILABLE_MODELS = [
  { id: "MiniMax-M3", label: "MiniMax M3", desc: "Flagship · 1M contexto · Coding/Agent" },
  { id: "MiniMax-M2.7", label: "MiniMax M2.7", desc: "Rápido y capaz" },
  { id: "M2-her", label: "M2-her", desc: "Role-play y diálogo" },
] as const;
