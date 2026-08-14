/**
 * Subtle metric card: muted uppercase label, large mono value, optional
 * sublabel/accent color on the value only. Replaces the old full-saturation
 * MetricTile blocks for the Usage Analytics tabs.
 */
import type { ReactNode } from "react";

interface UsageCardProps {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  sublabel?: ReactNode;
  className?: string;
}

export function UsageCard({
  label,
  value,
  valueClassName = "text-text",
  sublabel,
  className = "",
}: UsageCardProps) {
  return (
    <div className={`rounded-lg border border-border-subtle bg-surface-raised p-3 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${valueClassName}`}>
        {value}
      </p>
      {sublabel && <p className="mt-0.5 text-xs text-text-muted">{sublabel}</p>}
    </div>
  );
}
