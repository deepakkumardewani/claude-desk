import { Hono } from "hono";
import { getContextResponse, getContextAllResponse } from "./routes/context.js";
import { getFileResponse, postFileResponse } from "./routes/file.js";
import {
  getSettingsResponse,
  getSettingsSchemaResponse,
  putSettingsResponse,
} from "./routes/settings.js";
import { getSkillsResponse } from "./routes/skills.js";
import { getTreeResponse } from "./routes/tree.js";
import { getBackupsResponse, postRestoreBackupResponse } from "./routes/backups.js";
import { getScopesResponse } from "./routes/scopes.js";
import { mcpRoute } from "./routes/mcp.js";
import { mcpCatalogRoute } from "./routes/mcpCatalog.js";
import { getStatusResponse } from "./routes/status.js";
import {
  getUsageOverviewResponse,
  getUsageModelsResponse,
  getUsageProjectsResponse,
  getUsageTimelineResponse,
} from "./routes/usage.js";
import type { Scope } from "schema";

export function createApp() {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true, service: "cli" }));

  app.get("/api/tree", async (c) => {
    const scope = (c.req.query("scope") ?? "user") as Scope;
    const tree = await getTreeResponse(scope);
    return c.json(tree);
  });

  app.get("/api/file", async (c) => {
    const category = c.req.query("category") ?? "";
    const name = c.req.query("name") ?? "";
    const scope = (c.req.query("scope") ?? "user") as Scope;
    const result = await getFileResponse(category, name, scope);

    if (result.status === 200) {
      return c.json(result.body);
    }
    return c.json(result.body, result.status);
  });

  app.post("/api/file", async (c) => {
    const category = c.req.query("category") ?? "";
    const name = c.req.query("name") ?? "";
    const scope = (c.req.query("scope") ?? "user") as Scope;
    let body: { content?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.content !== "string") {
      return c.json({ error: "content must be a string" }, 400);
    }
    const result = await postFileResponse(category, name, body.content, scope);
    return c.json(result.body, result.status);
  });

  app.get("/api/skills", async (c) => {
    const result = await getSkillsResponse();
    return c.json(result);
  });

  app.get("/api/context", async (c) => {
    const result = await getContextResponse();
    return c.json(result);
  });

  // Global context endpoint — returns full context details including model, tokens, percentage
  // and nested items (skills, agents, MCPs, memory files). Not project-scoped.
  app.get("/api/context/all", async (c) => {
    const result = await getContextAllResponse();
    return c.json(result);
  });

  app.get("/api/settings/schema", (c) => {
    const result = getSettingsSchemaResponse();
    return c.json(result.body, result.status);
  });

  app.get("/api/settings", async (c) => {
    const scope = (c.req.query("scope") ?? "user") as Scope;
    const result = await getSettingsResponse(scope);
    return c.json(result.body, result.status);
  });

  app.put("/api/settings", async (c) => {
    const scope = (c.req.query("scope") ?? "user") as Scope;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const result = await putSettingsResponse(body, scope);
    return c.json(result.body, result.status);
  });

  app.get("/api/backups", async (c) => {
    const result = await getBackupsResponse();
    return c.json(result.body, result.status);
  });

  app.post("/api/backups/restore", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const result = await postRestoreBackupResponse(body);
    return c.json(result.body, result.status);
  });

  app.get("/api/scopes", async (c) => {
    const result = await getScopesResponse();
    return c.json(result.body, result.status);
  });

  // MCP routes (catalog before /api/mcp so /catalog is not shadowed)
  app.route("/api/mcp/catalog", mcpCatalogRoute);
  app.route("/api/mcp", mcpRoute);

  app.get("/api/status", async (c) => {
    const result = await getStatusResponse();
    return c.json(result);
  });

  app.get("/api/usage/overview", async (c) => {
    const result = await getUsageOverviewResponse();
    return c.json(result.body, result.status);
  });

  app.get("/api/usage/models", async (c) => {
    const result = await getUsageModelsResponse();
    return c.json(result.body, result.status);
  });

  app.get("/api/usage/projects", async (c) => {
    const result = await getUsageProjectsResponse();
    return c.json(result.body, result.status);
  });

  app.get("/api/usage/timeline", async (c) => {
    const result = await getUsageTimelineResponse();
    return c.json(result.body, result.status);
  });

  app.onError((_error, c) => c.json({ error: "internal server error" }, 500));

  return app;
}
