'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useChat } from '@/lib/hooks/useChat';
import {
  type Conversation,
  type MCPServerStatus,
  type Message,
  type MCPTool,
  type Attachment,
} from '@/lib/types';
import {
  createConversation as storageCreateConversation,
  deleteConversation as storageDeleteConversation,
  DEFAULT_PREFS,
  getConversations,
  getPrefs,
  savePrefs,
  upsertConversation,
  type UserPrefs,
} from '@/lib/storage/conversations';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { signOut } from '@/lib/auth/actions';

interface ToolsInfo {
  minimax: { reachable: boolean; error?: string };
  mcp: { servers: MCPServerStatus[]; tools: MCPTool[] };
}

interface ChatShellProps {
  initialEmail: string | null;
  initialDisplayName: string | null;
  initialPrefs: import('@/lib/supabase/database.types').Database['public']['Tables']['prefs']['Row'] | null;
}

function prefsFromRow(row: ChatShellProps['initialPrefs']): UserPrefs {
  if (!row) return DEFAULT_PREFS;
  return {
    model: row.model,
    temperature: row.temperature,
    systemPromptAdditions: row.system_prompt_additions,
    showReasoning: row.show_reasoning,
    defaultVoiceId: row.default_voice_id,
    capabilities: {
      image: row.cap_image,
      audio: row.cap_audio,
      video: row.cap_video,
      voice: row.cap_voice,
      music: row.cap_music,
    },
  };
}

export function ChatShell({ initialEmail, initialDisplayName, initialPrefs }: ChatShellProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Inicializamos con los prefs del servidor para evitar el parpadeo de defaults
  // → defaults. Tras el mount seguimos usando getPrefs() (que es Supabase) por
  // si ha cambiado desde otra pestaña.
  const [prefs, setPrefs] = useState<UserPrefs>(() => prefsFromRow(initialPrefs));
  const [toolsInfo, setToolsInfo] = useState<ToolsInfo | null>(null);
  const [showSettingsHint, setShowSettingsHint] = useState(false);
  const realtimeSetup = useRef(false);

  // Carga inicial: conversaciones + (re)lectura de prefs (sin hydration mismatch).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Re-leer prefs para estar al día (otro dispositivo pudo haber cambiado algo).
      const freshPrefs = await getPrefs();
      if (!cancelled) setPrefs(freshPrefs);

      const convs = await getConversations();
      if (cancelled) return;

      if (convs.length > 0) {
        setConversations(convs);
        setActiveId(convs[0].id);
      } else {
        const c = await storageCreateConversation(freshPrefs.model);
        await upsertConversation(c, []);
        setConversations([c]);
        setActiveId(c.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Carga de tools/MCPs en background
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/tools', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as ToolsInfo;
        if (!cancelled) setToolsInfo(data);
        if (!data.minimax.reachable) setShowSettingsHint(true);
      } catch (err) {
        console.warn('Error cargando /api/tools:', err);
      }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Realtime: sincroniza conversations + messages entre dispositivos.
  useEffect(() => {
    if (realtimeSetup.current) return;
    realtimeSetup.current = true;

    const supabase = createSupabaseBrowser();

    // Cuando cambia la lista de conversaciones (insert/update/delete) refrescamos.
    const convsChannel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        async (payload) => {
          // Si el evento es de otro user no debería llegarnos (RLS filtra), pero
          // por si acaso comprobamos.
          const ev = payload.new as { user_id?: string } | null;
          if (ev && ev.user_id) {
            // OK
          }
          // Recargar todo. Es barato y evita problemas de orden.
          const convs = await getConversations();
          setConversations(convs);
        }
      )
      .subscribe();

    // Mensajes: recarga la conversación afectada.
    const msgsChannel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        async (payload) => {
          const newRow = payload.new as { conversation_id?: string } | null;
          const oldRow = payload.old as { conversation_id?: string } | null;
          const convId = newRow?.conversation_id ?? oldRow?.conversation_id;
          if (!convId) return;

          // Recargar mensajes de esa conversación y actualizar lista.
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === convId);
            if (idx < 0) return prev;
            void (async () => {
              const convs = await getConversations();
              setConversations(convs);
            })();
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(convsChannel);
      void supabase.removeChannel(msgsChannel);
    };
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const persistMessages = useCallback(
    async (msgs: Message[]) => {
      if (!active) return;
      try {
        const updated = await upsertConversation(active, msgs);
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === updated.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [updated, ...prev];
        });
      } catch (err) {
        console.warn('persistMessages:', err);
      }
    },
    [active]
  );

  const { isStreaming, streamingReasoning, streamingContent, activeToolCalls, error, send, stop, reset } =
    useChat({
      model: prefs.model,
      capabilities: prefs.capabilities,
      systemPromptAdditions: prefs.systemPromptAdditions,
      onMessagesChange: persistMessages,
    });

  const onSend = useCallback(
    async (text: string, attachments: Attachment[]) => {
      if (!active) return;
      const history = active.messages;
      await send(history, text, attachments);
    },
    [active, send]
  );

  const onNew = async () => {
    const c = await storageCreateConversation(prefs.model);
    await upsertConversation(c, []);
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    reset();
  };

  const onDelete = async (id: string) => {
    try {
      await storageDeleteConversation(id);
    } catch (err) {
      console.warn('onDelete:', err);
    }
    const remaining = await getConversations();
    setConversations(remaining);
    if (activeId === id) {
      setActiveId(remaining[0]?.id ?? null);
      if (!remaining[0]) void onNew();
    }
  };

  const onSelect = (id: string) => {
    setActiveId(id);
    reset();
  };

  const updateModel = async (model: string) => {
    const next = { ...prefs, model };
    setPrefs(next);
    try {
      await savePrefs(next);
    } catch (err) {
      console.warn('updateModel.save:', err);
    }
  };

  const toggleReasoning = async () => {
    const next = { ...prefs, showReasoning: !prefs.showReasoning };
    setPrefs(next);
    try {
      await savePrefs(next);
    } catch (err) {
      console.warn('toggleReasoning.save:', err);
    }
  };

  const mcpServers = toolsInfo?.mcp.servers ?? [];
  const mcpOk = mcpServers.filter((s) => s.connected).length;

  return (
    <div className="h-screen flex bg-bg text-fg overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={onSelect}
        onNew={onNew}
        onDelete={onDelete}
        mcpStatus={mcpServers}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={() => {
          setSidebarOpen(false);
          router.push('/settings');
        }}
        user={{
          email: initialEmail,
          displayName: initialDisplayName,
          onSignOut: () => {
            void signOut();
          },
        }}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          model={prefs.model}
          onModelChange={updateModel}
          showReasoning={prefs.showReasoning}
          onToggleReasoning={toggleReasoning}
          onOpenSidebar={() => setSidebarOpen(true)}
          status={{
            minimaxOk: toolsInfo?.minimax.reachable ?? null,
            mcpCount: mcpServers.length,
            mcpOk,
          }}
        />

        {showSettingsHint && toolsInfo && !toolsInfo.minimax.reachable && (
          <SettingsBanner
            error={toolsInfo.minimax.error}
            onClose={() => setShowSettingsHint(false)}
          />
        )}

        <MessageList
          messages={active?.messages ?? []}
          showReasoning={prefs.showReasoning}
          isStreaming={isStreaming}
          streamingReasoning={streamingReasoning}
          streamingContent={streamingContent}
          activeToolCalls={activeToolCalls}
          error={error}
        />

        <ChatInput
          onSend={onSend}
          onStop={stop}
          isStreaming={isStreaming}
          disabled={!toolsInfo?.minimax.reachable}
          placeholder={
            toolsInfo && !toolsInfo.minimax.reachable
              ? 'Configura MINIMAX_API_KEY en .env.local para empezar'
              : 'Escribe un mensaje… (Shift+Enter para nueva línea)'
          }
        />
      </div>
    </div>
  );
}

function SettingsBanner({
  error,
  onClose,
}: {
  error?: string;
  onClose: () => void;
}) {
  return (
    <div className="bg-warning/10 border-b border-warning/40 px-3 sm:px-4 py-2 text-sm flex items-start gap-2">
      <span className="text-warning shrink-0">⚠️</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium">No se puede conectar a MiniMax</div>
        <div className="text-xs text-fg-muted mt-0.5 break-words">
          Revisa que <code className="px-1 bg-bg-elevated rounded">MINIMAX_API_KEY</code>{" "}
          esté definida en <code className="px-1 bg-bg-elevated rounded">.env.local</code>.
          {error ? ` Detalle: ${error}` : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-fg-muted hover:text-fg text-xs shrink-0"
        aria-label="Cerrar"
      >
        ✕
      </button>
    </div>
  );
}
