// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vite-plus/test";
import { Mcp } from "./Mcp";
import { ScopeProvider } from "../lib/scope";
import type { Catalog, CatalogEntry } from "schema";

const mockServers = {
  servers: [
    {
      name: "filesystem",
      disabled: false,
      transport: {
        type: "stdio" as const,
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
      },
      scope: "user" as const,
      health: "connected" as const,
      origin: "file" as const,
      editable: true,
    },
    {
      name: "playwright",
      disabled: false,
      transport: { type: "stdio" as const, command: "npx", args: ["-y", "@playwright/mcp"] },
      scope: "user" as const,
      health: "connected" as const,
      origin: "file" as const,
      editable: true,
    },
  ],
};

const catalogEntries: CatalogEntry[] = [
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
    keywords: ["filesystem", "file"],
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
];

const mockCatalog: Catalog = {
  version: 1,
  updatedAt: "2026-08-02",
  entries: catalogEntries,
};

vi.mock("../lib/api", () => ({
  fetchMcpServers: vi.fn(),
}));

vi.mock("../lib/mcpCatalog", async () => {
  const actual = await vi.importActual<typeof import("../lib/mcpCatalog")>("../lib/mcpCatalog");
  return {
    ...actual,
    fetchCatalog: vi.fn(),
  };
});

import { fetchMcpServers } from "../lib/api";
import { fetchCatalog } from "../lib/mcpCatalog";

function renderMcp() {
  return render(
    <ScopeProvider>
      <Mcp />
    </ScopeProvider>,
  );
}

describe("Mcp route", () => {
  beforeEach(() => {
    vi.mocked(fetchMcpServers).mockResolvedValue(mockServers);
    vi.mocked(fetchCatalog).mockResolvedValue(mockCatalog);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the MCP servers page with catalog", async () => {
    renderMcp();

    expect(await screen.findByRole("heading", { name: "MCP Servers" })).toBeTruthy();
    expect(await screen.findByText("Filesystem")).toBeTruthy();
    expect(screen.getByText("Playwright")).toBeTruthy();
    expect(screen.getByText("Memory")).toBeTruthy();
  });

  it("fetches catalog exactly once on mount", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    expect(vi.mocked(fetchCatalog)).toHaveBeenCalledTimes(1);
  });

  it("filters catalog instantly without additional fetches", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const initialFetchCalls = vi.mocked(fetchCatalog).mock.calls.length;
    const searchInput = screen.getByPlaceholderText("Search MCP servers…");

    fireEvent.change(searchInput, { target: { value: "play" } });
    await waitFor(() => {
      expect(screen.getByText("Playwright")).toBeTruthy();
    });

    expect(vi.mocked(fetchCatalog).mock.calls.length).toBe(initialFetchCalls);
  });

  it("shows only matching results when filtering", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const searchInput = screen.getByPlaceholderText("Search MCP servers…");
    fireEvent.change(searchInput, { target: { value: "memory" } });

    await waitFor(() => {
      expect(screen.queryByText("Filesystem")).toBe(null);
      expect(screen.getByText("Memory")).toBeTruthy();
      expect(screen.queryByText("Playwright")).toBe(null);
    });
  });

  it("shows empty state when no results match", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const searchInput = screen.getByPlaceholderText("Search MCP servers…");
    fireEvent.change(searchInput, { target: { value: "nonexistent-xyz" } });

    await waitFor(() => {
      expect(screen.getByText("No servers match your filters")).toBeTruthy();
    });
  });

  it("shows installed badge for installed entries", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const filesystemCard = screen.getByText("Filesystem").closest("article");
    expect(filesystemCard?.textContent).toContain("Installed");
  });

  it("does not show Install button for installed entries", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const filesystemCard = screen.getByText("Filesystem").closest("article");
    const buttons = filesystemCard?.querySelectorAll("button");
    const installButton = Array.from(buttons || []).find((btn) => btn.textContent === "Install");

    expect(installButton).toBeUndefined();
  });

  it("shows Install button for uninstalled entries", async () => {
    renderMcp();
    await screen.findByText("Memory");

    const memoryCard = screen.getByText("Memory").closest("article");
    const buttons = memoryCard?.querySelectorAll("button");
    const installButton = Array.from(buttons || []).find((btn) => btn.textContent === "Install");

    expect(installButton).toBeTruthy();
  });

  it("opens add dialog when Install is clicked", async () => {
    renderMcp();
    await screen.findByText("Memory");

    const memoryCard = screen.getByText("Memory").closest("article");
    const installButton = Array.from(memoryCard?.querySelectorAll("button") || []).find(
      (btn) => btn.textContent === "Install",
    ) as HTMLButtonElement;

    fireEvent.click(installButton);
    expect(await screen.findByRole("heading", { name: "Add MCP Server" })).toBeTruthy();
  });

  it("shows error when catalog fetch fails", async () => {
    vi.mocked(fetchCatalog).mockRejectedValue(new Error("Network error"));

    renderMcp();
    expect(await screen.findByText("Catalog unavailable")).toBeTruthy();
    expect(screen.getByText("Network error")).toBeTruthy();
  });

  it("shows official and runtime badges", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const filesystemCard = screen.getByText("Filesystem").closest("article");
    expect(filesystemCard?.textContent).toContain("Official");
    expect(filesystemCard?.textContent).toContain("npx");
  });

  it("shows community badge for community entries", async () => {
    const communityEntry: CatalogEntry = {
      ...catalogEntries[0],
      id: "community",
      name: "Community Tool",
      official: false,
    };

    vi.mocked(fetchCatalog).mockResolvedValue({
      version: 1,
      updatedAt: "2026-08-02",
      entries: [communityEntry],
    });

    renderMcp();
    await screen.findByText("Community Tool");

    const card = screen.getByText("Community Tool").closest("article");
    expect(card?.textContent).toContain("Community");
  });

  it("shows documentation link when homepage is present", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const filesystemCard = screen.getByText("Filesystem").closest("article");
    const docLink = filesystemCard?.querySelector('a[href*="modelcontextprotocol"]');
    expect(docLink).toBeTruthy();
    expect(docLink?.textContent).toBe("Docs");
  });

  it("renders category filter chips", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    expect(screen.getByRole("button", { name: "memory" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "browser" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "files-and-git" })).toBeTruthy();
  });

  it("filters by category when chip is selected", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const browserChip = screen.getByRole("button", { name: "browser" });
    fireEvent.click(browserChip);

    await waitFor(() => {
      expect(screen.getByText("Playwright")).toBeTruthy();
      expect(screen.queryByText("Filesystem")).toBe(null);
      expect(screen.queryByText("Memory")).toBe(null);
    });
  });

  it("shows clear filters button when filters are applied", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const searchInput = screen.getByPlaceholderText("Search MCP servers…");
    fireEvent.change(searchInput, { target: { value: "memory" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
    });
  });

  it("clears all filters when clear button is clicked", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const searchInput = screen.getByPlaceholderText("Search MCP servers…");
    fireEvent.change(searchInput, { target: { value: "memory" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => {
      expect(screen.getByText("Filesystem")).toBeTruthy();
      expect(screen.getByText("Playwright")).toBeTruthy();
      expect(screen.getByText("Memory")).toBeTruthy();
    });
  });

  it("supports multiple category filters", async () => {
    renderMcp();
    await screen.findByText("Filesystem");

    const filesGitChip = screen.getByRole("button", { name: "files-and-git" });
    const browserChip = screen.getByRole("button", { name: "browser" });

    fireEvent.click(filesGitChip);
    fireEvent.click(browserChip);

    await waitFor(() => {
      expect(screen.getByText("Filesystem")).toBeTruthy();
      expect(screen.getByText("Playwright")).toBeTruthy();
      expect(screen.queryByText("Memory")).toBe(null);
    });
  });
});
