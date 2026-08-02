/**
 * Horizontal bar chart showing cost by category (model, project, etc.)
 * Theme-aware: adapts to light/dark mode.
 */

interface CostBarsProps {
  data: Array<{
    label: string;
    cost: number;
  }>;
  maxValue?: number;
  title?: string;
}

export function CostBars({ data, maxValue, title }: CostBarsProps) {
  const sorted = [...data].sort((a, b) => b.cost - a.cost);
  const max = maxValue ?? Math.max(...sorted.map((d) => d.cost), 1);

  // Color palette for bars
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-cyan-500",
  ];

  const formatCost = (cost: number) => {
    if (cost >= 1) return `$${cost.toFixed(2)}`;
    if (cost >= 0.01) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div className="space-y-4">
      {title && <h3 className="text-sm font-semibold text-text">{title}</h3>}
      <div className="space-y-3">
        {sorted.map((item, index) => {
          const percentage = (item.cost / max) * 100;
          const color = colors[index % colors.length];

          return (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="truncate text-sm font-medium text-text">{item.label}</label>
                <span className="text-sm font-semibold text-text-muted">
                  {formatCost(item.cost)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className={`h-full rounded-full ${color} transition-all duration-300`}
                  style={{ width: `${percentage}%` }}
                  aria-label={`${item.label}: ${formatCost(item.cost)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
