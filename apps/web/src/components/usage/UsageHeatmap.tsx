/**
 * Calendar heatmap for daily cost, rendered as plain CSS-grid cells (no SVG)
 * using a transparent -> accent scale on the app's own surface color, so it
 * reads correctly in both themes instead of hardcoded light-mode grays.
 */
import { formatUsd } from "./format";

interface HeatmapDay {
  date: string; // YYYY-MM-DD
  value: number;
}

interface UsageHeatmapProps {
  data: HeatmapDay[];
  title?: string;
}

const CELL_SIZE_PX = 13;
const CELL_GAP_PX = 3;
const ACCENT_HEX = "#0d9488"; // teal-600 — Clay-aligned
const INTENSITY_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function intensityColor(intensity: number): string {
  if (intensity <= 0) return "var(--surface-soft)";
  const mixPct = Math.round(Math.min(1, intensity) * 80 + 20);
  return `color-mix(in oklab, ${ACCENT_HEX} ${mixPct}%, var(--surface-soft))`;
}

/** Local calendar date (YYYY-MM-DD). Avoids UTC shift from toISOString(). */
function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function UsageHeatmap({ data, title }: UsageHeatmapProps) {
  if (data.length === 0) {
    return (
      <div className="space-y-3">
        {title && <h3 className="text-sm font-semibold text-text">{title}</h3>}
        <div className="rounded-lg border border-border-subtle bg-surface p-8 text-center">
          <p className="text-text-muted">No data available</p>
        </div>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 0.01);
  const valueByDate = new Map(data.map((d) => [d.date, d.value]));
  const sortedDates = data
    .map((d) => new Date(`${d.date}T00:00:00`))
    .sort((a, b) => a.getTime() - b.getTime());
  const rangeStart = sortedDates[0];
  const rangeEnd = sortedDates[sortedDates.length - 1];
  const rangeStartKey = toLocalDateKey(rangeStart);
  const rangeEndKey = toLocalDateKey(rangeEnd);

  // Align the grid to the preceding Sunday so weekday rows line up across weeks.
  const gridStart = new Date(rangeStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const cells: HeatmapDay[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= rangeEnd) {
    const key = toLocalDateKey(cursor);
    cells.push({ date: key, value: valueByDate.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div className="space-y-3">
      {title && <h3 className="text-sm font-semibold text-text">{title}</h3>}
      <div className="overflow-x-auto">
        <div className="inline-flex gap-1">
          <div
            className="grid text-right text-[10px] leading-none text-text-muted"
            style={{
              gridTemplateRows: `repeat(7, ${CELL_SIZE_PX}px)`,
              gap: CELL_GAP_PX,
              paddingRight: 4,
            }}
          >
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={i} className="flex items-center justify-end">
                {label}
              </span>
            ))}
          </div>
          <div
            className="grid"
            style={{
              gridAutoFlow: "column",
              gridTemplateRows: `repeat(7, ${CELL_SIZE_PX}px)`,
              gap: CELL_GAP_PX,
            }}
          >
            {cells.map((day) => {
              const outOfRange = day.date < rangeStartKey || day.date > rangeEndKey;
              if (outOfRange) {
                return <div key={day.date} style={{ width: CELL_SIZE_PX, height: CELL_SIZE_PX }} />;
              }
              const intensity = day.value / max;
              return (
                <div
                  key={day.date}
                  className="rounded-sm"
                  style={{
                    width: CELL_SIZE_PX,
                    height: CELL_SIZE_PX,
                    backgroundColor: intensityColor(intensity),
                  }}
                  title={`${day.date} · ${day.value > 0 ? formatUsd(day.value, 2) : "No activity"}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <span>Less</span>
        <div className="flex gap-1">
          {INTENSITY_STEPS.map((step) => (
            <div
              key={step}
              className="size-3 rounded-sm"
              style={{ backgroundColor: intensityColor(step) }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
