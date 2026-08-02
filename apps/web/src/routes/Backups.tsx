import { useEffect, useState } from "react";
import { BackupList } from "../components/BackupList";
import { fetchBackups, type BackupsFile } from "../lib/api";

export function Backups() {
  const [files, setFiles] = useState<BackupsFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchBackups()
      .then((response) => {
        if (!cancelled) {
          setFiles(response.files);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load backups.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-text-muted">Loading backups…</p>;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <section className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-text">Backups</h2>
        <p className="text-sm text-text-muted">
          View and restore previous versions of your configuration files.
        </p>
      </div>

      {files.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface-raised p-8 text-center">
          <p className="text-text-muted">
            No backups yet. Backups are created automatically when you modify files.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {files.map((file) => (
            <div
              key={file.path}
              className="rounded-lg border border-border-subtle bg-surface-raised p-4"
            >
              <button
                onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
                className="flex w-full items-center justify-between gap-2 transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex-1 text-left">
                  <h3 className="font-medium text-text">{file.path}</h3>
                  <p className="text-sm text-text-muted">{file.backups.length} backup(s)</p>
                </div>
                <svg
                  className={`h-5 w-5 transition-transform ${
                    expandedFile === file.path ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </button>

              {expandedFile === file.path && (
                <div className="mt-4 pt-4 border-t border-border-subtle">
                  <BackupList
                    filePath={file.path}
                    backups={file.backups}
                    onRestore={() => {
                      // Optionally refresh the backups list
                      fetchBackups()
                        .then((response) => {
                          setFiles(response.files);
                        })
                        .catch(() => {
                          // Silently fail
                        });
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
