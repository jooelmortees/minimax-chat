/**
 * Servidor MCP de Tavily expuesto como tool HTTP streamable.
 * Se monta en Next.js en `src/app/api/mcp/tavily/route.ts`.
 *
 * Implementa las tools oficiales de Tavily usando `@tavily/core`:
 *  - tavily_search
 *  - tavily_extract
 *  - tavily_crawl
 *
 * El API key se lee de `process.env.TAVILY_API_KEY` en el server. La request
 * del cliente MCP debe llegar con un header `X-MCP-Proxy-Token` que coincida
 * con `process.env.MCP_PROXY_TOKEN` (si está definido). Esto evita que
 * cualquiera con la URL use tus claves.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tavily } from '@tavily/core';
import { z } from 'zod';

export function createTavilyMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'tavily',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const apiKey = process.env.TAVILY_API_KEY;
  const client = apiKey ? tavily({ apiKey }) : null;

  // --- tavily_search -------------------------------------------------------
  server.tool(
    'tavily_search',
    'Búsqueda web avanzada con Tavily. Devuelve resultados con título, URL, contenido y (opcional) una respuesta directa.',
    {
      query: z.string().describe('Texto a buscar.'),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe('Número máximo de resultados (1-20).'),
      search_depth: z
        .enum(['basic', 'advanced', 'fast', 'ultra-fast'])
        .default('basic')
        .describe('Profundidad: basic, advanced, fast o ultra-fast.'),
      topic: z
        .enum(['general', 'news', 'finance'])
        .default('general')
        .describe('Tipo de búsqueda: general, news o finance.'),
      include_images: z
        .boolean()
        .default(false)
        .describe('Si true, Tavily incluye imágenes en los resultados.'),
      days: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Limita a resultados de los últimos N días (solo news).'),
    },
    async (args) => {
      if (!client) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: 'TAVILY_API_KEY no está configurada en el servidor.' },
          ],
        };
      }
      try {
        const res = await client.search(args.query, {
          maxResults: args.max_results,
          searchDepth: args.search_depth,
          topic: args.topic,
          includeImages: args.include_images,
          days: args.days,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(res, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `tavily_search error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  // --- tavily_extract ------------------------------------------------------
  server.tool(
    'tavily_extract',
    'Extrae el contenido principal de una lista de URLs. Útil para leer artículos en detalle.',
    {
      urls: z
        .array(z.string().url())
        .min(1)
        .max(10)
        .describe('Lista de URLs a extraer (máx 10).'),
      extract_depth: z
        .enum(['basic', 'advanced'])
        .default('basic')
        .describe('"basic" para texto plano, "advanced" para tablas y estructura.'),
    },
    async (args) => {
      if (!client) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: 'TAVILY_API_KEY no está configurada en el servidor.' },
          ],
        };
      }
      try {
        const res = await client.extract(args.urls, { extractDepth: args.extract_depth });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(res, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `tavily_extract error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  // --- tavily_crawl --------------------------------------------------------
  server.tool(
    'tavily_crawl',
    'Crawl recursivo de un sitio a partir de una URL semilla. Devuelve el contenido de varias páginas.',
    {
      url: z.string().url().describe('URL semilla del crawl.'),
      max_depth: z
        .number()
        .int()
        .min(1)
        .max(3)
        .default(2)
        .describe('Profundidad máxima de navegación (1-3).'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe('Número máximo de páginas a devolver.'),
    },
    async (args) => {
      if (!client) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: 'TAVILY_API_KEY no está configurada en el servidor.' },
          ],
        };
      }
      try {
        const res = await client.crawl(args.url, {
          maxDepth: args.max_depth,
          limit: args.limit,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(res, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `tavily_crawl error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  return server;
}
