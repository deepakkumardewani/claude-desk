import { useEffect, useState } from "react";
import { fetchUsageWindows, type UsageWindowsResponse } from "../../lib/api";
import { BurnGauge } from "./BurnGauge";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateBlocks";
import { formatCost, formatDateTime, formatTokens } from "./format";
import {
  TABLE_WRAP,
  TABLE,
  THEAD_ROW,
  TH,
  TH_RIGHT,
  TR,
  TD,
  TD_MUTED,
  TD_NUM,
  TD_NUM_STRONG,
} from "./table";

const windowsCache = { data: null as UsageWindowsResponse | null };

export function WindowsTab() {
  const [data, setData] = useState<UsageWindowsResponse | null>(windowsCache.data);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!windowsCache.data);

  useEffect(() => {
    // Guard against the module cache, not the `data` state: including `data`
    // in the dependency array would make this effect's own setData() call
    // retrigger its cleanup before .finally() runs, dropping setLoading(false).
    if (windowsCache.data) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchUsageWindows({ limit: 20 })
      .then((response) => {
        if (cancelled) return;
        windowsCache.data = response;
        setData(response);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load billing windows");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingBlock label="Loading billing windows..." />;
  if (error) return <ErrorBlock message={error} />;

  const windows = data?.windows ?? [];
  const activeWindow = windows.find((window) => window.active) ?? null;

  return (
    <div className="space-y-6">
      {activeWindow ? (
        <BurnGauge
          cost={activeWindow.cost}
          burnPerHour={activeWindow.burnPerHour}
          projectedCost={activeWindow.projectedCost}
          remainingMs={activeWindow.remainingMs}
          progressPct={activeWindow.progressPct}
          startMs={activeWindow.startMs}
          endMs={activeWindow.endMs}
          turns={activeWindow.turns}
          active={activeWindow.active}
        />
      ) : null}

      {windows.length === 0 ? (
        <EmptyBlock message="No recent billing windows" />
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">Recent Windows</h3>
            {!activeWindow && (
              <p className="text-xs text-text-muted">No active 5h billing window</p>
            )}
          </div>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr className={THEAD_ROW}>
                  <th className={TH}>Started</th>
                  <th className={TH}>Ends</th>
                  <th className={TH}>Status</th>
                  <th className={TH_RIGHT}>Turns</th>
                  <th className={TH_RIGHT}>Tokens</th>
                  <th className={TH_RIGHT}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((window) => {
                  const isLive = window.active;
                  return (
                    <tr key={window.startMs} className={TR}>
                      <td className={`${TD} font-mono text-xs`}>
                        {formatDateTime(window.startMs)}
                      </td>
                      <td className={`${TD_MUTED} font-mono text-xs`}>
                        {formatDateTime(window.endMs)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                          {isLive && (
                            <span
                              className="size-1.5 rounded-full bg-green-500"
                              aria-hidden="true"
                            />
                          )}
                          <span
                            className={
                              isLive ? "font-medium text-green-700 dark:text-green-300" : undefined
                            }
                          >
                            {isLive ? "live" : "closed"}
                          </span>
                        </span>
                      </td>
                      <td className={TD_NUM}>{window.turns}</td>
                      <td className={TD_NUM}>
                        {formatTokens(window.inputTokens + window.outputTokens)}
                      </td>
                      <td className={TD_NUM_STRONG}>{formatCost(window.cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
