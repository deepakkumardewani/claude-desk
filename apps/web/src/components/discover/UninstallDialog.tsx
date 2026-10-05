import { useState } from "react";
import type { InstalledEntry } from "schema";
import { uninstall, type DiscoverApiError } from "../../lib/discoverApi";
import { Modal } from "../Modal";

const buttonBase =
  "rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";
const secondaryButton = `${buttonBase} bg-surface text-text ring-1 ring-border-subtle hover:bg-surface-soft`;
const dangerButton = `${buttonBase} bg-danger text-white hover:opacity-90`;

function PathList({ label, paths, tone }: { label: string; paths: string[]; tone?: string }) {
  if (paths.length === 0) return null;
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone ?? "text-text-muted"}`}>
        {label} ({paths.length})
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs text-text">
        {paths.map((path) => (
          <li key={path} className="break-all">
            {path}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type UninstallDialogProps = {
  entry: InstalledEntry;
  onClose: () => void;
  /** Called after the install was removed. */
  onDone: () => void;
};

/** Confirms an uninstall, listing what goes away; hand-edited files need an explicit second step. */
export function UninstallDialog({ entry, onClose, onDone }: UninstallDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DiscoverApiError | null>(null);
  const modified = error?.code === "LOCALLY_MODIFIED" ? (error.files ?? []) : null;

  async function run(force: boolean) {
    setBusy(true);
    setError(null);
    const result = await uninstall(entry.id, { force });
    setBusy(false);
    if (!result.ok) return setError(result);
    onDone();
  }

  return (
    <Modal title={`Uninstall ${entry.itemName}`} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <PathList label="Files removed" paths={entry.files.map((f) => f.path)} />
        <PathList label="Settings reverted" paths={entry.settingsEntries.map((s) => s.pointer)} />
        <PathList label="MCP servers removed" paths={entry.mcpServers} />
        {modified ? (
          <div role="alert" className="rounded-lg bg-surface p-3 ring-1 ring-danger">
            <p className="text-sm text-danger">
              These files were edited after install. Deleting them loses your changes (a backup is
              kept).
            </p>
            <PathList label="Locally modified" paths={modified} tone="text-danger" />
          </div>
        ) : null}
        {error && !modified ? (
          <p
            role="alert"
            className="rounded-lg bg-surface p-3 text-sm text-danger ring-1 ring-danger"
          >
            {error.message}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Cancel
        </button>
        {modified ? (
          <button type="button" className={dangerButton} disabled={busy} onClick={() => run(true)}>
            {busy ? "Deleting…" : "Delete anyway"}
          </button>
        ) : (
          <button type="button" className={dangerButton} disabled={busy} onClick={() => run(false)}>
            {busy ? "Uninstalling…" : "Uninstall"}
          </button>
        )}
      </div>
    </Modal>
  );
}
