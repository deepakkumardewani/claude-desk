import type { McpServerResponse, McpScope } from "schema";
import type { ReactNode } from "react";
import { useState } from "react";
import { McpServerItem } from "./McpServerItem";
import { apiFetch } from "../lib/sessionApi";

interface McpServerListProps {
  servers: McpServerResponse[];
  onServerRemoved: () => void;
}

function isPluginOrigin(server: McpServerResponse): boolean {
  return server.origin === "plugin" || server.editable === false;
}

function byName(a: McpServerResponse, b: McpServerResponse): number {
  return a.name.localeCompare(b.name);
}

function ServerGroup({
  title,
  count,
  caption,
  headingId,
  tone,
  testId,
  children,
}: {
  title: string;
  count: number;
  caption?: string;
  headingId: string;
  tone: "raised" | "soft";
  testId?: string;
  children: ReactNode;
}) {
  const surface =
    tone === "raised"
      ? "border-border-subtle bg-surface-raised"
      : "border-border-subtle bg-surface-soft/70";

  return (
    <section className="space-y-2.5" aria-labelledby={headingId} data-testid={testId}>
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-0.5">
        <h3
          id={headingId}
          className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-text"
        >
          {title}
        </h3>
        <span className="text-[0.7rem] tabular-nums text-text-muted">{count}</span>
        {caption ? <p className="basis-full text-xs text-text-muted">{caption}</p> : null}
      </header>
      <div className={`overflow-hidden rounded-xl border ${surface}`}>{children}</div>
    </section>
  );
}

export function McpServerList({ servers, onServerRemoved }: McpServerListProps) {
  const [removingServer, setRemovingServer] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const yourServers = servers.filter((s) => !isPluginOrigin(s)).sort(byName);
  const pluginServers = servers.filter(isPluginOrigin).sort(byName);

  const handleRemove = async (server: McpServerResponse) => {
    if (isPluginOrigin(server)) return;

    if (removingServer !== server.name) {
      setRemovingServer(server.name);
      setRemoveError(null);
      return;
    }

    const scope: McpScope = server.scope;
    try {
      const response = await apiFetch(
        `/api/mcp/${encodeURIComponent(server.name)}?scope=${scope}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        setRemoveError(error.error ?? response.statusText);
        return;
      }

      setRemovingServer(null);
      setRemoveError(null);
      onServerRemoved();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Unknown error");
    }
  };

  const handleCancelRemove = () => {
    setRemovingServer(null);
    setRemoveError(null);
  };

  if (servers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle bg-surface-raised p-6 text-center">
        <p className="text-sm text-text-muted">No servers installed yet</p>
        <p className="mt-1 text-sm text-text-muted">Install one from the catalog below</p>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="mcp-installed-list">
      {removeError ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          Failed to remove server: {removeError}
        </div>
      ) : null}

      {yourServers.length > 0 ? (
        <ServerGroup
          title="Your servers"
          count={yourServers.length}
          headingId="mcp-your-servers"
          tone="raised"
        >
          <div className="divide-y divide-border-subtle">
            {yourServers.map((server) => (
              <McpServerItem
                key={`${server.scope}:${server.name}`}
                server={server}
                isRemoving={removingServer === server.name}
                onRemove={() => void handleRemove(server)}
                onCancelRemove={handleCancelRemove}
              />
            ))}
          </div>
        </ServerGroup>
      ) : null}

      {pluginServers.length > 0 ? (
        <ServerGroup
          title="From plugins"
          count={pluginServers.length}
          caption="Managed by Claude plugins, view only"
          headingId="mcp-plugin-servers"
          tone="soft"
          testId="plugin-badge"
        >
          <div className="divide-y divide-border-subtle">
            {pluginServers.map((server) => (
              <McpServerItem
                key={`${server.scope}:${server.name}`}
                server={server}
                isRemoving={false}
                onRemove={() => void handleRemove(server)}
                onCancelRemove={handleCancelRemove}
              />
            ))}
          </div>
        </ServerGroup>
      ) : null}
    </div>
  );
}
