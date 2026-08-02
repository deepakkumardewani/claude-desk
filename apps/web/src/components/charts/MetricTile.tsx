/**
 * Simple metric tile component for displaying a single value with label.
 * Theme-aware: adapts to light/dark mode.
 */

interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: "blue" | "green" | "orange" | "purple";
  trend?: {
    direction: "up" | "down" | "flat";
    percent: number;
  };
}

const COLOR_MAP = {
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950",
    border: "border-blue-200 dark:border-blue-700",
    dot: "bg-blue-500",
  },
  green: {
    bg: "bg-green-50 dark:bg-green-950",
    border: "border-green-200 dark:border-green-700",
    dot: "bg-green-500",
  },
  orange: {
    bg: "bg-orange-50 dark:bg-orange-950",
    border: "border-orange-200 dark:border-orange-700",
    dot: "bg-orange-500",
  },
  purple: {
    bg: "bg-purple-50 dark:bg-purple-950",
    border: "border-purple-200 dark:border-purple-700",
    dot: "bg-purple-500",
  },
};

export function MetricTile({ label, value, unit, color = "blue", trend }: MetricTileProps) {
  const colorClasses = COLOR_MAP[color];

  return (
    <div className={`rounded-lg border ${colorClasses.bg} ${colorClasses.border} p-6`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-text-muted">{label}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <p className="text-3xl font-bold text-text">{value}</p>
            {unit && <span className="text-sm text-text-muted">{unit}</span>}
          </div>
        </div>
        {trend && (
          <div className="text-right">
            <div
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                trend.direction === "up"
                  ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
                  : trend.direction === "down"
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              <span>{trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}</span>
              <span>{Math.abs(trend.percent).toFixed(1)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
