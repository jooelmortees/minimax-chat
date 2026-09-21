# MiniMax Chat

A web chat client for **MiniMax M3** with real tool use via **MCP servers**, user authentication and cloud persistence on **Supabase** — start a conversation on your laptop, continue it on your phone.

🌐 **Live demo:** <https://minimax-chat-bay.vercel.app>

## Features

- **MiniMax M3 by default** (1M-token context, strong coding and agent performance). Switchable to `M2.7` / `M2-her`.
- **Streaming responses** over SSE, including the model's `<think>…</think>` reasoning in real time.
- **Transparent tool calling** — every tool call shows its name, arguments and result.
- **MCP servers** loaded from `mcp_servers.json` (Claude-Desktop-style config). Supports local stdio and remote HTTP servers. Ships with:
  - `context7` — up-to-date library documentation
  - `gh_grep` — code search across GitHub
  - `tavily` — web search / extract / crawl, served through a built-in MCP proxy (`/api/mcp/tavily`) that runs on Vercel
  - `minimax` — MiniMax media APIs (text-to-image, text-to-audio/TTS, video generation, music, voices), served through `/api/mcp/minimax`
- **Supabase Auth** (email + password). Public sign-up is disabled by design — users are created manually.
- **Postgres persistence** — conversations, messages, preferences and attachments.
- **Realtime sync** — conversations stay in sync across devices, live.
- **Private file attachments** — Supabase Storage bucket with per-user RLS and signed-URL previews.
- **AGENTS.md as system prompt** — project and global `AGENTS.md` files are loaded into the agent's context.
- **Dark mode**, mobile-first responsive UI.

## 🔑 Bring your own API key (BYOK)

Anyone can use the app with **their own API key** — nobody spends the deployer's credits.

1. Open **Settings → Your API key**.
2. Paste your MiniMax key (get one at [platform.minimaxi.com](https://platform.minimaxi.com/user-center/basic-information/interface-key)).
3. Optionally set a custom **base URL** (any OpenAI-compatible endpoint) and **model**.

How it works:

- The key is stored **only in your browser** (`localStorage`) — it is never sent to Supabase or stored on the server.
- Each chat request sends it as a header; the server uses it **transiently** for that request only (chat completions *and* the MiniMax media tools: image, audio, video, music).
- It is never cached server-side and never logged.
- If the deployment also defines `MINIMAX_API_KEY`, a user-provided key **takes precedence** over it.

> **Deployers:** on a public demo, simply *don't* set `MINIMAX_API_KEY` — visitors will be asked to add their own key in Settings, so there is nothing of yours to burn. Set it only for private deployments where you want a shared key.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| LLM | MiniMax M3 via OpenAI-compatible API |
| Agent loop | Custom iterative tool-calling loop (`src/lib/agents/loop.ts`) |
| MCP | `@modelcontextprotocol/sdk` — stdio + Streamable HTTP |
| Auth / DB / Realtime / Storage | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) |
| Markdown | react-markdown + highlight.js |

## Quickstart

**Requirements:** Node.js 20+, a MiniMax API key, a Supabase project (free tier is enough).

```bash
npm install
cp .env.local.example .env.local
# edit .env.local (see Environment below)
npm run dev
# open http://localhost:3000
```

### Supabase setup (one time)

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. **Authentication → Sign In/Up**: turn **off** "Allow new users to sign up".
3. **Authentication → Users → Add user**: create your login manually.
4. **Settings → API**: copy the Project URL and the `anon` public key.
5. **SQL Editor**: run [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql) — it creates the tables, RLS policies, triggers, the Storage bucket and the Realtime publication.

### Environment

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase `anon` public key |
| `MINIMAX_API_KEY` | No | Shared key used by the chat and the `/api/mcp/minimax` proxy when the user has not set their own (see BYOK above). Leave unset on public demos. |
| `MINIMAX_BASE_URL` | No | Default `https://api.minimax.io/v1` |
| `TAVILY_API_KEY` | No | Powers the `/api/mcp/tavily` proxy |
| `CONTEXT7_API_KEY` | No | Higher rate limits for context7 |
| `MINIMAX_MODEL` | No | Default `MiniMax-M3` |
| `MCP_PROXY_TOKEN` | Recommended in prod | Shared token protecting `/api/mcp/*` |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL, no trailing slash |

## Project structure

```
src/
├── app/
│   ├── api/chat/route.ts     # streaming SSE endpoint with iterative tool calling
│   ├── api/mcp/tavily/…      # Tavily MCP proxy (stateless, Vercel-compatible)
│   ├── api/mcp/minimax/…     # MiniMax media MCP proxy
│   ├── login/                # login page
│   └── page.tsx              # protected home
├── components/chat/          # ChatShell, Sidebar, MessageList, ChatInput, ToolCallCard, …
└── lib/
    ├── agents/loop.ts        # the agent loop (model + tools, iterative)
    ├── mcp/manager.ts        # MCP server lifecycle (stdio / remote)
    ├── llm/client.ts         # OpenAI-compatible client → api.minimax.io
    └── supabase/             # browser/server clients, middleware, storage helpers
mcp_servers.json               # MCP server configuration
supabase/migrations/           # database schema
```

## Deploy

Deploys out of the box on Vercel — see [`DEPLOY.md`](DEPLOY.md) for the step-by-step guide.

## Known limitations

- The media proxies wrap MiniMax's REST API directly instead of the original Python `minimax-mcp` (stdio) package, so they run inside serverless functions. Functionally equivalent for text-to-image/audio, video generation, voices and music.
- Video generation is asynchronous: the tool returns a `task_id` to poll, since serverless timeouts can't wait minutes.

## License

Proprietary, source-available. See [`LICENSE`](LICENSE).
