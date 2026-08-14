import { useMemo } from "react";
import { StackedUsageBar, type StackedUsageBarCategory } from "./StackedUsageBar";
import { CategorySummaryTable, type CategorySummaryTableCategory } from "./CategorySummaryTable";
import { getCategoryColor } from "../lib/categoryColors";
import type { ContextCategory } from "../api/context";

type Props = {
  breakdown: ContextCategory[];
  total: number;
  maxTokens: number;
  percentage: number;
  model: string;
  isEstimated: boolean;
  workspaceLabel: string;
  onRefresh: () => void;
  refreshing: boolean;
  staleError?: { title: string; body: string } | null;
};

function formatK(tokens: number): string {
  return `${(tokens / 1000).toFixed(1)}k`;
}

export function ContextSummary({
  breakdown,
  total,
  maxTokens,
  percentage,
  model,
  isEstimated,
  workspaceLabel,
  onRefresh,
  refreshing,
  staleError = null,
}: Props) {
  const stackedCategories = useMemo<StackedUsageBarCategory[]>(() => {
    return breakdown.map((entry) => ({
      name: entry.name,
      tokens: entry.tokens,
      color: getCategoryColor(entry.name),
    }));
  }, [breakdown]);

  const freeTokens = useMemo(() => {
    return (
      breakdown.find((entry) => entry.name.trim().toLowerCase() === "free space")?.tokens ?? null
    );
  }, [breakdown]);

  const tableCategories = useMemo<CategorySummaryTableCategory[]>(() => {
    return breakdown.map((entry) => ({
      name: entry.name,
      tokens: entry.tokens,
      percentage: entry.percentage,
      color: getCategoryColor(entry.name),
      items: entry.items,
      groups: entry.groups,
    }));
  }, [breakdown]);

  return (
    <div className="animate-fade-in flex flex-col">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text">
              Context
            </h2>
            <p className="truncate text-sm text-text-muted">{workspaceLabel}</p>
            {refreshing ? (
              <span className="text-sm text-text-muted" aria-live="polite">
                Refreshing…
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh context summary"
            className="grid size-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-soft hover:text-text disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg
              aria-hidden="true"
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <p>
              <span className="font-medium tabular-nums text-text">{total.toLocaleString()}</span>
              <span className="text-text-muted"> tokens</span>
            </p>
            <p className="text-text">{model}</p>
            <p className="tabular-nums text-text-muted">
              {formatK(total)} / {formatK(maxTokens)} ({percentage}%)
            </p>
            {freeTokens !== null ? (
              <p className="tabular-nums text-text-muted">{formatK(freeTokens)} free</p>
            ) : null}
            {isEstimated ? <p className="text-text-muted">Estimated</p> : null}
          </div>
          <StackedUsageBar total={maxTokens} categories={stackedCategories} height="h-2.5" />
        </div>
      </header>

      {staleError ? (
        <div
          role="status"
          className="mt-6 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-sm text-text-muted"
        >
          <span className="font-medium text-text">{staleError.title}.</span> Showing the last
          successful load. {staleError.body}
        </div>
      ) : null}

      <div className="mt-10">
        <CategorySummaryTable categories={tableCategories} />
      </div>
    </div>
  );
}
