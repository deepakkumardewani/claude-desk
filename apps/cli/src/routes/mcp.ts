import { Hono } from "hono";
import type { Context } from "hono";
import type { McpScope } from "schema";
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
import { isInvalidProjectDir, parseMcpScope, projectDirForLayer } from "./scopeQuery.js";

export const mcpRoute = new Hono();

const PLUGIN_WRITE_BLOCKED =
  "Server is plugin-origin and read-only. Remove or edit it via the Claude plugin that provides it.";

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
    scope: server.scope,
    origin: server.origin,
    editable: server.editable,
    ...healthFields(health, server.name),
  };
}

function mcpProjectDir(c: Context, scope: McpScope): string | undefined {
  return projectDirForLayer(scope, c.req.query("projectDir"));
}

async function isPluginOrigin(name: string, projectDir?: string): Promise<boolean> {
  const merged = await getMergedMcpServers({ projectDir });
  return merged.some((s) => s.name === name && s.origin === "plugin");
}

function jsonError(c: Context, error: unknown, fallback: string) {
  if (isInvalidProjectDir(error)) {
    return c.json({ error: error.message }, 400);
  }
  const message = error instanceof Error ? error.message : fallback;
  return c.json({ error: message }, 500);
}

mcpRoute.get("/", async (c: Context) => {
  try {
    const projectDirRaw = c.req.query("projectDir");
    const projectDir = projectDirRaw ? projectDirForLayer("project", projectDirRaw) : undefined;
    const [merged, mcpJsonServers, health] = await Promise.all([
      getMergedMcpServers({ projectDir }),
      getAllMcpServers(projectDir),
      queryMcpHealth(),
    ]);

    const byName = new Map<string, ReturnType<typeof responseFromMerged>>();

    for (const [name, { server, scope }] of Object.entries(mcpJsonServers)) {
      byName.set(name, {
        name,
        disabled: server.disabled ?? false,
        transport: server.transport,
        scope,
        origin: "file",
        editable: true,
        ...healthFields(health, name),
      });
    }

    for (const server of merged) {
      const existing = byName.get(server.name);
      if (existing && server.origin === "plugin") {
        continue;
      }
      byName.set(server.name, responseFromMerged(server, health));
    }

    const response = mcpListResponseSchema.parse({
      servers: Array.from(byName.values()),
    });

    return c.json(response, 200);
  } catch (error) {
    return jsonError(c, error, "Failed to list MCP servers");
  }
});

mcpRoute.post("/", async (c: Context) => {
  try {
    const body = await c.req.json();

    const result = mcpAddRequestSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: `Invalid request: ${result.error.message}` }, 400);
    }

    const { name, transport, scope = "user" } = result.data;
    const projectDir = mcpProjectDir(c, scope);

    if (await isPluginOrigin(name, projectDir)) {
      return c.json({ error: PLUGIN_WRITE_BLOCKED }, 403);
    }

    const config = await readMcpConfig(scope, projectDir);
    if (config.mcpServers[name]) {
      return c.json({ error: `Server "${name}" already exists in ${scope} scope` }, 400);
    }

    await addMcpServer(name, { transport }, scope, undefined, projectDir);

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
    return jsonError(c, error, "Failed to add MCP server");
  }
});

mcpRoute.delete("/:name", async (c: Context) => {
  try {
    const name = c.req.param("name");
    if (!name) {
      return c.json({ error: "Server name is required" }, 400);
    }
    const scope = parseMcpScope(c.req.query("scope") || "user");
    if (!scope) {
      return c.json({ error: "Invalid scope. Must be 'user', 'project', or 'local'" }, 400);
    }

    const projectDir = mcpProjectDir(c, scope);

    if (await isPluginOrigin(name, projectDir)) {
      return c.json({ error: PLUGIN_WRITE_BLOCKED }, 403);
    }

    await removeMcpServer(name, scope, undefined, projectDir);

    return c.json({ success: true }, 200);
  } catch (error) {
    if (isInvalidProjectDir(error)) {
      return c.json({ error: error.message }, 400);
    }
    const message = error instanceof Error ? error.message : "Failed to remove MCP server";
    if (message.includes("not found")) {
      return c.json({ error: message }, 404);
    }
    return c.json({ error: message }, 500);
  }
});

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
