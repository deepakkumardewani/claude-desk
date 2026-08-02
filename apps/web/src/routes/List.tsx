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
  summarizeConfig,
  type ConfigStat,
  type WorkspaceFile,
} from "../lib/workspace";
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

function StatRow({ stat }: { stat: ConfigStat }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="text-sm text-text-muted">{stat.label}</span>
      <span className="min-w-0 truncate text-right font-mono text-sm font-medium text-text">
        {stat.value}
        {stat.hint ? <span className="ml-1 font-sans text-text-muted">{stat.hint}</span> : null}
      </span>
    </div>
  );
}

function categoryHref(category: ApiCategory): string {
  if (category === "settings") {
    return "/settings";
  }
  if (category === "claudeMd") {
    return "/claude-md";
  }
  return `/${categoryToRoute(category)}`;
}

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-border-subtle ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading your workspace"
      className="mx-auto max-w-5xl space-y-7"
    >
      <header className="max-w-2xl space-y-3">
        <Bone className="h-9 w-72 sm:w-96" />
        <Bone className="h-4 w-full max-w-md" />
      </header>

      <Bone className="h-14 w-full rounded-xl" />

      <div className="flex flex-col gap-12">
        <section className="space-y-4">
          <div className="space-y-2">
            <Bone className="h-3 w-20" />
            <Bone className="h-4 w-64" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2"
              >
                <Bone className="size-2 shrink-0 rounded-full" />
                <Bone className="h-3.5 flex-1" />
                <Bone className="h-3 w-6" />
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-10 lg:grid-cols-2">
          <section className="space-y-3">
            <Bone className="h-3 w-32" />
            <div className="divide-y divide-border-subtle border-t border-border-subtle">
              {[0, 1].map((row) => (
                <div key={row} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Bone className="h-4 w-40" />
                    <Bone className="h-3 w-56" />
                  </div>
                  <Bone className="h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-3">
            <div className="flex items-center justify-between">
              <Bone className="h-3 w-28" />
              <Bone className="h-3 w-10" />
            </div>
            <div className="divide-y divide-border-subtle border-t border-border-subtle">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex items-center justify-between gap-4 py-3">
                  <Bone className="h-4 w-20" />
                  <Bone className="h-4 w-16" />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function List() {
  const navigate = useNavigate();
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

    Promise.all([fetchTree(), fetchSettings()])
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
  }, []);

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

  const files = useMemo(() => flattenFiles(categories), [categories]);
  const hasQuery = query.trim().length > 0;
  const results = useMemo(() => searchFiles(files, query, scope), [files, query, scope]);
  const stats = useMemo(() => summarizeConfig(settings), [settings]);
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
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Your Claude workspace
        </h1>
        <p className="mt-2 text-base text-text-muted">
          Search to jump anywhere, or open a category to browse in the sidebar.
        </p>
      </header>

      <div>
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
        <section aria-label="Search results list">
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
        <div className="flex flex-col gap-7">
          <SetupStatus compact={true} />
          <section aria-labelledby="browse-heading">
            <div className="max-w-2xl">
              <h2
                id="browse-heading"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted"
              >
                Browse
              </h2>
              <p className="mt-1.5 text-sm text-text-muted">
                Open a category in the file explorer.
              </p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {categories
                .filter((category) => !isDirectCategory(category.category))
                .map((category) => {
                  const { colorToken } = getCategoryMeta(category.category);
                  const count = categoryItemCount(category, settings);
                  return (
                    <Link
                      key={category.category}
                      to={categoryHref(category.category)}
                      className="group flex min-w-0 items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-left transition-colors hover:border-accent/35 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${colorToken}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                        {category.label}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                        {count.toLocaleString()}
                      </span>
                      <span className="shrink-0 opacity-40 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        <ArrowIcon />
                      </span>
                    </Link>
                  );
                })}
            </div>
          </section>

          <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
            {recent.length > 0 ? (
              <section aria-labelledby="recent-heading">
                <h2
                  id="recent-heading"
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted"
                >
                  Recently viewed
                </h2>
                <div className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
                  {recent.map((item) => {
                    const { prefix, leaf } = splitPathLabel(item.label);
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className="group flex items-center gap-3 py-3 transition-colors hover:text-accent focus-visible:outline-none"
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
                        <span className="shrink-0 text-xs text-text-muted">
                          {item.categoryLabel}
                        </span>
                        <ArrowIcon />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : (
              <div className="hidden lg:block" aria-hidden="true" />
            )}

            <aside aria-labelledby="config-heading">
              <div className="flex items-center justify-between gap-4">
                <h2
                  id="config-heading"
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted"
                >
                  Current config
                </h2>
                <Link
                  to="/settings"
                  className="text-xs font-medium text-accent transition hover:opacity-80"
                >
                  Edit →
                </Link>
              </div>
              <div className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
                {stats.map((stat) => (
                  <StatRow key={stat.label} stat={stat} />
                ))}
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
