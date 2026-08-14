import { useEffect, useState } from "react";
import type { UsageOverview } from "../../lib/api";
import { fetchOverviewCached, subscribeOverview } from "./overviewStore";
import { BurnGauge } from "./BurnGauge";
import { ShareBar } from "./ShareBar";
import { UsageHeatmap } from "./UsageHeatmap";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateBlocks";
import { formatCost, formatTokens } from "./format";

const MONEY_ACCENT = "text-teal-700 dark:text-teal-300";

export function OverviewTab() {
  const [overview, setOverview] = useState<UsageOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = subscribeOverview((data) => {
      if (cancelled) return;
      setOverview(data);
      setError(null);
      setLoading(false);
    });

    fetchOverviewCached()
      .then((data) => {
        if (!cancelled) {
          setOverview(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load usage overview");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (loading) return <LoadingBlock label="Loading overview..." />;
  if (error) return <ErrorBlock message={error} />;
  if (!overview) return <EmptyBlock message="No usage data available" />;

  const todayShareItems = Object.entries(overview.today.byModel).map(([model, agg]) => ({
    label: model.replace(/^claude-/, ""),
    cost: agg.cost,
  }));

  const allTimeStats = [
    { label: "Total cost", value: formatCost(overview.totals.cost), accent: true },
    { label: "Sessions", value: String(overview.totals.sessionCount) },
    { label: "Projects", value: String(overview.totals.projectCount) },
    {
      label: "Tokens",
      value: formatTokens(overview.totals.inputTokens + overview.totals.outputTokens),
    },
  ] as const;

  return (
    <div className="space-y-8">
      {/* Today primary — compact strip, not twin full-width cards */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-border-subtle pb-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Today</p>
          <p className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${MONEY_ACCENT}`}>
            {formatCost(overview.today.cost)}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            <span className="font-mono tabular-nums">{overview.today.turns}</span> turns ·{" "}
            <span className="font-mono tabular-nums">
              {formatTokens(overview.today.inputTokens + overview.today.outputTokens)}
            </span>{" "}
            tokens
          </p>
        </div>
        {!overview.activeWindow && (
          <p className="pb-1 text-xs text-text-muted">No active 5h billing window</p>
        )}
      </div>

      {overview.activeWindow && (
        <BurnGauge
          cost={overview.activeWindow.cost}
          burnPerHour={overview.activeWindow.burnPerHour}
          projectedCost={overview.activeWindow.projectedCost}
          remainingMs={overview.activeWindow.remainingMs}
          progressPct={overview.activeWindow.progressPct}
          startMs={overview.activeWindow.startMs}
          endMs={overview.activeWindow.endMs}
          turns={overview.activeWindow.turns}
          active={overview.activeWindow.active}
        />
      )}

      <UsageHeatmap
        data={overview.heatmap.map((d) => ({ date: d.date, value: d.cost }))}
        title="Spend · Last 12 Weeks"
      />

      <div>
        <h3 className="mb-3 text-sm font-semibold text-text">All Time</h3>
        <dl className="grid gap-x-6 gap-y-3 border-y border-border-subtle py-4 sm:grid-cols-2 lg:grid-cols-4">
          {allTimeStats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                {stat.label}
              </dt>
              <dd
                className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                  "accent" in stat && stat.accent ? MONEY_ACCENT : "text-text"
                }`}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {todayShareItems.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-text">Today by Model</h3>
          <ShareBar items={todayShareItems} />
        </div>
      )}
    </div>
  );
}
