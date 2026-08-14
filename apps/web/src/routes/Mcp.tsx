import { useEffect, useMemo, useRef, useState } from "react";
import type { McpServerResponse, CatalogEntry, CatalogCategory } from "schema";
import { CATALOG_CATEGORIES } from "schema";
import { McpServerList } from "../components/McpServerList";
import { McpAddDialog } from "../components/McpAddDialog";
import { McpCatalogGrid } from "../components/McpCatalogGrid";
import { fetchMcpServers } from "../lib/api";
import { useWorkspace } from "../lib/scope";
import { fetchCatalog, filterCatalog } from "../lib/mcpCatalog";
import { MCP_CATEGORY_LABELS, categoryDotClass } from "../lib/mcpCategory";
import { mcpVisibleInWorkspace } from "../lib/workspaceState";

function InstalledSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-border-subtle bg-surface-raised">
      <div className="divide-y divide-border-subtle">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3"
          >
            <div className="size-2.5 rounded-full bg-border-subtle" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-32 rounded bg-border-subtle" />
              <div className="h-3 w-48 rounded bg-border-subtle" />
            </div>
            <div className="h-6 w-16 rounded bg-border-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Mcp() {
  const { workspace, activeScope, projectDir } = useWorkspace();
  const [servers, setServers] = useState<McpServerResponse[]>([]);
  const [serversError, setServersError] = useState<string | null>(null);
  const [serversLoading, setServersLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<CatalogCategory[]>([]);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pendingCatalogEntry, setPendingCatalogEntry] = useState<CatalogEntry | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const visibleServers = useMemo(
    () => servers.filter((server) => mcpVisibleInWorkspace(server.scope, workspace)),
    [servers, workspace],
  );

  const installedNames = useMemo(
    () => new Set(visibleServers.map((s) => s.name)),
    [visibleServers],
  );

  const loadServers = () => {
    setServersLoading(true);
    return fetchMcpServers(activeScope, projectDir ?? undefined)
      .then((response) => {
        setServers(response.servers);
        setServersError(null);
      })
      .catch(() => {
        setServersError("Unable to load MCP servers.");
      })
      .finally(() => {
        setServersLoading(false);
      });
  };

  const recheckStatus = async () => {
    setIsChecking(true);
    await loadServers();
    setIsChecking(false);
    setLastChecked(new Date());
  };

  useEffect(() => {
    void loadServers().then(() => setLastChecked(new Date()));
  }, [activeScope, projectDir]);

  useEffect(() => {
    void fetchCatalog()
      .then((catalog) => {
        setCatalogEntries(catalog.entries);
        setCatalogError(null);
      })
      .catch((err) => {
        setCatalogError(err instanceof Error ? err.message : "Failed to load catalog");
      });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredEntries = useMemo(
    () =>
      filterCatalog(catalogEntries, {
        query: searchInput,
        categories: selectedCategories.length > 0 ? selectedCategories : [],
      }),
    [catalogEntries, searchInput, selectedCategories],
  );

  const toggleCategory = (category: CatalogCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const openCatalogAdd = (entry: CatalogEntry) => {
    setPendingCatalogEntry(entry);
    setShowAddDialog(true);
  };

  const openCustomAdd = () => {
    setPendingCatalogEntry(null);
    setShowAddDialog(true);
  };

  const handleServerAdded = async () => {
    setShowAddDialog(false);
    setPendingCatalogEntry(null);
    await loadServers();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-10 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="max-w-xl">
          <h1 className="font-display text-3xl font-bold tracking-tight text-text">MCP Servers</h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Browse curated MCP servers, pin installed ones, and manage file-scoped configs
          </p>
        </div>
        <div className="flex items-center gap-4 pt-1">
          <div className="flex flex-col items-end gap-0.5">
            {lastChecked && !isChecking ? (
              <span className="text-xs text-text-muted">
                Last checked {lastChecked.toLocaleTimeString()}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void recheckStatus()}
              disabled={isChecking}
              className="rounded-lg px-2 py-1 text-sm text-text-muted transition hover:bg-surface-soft hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isChecking ? "Checking…" : "Re-check status"}
            </button>
          </div>
          <button
            type="button"
            onClick={openCustomAdd}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
          >
            Add custom
          </button>
        </div>
      </div>

      <section className="space-y-5" aria-labelledby="mcp-installed-heading">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="mcp-installed-heading"
            className="text-sm font-semibold uppercase tracking-wide text-text-muted"
          >
            Installed
          </h2>
          {!serversLoading && !serversError ? (
            <span className="text-xs text-text-muted">{visibleServers.length} servers</span>
          ) : null}
        </div>
        {serversLoading ? (
          <InstalledSkeleton />
        ) : serversError ? (
          <p className="text-sm text-danger">{serversError}</p>
        ) : (
          <McpServerList servers={visibleServers} onServerRemoved={() => void loadServers()} />
        )}
      </section>

      <section
        className="space-y-4 border-t border-border-subtle pt-10"
        aria-labelledby="mcp-catalog-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="mcp-catalog-heading"
              className="text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Catalog
            </h2>
            <p className="mt-1 text-sm text-text-muted" aria-live="polite">
              {filteredEntries.length} of {catalogEntries.length}
            </p>
          </div>
          <label className="relative block w-full max-w-sm">
            <span className="sr-only">Search MCP servers</span>
            <input
              ref={searchRef}
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search MCP servers…"
              className="w-full rounded-xl border border-border-subtle bg-surface-raised py-2.5 pl-4 pr-4 text-sm text-text shadow-sm transition placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-4 focus:ring-accent/10"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategories([])}
            aria-pressed={selectedCategories.length === 0}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              selectedCategories.length === 0
                ? "border border-accent bg-accent text-accent-fg"
                : "border border-border-subtle bg-surface-raised text-text hover:border-accent/50"
            }`}
          >
            All
          </button>
          {CATALOG_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => toggleCategory(category)}
              aria-pressed={selectedCategories.includes(category)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                selectedCategories.includes(category)
                  ? "border border-accent bg-accent text-accent-fg"
                  : "border border-border-subtle bg-surface-raised text-text hover:border-accent/50"
              }`}
            >
              <span className={`size-2 rounded-full ${categoryDotClass(category)}`} />
              {MCP_CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>

        {catalogError ? (
          <div className="rounded-xl border border-dashed border-danger/40 bg-surface-raised p-8 text-center">
            <p className="font-medium text-danger">Catalog unavailable</p>
            <p className="mt-1 text-sm text-text-muted">{catalogError}</p>
          </div>
        ) : (
          <McpCatalogGrid
            entries={filteredEntries}
            installedNames={installedNames}
            onAdd={openCatalogAdd}
          />
        )}
      </section>

      {showAddDialog ? (
        <McpAddDialog
          catalogEntry={pendingCatalogEntry}
          onClose={() => {
            setShowAddDialog(false);
            setPendingCatalogEntry(null);
          }}
          onServerAdded={() => void handleServerAdded()}
        />
      ) : null}
    </div>
  );
}
