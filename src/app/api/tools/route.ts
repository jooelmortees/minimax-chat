import { MCPManager } from "@/lib/mcp/manager";
import { getMinimaxClient, getDefaultModel } from "@/lib/llm/client";
import { listProjectMarkdownFiles } from "@/lib/agents/system-prompt";
import { AVAILABLE_MODELS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mcp = MCPManager.get();
  await mcp.initialize();

  const openAITools = mcp.getOpenAITools().map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));

  const builtinTools = [
    {
      name: "read_project_file",
      description:
        "Lee un fichero .md del proyecto activo (AGENTS.md, README, docs).",
      parameters: {
        type: "object",
        properties: {
          relPath: { type: "string" },
          maxChars: { type: "number" },
        },
        required: ["relPath"],
      },
    },
    {
      name: "list_project_markdown_files",
      description: "Lista los .md del proyecto.",
      parameters: { type: "object", properties: {} },
    },
  ];

  const mdFiles = await listProjectMarkdownFiles();

  // Comprobamos conectividad con MiniMax (intento de listar modelos, barato)
  let minimaxReachable = false;
  let minimaxError: string | undefined;
  try {
    const client = getMinimaxClient();
    await client.models.list();
    minimaxReachable = true;
  } catch (err) {
    minimaxError = err instanceof Error ? err.message : String(err);
  }

  return Response.json({
    minimax: {
      reachable: minimaxReachable,
      error: minimaxError,
      defaultModel: getDefaultModel(),
      availableModels: AVAILABLE_MODELS,
    },
    mcp: {
      servers: mcp.getStatus(),
      tools: openAITools,
    },
    builtinTools,
    project: {
      markdownFiles: mdFiles,
    },
  });
}
