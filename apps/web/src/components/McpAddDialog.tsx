import { useState, type ReactNode } from "react";
import type { CatalogEntry } from "schema";
import { Modal } from "./Modal";
import { McpEnvVarFields } from "./McpEnvVarFields";
import { entryInstallName, entryToTransport } from "../lib/mcpCatalog";
import { MCP_CATEGORY_LABELS, categoryDotClass } from "../lib/mcpCategory";
import { useWorkspace } from "../lib/scope";
import { apiFetch } from "../lib/sessionApi";
import type { McpConfigScope } from "../lib/workspaceState";

interface McpAddDialogProps {
  onClose: () => void;
  onServerAdded: () => void;
  /** When set, dialog opens in catalog mode with this entry preselected. */
  catalogEntry?: CatalogEntry | null;
}

type Tab = "catalog" | "custom";
type CatalogState = "idle" | "writing" | "verifying" | "verified" | "warned";

interface HealthCheckResult {
  status: "connected" | "failed";
  message?: string;
}

const FIELD_INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text";
const FIELD_INPUT_MONO_CLASS = `${FIELD_INPUT_CLASS} font-mono`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text">{label}</label>
      {children}
    </div>
  );
}

export function McpAddDialog({ onClose, onServerAdded, catalogEntry = null }: McpAddDialogProps) {
  const { workspace, activeScope, projectDir } = useWorkspace();
  const [tab, setTab] = useState<Tab>(catalogEntry ? "catalog" : "custom");
  const [scope, setScope] = useState<McpConfigScope>(activeScope);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catalog tab state
  const [catalogState, setCatalogState] = useState<CatalogState>("idle");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogHealthMessage, setCatalogHealthMessage] = useState<string | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [literalMode, setLiteralMode] = useState<Record<string, boolean>>({});
  const [envErrors, setEnvErrors] = useState<Record<string, string>>({});

  // Custom tab state
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<"stdio" | "http" | "sse">("stdio");
  const [customCommand, setCustomCommand] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const validateEnvVars = (entry: CatalogEntry): boolean => {
    const errors: Record<string, string> = {};
    for (const envVar of entry.env) {
      if (envVar.required && !envValues[envVar.key]?.trim()) {
        errors[envVar.key] = `${envVar.label} is required`;
      }
    }
    setEnvErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const postServer = async (name: string, transport: unknown) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (projectDir) {
        params.set("projectDir", projectDir);
      }
      const query = params.toString();
      const response = await apiFetch(query ? `/api/mcp?${query}` : "/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, transport, scope }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to add server");
      }
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const checkHealth = async (name: string): Promise<HealthCheckResult> => {
    try {
      const response = await apiFetch("/api/mcp/health");
      if (!response.ok) {
        return { status: "failed", message: `Health check failed: ${response.status}` };
      }
      const data = (await response.json()) as {
        servers?: Record<string, { status: string; message?: string }>;
      };
      const serverHealth = data.servers?.[name];
      if (serverHealth?.status === "connected") {
        return { status: "connected" };
      }
      return { status: "failed", message: serverHealth?.message || "Server not connecting" };
    } catch (err) {
      return {
        status: "failed",
        message: err instanceof Error ? err.message : "Health check error",
      };
    }
  };

  const handleAddFromCatalog = async () => {
    if (!catalogEntry) {
      setCatalogError("Select a catalog server first");
      return;
    }

    if (!validateEnvVars(catalogEntry)) {
      return;
    }

    setCatalogState("writing");
    setCatalogError(null);
    setCatalogHealthMessage(null);

    try {
      const transport = entryToTransport(catalogEntry, envValues);
      const name = entryInstallName(catalogEntry);
      await postServer(name, transport);

      setCatalogState("verifying");
      const health = await checkHealth(name);

      if (health.status === "connected") {
        setCatalogState("verified");
        setTimeout(() => {
          onServerAdded();
          onClose();
        }, 500);
      } else {
        setCatalogState("warned");
        setCatalogHealthMessage(health.message || "Server installed but not connecting yet");
      }
    } catch (err) {
      setCatalogState("idle");
      setCatalogError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleRemoveWarnedServer = async () => {
    if (!catalogEntry) return;
    try {
      const name = entryInstallName(catalogEntry);
      const response = await apiFetch(`/api/mcp/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setCatalogHealthMessage("Failed to remove server");
        return;
      }
      setCatalogState("idle");
      setCatalogError(null);
      setCatalogHealthMessage(null);
    } catch (err) {
      setCatalogHealthMessage(err instanceof Error ? err.message : "Error removing server");
    }
  };

  const handleRecheck = async () => {
    if (!catalogEntry) return;
    setCatalogState("verifying");
    const name = entryInstallName(catalogEntry);
    const health = await checkHealth(name);

    if (health.status === "connected") {
      setCatalogState("verified");
      setTimeout(() => {
        onServerAdded();
        onClose();
      }, 500);
    } else {
      setCatalogState("warned");
      setCatalogHealthMessage(health.message || "Server still not connecting");
    }
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
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4">
        <div className="flex">
          <button
            type="button"
            onClick={() => setTab("catalog")}
            className={`px-4 py-3 text-center text-sm font-medium transition ${
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
            className={`px-4 py-3 text-center text-sm font-medium transition ${
              tab === "custom"
                ? "border-b-2 border-accent text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            Custom
          </button>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-border-subtle p-0.5">
          <button
            type="button"
            onClick={() => setScope("user")}
            aria-pressed={scope === "user"}
            className={`rounded-[0.3rem] px-2.5 py-1 text-xs font-medium transition ${
              scope === "user" ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text"
            }`}
          >
            User
          </button>
          <button
            type="button"
            onClick={() => setScope("project")}
            aria-pressed={scope === "project"}
            className={`rounded-[0.3rem] px-2.5 py-1 text-xs font-medium transition ${
              scope === "project" ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text"
            }`}
          >
            Project
          </button>
          {workspace.kind === "project" ? (
            <button
              type="button"
              onClick={() => setScope("local")}
              aria-pressed={scope === "local"}
              className={`rounded-[0.3rem] px-2.5 py-1 text-xs font-medium transition ${
                scope === "local" ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text"
              }`}
            >
              Local
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto p-4">
        {tab === "catalog" && catalogError ? (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {catalogError}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {tab === "catalog" && catalogHealthMessage ? (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            {catalogHealthMessage}
          </div>
        ) : null}

        {tab === "catalog" ? (
          <div className="space-y-4">
            {catalogEntry ? (
              <>
                <div className="rounded-xl border border-border-subtle bg-surface p-4">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`size-2 rounded-full ${categoryDotClass(catalogEntry.category)}`}
                    />
                    <span className="text-xs text-text-muted">
                      {MCP_CATEGORY_LABELS[catalogEntry.category]}
                    </span>
                  </div>
                  <p className="mt-2 font-medium text-text">{catalogEntry.name}</p>
                  <p className="mt-1 text-sm text-text-muted">{catalogEntry.description}</p>
                  <div className="mt-3 flex items-center gap-1.5 font-mono text-xs text-text-muted">
                    <span className="text-text-muted/70">Installs as:</span>
                    <span>{entryInstallName(catalogEntry)}</span>
                  </div>
                </div>

                {catalogEntry.env.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-text mb-3">Configuration</p>
                    <McpEnvVarFields
                      envVars={catalogEntry.env}
                      values={envValues}
                      onValuesChange={setEnvValues}
                      literalMode={literalMode}
                      onLiteralModeChange={setLiteralMode}
                      errors={envErrors}
                    />
                  </div>
                ) : null}

                {catalogState === "idle" ? (
                  <button
                    type="button"
                    onClick={() => void handleAddFromCatalog()}
                    disabled={isLoading}
                    className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Install Server
                  </button>
                ) : catalogState === "writing" || catalogState === "verifying" ? (
                  <div className="w-full rounded-lg bg-accent py-2.5 text-center text-sm font-medium text-accent-fg">
                    {catalogState === "writing" ? "Installing..." : "Verifying..."}
                  </div>
                ) : catalogState === "verified" ? (
                  <div className="w-full rounded-lg bg-success py-2.5 text-center text-sm font-medium text-success-fg">
                    Installed successfully
                  </div>
                ) : catalogState === "warned" ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => void handleRecheck()}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
                      >
                        Re-check
                      </button>
                      <a
                        href={catalogEntry.homepage}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-text-muted underline-offset-2 hover:text-text hover:underline"
                      >
                        View docs
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemoveWarnedServer()}
                      className="rounded-lg px-3 py-2 text-sm text-danger transition hover:bg-danger/10"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-text-muted">
                Pick a server from the catalog grid, then confirm here.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Server Name">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className={FIELD_INPUT_CLASS}
                placeholder="e.g. my-server"
              />
            </Field>

            <Field label="Transport">
              <select
                value={customType}
                onChange={(e) => setCustomType(e.target.value as "stdio" | "http" | "sse")}
                className={FIELD_INPUT_CLASS}
              >
                <option value="stdio">Stdio</option>
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </Field>

            {customType === "stdio" ? (
              <>
                <Field label="Command">
                  <input
                    type="text"
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    className={FIELD_INPUT_MONO_CLASS}
                    placeholder="e.g. npx"
                  />
                </Field>
                <Field label="Args (optional)">
                  <input
                    type="text"
                    value={customArgs}
                    onChange={(e) => setCustomArgs(e.target.value)}
                    className={FIELD_INPUT_MONO_CLASS}
                    placeholder="e.g. -y some-package"
                  />
                </Field>
              </>
            ) : (
              <Field label="URL">
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className={FIELD_INPUT_MONO_CLASS}
                  placeholder="https://example.com/mcp"
                />
              </Field>
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
