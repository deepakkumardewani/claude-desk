import { useState } from "react";
import type { CatalogEntry } from "schema";
import { McpEnvVarFields } from "./McpEnvVarFields";
import { entryInstallName, entryToTransport } from "../lib/mcpCatalog";
import { MCP_CATEGORY_LABELS, categoryDotClass } from "../lib/mcpCategory";
import { apiFetch } from "../lib/sessionApi";

interface McpCatalogTabProps {
  catalogEntry: CatalogEntry;
  isLoading: boolean;
  onServerAdded: () => void;
  onClose: () => void;
}

type CatalogState = "idle" | "writing" | "verifying" | "verified" | "warned";

interface HealthCheckResult {
  status: "connected" | "failed";
  message?: string;
}

export function McpCatalogTab({
  catalogEntry,
  isLoading,
  onServerAdded,
  onClose,
}: McpCatalogTabProps) {
  const [catalogState, setCatalogState] = useState<CatalogState>("idle");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogHealthMessage, setCatalogHealthMessage] = useState<string | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [literalMode, setLiteralMode] = useState<Record<string, boolean>>({});
  const [envErrors, setEnvErrors] = useState<Record<string, string>>({});

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
    const response = await apiFetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, transport }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error || "Failed to add server");
    }
    return response;
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

  return (
    <div className="space-y-4">
      {catalogError ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {catalogError}
        </div>
      ) : null}

      {catalogHealthMessage ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {catalogHealthMessage}
        </div>
      ) : null}

      <div className="rounded-xl border border-border-subtle bg-surface p-4">
        <div className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${categoryDotClass(catalogEntry.category)}`} />
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
    </div>
  );
}
