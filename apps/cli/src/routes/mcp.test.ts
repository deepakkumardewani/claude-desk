import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { mcpRoute } from "./mcp.js";
import * as mcpFs from "../fs/mcp.js";
import * as mcpHealth from "../fs/mcpHealth.js";
import { homedir } from "node:os";
import { rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

vi.mock("../fs/mcp.js");
vi.mock("../fs/mcpHealth.js");
vi.mock("../fs/backups.js", () => ({
  backupFile: vi.fn().mockResolvedValue(undefined),
}));

const testDir = resolve(homedir(), ".claude-test-mcp-api");

async function cleanup() {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const emptyHealth = { available: true, status: {} };

describe("MCP Routes", () => {
  beforeEach(async () => {
    await cleanup();
    await mkdir(testDir, { recursive: true });
    vi.stubEnv("CLAUDE_ROOT", testDir);
    vi.clearAllMocks();
    vi.mocked(mcpFs.getMergedMcpServers).mockResolvedValue([]);
    vi.mocked(mcpFs.getAllMcpServers).mockResolvedValue({});
    vi.mocked(mcpHealth.queryMcpHealth).mockResolvedValue(emptyHealth);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("GET /api/mcp", () => {
    it("should list merged servers with origin and health", async () => {
      vi.mocked(mcpFs.getMergedMcpServers).mockResolvedValue([
        {
          name: "chrome-devtools",
          command: "npx",
          args: ["chrome-devtools-mcp@latest"],
          type: "stdio",
          scope: "user",
          origin: "file",
          editable: true,
        },
        {
          name: "agentmemory",
          command: "npx",
          args: ["-y", "agentmemory"],
          type: "stdio",
          scope: "user",
          origin: "file",
          editable: true,
        },
      ]);
      vi.mocked(mcpFs.getAllMcpServers).mockResolvedValue({
        "project-server": {
          server: {
            name: "project-server",
            disabled: false,
            transport: { type: "stdio", command: "python" },
          },
          scope: "project",
        },
      });
      const ts = new Date().toISOString();
      vi.mocked(mcpHealth.queryMcpHealth).mockResolvedValue({
        available: true,
        status: {
          "chrome-devtools": { status: "connected", timestamp: ts },
          agentmemory: { status: "connected", timestamp: ts },
        },
      });

      const res = await mcpRoute.request("/", { method: "GET" });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.servers).toHaveLength(3);

      const chrome = json.servers.find((s: { name: string }) => s.name === "chrome-devtools");
      expect(chrome.origin).toBe("file");
      expect(chrome.editable).toBe(true);
      expect(chrome.health).toBe("connected");
      expect(chrome.transport.command).toBe("npx");

      const project = json.servers.find((s: { name: string }) => s.name === "project-server");
      expect(project.scope).toBe("project");
      expect(project.origin).toBe("file");
    });

    it("should include plugin-origin servers as read-only", async () => {
      vi.mocked(mcpFs.getMergedMcpServers).mockResolvedValue([
        {
          name: "synthetic-plugin-mcp",
          scope: "user",
          origin: "plugin",
          editable: false,
        },
      ]);

      const res = await mcpRoute.request("/", { method: "GET" });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.servers).toHaveLength(1);
      expect(json.servers[0].origin).toBe("plugin");
      expect(json.servers[0].editable).toBe(false);
      expect(json.servers[0].transport.command).toBe("(plugin-managed)");
    });

    it("should return empty list when no servers exist", async () => {
      const res = await mcpRoute.request("/", { method: "GET" });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.servers).toHaveLength(0);
    });
  });

  describe("POST /api/mcp", () => {
    it("should add a new server", async () => {
      const newServer = {
        name: "new-server",
        transport: {
          type: "stdio" as const,
          command: "python",
        },
        scope: "user" as const,
      };

      vi.mocked(mcpFs.readMcpConfig).mockResolvedValue({ mcpServers: {} });
      vi.mocked(mcpFs.addMcpServer).mockResolvedValue(undefined);

      const res = await mcpRoute.request("/", {
        method: "POST",
        body: JSON.stringify(newServer),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.name).toBe("new-server");
      expect(mcpFs.addMcpServer).toHaveBeenCalledWith("new-server", expect.any(Object), "user");
    });

    it("should reject duplicate server name", async () => {
      const newServer = {
        name: "existing-server",
        disabled: false,
        transport: {
          type: "stdio" as const,
          command: "python",
        },
        scope: "user" as const,
      };

      vi.mocked(mcpFs.readMcpConfig).mockResolvedValue({
        mcpServers: {
          "existing-server": {
            name: "existing-server",
            disabled: false,
            transport: { type: "stdio", command: "old" },
          },
        },
      });

      const res = await mcpRoute.request("/", {
        method: "POST",
        body: JSON.stringify(newServer),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("already exists");
    });

    it("should reject invalid request body", async () => {
      const invalidRequest = {
        // missing name and transport
      };

      const res = await mcpRoute.request("/", {
        method: "POST",
        body: JSON.stringify(invalidRequest),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(400);
    });

    it("should block POST against plugin-origin names without calling addMcpServer", async () => {
      vi.mocked(mcpFs.getMergedMcpServers).mockResolvedValue([
        {
          name: "synthetic-plugin-mcp",
          scope: "user",
          origin: "plugin",
          editable: false,
        },
      ]);

      const res = await mcpRoute.request("/", {
        method: "POST",
        body: JSON.stringify({
          name: "synthetic-plugin-mcp",
          transport: { type: "stdio", command: "x" },
          scope: "user",
        }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/plugin-origin/i);
      expect(mcpFs.addMcpServer).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/mcp/:name", () => {
    it("should remove a server", async () => {
      vi.mocked(mcpFs.removeMcpServer).mockResolvedValue(undefined);

      const res = await mcpRoute.request("/test-server?scope=user", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mcpFs.removeMcpServer).toHaveBeenCalledWith("test-server", "user");
    });

    it("should reject invalid scope", async () => {
      const res = await mcpRoute.request("/test-server?scope=invalid", {
        method: "DELETE",
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid scope");
    });

    it("should return 404 when server not found", async () => {
      vi.mocked(mcpFs.removeMcpServer).mockRejectedValue(new Error("Server not found"));

      const res = await mcpRoute.request("/nonexistent", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
    });

    it("should block DELETE against plugin-origin names without calling removeMcpServer", async () => {
      vi.mocked(mcpFs.getMergedMcpServers).mockResolvedValue([
        {
          name: "synthetic-plugin-mcp",
          scope: "user",
          origin: "plugin",
          editable: false,
        },
      ]);

      const res = await mcpRoute.request("/synthetic-plugin-mcp?scope=user", {
        method: "DELETE",
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/plugin-origin/i);
      expect(mcpFs.removeMcpServer).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/mcp/health", () => {
    it("should return health status from claude mcp list", async () => {
      const timestamp = new Date().toISOString();
      vi.mocked(mcpHealth.queryMcpHealth).mockResolvedValue({
        available: true,
        status: {
          server1: { status: "unknown", message: "Needs authentication", timestamp },
        },
      });

      const res = await mcpRoute.request("/health", { method: "GET" });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.servers.server1).toBeDefined();
      expect(json.servers.server1.status).toBe("unknown");
      expect(json.timestamp).toBeDefined();
    });
  });
});
