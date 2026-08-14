/**
 * Active 5-hour billing window card: spend, burn rate, projected cost,
 * remaining time, and a gradient progress bar showing elapsed window %.
 */
import { formatCost, formatDateTime, formatDuration } from "./format";

interface BurnGaugeProps {
  cost: number;
  burnPerHour: number;
  projectedCost: number;
  remainingMs: number;
  progressPct: number;
  startMs: number;
  endMs: number;
  turns?: number;
  active?: boolean;
  className?: string;
}

function LivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-green-500" />
      </span>
      Live
    </span>
  );
}

export function BurnGauge({
  cost,
  burnPerHour,
  projectedCost,
  remainingMs,
  progressPct,
  startMs,
  endMs,
  turns,
  active = false,
  className = "",
}: BurnGaugeProps) {
  const clampedPct = Math.min(100, Math.max(0, progressPct));

  return (
    <div className={`rounded-lg border border-border-subtle bg-surface-raised p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
          Active 5-Hour Window
        </p>
        {active && <LivePill />}
      </div>

      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-green-700 dark:text-green-300">
        {formatCost(cost)}
      </p>

      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted">
        <span className="font-mono tabular-nums">{formatCost(burnPerHour)}/h</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono tabular-nums">{formatDuration(remainingMs)} remaining</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono tabular-nums">{formatCost(projectedCost)} projected</span>
        {turns !== undefined && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{turns} turns</span>
          </>
        )}
      </p>

      <div className="mt-4 space-y-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
          <div
            className="h-full rounded-full bg-teal-600 transition-all duration-500"
            style={{ width: `${clampedPct}%` }}
            role="progressbar"
            aria-valuenow={Math.round(clampedPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Window elapsed"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-text-muted">
          <span className="font-mono tabular-nums">{formatDateTime(startMs)}</span>
          <span>{clampedPct.toFixed(0)}% elapsed</span>
          <span className="font-mono tabular-nums">{formatDateTime(endMs)}</span>
        </div>
      </div>
    </div>
  );
}
