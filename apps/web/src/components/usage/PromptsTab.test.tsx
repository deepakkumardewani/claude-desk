// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { PromptsTab } from "./PromptsTab";

const fetchUsagePrompts = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ fetchUsagePrompts }));

beforeEach(() => {
  fetchUsagePrompts.mockReset();
});
afterEach(cleanup);

test("lists prompts with cost, and placeholders for missing text or cost", async () => {
  fetchUsagePrompts.mockResolvedValue({
    prompts: [
      { sessionId: "s1", timestampMs: 1, prompt: "fix bug", cost: 0.25, project: "alpha" },
      { sessionId: "s2", timestampMs: 2, prompt: null, cost: null, project: "beta" },
    ],
  });
  render(<PromptsTab />);
  expect(await screen.findByText("fix bug")).toBeTruthy();
  expect(screen.getByText("$0.2500")).toBeTruthy();
  expect(screen.getByText("(no prompt text)")).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy();
  expect(fetchUsagePrompts).toHaveBeenCalledWith({
    limit: 50,
    project: undefined,
    since: undefined,
    until: undefined,
  });
});

test("filters are forwarded to the request", async () => {
  fetchUsagePrompts.mockResolvedValue({ prompts: [] });
  render(<PromptsTab />);
  expect(await screen.findByText("No recent prompts available")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Project"), { target: { value: "alpha" } });
  fireEvent.change(screen.getByLabelText("Since"), { target: { value: "2026-01-01" } });
  fireEvent.change(screen.getByLabelText("Until"), { target: { value: "2026-02-01" } });
  await waitFor(() =>
    expect(fetchUsagePrompts).toHaveBeenLastCalledWith({
      limit: 50,
      project: "alpha",
      since: "2026-01-01",
      until: "2026-02-01",
    }),
  );
});

test("shows an error block on failure", async () => {
  fetchUsagePrompts.mockRejectedValue(new Error("bad"));
  render(<PromptsTab />);
  expect(await screen.findByRole("alert")).toBeTruthy();
});
