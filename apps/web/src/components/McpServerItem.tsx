import { Link } from "react-router-dom";
import type { McpServerResponse } from "schema";
import { useWorkspace } from "../lib/scope";
import { pathForWorkspace } from "../lib/workspaceState";

interface McpServerItemProps {
  server: McpServerResponse;
  isRemoving: boolean;
  onRemove: () => void;
  onCancelRemove: () => void;
}

function isAuthIssue(error?: string): boolean {
  return Boolean(error?.toLowerCase().includes("authentication"));
}

function healthDotClass(server: McpServerResponse): string {
  if (isAuthIssue(server.error)) return "bg-[color:var(--warning)]";
  if (server.health === "connected") return "bg-success";
  if (server.health === "failed") return "bg-danger";
  return "bg-text-muted";
}

function healthLabel(server: McpServerResponse): string {
  if (isAuthIssue(server.error)) return "Needs authentication";
  if (server.health === "connected") return "Connected";
  if (server.health === "failed") return "Failed";
  return "Unknown";
}

function transportSummary(server: McpServerResponse): string {
  const { transport } = server;
  if (transport.type === "stdio") return transport.command;
  if (transport.type === "http" || transport.type === "sse") return transport.url;
  return "Unknown";
}

export function McpServerItem({
  server,
  isRemoving,
  onRemove,
  onCancelRemove,
}: McpServerItemProps) {
  const { workspace } = useWorkspace();
  const isPlugin = server.origin === "plugin" || server.editable === false;
  const canRemove = !isPlugin && server.editable !== false;
  const authIssue = isAuthIssue(server.error);

  return (
    <div
      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3.5"
      data-origin={server.origin ?? "file"}
      data-editable={canRemove ? "true" : "false"}
    >
      <div className={`size-2.5 shrink-0 rounded-full ${healthDotClass(server)}`}>
        <span className="sr-only">{healthLabel(server)}</span>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-text">{server.name}</span>
          <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-text-muted">
            {server.scope}
          </span>
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-text-muted">
          {server.transport.type.toUpperCase()} • {transportSummary(server)}
        </div>
        {authIssue ? (
          <div className="mt-1 text-xs text-warning">
            Needs authentication —{" "}
            <Link
              to={pathForWorkspace(workspace, "settings")}
              className="underline-offset-2 hover:underline"
            >
              check setup
            </Link>
          </div>
        ) : server.error ? (
          <div className="mt-1 text-xs text-danger">{server.error}</div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {canRemove ? (
          isRemoving ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Remove?</span>
              <button
                type="button"
                onClick={onRemove}
                className="rounded-lg bg-danger px-3 py-1.5 text-sm text-white transition hover:opacity-90"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={onCancelRemove}
                className="rounded-lg px-3 py-1.5 text-sm text-text-muted transition hover:bg-surface-soft"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg px-3 py-1.5 text-sm text-danger opacity-0 transition hover:bg-danger/10 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
            >
              Remove
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
