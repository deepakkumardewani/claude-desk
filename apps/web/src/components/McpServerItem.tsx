import type { McpServerResponse } from "schema";

interface McpServerItemProps {
  server: McpServerResponse;
  isRemoving: boolean;
  onRemove: () => void;
}

function healthDotClass(health: McpServerResponse["health"], error?: string): string {
  if (error?.toLowerCase().includes("authentication")) {
    return "bg-[color:var(--cat-claudemd)]";
  }
  if (health === "connected") return "bg-success";
  if (health === "failed") return "bg-danger";
  return "bg-text-muted";
}

function healthLabel(server: McpServerResponse): string {
  if (server.error?.toLowerCase().includes("authentication")) {
    return "Needs authentication";
  }
  return server.health ?? "unknown";
}

function transportSummary(server: McpServerResponse): string {
  const { transport } = server;
  if (transport.type === "stdio") return transport.command;
  if (transport.type === "http" || transport.type === "sse") return transport.url;
  return "Unknown";
}

export function McpServerItem({ server, isRemoving, onRemove }: McpServerItemProps) {
  const isPlugin = server.origin === "plugin" || server.editable === false;
  const canRemove = !isPlugin && server.editable !== false;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border p-4 shadow-sm ${
        isPlugin
          ? "border-border-subtle bg-surface-soft/80"
          : "border-accent/25 bg-surface-raised ring-1 ring-accent/10"
      }`}
      data-origin={server.origin ?? "file"}
      data-editable={canRemove ? "true" : "false"}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${healthDotClass(server.health, server.error)}`}
          title={healthLabel(server)}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text">{server.name}</span>
            <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-text-muted">
              {server.scope}
            </span>
            {isPlugin ? (
              <span
                className="rounded-full border border-[color:var(--cat-plugins)]/40 bg-[color:var(--cat-plugins)]/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-text"
                data-testid="plugin-badge"
              >
                Plugin
              </span>
            ) : (
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-text">
                Installed
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-text-muted">
            {server.transport.type.toUpperCase()} • {transportSummary(server)}
          </div>
          {server.error ? <div className="mt-1 text-xs text-danger">{server.error}</div> : null}
          {isPlugin ? (
            <div className="mt-1 text-xs text-text-muted">
              Managed by a Claude plugin — view only
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {canRemove ? (
          <>
            {isRemoving ? <span className="text-xs text-text-muted">Remove?</span> : null}
            <button
              type="button"
              onClick={onRemove}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                isRemoving
                  ? "bg-danger text-white hover:opacity-90"
                  : "text-danger hover:bg-danger/10"
              }`}
            >
              {isRemoving ? "Confirm" : "Remove"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled
            title="Plugin-origin servers cannot be edited here"
            className="cursor-not-allowed rounded-lg px-3 py-1.5 text-sm text-text-muted opacity-50"
            aria-disabled="true"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
