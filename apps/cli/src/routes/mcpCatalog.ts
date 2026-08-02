import { Hono } from "hono";
import type { Context } from "hono";
import { loadCatalog } from "../fs/mcpCatalog.js";

export const mcpCatalogRoute = new Hono();

/**
 * GET /api/mcp/catalog
 * Returns the full curated MCP catalog. Query parameters are ignored.
 * Loader failure returns 500 with an error message.
 */
mcpCatalogRoute.get("/", (c: Context) => {
  try {
    const catalog = loadCatalog();
    return c.json(catalog, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load catalog";
    return c.json({ error: message }, 500);
  }
});
