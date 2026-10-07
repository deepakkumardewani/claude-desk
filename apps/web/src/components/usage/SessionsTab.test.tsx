// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const fetchUsageSessions = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ fetchUsageSessions }));

const session = (overrides: Record<string, unknown> = {}) => ({
  sessionId: "abcdef1234567890",
  project: "my-proj",
  models: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4", "claude-extra"],
  turns: 9,
  lastTimestampMs: 1_700_000_000_000,
  inputTokens: 2000,
  outputTokens: 1000,
  cost: 3.21,
  ...overrides,
});

async function renderTab() {
  vi.resetModules();
  const { SessionsTab } = await import("./SessionsTab");
  return render(<SessionsTab />);
}

beforeEach(() => {
  fetchUsageSessions.mockReset();
});
afterEach(cleanup);

test("renders the table with truncated id, first three models and overflow count", async () => {
  fetchUsageSessions.mockResolvedValue({ sessions: [session()] });
  await renderTab();
  expect(await screen.findByText("abcdef12")).toBeTruthy();
  expect(screen.getByText("my-proj")).toBeTruthy();
  expect(screen.getByText("+1")).toBeTruthy();
  expect(screen.queryByText("extra")).toBeNull();
  expect(screen.getByText("3.0K")).toBeTruthy();
  expect(screen.getByText("$3.21")).toBeTruthy();
  expect(fetchUsageSessions).toHaveBeenCalledWith({ sort: "cost", limit: 20 });
});

test("changing sort and limit refetches with the new options", async () => {
  fetchUsageSessions.mockResolvedValue({ sessions: [session()] });
  await renderTab();
  await screen.findByText("abcdef12");
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "recent" } });
  await waitFor(() =>
    expect(fetchUsageSessions).toHaveBeenLastCalledWith({ sort: "recent", limit: 20 }),
  );
  fireEvent.change(screen.getByLabelText("Show"), { target: { value: "50" } });
  await waitFor(() =>
    expect(fetchUsageSessions).toHaveBeenLastCalledWith({ sort: "recent", limit: 50 }),
  );
});

test("shows empty and error states", async () => {
  fetchUsageSessions.mockResolvedValue({ sessions: [] });
  await renderTab();
  expect(await screen.findByText("No session data available")).toBeTruthy();
  cleanup();

  fetchUsageSessions.mockRejectedValue(new Error("bad"));
  await renderTab();
  expect(await screen.findByRole("alert")).toBeTruthy();
});
