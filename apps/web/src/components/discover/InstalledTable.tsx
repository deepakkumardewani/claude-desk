import { useState } from "react";
import type { DiscoveredItem, InstalledEntry, InstallStatus } from "schema";
import { useInstalls } from "../../lib/installs";
import { InstallDialog } from "./InstallDialog";
import { KindChip } from "./ItemCard";
import { UninstallDialog } from "./UninstallDialog";

/** HEAD placeholder: the server re-resolves the repo when `update` is sent. */
const HEAD_SHA = "HEAD";

export const STATUS_META: Record<InstallStatus, { label: string; className: string }> = {
  "up-to-date": { label: "Up to date", className: "text-success ring-success" },
  "update-available": { label: "Update available", className: "text-accent ring-accent" },
  "modified-locally": { label: "Modified locally", className: "text-warning ring-warning" },
  "missing-on-disk": { label: "Missing on disk", className: "text-danger ring-danger" },
  "source-unavailable": {
    label: "Source unavailable",
    className: "text-text-muted ring-border-subtle",
  },
};

const buttonBase =
  "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40";
const secondaryButton = `${buttonBase} bg-surface text-text ring-1 ring-border-subtle hover:bg-surface-soft`;
const primaryButton = `${buttonBase} bg-accent text-accent-fg hover:opacity-90`;

export function StatusBadge({ status }: { status: InstallStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      data-status={status}
      className={`inline-flex whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium ring-1 ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function scopeLabel(entry: InstalledEntry): string {
  const { scope, projectDir } = entry.target;
  if (scope === "user") return "User";
  const name = projectDir?.split("/").filter(Boolean).pop();
  return name ? `Project: ${name}` : "Project";
}

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

/** The item as the update dialog needs it; the server derives the real one from the manifest. */
function updateItem(entry: InstalledEntry): DiscoveredItem {
  return {
    id: `${entry.itemKind}:${entry.source.path}`,
    kind: entry.itemKind,
    name: entry.itemName,
    path: entry.source.path,
    files: [],
  };
}

function Row({
  entry,
  onUpdate,
  onUninstall,
}: {
  entry: InstalledEntry;
  onUpdate: () => void;
  onUninstall: () => void;
}) {
  return (
    <tr data-testid="installed-row" className="border-t border-border-subtle align-middle">
      <td className="px-3 py-2 font-medium text-text">{entry.itemName}</td>
      <td className="px-3 py-2">
        <KindChip kind={entry.itemKind} />
      </td>
      <td className="px-3 py-2 text-text-muted">{scopeLabel(entry)}</td>
      <td className="px-3 py-2 font-mono text-xs text-text-muted">
        {entry.source.owner}/{entry.source.repo}
      </td>
      <td className="px-3 py-2 text-text-muted">{formatDate(entry.installedAt)}</td>
      <td className="px-3 py-2">
        <StatusBadge status={entry.status} />
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            className={primaryButton}
            aria-label={`Update ${entry.itemName}`}
            onClick={onUpdate}
          >
            Update
          </button>
          <button
            type="button"
            className={secondaryButton}
            aria-label={`Uninstall ${entry.itemName}`}
            onClick={onUninstall}
          >
            Uninstall
          </button>
        </div>
      </td>
    </tr>
  );
}

const COLUMNS = ["Item", "Kind", "Scope", "Source", "Installed", "Status"];

/** Everything claude-desk installed, with update checks, updates and uninstalls (spec §3.5). */
export function InstalledTable() {
  const { entries, loading, checking, error, refresh, check } = useInstalls();
  const [updating, setUpdating] = useState<InstalledEntry | null>(null);
  const [removing, setRemoving] = useState<InstalledEntry | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {entries.length} installed item{entries.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          className={secondaryButton}
          disabled={checking || entries.length === 0}
          onClick={() => void check()}
        >
          {checking ? "Checking…" : "Check for updates"}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-surface-raised p-3 text-sm text-danger ring-1 ring-danger"
        >
          {error.message}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="rounded-xl bg-surface-raised p-6 text-center text-sm text-text-muted ring-1 ring-border-subtle">
          {loading
            ? "Loading…"
            : "Nothing installed yet. Install an item from skills.sh or a GitHub repo."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface-raised ring-1 ring-border-subtle">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-text-muted">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-3 py-2 font-semibold">
                    {column}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  onUpdate={() => setUpdating(entry)}
                  onUninstall={() => setRemoving(entry)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {updating ? (
        <InstallDialog
          repo={{ owner: updating.source.owner, repo: updating.source.repo, sha: HEAD_SHA }}
          items={[updateItem(updating)]}
          update={updating.id}
          onClose={() => {
            setUpdating(null);
            void refresh();
          }}
        />
      ) : null}
      {removing ? (
        <UninstallDialog
          entry={removing}
          onClose={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
