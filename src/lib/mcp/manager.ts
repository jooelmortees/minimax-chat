import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  MCPConfig,
  MCPServerConfig,
  MCPServerStatus,
  MCPTool,
} from "@/lib/types";

interface ServerHandle {
  name: string;
  config: MCPServerConfig;
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  tools: MCPTool[];
  status: MCPServerStatus;
}

const SERVER_PREFIX = "mcp__";

let manager: MCPManager | null = null;

export class MCPManager {
  private servers = new Map<string, ServerHandle>();
  private initialized = false;

  static get(): MCPManager {
    if (!manager) manager = new MCPManager();
    return manager;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const config = await loadMCPConfig();
    if (!config) {
      console.warn("[mcp] No se encontró configuración de servidores MCP");
      return;
    }

    // Log compacto para depuración: ver la URL interpolada de cada MCP remoto.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "∅";
    console.log(`[mcp] init: app_url=${appUrl} servers=${Object.keys(config.mcpServers).join(",")}`);
    for (const [name, cfg] of Object.entries(config.mcpServers)) {
      const kind = cfg.type ?? "stdio";
      const url = kind === "remote" ? cfg.url : "(stdio)";
      console.log(`[mcp]   ${name}: kind=${kind} url=${url}`);
    }

    await Promise.all(
      Object.entries(config.mcpServers).map(([name, cfg]) =>
        this.startServer(name, cfg)
      )
    );
  }

  private async startServer(
    name: string,
    config: MCPServerConfig
  ): Promise<void> {
    const status: MCPServerStatus = {
      name,
      description: config.description,
      connected: false,
      toolCount: 0,
    };

    // Si está deshabilitado, lo registramos y salimos
    if (config.enabled === false) {
      status.error = "deshabilitado en configuración";
      this.servers.set(name, {
        name,
        config,
        client: null as unknown as Client,
        transport: null as unknown as StdioClientTransport,
        tools: [],
        status,
      });
      console.log(`[mcp] ○ ${name} deshabilitado`);
      return;
    }

    const client = new Client(
      { name: "minimax-chat", version: "0.1.0" },
      { capabilities: {} }
    );

    let transport: StdioClientTransport | StreamableHTTPClientTransport;
    try {
      if (config.type === "remote") {
        transport = new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers },
        });
      } else {
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: buildStdioEnv(config.env ?? {}),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      status.error = `Config inválida: ${message}`;
      this.servers.set(name, {
        name,
        config,
        client,
        transport: null as unknown as StdioClientTransport,
        tools: [],
        status,
      });
      console.error(`[mcp] ✗ ${name} config inválida: ${message}`);
      return;
    }

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();

      const mcpTools: MCPTool[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema ?? { type: "object" }) as MCPTool["inputSchema"],
      }));

      status.connected = true;
      status.toolCount = mcpTools.length;

      this.servers.set(name, {
        name,
        config,
        client,
        transport,
        tools: mcpTools,
        status,
      });

      const kind = config.type === "remote" ? "remote" : "stdio";
      console.log(
        `[mcp] ✓ ${name} (${kind}) conectado (${mcpTools.length} tools): ${mcpTools
          .map((t) => t.name)
          .join(", ")}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : String(err);
      status.error = message;
      status.connected = false;
      console.error(`[mcp] ✗ ${name} falló: ${message}`);
      console.error(`[mcp] ✗ ${name} stack:`, stack);
      this.servers.set(name, {
        name,
        config,
        client,
        transport,
        tools: [],
        status,
      });
    }
  }

  /** Tools agregados de todos los servidores en formato OpenAI. */
  getOpenAITools(): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    const out: Array<{
      type: "function";
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }> = [];

    for (const handle of this.servers.values()) {
      if (!handle.status.connected) continue;
      for (const tool of handle.tools) {
        out.push({
          type: "function",
          function: {
            name: `${SERVER_PREFIX}${handle.name}__${tool.name}`,
            description:
              tool.description ?? `[${handle.name}] ${tool.name}`,
            parameters: tool.inputSchema as Record<string, unknown>,
          },
        });
      }
    }

    return out;
  }

  /** Estado de todos los servidores (para mostrar en UI). */
  getStatus(): MCPServerStatus[] {
    return Array.from(this.servers.values()).map((h) => h.status);
  }

  /**
   * Resuelve un nombre de tool estilo OpenAI (mcp__server__tool) y lo ejecuta.
   * Devuelve el texto del resultado o un error.
   */
  async callTool(
    fullName: string,
    args: Record<string, unknown>
  ): Promise<{ result: string; error?: string }> {
    if (!fullName.startsWith(SERVER_PREFIX)) {
      return {
        result: "",
        error: `Tool "${fullName}" no es un tool MCP (debe empezar por ${SERVER_PREFIX})`,
      };
    }
    const rest = fullName.slice(SERVER_PREFIX.length);
    const sep = rest.indexOf("__");
    if (sep === -1) {
      return {
        result: "",
        error: `Formato de tool inválido: "${fullName}". Esperado ${SERVER_PREFIX}server__tool`,
      };
    }
    const serverName = rest.slice(0, sep);
    const toolName = rest.slice(sep + 2);

    const handle = this.servers.get(serverName);
    if (!handle || !handle.status.connected) {
      return {
        result: "",
        error: `Servidor MCP "${serverName}" no está conectado`,
      };
    }

    try {
      const res = await handle.client.callTool({
        name: toolName,
        arguments: args,
      });

      // El contenido puede ser array de bloques (text, image, etc.) o string
      const content = res.content;
      if (typeof content === "string") return { result: content };
      if (Array.isArray(content)) {
        const text = content
          .map((block: { type: string; text?: string }) =>
            block.type === "text" && typeof block.text === "string"
              ? block.text
              : ""
          )
          .filter(Boolean)
          .join("\n");
        return { result: text || JSON.stringify(content) };
      }
      return { result: JSON.stringify(content) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: "", error: message };
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.servers.values()).map(async (h) => {
        try {
          await h.client.close();
        } catch {
          // ignoramos
        }
      })
    );
    this.servers.clear();
    this.initialized = false;
  }
}

// Carga el JSON de configuración desde la ruta indicada en MCP_SERVERS_CONFIG
// o ./mcp_servers.json por defecto.
async function loadMCPConfig(): Promise<MCPConfig | null> {
  const configPath =
    process.env.MCP_SERVERS_CONFIG ?? "./mcp_servers.json";
  const absolute = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);

  if (!existsSync(absolute)) {
    console.warn(`[mcp] No existe ${absolute}`);
    return null;
  }
  try {
    const raw = await readFile(absolute, "utf-8");
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> } & MCPConfig;
    // Filtra claves de metadatos (p. ej. "_comment", "_note") que no son servidores.
    if (parsed.mcpServers) {
      for (const key of Object.keys(parsed.mcpServers)) {
        if (key.startsWith("_")) delete parsed.mcpServers[key];
      }
    }
    return parsed as MCPConfig;
  } catch (err) {
    console.error(`[mcp] Error parseando ${absolute}:`, err);
    return null;
  }
}

/**
 * Resuelve valores tipo "${VAR}" o "${VAR:-default}" leyendo process.env.
 * Si la variable no existe, devuelve el default si está presente o string vacío.
 * NUNCA lanza: el fallo de una variable faltante se traduce en un servidor MCP
 * que no arranca (su `startServer` lo captura y lo reporta en status).
 */
function interpolateEnv(value: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/g, (_, name, def) => {
    const v = process.env[name];
    if (v !== undefined) return v;
    if (def !== undefined) return def;
    return "";
  });
}

function resolveEnvObject(
  env: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    out[k] = interpolateEnv(v);
  }
  return out;
}

/**
 * Construye el entorno que se pasa al proceso stdio del MCP.
 * NO propagamos process.env completo (riesgo de seguridad):
 * solo un set mínimo de variables que casi cualquier proceso de Node
 * necesita para arrancar, más las que el usuario declare explícitamente
 * en `mcp_servers.json` (con soporte para ${VAR}).
 */
function buildStdioEnv(
  declared: Record<string, string>
): Record<string, string> {
  const passthrough = [
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "WINDIR",
    "TMP",
    "TEMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "LANG",
    "LC_ALL",
    "NODE_ENV",
    "NODE_PATH",
  ];
  const env: Record<string, string> = {};
  for (const key of passthrough) {
    const v = process.env[key];
    if (v !== undefined) env[key] = v;
  }
  // Las declaradas en config (con ${...} resuelto) tienen prioridad
  Object.assign(env, resolveEnvObject(declared));
  return env;
}
