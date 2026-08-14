import { useEffect, useState } from "react";
import {
  fetchUsageTimeline,
  type UsageTimelineEntry,
  type UsageTimelineGranularity,
  type UsageTimelineResponse,
} from "../../lib/api";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateBlocks";
import { formatCost, formatTokens } from "./format";
import { TABLE_WRAP, TABLE, THEAD_ROW, TH, TH_RIGHT, TR, TD, TD_NUM, TD_NUM_STRONG } from "./table";

const SELECT_CLASS =
  "w-fit cursor-pointer rounded-md border border-border-subtle bg-surface px-2.5 py-1 text-[13px] text-text transition-colors duration-150 hover:border-text-muted";
const MONEY_ACCENT = "text-teal-700 dark:text-teal-300";
const MAX_VISIBLE_LABELS = 12;

const timelineCache = new Map<string, UsageTimelineResponse>();

function cacheKey(granularity: UsageTimelineGranularity, since: string, until: string): string {
  return `${granularity}|${since}|${until}`;
}

function shortPeriodLabel(period: string, granularity: UsageTimelineGranularity): string {
  const date = new Date(`${period}${granularity === "daily" ? "T00:00:00" : "-01T00:00:00"}`);
  if (Number.isNaN(date.getTime())) return period;
  return granularity === "daily"
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export function TimelineTab() {
  const [granularity, setGranularity] = useState<UsageTimelineGranularity>("daily");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [data, setData] = useState<UsageTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = cacheKey(granularity, since, until);
    const cached = timelineCache.get(key);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchUsageTimeline({ granularity, since: since || undefined, until: until || undefined })
      .then((response) => {
        if (cancelled) return;
        timelineCache.set(key, response);
        setData(response);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load timeline");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [granularity, since, until]);

  const entries = data?.timeline ?? [];
  const totals = entries.reduce(
    (acc, entry) => ({
      cost: acc.cost + entry.cost,
      inputTokens: acc.inputTokens + entry.inputTokens,
      outputTokens: acc.outputTokens + entry.outputTokens,
    }),
    { cost: 0, inputTokens: 0, outputTokens: 0 },
  );
  const uniqueSessionCount = data?.uniqueSessionCount ?? 0;
  const maxCost = Math.max(...entries.map((entry) => entry.cost), 1);
  const labelStep = Math.max(1, Math.ceil(entries.length / MAX_VISIBLE_LABELS));

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="inline-flex w-fit gap-0.5">
          {(["daily", "monthly"] as UsageTimelineGranularity[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-[13px] font-medium capitalize transition-[color,background-color] duration-150 ${
                granularity === g
                  ? "bg-surface-raised text-text shadow-sm ring-1 ring-border-subtle"
                  : "text-text-muted hover:bg-surface-soft hover:text-text"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
          Since
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className={`${SELECT_CLASS} cursor-text`}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
          Until
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className={`${SELECT_CLASS} cursor-text`}
          />
        </label>
      </div>

      {loading && <LoadingBlock label="Loading timeline..." />}
      {!loading && error && <ErrorBlock message={error} />}
      {!loading && !error && entries.length === 0 && (
        <EmptyBlock message="No timeline data available" />
      )}

      {!loading && !error && entries.length > 0 && (
        <>
          {/* Totals — quiet strip, not 3 equal hero cards */}
          <dl className="grid gap-x-6 gap-y-3 border-y border-border-subtle py-4 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                Total spend
              </dt>
              <dd className={`mt-1 font-mono text-xl font-semibold tabular-nums ${MONEY_ACCENT}`}>
                {formatCost(totals.cost)}
              </dd>
              <p className="mt-0.5 text-xs text-text-muted">
                {entries.length} {granularity === "daily" ? "days" : "months"}
              </p>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                Sessions
              </dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-text">
                {uniqueSessionCount}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                Tokens
              </dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-text">
                {formatTokens(totals.inputTokens + totals.outputTokens)}
              </dd>
            </div>
          </dl>

          {/* Vertical bar chart */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-text">Cost over time</h3>
            <div className="overflow-x-auto">
              <div className="flex h-36 min-w-full items-end gap-1">
                {entries.map((entry) => {
                  const pct = (entry.cost / maxCost) * 100;
                  return (
                    <div
                      key={entry.period}
                      className="group relative flex h-full w-full min-w-[6px] flex-1 flex-col justify-end"
                    >
                      <span className="pointer-events-none absolute -top-6 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-text shadow-sm group-hover:block">
                        {formatCost(entry.cost)}
                      </span>
                      <div
                        className="w-full rounded-t-sm bg-teal-600 transition-[height,opacity] duration-300 group-hover:opacity-75"
                        style={{ height: `${Math.max(pct, entry.cost > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex min-w-full gap-1 border-t border-border-subtle pt-1.5">
                {entries.map((entry, i) => (
                  <span
                    key={entry.period}
                    className="w-full min-w-[6px] flex-1 truncate text-center font-mono text-[10px] text-text-muted"
                  >
                    {i % labelStep === 0 ? shortPeriodLabel(entry.period, granularity) : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr className={THEAD_ROW}>
                  <th className={TH}>Date</th>
                  <th className={TH_RIGHT}>Input</th>
                  <th className={TH_RIGHT}>Output</th>
                  <th className={TH_RIGHT}>Cache Read</th>
                  <th className={TH_RIGHT}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry: UsageTimelineEntry) => (
                  <tr key={entry.period} className={TR}>
                    <td className={`${TD} font-mono`}>{entry.period}</td>
                    <td className={TD_NUM}>{formatTokens(entry.inputTokens)}</td>
                    <td className={TD_NUM}>{formatTokens(entry.outputTokens)}</td>
                    <td className={TD_NUM}>{formatTokens(entry.cacheReadTokens)}</td>
                    <td className={TD_NUM_STRONG}>{formatCost(entry.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
