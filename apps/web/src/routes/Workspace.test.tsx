// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vite-plus/test";
import * as api from "../api/context";
import { clearCachedContext } from "../lib/contextCache";
import { Workspace } from "./Workspace";

vi.mock("../api/context", () => ({
  fetchContextDetails: vi.fn(),
}));

vi.mock("../lib/scope", () => ({
  useWorkspace: () => ({
    workspace: { kind: "user" },
    projectDir: null,
    activeScope: "user",
  }),
}));

afterEach(() => {
  cleanup();
  clearCachedContext();
});

function renderWorkspace() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <Workspace />
    </MemoryRouter>,
  );
}

test("renders loading skeleton initially", () => {
  vi.mocked(api.fetchContextDetails).mockReturnValue(new Promise(() => {}));
  const html = renderWorkspace();
  expect(html).toContain("animate-pulse");
  expect(html).toContain("Loading context breakdown");
});

test("renders without errors when mounted", () => {
  vi.mocked(api.fetchContextDetails).mockReturnValue(new Promise(() => {}));
  expect(() => renderWorkspace()).not.toThrow();
});

test("renders breakdown when context API succeeds", async () => {
  vi.mocked(api.fetchContextDetails).mockResolvedValue({
    success: true,
    data: {
      model: "Sonnet 4.6",
      model_id: "claude-sonnet-4-6",
      total_tokens: 10000,
      max_tokens: 200000,
      percentage: 5,
      is_estimated: false,
      categories: [
        { name: "System Prompt", tokens: 5000, percentage: 50, items: [] },
        { name: "Tools", tokens: 5000, percentage: 50, items: [] },
      ],
    },
  });

  render(
    <MemoryRouter>
      <Workspace />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByText("10,000")).toBeTruthy();
  });
  expect(screen.getByText("System Prompt")).toBeTruthy();
  expect(screen.getByText("Tools")).toBeTruthy();
});

test("renders error alert when context API fails", async () => {
  vi.mocked(api.fetchContextDetails).mockResolvedValue({
    success: false,
    error: "Network error",
  });

  render(
    <MemoryRouter>
      <Workspace />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeTruthy();
  });
  expect(screen.getByText("Couldn't reach the server")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});
