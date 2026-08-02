import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { mcpCatalogRoute } from "./mcpCatalog.js";
import * as mcpCatalogModule from "../fs/mcpCatalog.js";

vi.mock("../fs/mcpCatalog.js");

describe("MCP Catalog Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/mcp/catalog", () => {
    it("returns 200 with the full catalog", async () => {
      vi.mocked(mcpCatalogModule.loadCatalog).mockReturnValue({
        version: 1,
        updatedAt: "2026-08-02",
        entries: [
          {
            id: "filesystem",
            name: "Filesystem",
            description: "Browse the file system",
            category: "files-and-git",
            homepage: "https://modelcontextprotocol.io",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
            env: [],
            official: true,
            keywords: [],
          },
          {
            id: "github",
            name: "GitHub",
            description: "Interact with GitHub API",
            category: "files-and-git",
            homepage: "https://modelcontextprotocol.io",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: [
              {
                key: "GITHUB_TOKEN",
                label: "GitHub personal access token",
                required: true,
              },
            ],
            official: true,
            keywords: [],
          },
        ],
      });

      const res = await mcpCatalogRoute.request("/", { method: "GET" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { version: number; entries: Array<{ id: string }> };
      expect(body.version).toBe(1);
      expect(body.entries.length).toBe(2);
      expect(body.entries[0]?.id).toBe("filesystem");
    });

    it("query parameters are ignored", async () => {
      vi.mocked(mcpCatalogModule.loadCatalog).mockReturnValue({
        version: 1,
        updatedAt: "2026-08-02",
        entries: [],
      });

      const res = await mcpCatalogRoute.request("/?q=test&page=2&pageSize=50", {
        method: "GET",
      });
      expect(res.status).toBe(200);
    });

    it("returns 500 when loader throws", async () => {
      vi.mocked(mcpCatalogModule.loadCatalog).mockImplementation(() => {
        throw new Error("Catalog validation failed: invalid data");
      });

      const res = await mcpCatalogRoute.request("/", { method: "GET" });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Catalog validation failed");
    });

    it("still returns 200 when global fetch is stubbed to throw (offline test)", async () => {
      // Mock fetch to throw to simulate offline environment
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      vi.mocked(mcpCatalogModule.loadCatalog).mockReturnValue({
        version: 1,
        updatedAt: "2026-08-02",
        entries: [
          {
            id: "test",
            name: "Test",
            description: "Test entry",
            category: "productivity",
            homepage: "https://example.com",
            command: "npx",
            args: ["test"],
            env: [],
            official: true,
            keywords: [],
          },
        ],
      });

      const res = await mcpCatalogRoute.request("/", { method: "GET" });
      expect(res.status).toBe(200);

      // Restore original fetch
      globalThis.fetch = originalFetch;
    });
  });
});
