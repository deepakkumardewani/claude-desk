/**
 * Compact inline share indicator for table rows: a thin track + percentage,
 * used instead of a duplicate legend chart when a row already carries the
 * label and cost (e.g. the Projects and Models tables).
 */
export function MiniShareBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-surface-soft">
        <div
          className="h-full rounded-full bg-teal-600 transition-[width] duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-text-muted">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}
