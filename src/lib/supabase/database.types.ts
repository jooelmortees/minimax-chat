/**
 * Tipos de la base de datos. Generados manualmente a partir de
 * supabase/migrations/0001_initial_schema.sql. Si el esquema cambia,
 * actualiza este fichero (o usa `supabase gen types typescript` cuando esté
 * disponible la CLI).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      prefs: {
        Row: {
          user_id: string;
          model: string;
          temperature: number;
          system_prompt_additions: string;
          show_reasoning: boolean;
          default_voice_id: string;
          cap_image: boolean;
          cap_audio: boolean;
          cap_video: boolean;
          cap_voice: boolean;
          cap_music: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          model?: string;
          temperature?: number;
          system_prompt_additions?: string;
          show_reasoning?: boolean;
          default_voice_id?: string;
          cap_image?: boolean;
          cap_audio?: boolean;
          cap_video?: boolean;
          cap_voice?: boolean;
          cap_music?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          model?: string;
          temperature?: number;
          system_prompt_additions?: string;
          show_reasoning?: boolean;
          default_voice_id?: string;
          cap_image?: boolean;
          cap_audio?: boolean;
          cap_video?: boolean;
          cap_voice?: boolean;
          cap_music?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          model: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          title?: string;
          model?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          model?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: 'system' | 'user' | 'assistant' | 'tool';
          content: string;
          reasoning: string | null;
          tool_call_id: string | null;
          tool_calls: Json;
          attachments_meta: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: 'system' | 'user' | 'assistant' | 'tool';
          content?: string;
          reasoning?: string | null;
          tool_call_id?: string | null;
          tool_calls?: Json;
          attachments_meta?: Json;
          created_at?: string;
        };
        Update: {
          content?: string;
          reasoning?: string | null;
          tool_call_id?: string | null;
          tool_calls?: Json;
          attachments_meta?: Json;
        };
        Relationships: [];
      };
      attachments: {
        Row: {
          id: string;
          user_id: string;
          message_id: string | null;
          kind: 'image' | 'audio' | 'video' | 'file';
          mime_type: string;
          name: string;
          size: number;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          message_id?: string | null;
          kind: 'image' | 'audio' | 'video' | 'file';
          mime_type: string;
          name: string;
          size: number;
          storage_path: string;
          created_at?: string;
        };
        Update: {
          message_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
