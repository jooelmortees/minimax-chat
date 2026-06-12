# Deploy en Vercel — paso a paso

Esta guía asume que ya tienes:
- Una API key de MiniMax (`MINIMAX_API_KEY`).
- Una API key de Tavily (`TAVILY_API_KEY`) si usas la web search en local.
- Una API key de Groq (`GROQ_API_KEY`) si transcribes audio.
- (Opcional) Una API key de context7 (`CONTEXT7_API_KEY`).
- El proyecto Supabase creado con la migración ejecutada y al menos un usuario dado de alta (ver README).

## 1. Sube el código a GitHub

```bash
# Desde la raíz del proyecto
cd "E:\Descargas\Prueba WEB Minimax-mcp"

# Inicializa git (si no lo has hecho)
git init
git add .
git commit -m "feat: Supabase auth, Realtime, storage, multi-device sync"

# Crea un repo vacío en GitHub (https://github.com/new).
# NO inicialices con README ni .gitignore (el repo ya los trae).

# Conecta y sube
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git branch -M main
git push -u origin main
```

> **Importante**: el `.gitignore` ya excluye `.env.local`, `node_modules`, `.next`, etc. Verifica que NO estás subiendo claves.

## 2. Crea el proyecto en Vercel

1. Ve a <https://vercel.com/new>.
2. Click en **"Import"** junto al repo que acabas de crear.
3. En la sección **"Environment Variables"**, añade (de Production, Preview y Development según necesites):

| Variable | Valor | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | anon public key |
| `MINIMAX_API_KEY` | `eyJ...` | API key de MiniMax |
| `MINIMAX_MODEL` | `MiniMax-M3` | opcional |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | opcional |
| `MCP_SERVERS_CONFIG` | `./mcp_servers.json` | opcional, default ya correcto |
| `TAVILY_API_KEY` | `tvly-...` | opcional; tavily no funcionará en Vercel (es stdio) |
| `CONTEXT7_API_KEY` | `ctx7sk-...` | recomendado |
| `GROQ_API_KEY` | `gsk-...` | opcional, para transcripción de audio |
| `GLOBAL_AGENTS_PATH` | *(vacío)* | no tiene sentido en Vercel |

4. Click **Deploy**. La primera build tarda 1-2 minutos.

## 3. Verifica el deploy

Una vez terminado:

1. Abre la URL que te da Vercel (`https://<proyecto>.vercel.app`).
2. Debería redirigirte a `/login`.
3. Entra con el email + contraseña del usuario que creaste en Supabase.
4. Verifica que puedes enviar mensajes.
5. Verifica que la lista de MCPs muestra context7 y gh_grep como "conectados" (tavily y minimax deben estar como "no conectados", esperado).
6. Abre la misma URL desde el móvil (con la sesión iniciada) y crea una conversación → debería aparecer instantáneamente en el PC (Realtime).

## 4. Configura el dominio personalizado (opcional)

1. En el proyecto de Vercel: **Settings → Domains**.
2. Añade tu dominio.
3. Configura el DNS según las instrucciones de Vercel (CNAME o A).
4. En **Supabase → Authentication → URL Configuration** añade tu dominio de Vercel en "Site URL" y en "Redirect URLs". Sin esto, el login puede fallar en producción.

## 5. Da de alta más usuarios

En Supabase → **Authentication → Users → Add user** (botón verde).

> Por seguridad el signup público está deshabilitado. Solo el admin da de alta usuarios.

## 6. Troubleshooting

### El login redirige a `/login` en bucle

- Comprueba que `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` están bien puestas en Vercel (revisar también typos en espacios).
- En Supabase → **Authentication → URL Configuration**, asegúrate de que la URL de Vercel está en "Site URL" o "Redirect URLs".

### "Invalid API key" de MiniMax

- La API key y el host deben coincidir regionalmente. Si tu key es de Global, el host es `https://api.minimax.io`. Si es de Mainland, `https://api.minimaxi.com`.

### context7 no conecta

- Asegúrate de que `CONTEXT7_API_KEY` está bien puesta. Si no tienes, funciona igual con rate limit bajo.
- En Vercel Functions hay un timeout de 10s en plan Hobby. Si context7 tarda más, considera el plan Pro.

### Tavily y minimax-mcp aparecen como "no conectados"

- **Esperado en Vercel.** Son stdio, no funcionan en serverless. Funcionan en local sin tocar nada.

### Realtime no sincroniza

- Verifica que ejecutaste la migración SQL completa. La publicación `supabase_realtime` debe incluir `conversations` y `messages`.
- En Supabase → **Database → Replication**, comprueba que esas tablas están activas.

### Storage falla al subir adjuntos

- Verifica que la migración creó el bucket `chat-attachments` y las policies de `storage.objects`.
- El plan Free tiene 1 GB de cuota. Los adjuntos actuales (dataURL) NO se suben a Storage todavía (ver "Limitaciones" del README).
