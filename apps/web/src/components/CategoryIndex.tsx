import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSettings, type ApiCategory } from "../lib/api";
import { useWorkspace } from "../lib/scope";
import { workspaceBasePath } from "../lib/workspaceState";
import { getCategoryMeta } from "../lib/categories";
import { CATEGORY_LABELS, pluginEntriesFromSettings, type WorkspaceFile } from "../lib/workspace";
import type { ClaudeSettings } from "schema";

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

type Props = {
  category: ApiCategory;
};

/** Category root (`/skills`, `/plans`, …) — sidebar is the browser; this pane orients the user. */
export function CategoryIndex({ category }: Props) {
  const label = CATEGORY_LABELS[category];
  const { colorToken } = getCategoryMeta(category);
  const { workspace, activeScope, projectDir } = useWorkspace();
  const basePath = workspaceBasePath(workspace);
  const [plugins, setPlugins] = useState<WorkspaceFile[] | null>(null);

  useEffect(() => {
    if (category !== "plugins") {
      setPlugins(null);
      return;
    }

    let cancelled = false;
    fetchSettings(activeScope, projectDir ?? undefined)
      .then((response) => {
        if (!cancelled) {
          setPlugins(
            pluginEntriesFromSettings(response.settings as ClaudeSettings).map((entry) => ({
              ...entry,
              href: `${basePath}/settings`,
            })),
          );
        }
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        if (!cancelled) {
          setPlugins([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [category, activeScope, projectDir, basePath]);

  const pluginList = useMemo(() => plugins ?? [], [plugins]);

  if (category === "plugins") {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <div className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${colorToken}`} />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
              Category
            </p>
          </div>
          <h1 className="mt-1.5 font-display text-3xl font-bold tracking-tight text-text">
            {label}
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            {pluginList.length.toLocaleString()} configured plugin
            {pluginList.length === 1 ? "" : "s"} from settings. The sidebar lists marketplace cache
            files — use this list to manage what you actually have enabled.
          </p>
        </header>

        {plugins === null ? (
          <p className="text-text-muted">Loading plugins…</p>
        ) : pluginList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-subtle bg-surface-raised p-10 text-center">
            <p className="font-medium text-text">No plugins configured</p>
            <Link
              to={`${basePath}/settings`}
              className="mt-2 inline-block text-sm font-medium text-accent"
            >
              Add plugins in Settings →
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-sm">
            <div className="divide-y divide-border-subtle">
              {pluginList.map((file) => (
                <Link
                  key={file.name}
                  to={file.href}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-surface"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text">{file.label}</p>
                    {file.detail ? (
                      <p className="truncate font-mono text-xs text-text-muted">{file.detail}</p>
                    ) : null}
                  </div>
                  <ArrowIcon />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-start py-16">
      <div className="flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${colorToken}`} />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">Category</p>
      </div>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-text">{label}</h1>
      <p className="mt-3 text-base text-text-muted">
        Pick a file from the sidebar to open it. Expand folders there to browse everything in this
        category.
      </p>
    </div>
  );
}
