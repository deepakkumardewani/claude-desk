import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  categoryToRoute,
  fetchSettings,
  fetchTree,
  type ApiCategory,
  type TreeCategory,
} from "../lib/api";
import { getCategoryMeta } from "../lib/categories";
import { getRecent, type RecentItem } from "../lib/recent";
import { SetupStatus } from "../components/SetupStatus.js";
import {
  categoryItemCount,
  flattenFiles,
  isDirectCategory,
  searchFiles,
  splitPathLabel,
  type WorkspaceFile,
} from "../lib/workspace";
import { useWorkspace } from "../lib/scope";
import { workspaceBasePath, type Workspace } from "../lib/workspaceState";
import type { ClaudeSettings } from "schema";

const SEARCH_RESULT_LIMIT = 40;

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-5 text-text-muted"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

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

function FileRow({ file }: { file: WorkspaceFile }) {
  return (
    <Link
      to={file.href}
      className="group flex items-center gap-3 px-4 py-3 transition hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-text">{file.label}</p>
        {file.detail && file.detail !== file.label ? (
          <p className="truncate font-mono text-xs text-text-muted">{file.detail}</p>
        ) : null}
      </div>
      <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-muted">
        {file.categoryLabel}
      </span>
      <ArrowIcon />
    </Link>
  );
}

function homeCopy(kind: Workspace["kind"]): { title: string; subtitle: string } {
  if (kind === "project") {
    return {
      title: "This project",
      subtitle: "Search jumps to a file; Browse opens a category in the sidebar.",
    };
  }
  return {
    title: "Your user config",
    subtitle: "~/.claude applies across projects; search or Browse to jump in.",
  };
}

function BrowseRow({
  href,
  label,
  purpose,
  colorToken,
  count,
}: {
  href: string;
  label: string;
  purpose: string;
  colorToken: string;
  count: number;
}) {
  const empty = count === 0;
  return (
    <Link
      to={href}
      className="group -mx-3 flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
    >
      <span className={`mt-2 size-2 shrink-0 rounded-full ${colorToken}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={`truncate text-base font-medium group-hover:text-accent ${empty ? "text-text-muted" : "text-text"}`}
          >
            {label}
          </span>
          <span
            className={`shrink-0 font-mono text-xs tabular-nums ${empty ? "text-text-muted" : "text-text"}`}
          >
            {count.toLocaleString()}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-muted">{purpose}</span>
      </span>
    </Link>
  );
}

function categoryHref(category: ApiCategory, basePath: string): string {
  if (category === "settings") {
    return `${basePath}/settings`;
  }
  if (category === "claudeMd") {
    return `${basePath}/claude-md`;
  }
  return `${basePath}/${categoryToRoute(category)}`;
}

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-border-subtle ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your workspace" className="mx-auto max-w-5xl">
      <header className="max-w-2xl space-y-3">
        <Bone className="h-9 w-72 sm:w-96" />
        <Bone className="h-4 w-full max-w-md" />
      </header>

      <Bone className="mt-4 h-14 w-full rounded-xl" />

      <section className="mt-12">
        <Bone className="h-6 w-24" />
        <div className="mt-4 grid gap-x-12 sm:grid-cols-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-start gap-3 px-3 py-2.5">
              <Bone className="mt-2 size-2 shrink-0 rounded-full" />
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <Bone className="h-4 w-24" />
                  <Bone className="h-3 w-5" />
                </div>
                <Bone className="h-3 w-44" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function List() {
  const navigate = useNavigate();
  const { workspace, activeScope, projectDir } = useWorkspace();
  const basePath = workspaceBasePath(workspace);
  const [categories, setCategories] = useState<TreeCategory[]>([]);
  const [settings, setSettings] = useState<ClaudeSettings>({});
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ApiCategory | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchTree(activeScope, projectDir ?? undefined),
      fetchSettings(activeScope, projectDir ?? undefined),
    ])
      .then(([tree, settingsResponse]) => {
        if (cancelled) {
          return;
        }
        setCategories(tree.categories);
        setSettings(settingsResponse.settings as ClaudeSettings);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load your workspace.");
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
  }, [activeScope, projectDir]);

  useEffect(() => {
    setRecent(getRecent());
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isCommandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!isCommandK && !isSlash) {
        return;
      }
      const target = event.target;
      const inField =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isSlash && inField) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const files = useMemo(
    () =>
      flattenFiles(categories).map((file) => ({
        ...file,
        href: `${basePath}${file.href}`,
      })),
    [categories, basePath],
  );
  const hasQuery = query.trim().length > 0;
  const results = useMemo(() => searchFiles(files, query, scope), [files, query, scope]);
  const copy = homeCopy(workspace.kind);
  const scopes = useMemo<Array<{ id: ApiCategory | null; label: string }>>(
    () => [
      { id: null, label: "All" },
      ...categories
        .filter((category) => !isDirectCategory(category.category))
        .map((category) => ({ id: category.category, label: category.label })),
    ],
    [categories],
  );

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mt-2 text-base text-text-muted">{copy.subtitle}</p>
      </header>

      <div className="mt-4">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="search"
            role="searchbox"
            aria-label="Search your workspace"
            value={query}
            placeholder="Search skills, commands, plans…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0]) {
                void navigate(results[0].href);
              }
            }}
            className="settings-search w-full rounded-xl border border-border-subtle bg-surface-raised py-3.5 pl-12 pr-16 text-base text-text shadow-sm transition placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-4 focus:ring-accent/10"
          />
          <kbd className="pointer-events-none absolute inset-y-0 right-4 my-auto hidden h-6 items-center rounded border border-border-subtle bg-surface px-1.5 font-mono text-[0.7rem] text-text-muted sm:flex">
            ⌘K
          </kbd>
        </div>

        {hasQuery ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {scopes.map((option) => {
              const isActive = scope === option.id;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setScope(option.id)}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    isActive
                      ? "bg-accent text-accent-fg"
                      : "border border-border-subtle text-text-muted hover:border-accent/40 hover:text-text"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
            <span className="ml-auto text-sm text-text-muted">
              {results.length.toLocaleString()} match{results.length === 1 ? "" : "es"}
            </span>
          </div>
        ) : null}
      </div>

      {hasQuery ? (
        <section className="mt-6" aria-label="Search results list">
          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-subtle bg-surface-raised p-10 text-center">
              <p className="font-medium text-text">No matches</p>
              <p className="mt-1 text-sm text-text-muted">
                Try a different keyword or widen the scope to All.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-sm">
              <div className="divide-y divide-border-subtle">
                {results.slice(0, SEARCH_RESULT_LIMIT).map((file) => (
                  <FileRow key={`${file.category}-${file.name}`} file={file} />
                ))}
              </div>
              {results.length > SEARCH_RESULT_LIMIT ? (
                <p className="border-t border-border-subtle px-4 py-2.5 text-xs text-text-muted">
                  Showing first {SEARCH_RESULT_LIMIT} of {results.length.toLocaleString()}. Keep
                  typing to narrow it down.
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : (
        <div>
          <SetupStatus />
          <section className="mt-12" aria-labelledby="browse-heading">
            <h2 id="browse-heading" className="font-display text-xl font-semibold text-text">
              Browse
            </h2>
            <div className="mt-4 grid gap-x-12 sm:grid-cols-2">
              {categories
                .filter((category) => !isDirectCategory(category.category))
                .map((category) => {
                  const meta = getCategoryMeta(category.category);
                  return (
                    <BrowseRow
                      key={category.category}
                      href={categoryHref(category.category, basePath)}
                      label={category.label}
                      purpose={meta.purpose}
                      colorToken={meta.colorToken}
                      count={categoryItemCount(category, settings)}
                    />
                  );
                })}
            </div>
          </section>

          {recent.length > 0 ? (
            <section className="mt-12" aria-labelledby="recent-heading">
              <h2 id="recent-heading" className="font-display text-xl font-semibold text-text">
                Recently viewed
              </h2>
              <div className="mt-2 divide-y divide-border-subtle">
                {recent.map((item) => {
                  const { prefix, leaf } = splitPathLabel(item.label);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className="group flex items-center gap-3 py-2 transition-colors hover:text-accent focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-text group-hover:text-accent">
                          {leaf}
                        </span>
                        {prefix ? (
                          <span className="block truncate font-mono text-xs text-text-muted">
                            {prefix}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-text-muted">{item.categoryLabel}</span>
                      <ArrowIcon />
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
