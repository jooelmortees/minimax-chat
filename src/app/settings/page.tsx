"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Server,
  FileText,
  Wrench,
  Image as ImageIcon,
  Volume2,
  Video,
  Mic,
  Music,
  Save,
  KeyRound,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { DEFAULT_CAPABILITIES } from "@/lib/types";
import { getPrefs, savePrefs, DEFAULT_PREFS, type UserPrefs } from "@/lib/storage/conversations";
import {
  getByokConfig,
  saveByokConfig,
  clearByokConfig,
  byokHeaders,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  type ByokConfig,
} from "@/lib/llm/byok";
import type { MCPServerStatus, MCPTool } from "@/lib/types";

interface ToolsInfo {
  minimax: {
    reachable: boolean;
    error?: string;
    defaultModel: string;
    availableModels: { id: string; label: string; desc: string }[];
  };
  mcp: { servers: MCPServerStatus[]; tools: MCPTool[] };
  builtinTools: { name: string; description: string; parameters: unknown }[];
  project: { markdownFiles: { relPath: string; size: number }[] };
}

export default function SettingsPage() {
  const router = useRouter();
  const [data, setData] = useState<ToolsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState<number>(0); // timestamp de último guardado
  // BYOK: la API key del usuario vive solo en el localStorage del navegador.
  const [byok, setByok] = useState<ByokConfig>({
    apiKey: "",
    baseURL: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
  });
  const [byokHasKey, setByokHasKey] = useState(false);
  const [byokShowKey, setByokShowKey] = useState(false);
  const [byokSavedAt, setByokSavedAt] = useState<number>(0);

  const load = async () => {
    setLoading(true);
    try {
      // Enviamos la key BYOK (si existe) para que el chequeo de
      // conectividad use la misma key que usaría el chat.
      const res = await fetch("/api/tools", {
        cache: "no-store",
        headers: byokHeaders(),
      });
      if (res.ok) setData((await res.json()) as ToolsInfo);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Carga prefs desde Supabase tras montar (sin hydration mismatch).
    void getPrefs().then(setPrefs);
    // Carga la config BYOK desde localStorage (nunca sale del navegador).
    const cfg = getByokConfig();
    if (cfg) {
      setByok(cfg);
      setByokHasKey(true);
    }
  }, []);

  const saveByok = () => {
    if (!byok.apiKey.trim()) return;
    saveByokConfig(byok);
    setByokHasKey(true);
    setByokSavedAt(Date.now());
    void load(); // re-chequea conectividad con la nueva key
  };

  const removeByok = () => {
    clearByokConfig();
    setByok({ apiKey: "", baseURL: DEFAULT_BASE_URL, model: DEFAULT_MODEL });
    setByokHasKey(false);
    setByokShowKey(false);
    void load();
  };

  const updatePrefs = (next: UserPrefs) => {
    setPrefs(next);
    void savePrefs(next);
    setSaved(Date.now());
  };

  const toggleCapability = (key: keyof typeof prefs.capabilities) => {
    updatePrefs({
      ...prefs,
      capabilities: {
        ...prefs.capabilities,
        [key]: !prefs.capabilities[key],
      },
    });
  };

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
          >
            <ArrowLeft size={16} />
            Volver al chat
          </button>
          <div className="ml-auto">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-bg-elevated disabled:opacity-50"
            >
              <RefreshCw size={12} className={cn(loading && "animate-spin")} />
              Refrescar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-6 space-y-6">
        <h1 className="text-2xl font-semibold">Ajustes y diagnóstico</h1>

        <Section title="Tu API key (BYOK)">
          <p className="text-xs text-fg-muted mb-3">
            Usa tu propia API key y nadie gasta los créditos del que despliega
            la app. La key se guarda <strong>solo en este navegador</strong>{" "}
            (localStorage): nunca se envía a Supabase ni se almacena en el
            servidor. Consigue una gratis en{" "}
            <a
              href="https://platform.minimaxi.com/user-center/basic-information/interface-key"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              platform.minimaxi.com
            </a>
            .
          </p>
          <div className="space-y-2">
            <label className="block">
              <span className="text-xs text-fg-muted flex items-center gap-1.5 mb-1">
                <KeyRound size={12} /> API key
              </span>
              <div className="relative">
                <input
                  type={byokShowKey ? "text" : "password"}
                  value={byok.apiKey}
                  onChange={(e) =>
                    setByok({ ...byok, apiKey: e.target.value })
                  }
                  placeholder={
                    byokHasKey ? "•••••••• (ya hay una key guardada)" : "Pega tu API key aquí"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full text-sm font-mono bg-bg border border-border rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-accent/60"
                />
                <button
                  type="button"
                  onClick={() => setByokShowKey((v) => !v)}
                  aria-label={byokShowKey ? "Ocultar key" : "Mostrar key"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                >
                  {byokShowKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-fg-muted mb-1 block">
                  Base URL (endpoint compatible con OpenAI)
                </span>
                <input
                  type="text"
                  value={byok.baseURL}
                  onChange={(e) =>
                    setByok({ ...byok, baseURL: e.target.value })
                  }
                  placeholder={DEFAULT_BASE_URL}
                  spellCheck={false}
                  className="w-full text-sm font-mono bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60"
                />
              </label>
              <label className="block">
                <span className="text-xs text-fg-muted mb-1 block">Modelo</span>
                <input
                  type="text"
                  value={byok.model}
                  onChange={(e) =>
                    setByok({ ...byok, model: e.target.value })
                  }
                  placeholder={DEFAULT_MODEL}
                  spellCheck={false}
                  className="w-full text-sm font-mono bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60"
                />
              </label>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={saveByok}
                disabled={!byok.apiKey.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-40"
              >
                <Save size={12} /> Guardar key
              </button>
              {byokHasKey && (
                <button
                  type="button"
                  onClick={removeByok}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-danger/40 text-danger hover:bg-danger/10"
                >
                  <Trash2 size={12} /> Borrar
                </button>
              )}
              {byokSavedAt > 0 && (
                <span className="text-xs text-success flex items-center gap-1">
                  <CheckCircle2 size={12} /> Guardada en este navegador
                </span>
              )}
            </div>
          </div>
        </Section>

        <Section title="Capacidades multimodales">
          <p className="text-xs text-fg-muted mb-3">
            Activa o desactiva las herramientas de generación que el agente puede usar.
            Si todas están activas, el agente detecta del prompt cuándo usarlas.
            Si alguna está desactivada, el agente sabe que NO debe usarla.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <CapabilityToggle
              icon={<ImageIcon size={16} className="text-accent" />}
              label="Generación de imágenes"
              description="text_to_image del MCP de MiniMax"
              enabled={prefs.capabilities.image}
              onChange={() => toggleCapability("image")}
            />
            <CapabilityToggle
              icon={<Volume2 size={16} className="text-accent" />}
              label="Texto a voz (TTS)"
              description="text_to_audio del MCP de MiniMax"
              enabled={prefs.capabilities.audio}
              onChange={() => toggleCapability("audio")}
            />
            <CapabilityToggle
              icon={<Video size={16} className="text-accent" />}
              label="Generación de video"
              description="generate_video del MCP de MiniMax"
              enabled={prefs.capabilities.video}
              onChange={() => toggleCapability("video")}
            />
            <CapabilityToggle
              icon={<Mic size={16} className="text-accent" />}
              label="Clonación de voz"
              description="voice_clone del MCP de MiniMax"
              enabled={prefs.capabilities.voice}
              onChange={() => toggleCapability("voice")}
            />
            <CapabilityToggle
              icon={<Music size={16} className="text-accent" />}
              label="Generación de música"
              description="music_generation del MCP de MiniMax"
              enabled={prefs.capabilities.music}
              onChange={() => toggleCapability("music")}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                updatePrefs({
                  ...prefs,
                  capabilities: { ...DEFAULT_CAPABILITIES },
                })
              }
              className="text-xs px-2.5 py-1.5 rounded border border-border hover:bg-bg-elevated"
            >
              Activar todas
            </button>
            <button
              type="button"
              onClick={() =>
                updatePrefs({
                  ...prefs,
                  capabilities: {
                    image: false,
                    audio: false,
                    video: false,
                    voice: false,
                    music: false,
                  },
                })
              }
              className="text-xs px-2.5 py-1.5 rounded border border-border hover:bg-bg-elevated"
            >
              Desactivar todas
            </button>
            {saved > 0 && (
              <span className="text-xs text-success flex items-center gap-1">
                <Save size={10} /> Guardado
              </span>
            )}
          </div>
        </Section>

        <Section title="Instrucciones adicionales del sistema">
          <p className="text-xs text-fg-muted mb-2">
            Se añaden al final del system prompt. Útil para forzar un tono, idioma
            concreto, o reglas que solo aplican a esta sesión.
          </p>
          <textarea
            value={prefs.systemPromptAdditions}
            onChange={(e) =>
              updatePrefs({ ...prefs, systemPromptAdditions: e.target.value })
            }
            placeholder="Ej: Responde siempre en español. Cita fuentes cuando hables de APIs externas. Prefiere código TS sobre JS."
            rows={5}
            className="w-full text-sm bg-bg border border-border rounded-lg p-3 focus:outline-none focus:border-accent/60 resize-y"
          />
        </Section>

        <Section title="Voz por defecto para TTS">
          <p className="text-xs text-fg-muted mb-2">
            ID de la voz a usar cuando el agente genere audio. Déjalo vacío
            para que el provider elija. Algunos IDs de ejemplo:
            <code className="ml-1 px-1 bg-bg-elevated rounded">
              English_expressive_narrator
            </code>
            ,{" "}
            <code className="px-1 bg-bg-elevated rounded">Spanish_female_calm</code>
            .
          </p>
          <input
            type="text"
            value={prefs.defaultVoiceId}
            onChange={(e) =>
              updatePrefs({ ...prefs, defaultVoiceId: e.target.value })
            }
            placeholder="(vacío = provider default)"
            className="w-full text-sm bg-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60"
          />
        </Section>

        <Section title="MiniMax">
          {!data ? (
            <Skeleton />
          ) : (
            <div className="space-y-2">
              <Row
                icon={
                  data.minimax.reachable ? (
                    <CheckCircle2 size={16} className="text-success" />
                  ) : (
                    <XCircle size={16} className="text-danger" />
                  )
                }
                label="Conectividad con la API"
                value={data.minimax.reachable ? "OK" : "Error"}
              />
              {!data.minimax.reachable && data.minimax.error && (
                <div className="text-xs text-danger bg-danger/10 border border-danger/40 rounded p-2 break-words">
                  {data.minimax.error}
                </div>
              )}
              <Row
                icon={<Server size={16} className="text-fg-muted" />}
                label="Modelo por defecto"
                value={data.minimax.defaultModel}
                mono
              />
              <div className="text-xs text-fg-muted">
                Modelos disponibles:
                <ul className="mt-1 space-y-1">
                  {data.minimax.availableModels.map((m) => (
                    <li key={m.id} className="font-mono">
                      · {m.id} — {m.label}{" "}
                      <span className="text-fg-subtle">({m.desc})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Section>

        <Section title="Servidores MCP">
          {!data ? (
            <Skeleton />
          ) : data.mcp.servers.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No hay servidores configurados. Añádelos en{" "}
              <code className="px-1 bg-bg-elevated rounded">mcp_servers.json</code>.
            </p>
          ) : (
            <div className="space-y-2">
              {data.mcp.servers.map((s) => (
                <div
                  key={s.name}
                  className="rounded-lg border border-border bg-bg-elevated p-3"
                >
                  <div className="flex items-center gap-2">
                    {s.connected ? (
                      <CheckCircle2 size={14} className="text-success" />
                    ) : (
                      <XCircle size={14} className="text-danger" />
                    )}
                    <span className="font-medium text-sm">{s.name}</span>
                    <span className="ml-auto text-xs text-fg-muted">
                      {s.connected
                        ? `${s.toolCount} tools`
                        : "desconectado"}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-xs text-fg-muted mt-1">{s.description}</p>
                  )}
                  {s.error && (
                    <p className="text-xs text-danger mt-1 break-words">
                      {s.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Tools disponibles (${data ? data.builtinTools.length + data.mcp.tools.length : "..."})`}>
          {!data ? (
            <Skeleton />
          ) : (
            <div className="space-y-1.5">
              {data.builtinTools.map((t) => (
                <ToolRow key={t.name} name={t.name} description={t.description} builtin />
              ))}
              {data.mcp.tools.map((t) => (
                <ToolRow key={t.name} name={t.name} description={t.description ?? ""} />
              ))}
            </div>
          )}
        </Section>

        <Section title={`Ficheros .md del proyecto (${data?.project.markdownFiles.length ?? "..."})`}>
          {!data ? (
            <Skeleton />
          ) : data.project.markdownFiles.length === 0 ? (
            <p className="text-sm text-fg-muted">No hay .md en el proyecto.</p>
          ) : (
            <div className="space-y-1">
              {data.project.markdownFiles.map((f) => (
                <div
                  key={f.relPath}
                  className="flex items-center gap-2 text-sm font-mono px-2 py-1.5 rounded hover:bg-bg-elevated"
                >
                  <FileText size={12} className="text-fg-muted shrink-0" />
                  <span className="truncate">{f.relPath}</span>
                  <span className="ml-auto text-xs text-fg-subtle tabular-nums">
                    {f.size} B
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Configuración">
          <div className="text-sm space-y-2 text-fg-muted">
            <p>
              Variables leídas de <code>.env.local</code>:
            </p>
            <ul className="list-disc pl-5 space-y-0.5 font-mono text-xs">
              <li>MINIMAX_API_KEY (opcional: solo si el despliegue ofrece una key compartida; si no se define, cada usuario pone la suya en el apartado “Tu API key” de arriba)</li>
              <li>MINIMAX_MODEL (default: MiniMax-M3)</li>
              <li>MINIMAX_BASE_URL (default: https://api.minimax.io/v1)</li>
              <li>GROQ_API_KEY (opcional, para transcribir audio con Whisper via Groq)</li>
              <li>GROQ_STT_MODEL (opcional, default: whisper-large-v3)</li>
              <li>TAVILY_API_KEY (opcional, para búsqueda web)</li>
              <li>MCP_SERVERS_CONFIG (default: ./mcp_servers.json)</li>
              <li>GLOBAL_AGENTS_PATH (opcional)</li>
              <li>PROJECT_ROOT (default: .)</li>
            </ul>
            <p className="pt-2">
              Para añadir un MCP nuevo, edita <code>mcp_servers.json</code> y reinicia el
              servidor.
            </p>
          </div>
        </Section>
      </main>
    </div>
  );
}

function CapabilityToggle({
  icon,
  label,
  description,
  enabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
        enabled
          ? "border-accent/40 bg-accent/5 hover:bg-accent/10"
          : "border-border bg-bg-elevated hover:bg-bg-subtle"
      )}
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-fg-muted truncate">{description}</div>
      </div>
      <div
        className={cn(
          "shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors",
          enabled ? "bg-accent" : "bg-bg-subtle"
        )}
      >
        <div
          className={cn(
            "w-4 h-4 rounded-full bg-white transition-transform",
            enabled ? "translate-x-4" : "translate-x-0"
          )}
        />
      </div>
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">
        {title}
      </h2>
      <div className="rounded-xl border border-border bg-bg-elevated p-3 sm:p-4">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      <span className="text-fg-muted">{label}</span>
      <span className={cn("ml-auto", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}

function ToolRow({
  name,
  description,
  builtin,
}: {
  name: string;
  description: string;
  builtin?: boolean;
}) {
  return (
    <div className="rounded border border-border bg-bg px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <Wrench size={12} className="text-fg-muted shrink-0" />
        <span className="font-mono text-xs truncate">{name}</span>
        {builtin && (
          <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded">
            built-in
          </span>
        )}
      </div>
      {description && (
        <p className="text-xs text-fg-muted mt-0.5 line-clamp-2">{description}</p>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 bg-bg-subtle rounded animate-pulse" />
      <div className="h-4 bg-bg-subtle rounded animate-pulse w-3/4" />
      <div className="h-4 bg-bg-subtle rounded animate-pulse w-1/2" />
    </div>
  );
}
