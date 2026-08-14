/**
 * Formatting helpers shared across the Usage Analytics tabs.
 */

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const TOKENS_PER_K = 1_000;
const TOKENS_PER_M = 1_000_000;

const SMALL_COST_THRESHOLD = 1;
const SMALL_COST_DECIMALS = 4;
const LARGE_COST_DECIMALS = 2;

export function formatUsd(value: number, decimals = 4): string {
  if (!Number.isFinite(value)) return `$${(0).toFixed(decimals)}`;
  return `$${value.toFixed(decimals)}`;
}

/**
 * Auto-scaled cost formatter used everywhere a dollar figure is displayed:
 * 2 decimals once a value reads as whole cents or more, 4 decimals below $1
 * so sub-cent costs (e.g. a single cached-read turn) don't collapse to $0.00.
 */
export function formatCost(value: number): string {
  const decimals =
    Math.abs(value) < SMALL_COST_THRESHOLD ? SMALL_COST_DECIMALS : LARGE_COST_DECIMALS;
  return formatUsd(value, decimals);
}

export function formatTokens(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= TOKENS_PER_M) return `${(value / TOKENS_PER_M).toFixed(1)}M`;
  if (abs >= TOKENS_PER_K) return `${(value / TOKENS_PER_K).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / MS_PER_SECOND));
  const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor(
    (totalSeconds % (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) / SECONDS_PER_MINUTE,
  );
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function formatDateTime(value: number | string): string {
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

export function shareOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}
