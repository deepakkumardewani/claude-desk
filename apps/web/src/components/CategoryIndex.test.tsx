// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { CategoryIndex } from "./CategoryIndex";

const fetchSettings = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ fetchSettings }));
vi.mock("../lib/scope", () => ({
  useWorkspace: () => ({ workspace: { kind: "user" }, activeScope: "user", projectDir: null }),
}));

function renderIndex(category: "skills" | "plugins") {
  return render(
    <MemoryRouter>
      <CategoryIndex category={category} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchSettings.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("non-plugin categories show orientation text and never fetch", () => {
  renderIndex("skills");
  expect(screen.getByText(/Pick a file from the sidebar/u)).toBeTruthy();
  expect(fetchSettings).not.toHaveBeenCalled();
});

test("plugins: shows loading, then configured plugins linking to settings", async () => {
  fetchSettings.mockResolvedValue({
    settings: { enabledPlugins: { "foo@market": true } },
  });
  renderIndex("plugins");
  expect(screen.getByText("Loading plugins…")).toBeTruthy();
  const link = await screen.findByRole("link", { name: /foo/u });
  expect(link.getAttribute("href")).toBe("/user/settings");
  expect(fetchSettings).toHaveBeenCalledWith("user", undefined);
  expect(screen.getByText(/1 configured plugin /u)).toBeTruthy();
});

test("plugins: empty state when no plugins configured", async () => {
  fetchSettings.mockResolvedValue({ settings: {} });
  renderIndex("plugins");
  expect(await screen.findByText("No plugins configured")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Add plugins in Settings/u }).getAttribute("href")).toBe(
    "/user/settings",
  );
});

test("plugins: fetch failure falls back to the empty state", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchSettings.mockRejectedValue(new Error("nope"));
  renderIndex("plugins");
  expect(await screen.findByText("No plugins configured")).toBeTruthy();
});
