import { expect, test } from "vite-plus/test";
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatTokens,
  formatUsd,
  shareOf,
} from "./format";

test("formatUsd handles finite and non-finite values", () => {
  expect(formatUsd(1.23456)).toBe("$1.2346");
  expect(formatUsd(1.23456, 2)).toBe("$1.23");
  expect(formatUsd(Number.NaN)).toBe("$0.0000");
  expect(formatUsd(Number.POSITIVE_INFINITY, 2)).toBe("$0.00");
});

test("formatCost uses 4 decimals below $1 and 2 from $1 up, including negatives", () => {
  expect(formatCost(0.00123)).toBe("$0.0012");
  expect(formatCost(0.9999)).toBe("$0.9999");
  expect(formatCost(1)).toBe("$1.00");
  expect(formatCost(-0.5)).toBe("$-0.5000");
  expect(formatCost(-12.345)).toBe("$-12.35");
});

test("formatTokens scales to K and M", () => {
  expect(formatTokens(Number.NaN)).toBe("0");
  expect(formatTokens(999.6)).toBe("1000");
  expect(formatTokens(1000)).toBe("1.0K");
  expect(formatTokens(1_000_000)).toBe("1.0M");
  expect(formatTokens(1500)).toBe("1.5K");
  expect(formatTokens(2_500_000)).toBe("2.5M");
  expect(formatTokens(-1500)).toBe("-1.5K");
});

test("formatDuration omits leading zero units", () => {
  expect(formatDuration(-5)).toBe("0s");
  expect(formatDuration(45_000)).toBe("45s");
  expect(formatDuration(125_000)).toBe("2m 5s");
  expect(formatDuration(3_661_000)).toBe("1h 1m 1s");
  expect(formatDuration(3_600_000)).toBe("1h 0m 0s");
});

test("formatDateTime accepts numbers and strings, and dashes invalid input", () => {
  expect(formatDateTime("not a date")).toBe("—");
  expect(formatDateTime(Number.NaN)).toBe("—");
  expect(formatDateTime(Date.UTC(2026, 0, 15, 12))).toMatch(/Jan/u);
  expect(formatDateTime("2026-03-05T12:00:00Z")).toMatch(/Mar/u);
});

test("formatPercent and shareOf", () => {
  expect(formatPercent(12.345)).toBe("12.3%");
  expect(formatPercent(Number.NaN)).toBe("0%");
  expect(shareOf(1, 4)).toBe(25);
  expect(shareOf(1, 0)).toBe(0);
  expect(shareOf(1, -3)).toBe(0);
});
