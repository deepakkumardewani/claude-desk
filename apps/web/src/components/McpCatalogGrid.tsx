import type { CatalogEntry } from "schema";
import { isEntryInstalled } from "../lib/mcpCatalog";

interface McpCatalogGridProps {
  entries: CatalogEntry[];
  installedNames: ReadonlySet<string>;
  onAdd: (entry: CatalogEntry) => void;
}

export function McpCatalogGrid({ entries, installedNames, onAdd }: McpCatalogGridProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle bg-surface-raised p-10 text-center">
        <p className="font-medium text-text">No servers match your filters</p>
        <p className="mt-1 text-sm text-text-muted">
          Try adjusting your search or category selection
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => {
        const installed = isEntryInstalled(entry, installedNames);
        return (
          <article
            key={entry.id}
            className={`flex flex-col rounded-xl border bg-surface-raised p-4 shadow-sm transition ${
              installed
                ? "border-accent/40 ring-1 ring-accent/15"
                : "border-border-subtle hover:border-accent/25"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border-subtle bg-surface-soft text-xs font-semibold text-text-muted">
                {entry.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-medium text-text">{entry.name}</h3>
                  {installed ? (
                    <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-text">
                      Installed
                    </span>
                  ) : null}
                  <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[0.65rem] text-text-muted">
                    {entry.official ? "Official" : "Community"}
                  </span>
                  <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[0.65rem] text-text-muted">
                    {entry.command}
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-3 line-clamp-3 flex-1 text-sm text-text-muted">{entry.description}</p>

            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {entry.homepage ? (
                  <a
                    href={entry.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
                  >
                    Docs
                  </a>
                ) : null}
              </div>
              {!installed && (
                <button
                  type="button"
                  onClick={() => onAdd(entry)}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition hover:opacity-90"
                >
                  Install
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
