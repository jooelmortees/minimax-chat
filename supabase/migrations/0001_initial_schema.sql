-- =============================================================================
-- 0001_initial_schema.sql
-- Esquema inicial de MiniMax Chat con Supabase.
-- - Auth: Supabase Auth (auth.users).
-- - Datos: profiles, prefs, conversations, messages, attachments.
-- - Storage: bucket privado 'chat-attachments' con RLS por user_id.
-- - Realtime: publicación de conversations y messages.
-- - RLS estricta en todas las tablas: cada usuario solo ve lo suyo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: 1 fila por usuario, datos básicos.
-- -----------------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.tg_touch_updated_at();

-- Se crea fila en profiles al registrarse (auth.users row → profiles row).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;

  insert into public.prefs (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- prefs: preferencias del usuario (1 fila por user). Modelo, temperatura, etc.
-- -----------------------------------------------------------------------------
create table public.prefs (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  model                  text        not null default 'MiniMax-M3',
  temperature            real        not null default 1.0,
  system_prompt_additions text       not null default '',
  show_reasoning         boolean     not null default true,
  default_voice_id       text        not null default '',
  -- Capabilities multimodales (image, audio, video, voice, music).
  cap_image              boolean     not null default true,
  cap_audio              boolean     not null default true,
  cap_video              boolean     not null default true,
  cap_voice              boolean     not null default true,
  cap_music              boolean     not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger prefs_touch_updated_at
  before update on public.prefs
  for each row execute function public.tg_touch_updated_at();

-- -----------------------------------------------------------------------------
-- conversations: cabecera. Los mensajes viven en su propia tabla.
-- -----------------------------------------------------------------------------
create table public.conversations (
  id          text        primary key,                            -- 'conv_<nanoid>' generado en cliente
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null default 'Nueva conversación',
  model       text        not null default 'MiniMax-M3',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create trigger conversations_touch_updated_at
  before update on public.conversations
  for each row execute function public.tg_touch_updated_at();

-- -----------------------------------------------------------------------------
-- messages: cada mensaje de una conversación (user / assistant / tool / system).
-- Se almacenan campos en columnas tipadas; el cuerpo en JSONB para flexibilidad
-- de tool_calls, attachments, etc.
-- -----------------------------------------------------------------------------
create table public.messages (
  id              text        primary key,                        -- generado en cliente
  conversation_id text        not null references public.conversations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  role            text        not null check (role in ('system','user','assistant','tool')),
  content         text        not null default '',
  reasoning       text,
  tool_call_id    text,
  -- tool_calls: array JSONB de {id,name,server,args,result,error,status,startedAt,endedAt}
  tool_calls      jsonb       not null default '[]'::jsonb,
  -- attachments_meta: array JSONB de {id,kind,mimeType,name,size,storagePath}
  attachments_meta jsonb      not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index messages_conv_idx
  on public.messages (conversation_id, created_at asc);
create index messages_user_idx
  on public.messages (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- attachments: metadata de archivos subidos a Storage. Binarios en bucket.
-- -----------------------------------------------------------------------------
create table public.attachments (
  id           text        primary key,                          -- generado en cliente
  user_id      uuid        not null references auth.users(id) on delete cascade,
  message_id   text        references public.messages(id) on delete cascade,
  kind         text        not null check (kind in ('image','audio','video','file')),
  mime_type    text        not null,
  name         text        not null,
  size         bigint      not null,
  storage_path text        not null,                            -- 'user_id/<attachment_id>'
  created_at   timestamptz not null default now()
);

create index attachments_user_idx
  on public.attachments (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS en todas las tablas
-- -----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.prefs          enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.attachments    enable row level security;

-- profiles: solo el dueño.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = user_id);

-- prefs: solo el dueño.
create policy "prefs_select_own" on public.prefs
  for select using (auth.uid() = user_id);
create policy "prefs_insert_own" on public.prefs
  for insert with check (auth.uid() = user_id);
create policy "prefs_update_own" on public.prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "prefs_delete_own" on public.prefs
  for delete using (auth.uid() = user_id);

-- conversations: solo el dueño.
create policy "conversations_select_own" on public.conversations
  for select using (auth.uid() = user_id);
create policy "conversations_insert_own" on public.conversations
  for insert with check (auth.uid() = user_id);
create policy "conversations_update_own" on public.conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversations_delete_own" on public.conversations
  for delete using (auth.uid() = user_id);

-- messages: el dueño de la conversación (unido por user_id redundante).
create policy "messages_select_own" on public.messages
  for select using (auth.uid() = user_id);
create policy "messages_insert_own" on public.messages
  for insert with check (auth.uid() = user_id);
create policy "messages_update_own" on public.messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "messages_delete_own" on public.messages
  for delete using (auth.uid() = user_id);

-- attachments: solo el dueño.
create policy "attachments_select_own" on public.attachments
  for select using (auth.uid() = user_id);
create policy "attachments_insert_own" on public.attachments
  for insert with check (auth.uid() = user_id);
create policy "attachments_update_own" on public.attachments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "attachments_delete_own" on public.attachments
  for delete using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Trigger: crear profiles + prefs al registrarse (idempotente).
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Storage: bucket privado 'chat-attachments' con RLS por user_id.
-- La key del objeto sigue el patrón 'user_id/<attachment_id>.<ext>'.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  52428800,                                                            -- 50 MB
  array['image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/wav','audio/webm','audio/ogg','video/mp4','video/webm','application/pdf','application/octet-stream']
)
on conflict (id) do nothing;

-- Policy: el dueño puede subir/seleccionar/actualizar/borrar objetos bajo su prefijo.
create policy "storage_chat_attachments_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "storage_chat_attachments_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "storage_chat_attachments_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "storage_chat_attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- Realtime: publicación en conversations y messages (filtrada por RLS en cliente).
-- En proyectos nuevos postgres_changes está DESHABILITADO por defecto; al añadir
-- tablas a la publicación por defecto, el cliente recibe los eventos.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  -- Añadir solo si no están ya. setval/catch de "relation already in publication".
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.attachments;
  exception when duplicate_object then null;
  end;
end
$$;

-- -----------------------------------------------------------------------------
-- Helper: client puede pedir el path 'user_id/<id>' para Storage.
-- No necesita función SQL; lo construye el cliente.
-- -----------------------------------------------------------------------------
