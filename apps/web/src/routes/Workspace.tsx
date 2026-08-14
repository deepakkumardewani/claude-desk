import { useCallback, useEffect, useState } from "react";
import { ContextSummary } from "../components/ContextSummary";
import { fetchContextDetails, type ContextDetails } from "../api/context";
import { getCachedContext, setCachedContext } from "../lib/contextCache";
import { useWorkspace } from "../lib/scope";
import { dirBasename } from "../lib/workspaceState";

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
      <div className="h-4 w-40 animate-pulse rounded bg-border-subtle" />
      <div className="h-2 flex-1 animate-pulse rounded-full bg-border-subtle" />
      <div className="h-4 w-20 animate-pulse rounded bg-border-subtle" />
      <div className="h-4 w-12 animate-pulse rounded bg-border-subtle" />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading context breakdown" className="flex flex-col gap-6">
      <div className="flex items-baseline gap-3">
        <div className="h-10 w-32 animate-pulse rounded bg-border-subtle" />
        <div className="h-4 w-40 animate-pulse rounded bg-border-subtle" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}

/** Turn API/CLI errors into something a non-developer can act on. */
export function friendlyContextError(raw: string | null | undefined): {
  title: string;
  body: string;
} {
  const message = (raw ?? "").toLowerCase();

  if (
    message.includes("cli") ||
    message.includes("claude") ||
    message.includes("path") ||
    message.includes("enoent") ||
    message.includes("not found") ||
    message.includes("spawn")
  ) {
    return {
      title: "Claude Code isn't available",
      body: "We couldn't read your live context. Open Claude Code (or install the claude command-line tool), then try again.",
    };
  }

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("failed to fetch") ||
    message.includes("reach the server")
  ) {
    return {
      title: "Couldn't reach the server",
      body: "The app couldn't talk to the local backend. Make sure claude-desk is still running, then try again.",
    };
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return {
      title: "That took too long",
      body: "Reading your context timed out. Claude Code may be busy — wait a moment and try again.",
    };
  }

  return {
    title: "Couldn't load your context",
    body: "Something went wrong while reading how full Claude's memory is. Try again in a moment. If it keeps failing, restart Claude Code and claude-desk.",
  };
}

export function Workspace() {
  const { workspace, projectDir, activeScope } = useWorkspace();
  const cacheKey = workspace.kind === "project" ? `project:${workspace.dir}` : "user";
  const cached = getCachedContext(cacheKey);
  const [data, setData] = useState<ContextDetails | null>(cached);
  const [loading, setLoading] = useState(cached === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (isRefresh = false) => {
      const hasCache = getCachedContext(cacheKey) !== null;
      if (isRefresh) {
        setRefreshing(true);
        setLoading(true);
        setError(null);
      } else if (!hasCache) {
        setLoading(true);
        setData(null);
      } else {
        setData(getCachedContext(cacheKey));
      }

      fetchContextDetails(activeScope, projectDir ?? undefined)
        .then((res) => {
          if (res.success) {
            setCachedContext(cacheKey, res.data);
            setData(res.data);
            setError(null);
          } else {
            if (!getCachedContext(cacheKey)) {
              setData(null);
            }
            setError(res.error);
          }
        })
        .catch((err) => {
          if (!getCachedContext(cacheKey)) {
            setData(null);
          }
          setError(err instanceof Error ? err.message : "Unable to reach the server.");
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [activeScope, cacheKey, projectDir],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const workspaceLabel =
    workspace.kind === "project" ? dirBasename(workspace.dir) : "User (~/.claude)";

  const friendly = friendlyContextError(error);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-2">
      {loading ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text">
              Context
            </h2>
            <p className="text-sm text-text-muted">{workspaceLabel}</p>
            {refreshing ? (
              <span className="text-sm text-text-muted" aria-live="polite">
                Refreshing…
              </span>
            ) : null}
          </div>
          <LoadingSkeleton />
        </>
      ) : error && !data ? (
        <div
          role="alert"
          className="rounded-xl border border-border-subtle bg-surface-raised px-6 py-5"
        >
          <h2 className="font-display text-lg font-semibold tracking-tight text-text">
            {friendly.title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-muted">{friendly.body}</p>
          <button
            type="button"
            onClick={() => load(false)}
            className="mt-4 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
        </div>
      ) : data ? (
        <ContextSummary
          breakdown={data.categories}
          total={data.total_tokens}
          maxTokens={data.max_tokens}
          percentage={data.percentage}
          model={data.model}
          isEstimated={data.is_estimated}
          workspaceLabel={workspaceLabel}
          onRefresh={() => load(true)}
          refreshing={refreshing}
          staleError={error ? friendly : null}
        />
      ) : null}
    </section>
  );
}
