/**
 * Shared Tailwind class strings for Usage Analytics tables so header, row,
 * and numeric-cell styling (hover state, uppercase muted headers, mono
 * tabular numbers) stays consistent across Models/Projects/Sessions/Windows.
 */
export const TABLE_WRAP = "overflow-x-auto rounded-lg border border-border-subtle";
export const TABLE = "w-full text-sm";
export const THEAD_ROW = "border-b border-border-subtle bg-surface-soft";
export const TH =
  "whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted";
export const TH_RIGHT = `${TH} text-right`;
export const TR =
  "border-b border-border-subtle transition-colors duration-150 last:border-0 hover:bg-surface-soft/60";
export const TD = "px-4 py-2.5 text-text";
export const TD_MUTED = "px-4 py-2.5 text-text-muted";
export const TD_NUM = "px-4 py-2.5 text-right font-mono tabular-nums text-text-muted";
export const TD_NUM_STRONG = "px-4 py-2.5 text-right font-mono tabular-nums font-medium text-text";
export const TD_TRUNCATE = "block max-w-[220px] truncate";
