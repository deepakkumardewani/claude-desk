import { useState } from "react";
import type { Backup } from "../lib/api";
import { restoreBackup } from "../lib/api";

interface BackupListProps {
  filePath: string;
  backups: Backup[];
  onRestore?: () => void;
}

export function BackupList({ filePath, backups, onRestore }: BackupListProps) {
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleRestore(backup: Backup) {
    setError(null);
    setSuccess(null);
    setRestoring(backup.id);

    try {
      // Show confirmation dialog
      const confirmed = window.confirm(
        `Restore backup from ${new Date(backup.timestamp).toLocaleString()}? The current version will be backed up first.`,
      );

      if (!confirmed) {
        setRestoring(null);
        return;
      }

      await restoreBackup(backup.id, filePath);
      setSuccess(`Restored backup from ${new Date(backup.timestamp).toLocaleString()}`);
      onRestore?.();
    } catch (err) {
      setError(`Failed to restore backup: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRestoring(null);
    }
  }

  if (backups.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-raised p-4 text-center text-text-muted">
        No backups available for this file
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
          {success}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border-subtle">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-raised">
              <th className="px-4 py-2 text-left font-medium text-text-muted">Timestamp</th>
              <th className="px-4 py-2 text-right font-medium text-text-muted">Size</th>
              <th className="px-4 py-2 text-right font-medium text-text-muted">Action</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.id} className="border-b border-border-subtle hover:bg-surface-raised">
                <td className="px-4 py-3 text-text">
                  {new Date(backup.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-muted">
                  {(backup.size / 1024).toFixed(1)} KB
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRestore(backup)}
                    disabled={restoring !== null}
                    className="rounded px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed bg-accent text-background hover:bg-accent/90"
                  >
                    {restoring === backup.id ? "Restoring…" : "Restore"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
