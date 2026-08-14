import { useEffect, useState } from "react";
import { BackupList } from "../components/BackupList";
import { fetchBackups, type BackupsFile } from "../lib/api";
import { splitPathLabel } from "../lib/workspace";

function backupCountLabel(count: number): string {
  return count === 1 ? "1 backup" : `${count} backups`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`size-4 shrink-0 text-text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function FileGroup({
  file,
  open,
  onToggle,
  onRestored,
}: {
  file: BackupsFile;
  open: boolean;
  onToggle: () => void;
  onRestored: () => void;
}) {
  const { prefix, leaf } = splitPathLabel(file.path);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="group flex w-full items-start gap-3 py-3 text-left transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-medium text-text group-hover:text-accent">{leaf}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
              {backupCountLabel(file.backups.length)}
            </span>
          </span>
          {prefix ? (
            <span className="mt-0.5 block truncate font-mono text-xs text-text-muted">
              {prefix}
            </span>
          ) : null}
        </span>
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="pb-4 pl-0">
          <BackupList filePath={file.path} backups={file.backups} onRestore={onRestored} />
        </div>
      ) : null}
    </div>
  );
}

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

  function refreshFiles(): void {
    fetchBackups()
      .then((response) => {
        setFiles(response.files);
      })
      .catch((err: unknown) => {
        console.error("Unable to refresh backups after restore", err);
      });
  }

  if (loading) {
    return <p className="text-text-muted">Loading backups…</p>;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <section className="mx-auto max-w-3xl">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-text">Backups</h1>
        <p className="mt-2 text-base text-text-muted">
          Previous versions of files you have changed. Restore one to roll back.
        </p>
      </header>

      {files.length === 0 ? (
        <p className="mt-8 text-sm text-text-muted">
          No backups yet. Saving a file creates a snapshot automatically.
        </p>
      ) : (
        <div className="mt-8 divide-y divide-border-subtle border-t border-border-subtle">
          {files.map((file) => (
            <FileGroup
              key={file.path}
              file={file}
              open={expandedFile === file.path}
              onToggle={() =>
                setExpandedFile((current) => (current === file.path ? null : file.path))
              }
              onRestored={refreshFiles}
            />
          ))}
        </div>
      )}
    </section>
  );
}
