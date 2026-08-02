import type { McpServerResponse, Scope } from "schema";
import { useState } from "react";
import { McpServerItem } from "./McpServerItem";

interface McpServerListProps {
  servers: McpServerResponse[];
  onServerRemoved: () => void;
}

/** File-origin first (pinned highlight), then plugin-origin (read-only). */
function sortPinned(servers: McpServerResponse[]): McpServerResponse[] {
  return [...servers].sort((a, b) => {
    const aPlugin = a.origin === "plugin" || a.editable === false ? 1 : 0;
    const bPlugin = b.origin === "plugin" || b.editable === false ? 1 : 0;
    if (aPlugin !== bPlugin) return aPlugin - bPlugin;
    return a.name.localeCompare(b.name);
  });
}

export function McpServerList({ servers, onServerRemoved }: McpServerListProps) {
  const [removingServer, setRemovingServer] = useState<string | null>(null);
  const ordered = sortPinned(servers);

  const handleRemove = async (server: McpServerResponse) => {
    if (server.origin === "plugin" || server.editable === false) {
      return;
    }

    if (removingServer !== server.name) {
      setRemovingServer(server.name);
      return;
    }

    const scope: Scope = server.scope;
    try {
      const response = await fetch(`/api/mcp/${encodeURIComponent(server.name)}?scope=${scope}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        alert(`Failed to remove server: ${error.error ?? response.statusText}`);
        return;
      }

      setRemovingServer(null);
      onServerRemoved();
    } catch (error) {
      alert(`Failed to remove server: ${error instanceof Error ? error.message : "Unknown error"}`);
      setRemovingServer(null);
    }
  };

  if (ordered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle bg-surface-raised p-6 text-center">
        <p className="text-sm text-text-muted">No servers installed yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="mcp-installed-list">
      {ordered.map((server) => (
        <McpServerItem
          key={`${server.scope}:${server.name}`}
          server={server}
          isRemoving={removingServer === server.name}
          onRemove={() => void handleRemove(server)}
        />
      ))}
    </div>
  );
}
