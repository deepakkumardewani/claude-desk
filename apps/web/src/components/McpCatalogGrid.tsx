import type { CatalogEntry } from "schema";
import { isEntryInstalled } from "../lib/mcpCatalog";
import { categoryDotClass } from "../lib/mcpCategory";

interface McpCatalogGridProps {
  entries: CatalogEntry[];
  installedNames: ReadonlySet<string>;
  onAdd: (entry: CatalogEntry) => void;
}

function scrollToInstalledRow(name: string) {
  const list = document.querySelector('[data-testid="mcp-installed-list"]');
  const target = Array.from(list?.querySelectorAll("[data-origin]") ?? []).find((el) =>
    el.textContent?.toLowerCase().includes(name.toLowerCase()),
  );
  if (!(target instanceof HTMLElement)) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("bg-accent/10");
  setTimeout(() => target.classList.remove("bg-accent/10"), 1200);
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
      {entries.map((entry) => {
        const installed = isEntryInstalled(entry, installedNames);
        return (
          <article
            key={entry.id}
            className={`flex flex-col gap-3 rounded-xl border bg-surface-raised p-4 shadow-sm transition ${
              installed
                ? "border-border-subtle opacity-70"
                : "border-border-subtle hover:border-accent/25 hover:shadow-md"
            }`}
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${categoryDotClass(entry.category)}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-medium text-text">{entry.name}</h3>
                  {installed ? (
                    <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-text">
                      Installed
                    </span>
                  ) : null}
                  {!entry.official ? (
                    <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[0.65rem] text-text-muted">
                      Community
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <p className="line-clamp-2 flex-1 text-sm text-text-muted">{entry.description}</p>

            <div className="mt-auto flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-mono text-xs text-text-muted">
                <span>{entry.command}</span>
                {entry.homepage ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <a
                      href={entry.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="not-italic underline-offset-2 hover:text-text hover:underline"
                    >
                      Docs
                    </a>
                  </>
                ) : null}
              </div>
              {installed ? (
                <button
                  type="button"
                  onClick={() => scrollToInstalledRow(entry.id)}
                  className="text-xs text-accent underline-offset-2 hover:underline"
                >
                  Manage
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onAdd(entry)}
                  className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text transition hover:border-accent hover:bg-accent hover:text-accent-fg"
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
