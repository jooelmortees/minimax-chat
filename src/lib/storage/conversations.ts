/**
 * Storage de conversaciones y prefs sobre Supabase.
 * Reemplaza al antiguo conversations.ts (localStorage).
 *
 * Decisiones:
 * - El cliente de Supabase se crea en el navegador; no importamos server.ts
 *   para mantener la API similar a la versión localStorage.
 * - Las prefs se hidratan con DEFAULT_PREFS en el servidor y se cargan
 *   en cliente tras montar (useEffect) para evitar hydration mismatch.
 * - Las conversaciones se listan en orden updated_at desc.
 */

import { nanoid } from 'nanoid';
import {
  type Capabilities,
  DEFAULT_CAPABILITIES,
  type Conversation,
  type Message,
} from '@/lib/types';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

export interface UserPrefs {
  model: string;
  temperature: number;
  systemPromptAdditions: string;
  showReasoning: boolean;
  capabilities: Capabilities;
  defaultVoiceId: string;
}

export const DEFAULT_PREFS: UserPrefs = {
  model: 'MiniMax-M3',
  temperature: 1.0,
  systemPromptAdditions: '',
  showReasoning: true,
  capabilities: DEFAULT_CAPABILITIES,
  defaultVoiceId: '',
};

// --- Conversaciones ---

type ConvRow = Database['public']['Tables']['conversations']['Row'];
type MsgRow = Database['public']['Tables']['messages']['Row'];

function rowToConversation(row: ConvRow, messages: Message[]): Conversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    messages,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function rowToMessage(row: MsgRow): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning ?? undefined,
    toolCalls: Array.isArray(row.tool_calls)
      ? (row.tool_calls as unknown as Message['toolCalls'])
      : [],
    toolCallId: row.tool_call_id ?? undefined,
    attachments: Array.isArray(row.attachments_meta)
      ? (row.attachments_meta as unknown as Message['attachments'])
      : [],
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function getConversations(): Promise<Conversation[]> {
  const supabase = createSupabaseBrowser();
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) {
    console.warn('getConversations:', error.message);
    return [];
  }
  if (!convs || convs.length === 0) return [];

  const ids = convs.map((c) => c.id);
  const { data: msgs, error: mErr } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', ids)
    .order('created_at', { ascending: true });
  if (mErr) {
    console.warn('getConversations.messages:', mErr.message);
  }

  const byConv = new Map<string, Message[]>();
  for (const m of msgs ?? []) {
    const arr = byConv.get(m.conversation_id) ?? [];
    arr.push(rowToMessage(m));
    byConv.set(m.conversation_id, arr);
  }

  return convs.map((c) => rowToConversation(c, byConv.get(c.id) ?? []));
}

export async function createConversation(model: string): Promise<Conversation> {
  const supabase = createSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const now = new Date().toISOString();
  const id = `conv_${nanoid(10)}`;
  const { error } = await supabase.from('conversations').insert({
    id,
    user_id: user.id,
    title: 'Nueva conversación',
    model,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(`createConversation: ${error.message}`);

  return {
    id,
    title: 'Nueva conversación',
    model,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function upsertConversation(
  conv: Conversation,
  messages: Message[]
): Promise<Conversation> {
  const supabase = createSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  // 1) Upsert de la cabecera
  const now = new Date().toISOString();
  const title = deriveTitle(messages, conv.title);
  const { error: convErr } = await supabase
    .from('conversations')
    .upsert(
      {
        id: conv.id,
        user_id: user.id,
        title,
        model: conv.model,
        updated_at: now,
      },
      { onConflict: 'id' }
    );
  if (convErr) throw new Error(`upsertConversation: ${convErr.message}`);

  // 2) Sincronizar mensajes. Estrategia: borrar los actuales de esa conversación
  //    y reinsertar. El volumen típico es bajo (decenas/cientos por conv) y
  //    garantiza consistencia sin tener que diffear.
  const { error: delErr } = await supabase
    .from('messages')
    .delete()
    .eq('conversation_id', conv.id);
  if (delErr) throw new Error(`upsertConversation.delete: ${delErr.message}`);

  if (messages.length > 0) {
    const rows = messages.map((m) => ({
      id: m.id,
      conversation_id: conv.id,
      user_id: user.id,
      role: m.role,
      content: m.content,
      reasoning: m.reasoning ?? null,
      tool_call_id: m.toolCallId ?? null,
      tool_calls: (m.toolCalls ?? []) as unknown as Database['public']['Tables']['messages']['Insert']['tool_calls'],
      attachments_meta: (m.attachments ?? []) as unknown as Database['public']['Tables']['messages']['Insert']['attachments_meta'],
      created_at: new Date(m.createdAt).toISOString(),
    }));
    const { error: insErr } = await supabase.from('messages').insert(rows);
    if (insErr) throw new Error(`upsertConversation.insert: ${insErr.message}`);
  }

  return {
    ...conv,
    messages,
    title,
    updatedAt: Date.now(),
  };
}

export async function deleteConversation(id: string): Promise<void> {
  const supabase = createSupabaseBrowser();
  const { error } = await supabase.from('conversations').delete().eq('id', id);
  if (error) throw new Error(`deleteConversation: ${error.message}`);
}

// --- Prefs ---

type PrefsRow = Database['public']['Tables']['prefs']['Row'];

function rowToPrefs(row: PrefsRow): UserPrefs {
  return {
    model: row.model,
    temperature: row.temperature,
    systemPromptAdditions: row.system_prompt_additions,
    showReasoning: row.show_reasoning,
    capabilities: {
      image: row.cap_image,
      audio: row.cap_audio,
      video: row.cap_video,
      voice: row.cap_voice,
      music: row.cap_music,
    },
    defaultVoiceId: row.default_voice_id,
  };
}

export async function getPrefs(): Promise<UserPrefs> {
  const supabase = createSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PREFS;

  const { data, error } = await supabase
    .from('prefs')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.warn('getPrefs:', error.message);
    return DEFAULT_PREFS;
  }
  return data ? rowToPrefs(data) : DEFAULT_PREFS;
}

export async function savePrefs(prefs: UserPrefs): Promise<void> {
  const supabase = createSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { error } = await supabase
    .from('prefs')
    .upsert(
      {
        user_id: user.id,
        model: prefs.model,
        temperature: prefs.temperature,
        system_prompt_additions: prefs.systemPromptAdditions,
        show_reasoning: prefs.showReasoning,
        default_voice_id: prefs.defaultVoiceId,
        cap_image: prefs.capabilities.image,
        cap_audio: prefs.capabilities.audio,
        cap_video: prefs.capabilities.video,
        cap_voice: prefs.capabilities.voice,
        cap_music: prefs.capabilities.music,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  if (error) throw new Error(`savePrefs: ${error.message}`);
}

// --- Helpers ---

function deriveTitle(messages: Message[], fallback: string): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim());
  if (!firstUser) return fallback;
  const text = firstUser.content.trim().split('\n')[0];
  if (text.length <= 60) return text || fallback;
  return `${text.slice(0, 57)}…`;
}
