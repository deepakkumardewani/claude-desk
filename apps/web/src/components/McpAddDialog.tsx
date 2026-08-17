import { useState } from "react";
import type { CatalogEntry } from "schema";
import { Modal } from "./Modal";
import { useWorkspace } from "../lib/scope";
import type { McpConfigScope } from "../lib/workspaceState";
import { McpCatalogTab } from "./McpCatalogTab";
import { McpCustomServerTab } from "./McpCustomServerTab";

interface McpAddDialogProps {
  onClose: () => void;
  onServerAdded: () => void;
  /** When set, dialog opens in catalog mode with this entry preselected. */
  catalogEntry?: CatalogEntry | null;
}

export function McpAddDialog({ onClose, onServerAdded, catalogEntry = null }: McpAddDialogProps) {
  const { workspace, activeScope, projectDir } = useWorkspace();
  const canUseProjectScope = Boolean(projectDir);
  const [scope, setScope] = useState<McpConfigScope>(
    activeScope === "project" && projectDir ? "project" : "user",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom tab state
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<"stdio" | "http" | "sse">("stdio");
  const [customCommand, setCustomCommand] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const handleError = (newError: string | null) => {
    setError(newError);
    setIsLoading(false);
  };

  const handleServerAdded = () => {
    setIsLoading(false);
    onServerAdded();
  };

  return (
    <Modal title="Add MCP Server" onClose={onClose}>
      <div className="flex items-center justify-end gap-3 border-b border-border-subtle px-4 py-3">
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
            disabled={!canUseProjectScope}
            title={canUseProjectScope ? undefined : "Open a project to save there"}
            className={`rounded-[0.3rem] px-2.5 py-1 text-xs font-medium transition ${
              scope === "project" ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Project
          </button>
          {workspace.kind === "project" ? (
            <button
              type="button"
              onClick={() => setScope("local")}
              aria-pressed={scope === "local"}
              disabled={!canUseProjectScope}
              className={`rounded-[0.3rem] px-2.5 py-1 text-xs font-medium transition ${
                scope === "local" ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Local
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto p-4">
        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {catalogEntry ? (
          <McpCatalogTab
            catalogEntry={catalogEntry}
            isLoading={isLoading}
            onServerAdded={handleServerAdded}
            onClose={onClose}
          />
        ) : (
          <McpCustomServerTab
            customName={customName}
            onCustomNameChange={setCustomName}
            customType={customType}
            onCustomTypeChange={setCustomType}
            customCommand={customCommand}
            onCustomCommandChange={setCustomCommand}
            customArgs={customArgs}
            onCustomArgsChange={setCustomArgs}
            customUrl={customUrl}
            onCustomUrlChange={setCustomUrl}
            isLoading={isLoading}
            error={error}
            onError={handleError}
            onServerAdded={handleServerAdded}
            onClose={onClose}
            scope={scope}
            projectDir={projectDir ?? undefined}
          />
        )}
      </div>
    </Modal>
  );
}
