import { useState } from "react";
import type { Scope, CatalogEntry } from "schema";
import { Modal } from "./Modal";
import { entryInstallName, entryToTransport } from "../lib/mcpCatalog";
import { useScope } from "../lib/scope";

interface McpAddDialogProps {
  onClose: () => void;
  onServerAdded: () => void;
  /** When set, dialog opens in catalog mode with this entry preselected. */
  catalogEntry?: CatalogEntry | null;
}

type Tab = "catalog" | "custom";

export function McpAddDialog({ onClose, onServerAdded, catalogEntry = null }: McpAddDialogProps) {
  const { activeScope } = useScope();
  const [tab, setTab] = useState<Tab>(catalogEntry ? "catalog" : "custom");
  const [scope, setScope] = useState<Scope>(activeScope);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<"stdio" | "http" | "sse">("stdio");
  const [customCommand, setCustomCommand] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const postServer = async (name: string, transport: unknown) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, transport, scope }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to add server");
      }
      onServerAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddFromCatalog = async () => {
    if (!catalogEntry) {
      setError("Select a catalog server first");
      return;
    }
    await postServer(entryInstallName(catalogEntry), entryToTransport(catalogEntry));
  };

  const handleAddCustom = async () => {
    if (!customName.trim()) {
      setError("Server name is required");
      return;
    }

    if (customType === "stdio") {
      if (!customCommand.trim()) {
        setError("Command is required for stdio servers");
        return;
      }
      const args = customArgs
        .split(/\s+/)
        .map((a) => a.trim())
        .filter(Boolean);
      await postServer(customName.trim(), {
        type: "stdio",
        command: customCommand.trim(),
        ...(args.length > 0 ? { args } : {}),
      });
      return;
    }

    if (!customUrl.trim()) {
      setError("URL is required for HTTP/SSE servers");
      return;
    }
    await postServer(customName.trim(), { type: customType, url: customUrl.trim() });
  };

  return (
    <Modal title="Add MCP Server" onClose={onClose}>
      <div className="border-b border-border-subtle">
        <div className="flex">
          <button
            type="button"
            onClick={() => setTab("catalog")}
            className={`flex-1 px-4 py-3 text-center text-sm font-medium transition ${
              tab === "catalog"
                ? "border-b-2 border-accent text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            From Catalog
          </button>
          <button
            type="button"
            onClick={() => setTab("custom")}
            className={`flex-1 px-4 py-3 text-center text-sm font-medium transition ${
              tab === "custom"
                ? "border-b-2 border-accent text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto p-4">
        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div>
          <label className="block text-sm font-medium text-text">Scope</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text"
          >
            <option value="user">User</option>
            <option value="project">Project</option>
          </select>
        </div>

        {tab === "catalog" ? (
          <div className="space-y-4">
            {catalogEntry ? (
              <div className="rounded-xl border border-border-subtle bg-surface p-4">
                <p className="font-medium text-text">{catalogEntry.name}</p>
                <p className="mt-0.5 font-mono text-xs text-text-muted">{catalogEntry.id}</p>
                <p className="mt-2 text-sm text-text-muted">{catalogEntry.description}</p>
                <p className="mt-3 font-mono text-xs text-text-muted">
                  Installs as: {entryInstallName(catalogEntry)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                Pick a server from the catalog grid, then confirm here.
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleAddFromCatalog()}
              disabled={!catalogEntry || isLoading}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? "Adding…" : "Add Server"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text">Server Name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text"
                placeholder="e.g. my-server"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text">Transport</label>
              <select
                value={customType}
                onChange={(e) => setCustomType(e.target.value as "stdio" | "http" | "sse")}
                className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text"
              >
                <option value="stdio">Stdio</option>
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </div>

            {customType === "stdio" ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-text">Command</label>
                  <input
                    type="text"
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 font-mono text-sm text-text"
                    placeholder="e.g. npx"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text">Args (optional)</label>
                  <input
                    type="text"
                    value={customArgs}
                    onChange={(e) => setCustomArgs(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 font-mono text-sm text-text"
                    placeholder="e.g. -y some-package"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-text">URL</label>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 font-mono text-sm text-text"
                  placeholder="https://example.com/mcp"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleAddCustom()}
              disabled={isLoading}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-40"
            >
              {isLoading ? "Adding…" : "Add Server"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
