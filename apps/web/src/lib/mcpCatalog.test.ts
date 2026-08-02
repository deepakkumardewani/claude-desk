import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import {
  fetchCatalog,
  filterCatalog,
  entryInstallName,
  entryToTransport,
  isEntryInstalled,
} from "./mcpCatalog";
import type { CatalogEntry, Catalog } from "schema";

const sampleEntry: CatalogEntry = {
  id: "filesystem",
  name: "Filesystem",
  description: "Browse the file system",
  category: "files-and-git",
  homepage: "https://modelcontextprotocol.io",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem"],
  env: [],
  official: true,
  keywords: ["filesystem", "file"],
};

const entryWithEnv: CatalogEntry = {
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
  keywords: ["github", "git"],
};

const entries: CatalogEntry[] = [
  sampleEntry,
  entryWithEnv,
  {
    id: "memory",
    name: "Memory",
    description: "Enable memory for Claude",
    category: "memory",
    homepage: "https://modelcontextprotocol.io",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    env: [],
    official: true,
    keywords: ["memory"],
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Control browsers with Playwright",
    category: "browser",
    homepage: "https://playwright.dev",
    command: "npx",
    args: ["-y", "@playwright/mcp"],
    env: [],
    official: true,
    keywords: ["playwright", "browser"],
  },
  {
    id: "community-tool",
    name: "Community Tool",
    description: "A community-maintained tool for something",
    category: "devtools",
    homepage: "https://example.com",
    command: "npx",
    args: ["-y", "community-package"],
    env: [],
    official: false,
    keywords: ["community"],
  },
];

describe("filterCatalog", () => {
  it("returns all entries when query and categories are empty", () => {
    const result = filterCatalog(entries);
    expect(result).toHaveLength(5);
  });

  it("ranks by name-prefix", () => {
    const result = filterCatalog(entries, { query: "play" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("playwright");
  });

  it("ranks name-prefix higher than name-contains", () => {
    const result = filterCatalog(entries, { query: "file" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("filesystem");
  });

  it("ranks name-contains higher than keyword match", () => {
    const result = filterCatalog(entries, { query: "memory" });
    expect(result[0].id).toBe("memory");
  });

  it("ranks keyword match higher than description", () => {
    const result = filterCatalog(entries, { query: "browser" });
    expect(result[0].id).toBe("playwright");
  });

  it("breaks ties by official status", () => {
    const tiedEntries = [
      { ...sampleEntry, id: "official", official: true, name: "aaa" },
      { ...sampleEntry, id: "community", official: false, name: "aaa" },
    ];
    const result = filterCatalog(tiedEntries, { query: "aaa" });
    expect(result[0].id).toBe("official");
    expect(result[1].id).toBe("community");
  });

  it("breaks remaining ties by name", () => {
    const tiedEntries = [
      { ...sampleEntry, id: "b", official: true, name: "zzz" },
      { ...sampleEntry, id: "a", official: true, name: "aaa" },
    ];
    const result = filterCatalog(tiedEntries);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");
  });

  it("filters by category", () => {
    const result = filterCatalog(entries, { categories: ["browser"] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("playwright");
  });

  it("intersects category filter with query", () => {
    const result = filterCatalog(entries, {
      query: "file",
      categories: ["files-and-git"],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("filesystem");
  });

  it("returns empty array when no matches", () => {
    const result = filterCatalog(entries, { query: "nonexistent" });
    expect(result).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const result1 = filterCatalog(entries, { query: "FILE" });
    const result2 = filterCatalog(entries, { query: "file" });
    expect(result1).toEqual(result2);
  });
});

describe("entryInstallName", () => {
  it("returns the entry id", () => {
    expect(entryInstallName(sampleEntry)).toBe("filesystem");
  });
});

describe("entryToTransport", () => {
  it("builds transport for entry without env", () => {
    const transport = entryToTransport(sampleEntry);
    expect(transport).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
    });
  });

  it("omits env key when no env values provided", () => {
    const transport = entryToTransport(entryWithEnv);
    expect(transport).not.toHaveProperty("env");
  });

  it("includes env key when values provided", () => {
    const transport = entryToTransport(entryWithEnv, {
      GITHUB_TOKEN: "ghp_test123",
    });
    expect(transport.env).toEqual({
      GITHUB_TOKEN: "ghp_test123",
    });
  });

  it("omits undefined env values", () => {
    const transport = entryToTransport(entryWithEnv, {
      GITHUB_TOKEN: "ghp_test123",
      OTHER_VAR: "value",
    });
    expect(transport.env).toEqual({
      GITHUB_TOKEN: "ghp_test123",
    });
  });
});

describe("isEntryInstalled", () => {
  it("detects installed entries by id", () => {
    expect(isEntryInstalled(sampleEntry, ["filesystem"])).toBe(true);
  });

  it("returns false when not installed", () => {
    expect(isEntryInstalled(sampleEntry, ["other"])).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isEntryInstalled(sampleEntry, ["FILESYSTEM"])).toBe(true);
    expect(isEntryInstalled(sampleEntry, ["FileSystem"])).toBe(true);
  });

  it("works with Set input", () => {
    const installed = new Set(["filesystem"]);
    expect(isEntryInstalled(sampleEntry, installed)).toBe(true);
  });
});

describe("fetchCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches from /api/mcp/catalog", async () => {
    const mockCatalog: Catalog = {
      version: 1,
      updatedAt: "2026-08-02",
      entries: [sampleEntry],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockCatalog), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchCatalog();
    expect(result).toEqual(mockCatalog);
    expect(fetchSpy).toHaveBeenCalledWith("/api/mcp/catalog");
    fetchSpy.mockRestore();
  });

  it("throws on fetch error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", {
        status: 500,
      }),
    );

    await expect(fetchCatalog()).rejects.toThrow("Failed to fetch catalog");
    fetchSpy.mockRestore();
  });
});
