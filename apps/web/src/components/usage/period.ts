/** Shared period filter options for Models / Projects tabs. */
export const PERIOD_OPTIONS = [
  { value: "", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
] as const;

export type PeriodOptionValue = (typeof PERIOD_OPTIONS)[number]["value"];

export const PERIOD_SELECT_CLASS =
  "w-fit cursor-pointer rounded-md border border-border-subtle bg-surface px-2.5 py-1 text-[13px] text-text transition-colors duration-150 hover:border-text-muted";

export function periodLabel(period: string): string {
  return PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "All time";
}
