import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Localiza el AGENTS.md global del usuario.
 * Prioridad:
 *  1) GLOBAL_AGENTS_PATH (env var, ruta absoluta)
 *  2) ~/.config/opencode/AGENTS.md (estilo opencode)
 *  3) ~/.opencode/AGENTS.md
 */
function findGlobalAgentsPath(): string | null {
  const explicit = process.env.GLOBAL_AGENTS_PATH;
  if (explicit && existsSync(explicit)) return explicit;

  const home = os.homedir();
  const candidates = [
    path.join(home, ".config", "opencode", "AGENTS.md"),
    path.join(home, ".opencode", "AGENTS.md"),
    path.join(home, "AGENTS.md"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function findProjectAgentsPath(): string | null {
  const root = process.env.PROJECT_ROOT ?? ".";
  const absolute = path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
  const candidate = path.join(absolute, "AGENTS.md");
  return existsSync(candidate) ? candidate : null;
}

export interface LoadedAgentsDocs {
  global: { path: string; content: string } | null;
  project: { path: string; content: string } | null;
}

/** Lee ambos AGENTS.md disponibles. */
export async function loadAgentsDocs(): Promise<LoadedAgentsDocs> {
  const result: LoadedAgentsDocs = { global: null, project: null };

  const g = findGlobalAgentsPath();
  if (g) {
    result.global = { path: g, content: await readFile(g, "utf-8") };
  }

  const p = findProjectAgentsPath();
  if (p) {
    result.project = { path: p, content: await readFile(p, "utf-8") };
  }

  return result;
}

export interface BuiltSystemPrompt {
  prompt: string;
  sources: { path: string; chars: number }[];
}

/**
 * Construye el system prompt final:
 *  1) Identidad y comportamiento del agente
 *  2) Reglas del AGENTS.md global y de proyecto (concatenados, con su origen)
 *  3) Lista de tools MCP disponibles
 *  4) Reglas operativas (cómo iterar con tool calls, formato de respuesta, etc.)
 */
export async function buildSystemPrompt(opts: {
  mcpTools: Array<{ name: string; description: string }>;
  cwd: string;
}): Promise<BuiltSystemPrompt> {
  const docs = await loadAgentsDocs();
  const sources: BuiltSystemPrompt["sources"] = [];

  const parts: string[] = [];

  parts.push(
    `Eres un agente de IA con acceso a herramientas externas (MCP: Model Context Protocol). ` +
      `Tu trabajo es ayudar al usuario a programar, investigar y resolver tareas de ingeniería con el mayor rigor posible. ` +
      `Responde siempre en español salvo que el usuario escriba en otro idioma.`
  );

  parts.push(
    `## Principios operativos\n\n` +
      `- Piensa a fondo antes de responder. No rellenes con placeholders.\n` +
      `- Cuestiona las suposiciones. Si no sabes algo, verifica con herramientas.\n` +
      `- Si una tarea es trivial, sé conciso. Si es compleja, estructura la respuesta.\n` +
      `- Cita archivos y líneas concretas (ruta:linea) cuando hables de código.\n` +
      `- Cuando uses herramientas, explica brevemente por qué.\n` +
      `- Si una herramienta falla, propaga el error con contexto y propone alternativa.\n` +
      `- No inventes APIs, métodos, props o eventos. Verifica en documentación oficial antes de afirmar.`
  );

  if (docs.global) {
    sources.push({
      path: docs.global.path,
      chars: docs.global.content.length,
    });
    parts.push(
      `## Reglas globales del usuario (AGENTS.md global)\n\n` +
        `Origen: \`${docs.global.path}\`\n\n` +
        `Estas reglas tienen prioridad. Aplícalas siempre:\n\n` +
        `\`\`\`markdown\n${docs.global.content}\n\`\`\``
    );
  }

  if (docs.project) {
    sources.push({
      path: docs.project.path,
      chars: docs.project.content.length,
    });
    parts.push(
      `## Reglas del proyecto actual (AGENTS.md local)\n\n` +
        `Origen: \`${docs.project.path}\`\n\n` +
        `Estas reglas son específicas de este proyecto y complementan a las globales:\n\n` +
        `\`\`\`markdown\n${docs.project.content}\n\`\`\``
    );
  }

  if (opts.mcpTools.length > 0) {
    const toolList = opts.mcpTools
      .map((t) => `- \`${t.name}\`: ${t.description}`)
      .join("\n");
    parts.push(
      `## Herramientas MCP disponibles\n\n` +
        `Tienes ${opts.mcpTools.length} herramientas. Los nombres siguen el formato \`mcp__<servidor>__<tool>\`.\n\n` +
        `${toolList}\n\n` +
        `### Reglas de uso de herramientas\n\n` +
        `- Llama solo a las herramientas que necesites. No llames por llamar.\n` +
        `- Si una tool no existe o falla, informa al usuario con el mensaje de error exacto.\n` +
        `- Puedes encadenar varias llamadas en paralelo si son independientes.\n` +
        `- Si una llamada depende del resultado de otra, hazlas secuencialmente.\n` +
        `- Para tareas de investigación, alterna búsquedas y lecturas hasta tener evidencia suficiente.`
    );
  } else {
    parts.push(
      `## Herramientas\n\n` +
        `No hay servidores MCP conectados. Puedes seguir conversando normalmente, ` +
        `pero no podrás ejecutar herramientas hasta que se conecten en \`mcp_servers.json\`.`
    );
  }

  parts.push(
    `## Reglas de formato\n\n` +
      `- Usa markdown para estructurar respuestas largas.\n` +
      `- Bloques de código con el lenguaje correcto (\`\`\`ts, \`\`\`bash, etc.).\n` +
      `- Para tareas de varias fases, presenta un plan antes de ejecutar.\n` +
      `- Directorio de trabajo: \`${opts.cwd}\`.`
  );

  return {
    prompt: parts.join("\n\n---\n\n"),
    sources,
  };
}

/** Lista de ficheros .md del proyecto (para que la tool read_project_file sepa qué puede leer). */
export async function listProjectMarkdownFiles(
  maxDepth = 3
): Promise<{ path: string; relPath: string; size: number }[]> {
  const root = process.env.PROJECT_ROOT ?? ".";
  const absolute = path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
  const results: { path: string; relPath: string; size: number }[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        try {
          const { stat } = await import("node:fs/promises");
          const s = await stat(full);
          results.push({
            path: full,
            relPath: path.relative(absolute, full).replace(/\\/g, "/"),
            size: s.size,
          });
        } catch {
          // ignoramos
        }
      }
    }
  }

  await walk(absolute, 0);
  // Orden: AGENTS.md primero, README.md segundo, resto alfabético
  results.sort((a, b) => {
    const score = (p: string) =>
      p.endsWith("AGENTS.md") ? 0 : p.endsWith("README.md") ? 1 : 2;
    const sa = score(a.relPath);
    const sb = score(b.relPath);
    if (sa !== sb) return sa - sb;
    return a.relPath.localeCompare(b.relPath);
  });
  return results;
}
