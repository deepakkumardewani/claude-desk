// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const fetchUsageTimeline = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ fetchUsageTimeline }));

const entry = (period: string, cost: number) => ({
  period,
  cost,
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 2000,
});

async function renderTab() {
  vi.resetModules();
  const { TimelineTab } = await import("./TimelineTab");
  return render(<TimelineTab />);
}

beforeEach(() => {
  fetchUsageTimeline.mockReset();
});
afterEach(cleanup);

test("shows totals, session count and table rows for daily data", async () => {
  fetchUsageTimeline.mockResolvedValue({
    timeline: [entry("2026-01-01", 1), entry("2026-01-02", 0)],
    uniqueSessionCount: 5,
  });
  await renderTab();
  expect(await screen.findByText("Total spend")).toBeTruthy();
  expect(screen.getByText("$1.00", { selector: "dd" })).toBeTruthy();
  expect(screen.getByText("5")).toBeTruthy();
  expect(screen.getByText("2 days")).toBeTruthy();
  expect(screen.getByText("3.0K")).toBeTruthy();
  expect(screen.getByText("2026-01-02")).toBeTruthy();
  expect(fetchUsageTimeline).toHaveBeenCalledWith({
    granularity: "daily",
    since: undefined,
    until: undefined,
  });
});

test("switching to monthly and setting dates refetches", async () => {
  fetchUsageTimeline.mockResolvedValue({ timeline: [entry("2026-01", 2)], uniqueSessionCount: 1 });
  await renderTab();
  await screen.findByText("Total spend");
  fireEvent.click(screen.getByRole("button", { name: "monthly" }));
  expect(await screen.findByText("1 months")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Since"), { target: { value: "2026-01-01" } });
  fireEvent.change(screen.getByLabelText("Until"), { target: { value: "2026-02-01" } });
  await waitFor(() =>
    expect(fetchUsageTimeline).toHaveBeenLastCalledWith({
      granularity: "monthly",
      since: "2026-01-01",
      until: "2026-02-01",
    }),
  );
});

test("thins x-axis labels when there are many entries", async () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    entry(`2026-01-${String(i + 1).padStart(2, "0")}`, i),
  );
  fetchUsageTimeline.mockResolvedValue({ timeline: many, uniqueSessionCount: 1 });
  const { container } = await renderTab();
  await screen.findByText("Total spend");
  const labels = Array.from(container.querySelectorAll("span.text-center")).filter(
    (el) => el.textContent !== "",
  );
  expect(labels).toHaveLength(10);
});

test("empty and error states", async () => {
  fetchUsageTimeline.mockResolvedValue({ timeline: [], uniqueSessionCount: 0 });
  await renderTab();
  expect(await screen.findByText("No timeline data available")).toBeTruthy();
  cleanup();
  fetchUsageTimeline.mockRejectedValue(new Error("bad"));
  await renderTab();
  expect(await screen.findByRole("alert")).toBeTruthy();
});
