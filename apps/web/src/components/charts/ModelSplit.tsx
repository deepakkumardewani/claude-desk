/**
 * Pie/donut chart showing cost distribution by model.
 * Custom SVG implementation, theme-aware.
 */

interface ModelData {
  label: string;
  cost: number;
}

interface ModelSplitProps {
  data: ModelData[];
  title?: string;
  variant?: "pie" | "donut";
}

// SVG color palette
const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#14b8a6", // teal
];

interface Point {
  x: number;
  y: number;
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
): Point {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    `L ${x} ${y}`,
    `Z`,
  ].join(" ");
}

export function ModelSplit({ data, title, variant = "donut" }: ModelSplitProps) {
  const total = data.reduce((sum, d) => sum + d.cost, 0);

  if (total === 0) {
    return (
      <div className="space-y-4">
        {title && <h3 className="text-sm font-semibold text-text">{title}</h3>}
        <div className="rounded-lg border border-border-subtle bg-surface-raised p-8 text-center">
          <p className="text-text-muted">No data available</p>
        </div>
      </div>
    );
  }

  const chartSize = 200;
  const center = chartSize / 2;
  const radius = 70;

  let currentAngle = 0;
  const slices = data.map((item) => {
    const sliceAngle = (item.cost / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    return {
      ...item,
      percentage: (item.cost / total) * 100,
      path: describeArc(center, center, radius, startAngle, endAngle),
      startAngle,
      endAngle,
    };
  });

  return (
    <div className="space-y-4">
      {title && <h3 className="text-sm font-semibold text-text">{title}</h3>}
      <div className="flex gap-6">
        <svg width={chartSize} height={chartSize} viewBox={`0 0 ${chartSize} ${chartSize}`}>
          {slices.map((slice, index) => (
            <g key={slice.label}>
              <path d={slice.path} fill={COLORS[index % COLORS.length]} opacity="0.8" />
            </g>
          ))}
          {variant === "donut" && (
            <circle cx={center} cy={center} r={40} className="fill-surface-raised" />
          )}
        </svg>

        <div className="flex flex-col justify-center space-y-2 text-sm">
          {slices.map((slice, index) => (
            <div key={slice.label} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="flex-1 text-text">{slice.label}</span>
              <span className="font-semibold text-text-muted">{slice.percentage.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
