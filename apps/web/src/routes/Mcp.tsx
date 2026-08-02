import { useEffect, useMemo, useState } from "react";
import type { McpServerResponse, CatalogEntry, CatalogCategory } from "schema";
import { CATALOG_CATEGORIES } from "schema";
import { McpServerList } from "../components/McpServerList";
import { McpAddDialog } from "../components/McpAddDialog";
import { McpCatalogGrid } from "../components/McpCatalogGrid";
import { fetchMcpServers } from "../lib/api";
import { fetchCatalog, filterCatalog } from "../lib/mcpCatalog";

export function Mcp() {
  const [servers, setServers] = useState<McpServerResponse[]>([]);
  const [serversError, setServersError] = useState<string | null>(null);
  const [serversLoading, setServersLoading] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<CatalogCategory[]>([]);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pendingCatalogEntry, setPendingCatalogEntry] = useState<CatalogEntry | null>(null);

  const installedNames = useMemo(() => new Set(servers.map((s) => s.name)), [servers]);

  const loadServers = () => {
    setServersLoading(true);
    return fetchMcpServers()
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

  useEffect(() => {
    void loadServers();
    void fetchCatalog()
      .then((catalog) => {
        setCatalogEntries(catalog.entries);
        setCatalogError(null);
      })
      .catch((err) => {
        setCatalogError(err instanceof Error ? err.message : "Failed to load catalog");
      });
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

  const clearFilters = () => {
    setSearchInput("");
    setSelectedCategories([]);
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
    <div className="mx-auto max-w-6xl space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text">MCP Servers</h1>
          <p className="mt-1 text-sm text-text-muted">
            Browse curated MCP servers, pin installed ones, and manage file-scoped configs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadServers()}
            className="rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text transition hover:bg-surface"
          >
            Re-check status
          </button>
          <button
            type="button"
            onClick={openCustomAdd}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
          >
            Add custom
          </button>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="mcp-installed-heading">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="mcp-installed-heading"
            className="text-sm font-semibold uppercase tracking-wide text-text-muted"
          >
            Installed
          </h2>
          {!serversLoading && !serversError ? (
            <span className="text-xs text-text-muted">{servers.length} servers</span>
          ) : null}
        </div>
        {serversLoading ? (
          <p className="text-sm text-text-muted">Loading installed servers…</p>
        ) : serversError ? (
          <p className="text-sm text-danger">{serversError}</p>
        ) : (
          <McpServerList servers={servers} onServerRemoved={() => void loadServers()} />
        )}
      </section>

      <section className="space-y-4" aria-labelledby="mcp-catalog-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            id="mcp-catalog-heading"
            className="text-sm font-semibold uppercase tracking-wide text-text-muted"
          >
            Catalog
          </h2>
          <label className="relative block w-full max-w-md">
            <span className="sr-only">Search MCP servers</span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search MCP servers…"
              className="w-full rounded-xl border border-border-subtle bg-surface-raised py-2.5 pl-4 pr-4 text-sm text-text shadow-sm transition placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-4 focus:ring-accent/10"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {CATALOG_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => toggleCategory(category)}
              aria-pressed={selectedCategories.includes(category)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                selectedCategories.includes(category)
                  ? "border-accent bg-accent text-accent-fg"
                  : "border border-border-subtle bg-surface-raised text-text hover:border-accent/50"
              }`}
            >
              {category}
            </button>
          ))}
          {(searchInput || selectedCategories.length > 0) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              Clear filters
            </button>
          )}
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
