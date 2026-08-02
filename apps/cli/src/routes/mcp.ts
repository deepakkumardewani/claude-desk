import { Hono } from "hono";
import type { Context } from "hono";
import type { Scope } from "schema";
import { mcpListResponseSchema, mcpAddRequestSchema, mcpHealthCheckResponseSchema } from "schema";
import {
  readMcpConfig,
  addMcpServer,
  removeMcpServer,
  getAllMcpServers,
  getMergedMcpServers,
  type MergedMcpServer,
} from "../fs/mcp.js";
import { queryMcpHealth, type McpHealthResult } from "../fs/mcpHealth.js";

export const mcpRoute = new Hono();

const PLUGIN_WRITE_BLOCKED =
  "Server is plugin-origin and read-only. Remove or edit it via the Claude plugin that provides it.";

/** Map Claude "local" scope onto the API's project/user enum. */
function toApiScope(scope: Scope | "local"): Scope {
  return scope === "local" ? "project" : scope;
}

/**
 * Build a transport object from a MergedMcpServer's flat claude.json fields.
 * Plugin-origin servers have no config — use a stdio placeholder so the response
 * schema (transport required) still parses.
 */
function transportFromMerged(server: MergedMcpServer) {
  const type = server.type ?? (server.url ? "http" : server.command ? "stdio" : undefined);

  if (type === "http" || type === "sse") {
    if (server.url) {
      return { type, url: server.url } as const;
    }
  }

  if (server.command) {
    return {
      type: "stdio" as const,
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(server.env ? { env: server.env } : {}),
    };
  }

  // Plugin-origin (or incomplete file entry) — schema requires a transport
  return { type: "stdio" as const, command: "(plugin-managed)" };
}

function healthFields(health: McpHealthResult, name: string) {
  const entry = health.status[name];
  return {
    health: (entry?.status ?? "unknown") as "connected" | "failed" | "unknown",
    ...(entry?.message ? { error: entry.message } : {}),
  };
}

function responseFromMerged(server: MergedMcpServer, health: McpHealthResult) {
  return {
    name: server.name,
    disabled: false,
    transport: transportFromMerged(server),
    scope: toApiScope(server.scope),
    origin: server.origin,
    editable: server.editable,
    ...healthFields(health, server.name),
  };
}

async function isPluginOrigin(name: string): Promise<boolean> {
  const merged = await getMergedMcpServers();
  return merged.some((s) => s.name === name && s.origin === "plugin");
}

/**
 * GET /api/mcp
 * Merged list: .mcp.json + ~/.claude.json (user/local) + plugin-origin, with health.
 */
mcpRoute.get("/", async (c: Context) => {
  try {
    const [merged, mcpJsonServers, health] = await Promise.all([
      getMergedMcpServers(),
      getAllMcpServers(),
      queryMcpHealth(),
    ]);

    // Seed with .mcp.json (project/user file scope), then overlay ~/.claude.json + plugins.
    // File-sourced entries from merge overwrite .mcp.json for the same name; plugins only
    // appear when absent from every file source (handled inside getMergedMcpServers).
    const byName = new Map<string, ReturnType<typeof responseFromMerged>>();

    for (const [name, { server, scope }] of Object.entries(mcpJsonServers)) {
      byName.set(name, {
        name,
        disabled: server.disabled ?? false,
        transport: server.transport,
        scope: scope as Scope,
        origin: "file",
        editable: true,
        ...healthFields(health, name),
      });
    }

    for (const server of merged) {
      const existing = byName.get(server.name);
      if (existing && server.origin === "plugin") {
        // File source already owns this name — keep file config, skip plugin tag
        continue;
      }
      byName.set(server.name, responseFromMerged(server, health));
    }

    const response = mcpListResponseSchema.parse({
      servers: Array.from(byName.values()),
    });

    return c.json(response, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list MCP servers";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/mcp
 * Add a new MCP server (file-origin only; plugin names are rejected).
 */
mcpRoute.post("/", async (c: Context) => {
  try {
    const body = await c.req.json();

    const result = mcpAddRequestSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: `Invalid request: ${result.error.message}` }, 400);
    }

    const { name, transport, scope = "user" } = result.data;

    if (await isPluginOrigin(name)) {
      return c.json({ error: PLUGIN_WRITE_BLOCKED }, 403);
    }

    const config = await readMcpConfig(scope);
    if (config.mcpServers[name]) {
      return c.json({ error: `Server "${name}" already exists in ${scope} scope` }, 400);
    }

    await addMcpServer(name, { transport }, scope);

    return c.json(
      {
        name,
        disabled: false,
        transport,
        scope,
        origin: "file",
        editable: true,
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add MCP server";
    return c.json({ error: message }, 500);
  }
});

/**
 * DELETE /api/mcp/:name
 * Remove an MCP server (blocked for plugin-origin names).
 */
mcpRoute.delete("/:name", async (c: Context) => {
  try {
    const name = c.req.param("name");
    if (!name) {
      return c.json({ error: "Server name is required" }, 400);
    }
    const scope = (c.req.query("scope") || "user") as Scope;

    if (scope !== "user" && scope !== "project") {
      return c.json({ error: "Invalid scope. Must be 'user' or 'project'" }, 400);
    }

    if (await isPluginOrigin(name)) {
      return c.json({ error: PLUGIN_WRITE_BLOCKED }, 403);
    }

    await removeMcpServer(name, scope);

    return c.json({ success: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove MCP server";
    if (message.includes("not found")) {
      return c.json({ error: message }, 404);
    }
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/mcp/health
 * Live re-check via `claude mcp list` (Phase 2).
 */
mcpRoute.get("/health", async (c: Context) => {
  try {
    const { status: serverHealth } = await queryMcpHealth();
    const timestamp = new Date().toISOString();

    const response = mcpHealthCheckResponseSchema.parse({
      servers: serverHealth,
      timestamp,
    });

    return c.json(response, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check MCP health";
    return c.json({ error: message }, 500);
  }
});
