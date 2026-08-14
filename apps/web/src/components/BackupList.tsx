import { useState } from "react";
import type { Backup } from "../lib/api";
import { restoreBackup } from "../lib/api";

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatWhen(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

export function BackupList({
  filePath,
  backups,
  onRestore,
}: {
  filePath: string;
  backups: Backup[];
  onRestore?: () => void;
}) {
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleRestore(backup: Backup) {
    setError(null);
    setSuccess(null);
    setRestoring(backup.id);

    try {
      const confirmed = window.confirm(
        `Restore backup from ${formatWhen(backup.timestamp)}? The current version will be backed up first.`,
      );

      if (!confirmed) {
        return;
      }

      await restoreBackup(backup.id, filePath);
      setSuccess(`Restored backup from ${formatWhen(backup.timestamp)}`);
      onRestore?.();
    } catch (err) {
      setError(`Failed to restore backup: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRestoring(null);
    }
  }

  if (backups.length === 0) {
    return <p className="text-sm text-text-muted">No backups for this file.</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {success ? <p className="text-sm text-success">{success}</p> : null}

      <ul className="divide-y divide-border-subtle">
        {backups.map((backup) => (
          <li key={backup.id} className="flex items-baseline gap-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm text-text">
              {formatWhen(backup.timestamp)}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
              {formatSize(backup.size)}
            </span>
            <button
              type="button"
              onClick={() => {
                void handleRestore(backup);
              }}
              disabled={restoring !== null}
              className="shrink-0 text-sm font-medium text-accent transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {restoring === backup.id ? "Restoring…" : "Restore"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
