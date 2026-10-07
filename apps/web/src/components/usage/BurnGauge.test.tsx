// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vite-plus/test";
import { BurnGauge } from "./BurnGauge";

afterEach(cleanup);

const base = {
  cost: 2.5,
  burnPerHour: 0.5,
  projectedCost: 3,
  remainingMs: 3_600_000,
  progressPct: 40,
  startMs: Date.UTC(2026, 0, 1),
  endMs: Date.UTC(2026, 0, 2),
};

test("renders cost, rates, remaining time and projected cost", () => {
  render(<BurnGauge {...base} />);
  expect(screen.getByText("$2.50")).toBeTruthy();
  expect(screen.getByText("$0.5000/h")).toBeTruthy();
  expect(screen.getByText("1h 0m 0s remaining")).toBeTruthy();
  expect(screen.getByText("$3.00 projected")).toBeTruthy();
  expect(screen.getByText("40% elapsed")).toBeTruthy();
});

test("turns and Live pill are optional", () => {
  const { rerender } = render(<BurnGauge {...base} />);
  expect(screen.queryByText("Live")).toBeNull();
  expect(screen.queryByText(/turns/u)).toBeNull();
  rerender(<BurnGauge {...base} active turns={7} />);
  expect(screen.getByText("Live")).toBeTruthy();
  expect(screen.getByText("7 turns")).toBeTruthy();
});

test("progress is clamped to 0..100", () => {
  const { rerender } = render(<BurnGauge {...base} progressPct={150} />);
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  rerender(<BurnGauge {...base} progressPct={-20} />);
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
});
