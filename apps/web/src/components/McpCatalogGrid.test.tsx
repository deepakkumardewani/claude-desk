// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import type { CatalogEntry } from "schema";
import { McpCatalogGrid } from "./McpCatalogGrid";

const entry = (overrides: Partial<CatalogEntry> = {}) =>
  ({
    id: "github",
    name: "GitHub",
    category: "dev",
    description: "Repo tools",
    command: "npx gh",
    official: true,
    ...overrides,
  }) as CatalogEntry;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  document.body.innerHTML = "";
});

test("empty entries show the no-match message", () => {
  render(<McpCatalogGrid entries={[]} installedNames={new Set()} onAdd={() => {}} />);
  expect(screen.getByText("No servers match your filters")).toBeTruthy();
});

test("not-installed entries show Install and call onAdd with the entry", () => {
  const onAdd = vi.fn();
  const e = entry();
  render(<McpCatalogGrid entries={[e]} installedNames={new Set()} onAdd={onAdd} />);
  fireEvent.click(screen.getByRole("button", { name: "Install" }));
  expect(onAdd).toHaveBeenCalledWith(e);
  expect(screen.queryByText("Installed")).toBeNull();
  expect(screen.queryByText("Community")).toBeNull();
});

test("community badge and docs link render when applicable", () => {
  render(
    <McpCatalogGrid
      entries={[entry({ official: false, homepage: "https://docs.example" })]}
      installedNames={new Set()}
      onAdd={() => {}}
    />,
  );
  expect(screen.getByText("Community")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toBe(
    "https://docs.example",
  );
});

test("installed entries show a badge and Manage highlights the installed row temporarily", () => {
  const list = document.createElement("div");
  list.setAttribute("data-testid", "mcp-installed-list");
  const row = document.createElement("div");
  row.setAttribute("data-origin", "file");
  row.textContent = "GitHub server";
  const scrollIntoView = vi.fn();
  row.scrollIntoView = scrollIntoView;
  list.appendChild(row);
  document.body.appendChild(list);

  render(
    <McpCatalogGrid entries={[entry()]} installedNames={new Set(["github"])} onAdd={() => {}} />,
  );
  expect(screen.getByText("Installed")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Install" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Manage" }));
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  expect(row.classList.contains("bg-accent/10")).toBe(true);
  vi.advanceTimersByTime(1200);
  expect(row.classList.contains("bg-accent/10")).toBe(false);
});

test("Manage is a no-op when the installed row is not on the page", () => {
  render(
    <McpCatalogGrid entries={[entry()]} installedNames={new Set(["github"])} onAdd={() => {}} />,
  );
  expect(() => fireEvent.click(screen.getByRole("button", { name: "Manage" }))).not.toThrow();
});
