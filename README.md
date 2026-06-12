# MiniMax Chat

Web tipo chat con **MiniMax M3** (vía API OpenAI-compatible), acceso a **MCP servers** (context7, gh_grep, etc.), autenticación de usuarios y persistencia en **Supabase** para usar el mismo estado desde cualquier dispositivo.

> **Estado del proyecto**: chat, MCPs (los que tienen remoto) y persistencia en Supabase funcionan. Auth email+password operativa. Realtime activa para sincronizar entre dispositivos. Storage configurado (ver "Limitaciones").

## Características

- **MiniMax M3** (1M contexto, coding/agent) como modelo por defecto. Configurable: `M2.7`, `M2-her`.
- **Streaming SSE** con texto y razonamiento (`<think>…</think>`) en tiempo real.
- **Tool calling transparente**: ves qué tool se llama, con sus args, y el resultado.
- **MCP servers** cargados desde `mcp_servers.json`. Soporta stdio (local) y remoto (HTTP). Por defecto trae:
  - `context7` (remoto oficial Upstash) — docs actualizadas.
  - `gh_grep` (remoto) — búsqueda de código en GitHub.
  - `tavily` (proxy MCP propio) — web search/extract/crawl. Funciona en Vercel.
  - `minimax` (proxy MCP propio) — imagen, video, audio TTS, música, voces. Funciona en Vercel.
  - **Los proxies MCP de Tavily y MiniMax** se exponen en route handlers de Next.js (`/api/mcp/tavily` y `/api/mcp/minimax`) usando `WebStandardStreamableHTTPServerTransport` del SDK MCP. Cada request crea un server + transport stateless (compatible con Vercel Functions). Las API keys se leen de `process.env` en el server, nunca llegan al cliente.
- **Auth con Supabase** (email + contraseña). El registro está deshabilitado por defecto: das de alta usuarios manualmente desde la Dashboard.
- **Persistencia en Supabase Postgres**: conversaciones, mensajes, prefs y adjuntos.
- **Realtime** activado en `conversations` y `messages` → ves los cambios en tiempo real desde cualquier dispositivo.
- **Storage** (bucket privado `chat-attachments`) con RLS por `user_id`. Al adjuntar un archivo, el cliente lo sube a Storage y la UI muestra una preview usando signed URLs. La metadata en `messages.attachments_meta` guarda solo `storagePath` (no el dataURL), por lo que los mensajes no se duplican entre dispositivos.
- **AGENTS.md como system prompt**: se carga tu `~/.config/opencode/AGENTS.md` y el `AGENTS.md` del proyecto.
- **Dark mode**, **mobile-first responsive**.

## Requisitos

- Node.js 20+ (probado con 22)
- Una API key de MiniMax: <https://platform.minimaxi.com/user-center/basic-information/interface-key>
- Una cuenta de Supabase (plan Free es suficiente): <https://supabase.com>

## Arranque rápido

### 1) Instala dependencias

```bash
npm install
```

### 2) Crea el proyecto Supabase

1. Ve a <https://supabase.com/dashboard> y crea un proyecto nuevo.
2. **Authentication → Providers**: deja Email habilitado, **deshabilita el signup público** (`Auth → Sign In/Up → "Allow new users to sign up" = OFF`).
3. **Authentication → Users → Add user**: crea tu usuario con email + contraseña (esto es lo que se usa para "registro manual").
4. **Settings → API**: copia `Project URL` y `anon public key`.
5. **SQL Editor → New query**: pega y ejecuta el contenido de [`supabase/migrations/0001_initial_schema.sql`](./supabase/migrations/0001_initial_schema.sql). Crea tablas, RLS, triggers, Storage bucket y publicación Realtime.

### 3) Configura el `.env.local`

```bash
cp .env.local.example .env.local
```

Edita `.env.local` con:
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` del paso 2.
- `MINIMAX_API_KEY`.
- Opcionales: `TAVILY_API_KEY`, `CONTEXT7_API_KEY` (recomendado), `GROQ_API_KEY`.

### 4) Arranca en dev

```bash
npm run dev
# Abre http://localhost:3000
# Te redirigirá a /login → entra con el usuario que creaste en el paso 2.
```

## Estructura

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # POST streaming SSE con tool calling iterativo
│   │   ├── tools/route.ts       # GET estado de MCPs + tools
│   │   └── health/route.ts
│   ├── login/                   # página de login + LoginForm
│   ├── settings/page.tsx        # diagnóstico
│   ├── page.tsx                 # home protegida (server component, carga perfil+prefs)
│   ├── layout.tsx
│   └── globals.css
├── components/chat/
│   ├── ChatShell.tsx            # orquestador (client component, Realtime incluido)
│   ├── Header.tsx
│   ├── Sidebar.tsx              # conversaciones + estado MCP + user/logout
│   ├── MessageList.tsx
│   ├── Message.tsx
│   ├── ChatInput.tsx
│   ├── ToolCallCard.tsx
│   └── Markdown.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # createBrowserClient
│   │   ├── server.ts            # createServerClient (RSC, route handlers, server actions)
│   │   ├── middleware.ts        # updateSession (refresco de cookies)
│   │   └── database.types.ts    # tipos del schema (generados manualmente)
│   ├── auth/
│   │   └── actions.ts           # signIn, signOut (server actions)
│   ├── agents/
│   │   ├── loop.ts              # agent loop (model + tools iterativo)
│   │   └── system-prompt.ts     # carga AGENTS.md y construye el system prompt
│   ├── llm/client.ts            # cliente OpenAI -> api.minimax.io
│   ├── mcp/manager.ts           # ciclo de vida de servidores MCP stdio/remote
│   ├── hooks/useChat.ts         # cliente SSE para el navegador
│   ├── storage/
│   │   ├── conversations.ts     # Supabase: conversaciones, mensajes, prefs
│   │   └── attachments.ts       # Supabase Storage: upload/download/signed URLs
│   ├── types.ts
│   └── utils.ts
├── middleware.ts                # refresca sesión Supabase y protege rutas
mcp_servers.json                 # config MCP estilo Claude Desktop
supabase/migrations/0001_initial_schema.sql
.env.local.example
```

## Variables de entorno

| Variable | Default | Descripción |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | — | **Requerida.** URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | **Requerida.** anon public key. |
| `MINIMAX_API_KEY` | — | **Requerida.** API key de MiniMax. Usada por el chat Y por el proxy MCP `/api/mcp/minimax`. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | URL pública de la app (sin slash final). Usada para construir las URLs de los proxies MCP internos. En Vercel: `https://<proyecto>.vercel.app`. |
| `MCP_PROXY_TOKEN` | — | **Recomendado en producción.** Token compartido que protege los endpoints `/api/mcp/*`. Genera uno con `openssl rand -hex 32`. Si está vacío, los endpoints quedan abiertos. |
| `MINIMAX_MODEL` | `MiniMax-M3` | Modelo por defecto. |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | URL base del API. |
| `MCP_SERVERS_CONFIG` | `./mcp_servers.json` | Ruta al fichero de config de MCPs. |
| `TAVILY_API_KEY` | — | API key de Tavily, consumida por el proxy MCP `/api/mcp/tavily`. |
| `CONTEXT7_API_KEY` | — | Recomendado. Mayor rate limit. |
| `GROQ_API_KEY` | — | Transcripción de audio. |
| `GLOBAL_AGENTS_PATH` | — | Ruta absoluta a un `AGENTS.md` global. |
| `PROJECT_ROOT` | `.` | Directorio base para el `AGENTS.md` local. |

## Deploy en Vercel

Ver [`DEPLOY.md`](./DEPLOY.md) para instrucciones paso a paso.

Resumen:
1. `git init` + crear repo en GitHub + push.
2. En Vercel: "Add New Project" → importa el repo.
3. Configura las **Environment Variables** (mismas que `.env.local`, **excepto** `MCP_SERVERS_CONFIG` que puede quedarse por defecto y `GLOBAL_AGENTS_PATH` que no tiene sentido en Vercel).
4. Deploy. Vercel te dará una URL `https://<proyecto>.vercel.app`.

## Limitaciones conocidas

- **`minimax-mcp` original (Python/uvx)** sigue siendo stdio. Lo hemos sustituido por un proxy MCP HTTP (`/api/mcp/minimax`) que wrappea la API REST de MiniMax directamente. Funcionalmente equivalente para `text_to_audio`, `text_to_image`, `generate_video` (con `query_video_generation`), `list_voices` y `music_generation`. La diferencia: el proxy se ejecuta dentro del deploy de Vercel y consume tu `MINIMAX_API_KEY` desde `process.env`, en vez de un proceso Python local. Si necesitas una tool específica del `minimax-mcp` original que no esté en el proxy (p. ej. `play_audio`, `voice_design` experimental), dímelo y la añado.
- **El `middleware` file convention estaba deprecado en Next.js 16** (ahora `proxy.ts`). **Ya migrado** (`src/proxy.ts`). El build ya muestra `Proxy (Middleware)` en vez de `Middleware`.
- **Registro público deshabilitado**: cada usuario nuevo lo das de alta manualmente en `Auth → Users → Add user` desde la Dashboard. Esto es intencional para no exponer tus API keys de MCP.
- **Timeout de Vercel Functions**: Hobby = 10s, Pro = 60s. Las tools Tavily (search/extract/crawl) y MiniMax (image/audio) responden en segundos. `generate_video` puede tardar minutos; la implementación devuelve un `task_id` y hay que llamar a `query_video_generation` después. Aceptable, pero si quieres que el modelo espere el vídeo completo necesitas rethinkear el loop.

## Scripts

- `npm run dev` — dev server.
- `npm run build` — build de producción.
- `npm start` — arranca el build.
- `npm run typecheck` — TypeScript sin emit.
- `npm run lint` — ESLint (puede fallar en Windows con paths con espacios; usa `npx tsc --noEmit` como alternativa).
