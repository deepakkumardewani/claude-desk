// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const fetchUsageWindows = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ fetchUsageWindows }));

const win = (overrides: Record<string, unknown> = {}) => ({
  startMs: 1_700_000_000_000,
  endMs: 1_700_018_000_000,
  active: false,
  cost: 1.5,
  burnPerHour: 0.3,
  projectedCost: 1.8,
  remainingMs: 0,
  progressPct: 100,
  turns: 4,
  inputTokens: 1000,
  outputTokens: 500,
  ...overrides,
});

// The tab keeps a module-level cache, so every test loads a fresh module instance.
async function renderTab() {
  vi.resetModules();
  const { WindowsTab } = await import("./WindowsTab");
  return render(<WindowsTab />);
}

beforeEach(() => {
  fetchUsageWindows.mockReset();
});
afterEach(cleanup);

test("shows a loading block, then an empty state when there are no windows", async () => {
  fetchUsageWindows.mockResolvedValue({ windows: [] });
  await renderTab();
  expect(screen.getByRole("status")).toBeTruthy();
  expect(await screen.findByText("No recent billing windows")).toBeTruthy();
  expect(fetchUsageWindows).toHaveBeenCalledWith({ limit: 20 });
});

test("shows the error message when loading fails", async () => {
  fetchUsageWindows.mockRejectedValue(new Error("nope"));
  await renderTab();
  expect(await screen.findByRole("alert")).toBeTruthy();
});

test("without an active window it notes that and lists closed windows", async () => {
  fetchUsageWindows.mockResolvedValue({ windows: [win()] });
  await renderTab();
  expect(await screen.findByText("No active 5h billing window")).toBeTruthy();
  expect(screen.getByText("closed")).toBeTruthy();
  expect(screen.getByText("1.5K")).toBeTruthy();
  expect(screen.queryByText("Active 5-Hour Window")).toBeNull();
});

test("an active window renders the gauge and a live row", async () => {
  fetchUsageWindows.mockResolvedValue({
    windows: [win({ active: true, startMs: 1 }), win({ startMs: 2 })],
  });
  await renderTab();
  expect(await screen.findByText("Active 5-Hour Window")).toBeTruthy();
  expect(screen.getByText("live")).toBeTruthy();
  expect(screen.getByText("closed")).toBeTruthy();
  expect(screen.queryByText("No active 5h billing window")).toBeNull();
});
