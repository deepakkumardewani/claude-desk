/**
 * Daily activity heatmap showing usage over time.
 * Theme-aware custom SVG component.
 */

interface HeatmapDay {
  date: string; // YYYY-MM-DD
  value: number;
}

interface HeatmapProps {
  data: HeatmapDay[];
  title?: string;
  unit?: string;
  getColor?: (value: number, max: number) => string;
}

function getDefaultColor(value: number, max: number): string {
  if (value === 0) return "#e5e7eb"; // gray-200
  const intensity = value / max;

  // Blue gradient from light to dark
  if (intensity < 0.2) return "#dbeafe"; // blue-100
  if (intensity < 0.4) return "#93c5fd"; // blue-300
  if (intensity < 0.6) return "#3b82f6"; // blue-500
  if (intensity < 0.8) return "#1d4ed8"; // blue-700
  return "#1e3a8a"; // blue-900
}

export function Heatmap({ data, title, unit, getColor = getDefaultColor }: HeatmapProps) {
  if (data.length === 0) {
    return (
      <div className="space-y-4">
        {title && <h3 className="text-sm font-semibold text-text">{title}</h3>}
        <div className="rounded-lg border border-border-subtle bg-surface-raised p-8 text-center">
          <p className="text-text-muted">No data available</p>
        </div>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const cellSize = 24;
  const gap = 4;
  const cellWithGap = cellSize + gap;

  // Group by week for calendar view
  const dateMap = new Map(data.map((d) => [d.date, d.value]));

  // Get date range
  const dates = data.map((d) => new Date(d.date)).sort((a, b) => a.getTime() - b.getTime());
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  // Generate all dates in range
  const allDates: Date[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    allDates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  // Group by week
  const weeks: HeatmapDay[][] = [];
  let currentWeek: HeatmapDay[] = [];

  for (const date of allDates) {
    const dateStr = date.toISOString().split("T")[0];
    const value = dateMap.get(dateStr) ?? 0;
    currentWeek.push({ date: dateStr, value });

    if (date.getDay() === 6) {
      // Saturday end of week
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  const svgWidth = weeks.length * cellWithGap + 50;
  const svgHeight = 7 * cellWithGap + 50;

  const formatValue = (value: number) => {
    if (value === 0) return "No activity";
    return `${value.toFixed(2)} ${unit || "units"}`;
  };

  return (
    <div className="space-y-4">
      {title && <h3 className="text-sm font-semibold text-text">{title}</h3>}
      <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-raised p-4">
        <svg width={svgWidth} height={svgHeight} className="min-w-full">
          {/* Day labels */}
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
            <text
              key={day}
              x={10}
              y={30 + i * cellWithGap}
              fontSize="12"
              fill="currentColor"
              className="text-text-muted"
              textAnchor="end"
            >
              {day}
            </text>
          ))}

          {/* Cells */}
          {weeks.map((week, weekIndex) => (
            <g key={weekIndex}>
              {week.map((day, dayIndex) => {
                const x = 50 + weekIndex * cellWithGap;
                const y = 30 + dayIndex * cellWithGap;
                const bgColor = getColor(day.value, max);

                return (
                  <g key={`${weekIndex}-${dayIndex}`}>
                    <rect
                      x={x}
                      y={y}
                      width={cellSize}
                      height={cellSize}
                      fill={bgColor}
                      stroke="currentColor"
                      strokeWidth="1"
                      className="stroke-border-subtle hover:stroke-text-muted"
                      rx="4"
                    />
                    <title>{`${day.date}: ${formatValue(day.value)}`}</title>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Less</span>
        <div className="flex gap-1">
          {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((intensity) => (
            <div
              key={intensity}
              className="h-3 w-3 rounded"
              style={{
                backgroundColor: getColor(intensity * max, max),
                border: "1px solid rgba(0,0,0,0.1)",
              }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
