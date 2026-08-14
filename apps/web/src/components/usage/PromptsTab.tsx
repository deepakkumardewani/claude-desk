import { useEffect, useState } from "react";
import { fetchUsagePrompts, type UsagePromptsResponse } from "../../lib/api";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateBlocks";
import { formatCost, formatDateTime } from "./format";
import { PERIOD_SELECT_CLASS } from "./period";

const PROMPT_LIMIT = 50;

export function PromptsTab() {
  const [project, setProject] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [data, setData] = useState<UsagePromptsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchUsagePrompts({
      limit: PROMPT_LIMIT,
      project: project || undefined,
      since: since || undefined,
      until: until || undefined,
    })
      .then((response) => {
        if (cancelled) return;
        setData(response);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load recent prompts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project, since, until]);

  const prompts = data?.prompts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-text-muted">
          Project
          <input
            type="text"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="Exact name"
            className={PERIOD_SELECT_CLASS}
          />
        </label>
        <label className="flex w-fit flex-col gap-1 text-xs font-medium text-text-muted">
          Since
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className={PERIOD_SELECT_CLASS}
          />
        </label>
        <label className="flex w-fit flex-col gap-1 text-xs font-medium text-text-muted">
          Until
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className={PERIOD_SELECT_CLASS}
          />
        </label>
      </div>

      {loading && <LoadingBlock label="Loading recent prompts..." />}
      {!loading && error && <ErrorBlock message={error} />}
      {!loading && !error && prompts.length === 0 && (
        <EmptyBlock message="No recent prompts available" />
      )}

      {!loading && !error && prompts.length > 0 && (
        <ul className="divide-y divide-border-subtle border-y border-border-subtle">
          {prompts.map((prompt) => (
            <li
              key={`${prompt.sessionId}-${prompt.timestampMs}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 py-3 transition-colors duration-150 hover:bg-surface-soft/40"
            >
              <p className="min-w-0 truncate text-sm text-text" title={prompt.prompt ?? undefined}>
                {prompt.prompt ?? "(no prompt text)"}
              </p>
              <span className="shrink-0 self-center font-mono text-sm font-medium tabular-nums text-text">
                {prompt.cost !== null ? formatCost(prompt.cost) : "—"}
              </span>
              <p className="col-span-2 truncate text-xs text-text-muted">
                <span title={prompt.project}>{prompt.project}</span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">{formatDateTime(prompt.timestampMs)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
