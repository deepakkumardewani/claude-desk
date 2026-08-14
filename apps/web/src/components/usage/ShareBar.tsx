/**
 * Horizontal stacked cost share bar with a legend list (dot, label, %, $).
 */
import { formatCost, formatPercent, shareOf } from "./format";
import { COST_RAMP } from "./palette";

export interface ShareBarItem {
  label: string;
  cost: number;
  color?: string;
}

interface ShareBarProps {
  items: ShareBarItem[];
}

export function ShareBar({ items }: ShareBarProps) {
  const total = items.reduce((sum, item) => sum + item.cost, 0);

  if (total <= 0 || items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-subtle p-8 text-center">
        <p className="text-sm text-text-muted">No cost data available</p>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => b.cost - a.cost);
  const colored = sorted.map((item, index) => ({
    ...item,
    color: item.color ?? COST_RAMP[index % COST_RAMP.length],
    pct: shareOf(item.cost, total),
  }));

  return (
    <div className="space-y-4">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-soft"
        role="img"
        aria-label={colored.map((item) => `${item.label} ${formatPercent(item.pct)}`).join(", ")}
      >
        {colored.map((item) => (
          <div
            key={item.label}
            className="h-full transition-[width] duration-500 ease-out first:rounded-l-full last:rounded-r-full"
            style={{ width: `${item.pct}%`, backgroundColor: item.color }}
            title={`${item.label}: ${formatPercent(item.pct)}`}
          />
        ))}
      </div>

      <ul className="space-y-2">
        {colored.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-sm">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-text" title={item.label}>
              {item.label}
            </span>
            <span className="flex shrink-0 items-baseline gap-2 font-mono text-xs tabular-nums">
              <span className="text-text-muted">{formatPercent(item.pct)}</span>
              <span className="w-16 text-right font-medium text-text">{formatCost(item.cost)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
