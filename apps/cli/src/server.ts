import { Hono } from "hono";
import { registerSecurity, requireBearerToken } from "./auth.js";
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
import { getProjectsResponse } from "./routes/projects.js";
import { mcpRoute } from "./routes/mcp.js";
import { mcpCatalogRoute } from "./routes/mcpCatalog.js";
import { getStatusResponse } from "./routes/status.js";
import {
  getUsageOverviewResponse,
  getUsageModelsResponse,
  getUsageProjectsResponse,
  getUsageTimelineResponse,
  getUsageSessionsResponse,
  getUsageWindowsResponse,
  getUsagePromptsResponse,
} from "./routes/usage.js";
import {
  isInvalidProjectDir,
  parseScope,
  parseSettingsLayer,
  projectDirForLayer,
} from "./routes/scopeQuery.js";

/** Parse a positive integer query param, falling back to `defaultValue` when absent or invalid. */
function parseQueryInt(value: string | undefined, defaultValue: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultValue;
}

export function createApp(options: { token: string }): Hono {
  if (!options.token) {
    throw new Error("token is required");
  }

  const app = new Hono();
  registerSecurity(app);
  app.use("*", requireBearerToken(options.token));

  app.get("/api/health", (c) => c.json({ ok: true, service: "cli" }));

  app.get("/api/tree", async (c) => {
    try {
      const scope = parseScope(c.req.query("scope"));
      const projectDir = projectDirForLayer(scope, c.req.query("projectDir"));
      const result = await getTreeResponse(scope, projectDir);
      return c.json(result.body, result.status);
    } catch (error) {
      if (isInvalidProjectDir(error)) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/api/file", async (c) => {
    try {
      const category = c.req.query("category") ?? "";
      const name = c.req.query("name") ?? "";
      const scope = parseScope(c.req.query("scope"));
      const projectDir = projectDirForLayer(scope, c.req.query("projectDir"));
      const result = await getFileResponse(category, name, scope, projectDir);

      if (result.status === 200) {
        return c.json(result.body);
      }
      return c.json(result.body, result.status);
    } catch (error) {
      if (isInvalidProjectDir(error)) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.post("/api/file", async (c) => {
    try {
      const category = c.req.query("category") ?? "";
      const name = c.req.query("name") ?? "";
      const scope = parseScope(c.req.query("scope"));
      const projectDir = projectDirForLayer(scope, c.req.query("projectDir"));
      let body: { content?: string };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "invalid JSON body" }, 400);
      }
      if (typeof body.content !== "string") {
        return c.json({ error: "content must be a string" }, 400);
      }
      const result = await postFileResponse(category, name, body.content, scope, projectDir);
      return c.json(result.body, result.status);
    } catch (error) {
      if (isInvalidProjectDir(error)) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/api/skills", async (c) => {
    const result = await getSkillsResponse();
    return c.json(result);
  });

  app.get("/api/context", async (c) => {
    const result = await getContextResponse();
    return c.json(result);
  });

  // Context snapshot from `claude /context all`. When scope=project, runs in that directory
  // so project skills appear the same way they do in the Claude CLI.
  app.get("/api/context/all", async (c) => {
    try {
      const scope = parseScope(c.req.query("scope"));
      const projectDir = projectDirForLayer(scope, c.req.query("projectDir"));
      const result = await getContextAllResponse(projectDir);
      return c.json(result);
    } catch (error) {
      if (isInvalidProjectDir(error)) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/api/settings/schema", (c) => {
    const result = getSettingsSchemaResponse();
    return c.json(result.body, result.status);
  });

  app.get("/api/settings", async (c) => {
    try {
      const layer = parseSettingsLayer(c.req.query("scope"));
      const projectDir = projectDirForLayer(layer, c.req.query("projectDir"));
      const result = await getSettingsResponse(layer, projectDir);
      return c.json(result.body, result.status);
    } catch (error) {
      if (isInvalidProjectDir(error)) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.put("/api/settings", async (c) => {
    try {
      const layer = parseSettingsLayer(c.req.query("scope"));
      const projectDir = projectDirForLayer(layer, c.req.query("projectDir"));
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "invalid JSON body" }, 400);
      }
      const result = await putSettingsResponse(body, layer, projectDir);
      return c.json(result.body, result.status);
    } catch (error) {
      if (isInvalidProjectDir(error)) return c.json({ error: error.message }, 400);
      throw error;
    }
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
    const result = await getScopesResponse(c.req.query("projectDir"));
    return c.json(result.body, result.status);
  });

  app.get("/api/projects", async (c) => {
    const result = await getProjectsResponse(c.req.query("extra"));
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
    const result = await getUsageModelsResponse({
      since: c.req.query("since"),
      until: c.req.query("until"),
      period: c.req.query("period"),
    });
    return c.json(result.body, result.status);
  });

  app.get("/api/usage/projects", async (c) => {
    const result = await getUsageProjectsResponse({
      since: c.req.query("since"),
      until: c.req.query("until"),
      period: c.req.query("period"),
    });
    return c.json(result.body, result.status);
  });

  app.get("/api/usage/timeline", async (c) => {
    const result = await getUsageTimelineResponse({
      granularity: c.req.query("granularity"),
      since: c.req.query("since"),
      until: c.req.query("until"),
    });
    return c.json(result.body, result.status);
  });

  app.get("/api/usage/sessions", async (c) => {
    const result = await getUsageSessionsResponse({
      sort: c.req.query("sort"),
      limit: parseQueryInt(c.req.query("limit"), 20),
    });
    return c.json(result.body, result.status);
  });

  app.get("/api/usage/windows", async (c) => {
    const result = await getUsageWindowsResponse(parseQueryInt(c.req.query("limit"), 20));
    return c.json(result.body, result.status);
  });

  app.get("/api/usage/prompts", async (c) => {
    const result = await getUsagePromptsResponse({
      limit: parseQueryInt(c.req.query("limit"), 50),
      since: c.req.query("since"),
      until: c.req.query("until"),
      project: c.req.query("project"),
    });
    return c.json(result.body, result.status);
  });

  app.onError((_error, c) => c.json({ error: "internal server error" }, 500));

  return app;
}
