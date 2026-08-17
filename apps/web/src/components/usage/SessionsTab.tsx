import { useState } from "react";
import { fetchUsageSessions, type UsageSessionsResponse } from "../../lib/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateBlocks";
import { ModelPill } from "./ModelPill";
import { formatCost, formatDateTime, formatTokens } from "./format";
import {
  TABLE_WRAP,
  TABLE,
  THEAD_ROW,
  TH,
  TH_RIGHT,
  TR,
  TD,
  TD_NUM,
  TD_NUM_STRONG,
  TD_TRUNCATE,
} from "./table";

const SELECT_CLASS =
  "w-fit cursor-pointer rounded-md border border-border-subtle bg-surface px-2.5 py-1 text-[13px] text-text transition-colors duration-150 hover:border-text-muted";

const SORT_OPTIONS = [
  { value: "cost", label: "Most expensive" },
  { value: "recent", label: "Most recent" },
] as const;

const LIMIT_OPTIONS = [20, 50, 100] as const;

const sessionsCache = new Map<string, UsageSessionsResponse>();

export function SessionsTab() {
  const [sort, setSort] = useState<"cost" | "recent">("cost");
  const [limit, setLimit] = useState<number>(20);

  const cacheKey = `${sort}|${limit}`;
  const { data, error, loading } = useAsyncData(
    () => fetchUsageSessions({ sort, limit }),
    [sort, limit],
    { cache: sessionsCache, cacheKey },
  );

  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "cost" | "recent")}
              className={SELECT_CLASS}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
            Show
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className={SELECT_CLASS}
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!loading && !error && sessions.length > 0 && (
          <p className="pb-1.5 text-xs text-text-muted">
            <span className="font-mono tabular-nums text-text">{sessions.length}</span> sessions
          </p>
        )}
      </div>

      {loading && <LoadingBlock label="Loading sessions..." />}
      {!loading && error && <ErrorBlock message={error} />}
      {!loading && !error && sessions.length === 0 && (
        <EmptyBlock message="No session data available" />
      )}

      {!loading && !error && sessions.length > 0 && (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr className={THEAD_ROW}>
                <th className={TH}>ID</th>
                <th className={TH}>Project</th>
                <th className={TH}>Models</th>
                <th className={TH_RIGHT}>Turns</th>
                <th className={TH_RIGHT}>Last Activity</th>
                <th className={TH_RIGHT}>Tokens</th>
                <th className={TH_RIGHT}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.sessionId} className={TR}>
                  <td
                    className={`${TD} font-mono text-xs text-text-muted`}
                    title={session.sessionId}
                  >
                    {session.sessionId.slice(0, 8)}
                  </td>
                  <td className={TD}>
                    <span className={TD_TRUNCATE} title={session.project}>
                      {session.project}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex max-w-[16rem] flex-wrap gap-1 overflow-hidden">
                      {session.models.slice(0, 3).map((model) => (
                        <ModelPill key={model} model={model} />
                      ))}
                      {session.models.length > 3 && (
                        <span className="text-[11px] text-text-muted">
                          +{session.models.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={TD_NUM}>{session.turns}</td>
                  <td className={TD_NUM}>{formatDateTime(session.lastTimestampMs)}</td>
                  <td className={TD_NUM}>
                    {formatTokens(session.inputTokens + session.outputTokens)}
                  </td>
                  <td className={TD_NUM_STRONG}>{formatCost(session.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
