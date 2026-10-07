// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { List } from "./List";

const api = vi.hoisted(() => ({ fetchTree: vi.fn(), fetchSettings: vi.fn() }));
const recent = vi.hoisted(() => ({ getRecent: vi.fn() }));
const workspace = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  ...api,
}));
vi.mock("../lib/recent", () => recent);
vi.mock("../lib/scope", () => ({ useWorkspace: () => workspace.current }));
vi.mock("../components/SetupStatus.js", () => ({ SetupStatus: () => <div>setup-status</div> }));

const tree = {
  categories: [
    { category: "skills", label: "Skills", files: [{ name: "colorize/SKILL.md" }] },
    {
      category: "commands",
      label: "Commands",
      files: [{ name: "deploy.md" }, { name: "ship.md" }],
    },
    { category: "settings", label: "Settings", files: [{ name: "settings.json" }] },
  ],
};

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

const renderList = () =>
  render(
    <MemoryRouter>
      <List />
      <Where />
    </MemoryRouter>,
  );

beforeEach(() => {
  api.fetchTree.mockReset().mockResolvedValue(tree);
  api.fetchSettings.mockReset().mockResolvedValue({ settings: {} });
  recent.getRecent.mockReset().mockReturnValue([]);
  workspace.current = { workspace: { kind: "user" }, activeScope: "user", projectDir: null };
});
afterEach(cleanup);

const loaded = () => screen.findByRole("searchbox");

test("renders the loading skeleton first", () => {
  renderList();
  expect(screen.getByLabelText("Loading your workspace").getAttribute("aria-busy")).toBe("true");
});

test("shows an error when loading fails", async () => {
  api.fetchTree.mockRejectedValue(new Error("x"));
  renderList();
  expect(await screen.findByText("Unable to load your workspace.")).toBeTruthy();
});

test("user workspace browse lists non-direct categories with counts and links", async () => {
  renderList();
  await loaded();
  expect(screen.getByText("Your user config")).toBeTruthy();
  expect(screen.getByText("setup-status")).toBeTruthy();
  const skills = screen.getByRole("link", { name: /Skills/ });
  expect(skills.textContent).toContain("1");
  expect(screen.getByRole("link", { name: /Commands/ }).textContent).toContain("2");
  expect(screen.queryByRole("link", { name: /^Settings/ })).toBeNull();
  expect(screen.queryByText("Recently viewed")).toBeNull();
  expect(api.fetchTree).toHaveBeenCalledWith("user", undefined);
});

test("project workspace uses project copy and passes projectDir", async () => {
  workspace.current = {
    workspace: { kind: "project", dir: "/work/app" },
    activeScope: "project",
    projectDir: "/work/app",
  };
  renderList();
  await loaded();
  expect(screen.getByText("This project")).toBeTruthy();
  expect(api.fetchTree).toHaveBeenCalledWith("project", "/work/app");
  expect(api.fetchSettings).toHaveBeenCalledWith("project", "/work/app");
});

test("recent items show leaf with a dim prefix when the label is a path", async () => {
  recent.getRecent.mockReturnValue([
    { href: "/skills/a", label: "group/leaf", categoryLabel: "Skills" },
    { href: "/commands/b", label: "plain", categoryLabel: "Commands" },
  ]);
  renderList();
  await loaded();
  expect(screen.getByText("Recently viewed")).toBeTruthy();
  expect(screen.getByText("leaf")).toBeTruthy();
  expect(screen.getByText("group/")).toBeTruthy();
  expect(screen.getByText("plain")).toBeTruthy();
});

test("typing searches, shows count, filters by scope and handles no matches", async () => {
  renderList();
  const box = await loaded();
  fireEvent.change(box, { target: { value: "deploy" } });
  expect(screen.getByText("1 match")).toBeTruthy();
  expect(screen.getByLabelText("Search results list")).toBeTruthy();
  expect(screen.queryByText("setup-status")).toBeNull();

  fireEvent.change(box, { target: { value: "md" } });
  expect(screen.getByText("3 matches")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Skills" }));
  expect(screen.getByText("1 match")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  expect(screen.getByText("3 matches")).toBeTruthy();

  fireEvent.change(box, { target: { value: "zzz" } });
  expect(screen.getByText("No matches")).toBeTruthy();
});

test("result detail is hidden when it equals the label", async () => {
  api.fetchTree.mockResolvedValue({
    categories: [{ category: "commands", label: "Commands", files: [{ name: "x" }] }],
  });
  renderList();
  fireEvent.change(await loaded(), { target: { value: "x" } });
  expect(screen.getAllByText("x")).toHaveLength(1);
});

test("long result lists are capped with a footer", async () => {
  api.fetchTree.mockResolvedValue({
    categories: [
      {
        category: "commands",
        label: "Commands",
        files: Array.from({ length: 45 }, (_, i) => ({ name: `c${i}.md` })),
      },
    ],
  });
  renderList();
  fireEvent.change(await loaded(), { target: { value: "c" } });
  expect(screen.getByText(/Showing first 40 of 45/)).toBeTruthy();
  expect(screen.getAllByRole("link")).toHaveLength(40);
});

test("Enter navigates to the first result; Enter with no results does nothing", async () => {
  renderList();
  const box = await loaded();
  fireEvent.change(box, { target: { value: "deploy" } });
  fireEvent.keyDown(box, { key: "Tab" });
  expect(screen.getByTestId("where").textContent).toBe("/");
  fireEvent.keyDown(box, { key: "Enter" });
  await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("deploy"));

  cleanup();
  renderList();
  const box2 = await loaded();
  fireEvent.change(box2, { target: { value: "zzz" } });
  fireEvent.keyDown(box2, { key: "Enter" });
  expect(screen.getByTestId("where").textContent).toBe("/");
});

test("Cmd/Ctrl+K and / focus search; / inside a field does not; other keys ignored", async () => {
  renderList();
  const box = await loaded();
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  expect(document.activeElement).toBe(box);

  box.blur();
  fireEvent.keyDown(window, { key: "K", ctrlKey: true });
  expect(document.activeElement).toBe(box);

  box.blur();
  fireEvent.keyDown(window, { key: "/" });
  expect(document.activeElement).toBe(box);

  box.blur();
  fireEvent.keyDown(window, { key: "a" });
  expect(document.activeElement).not.toBe(box);

  fireEvent.keyDown(window, { key: "/", metaKey: true });
  expect(document.activeElement).not.toBe(box);

  const other = document.createElement("input");
  document.body.appendChild(other);
  other.focus();
  fireEvent.keyDown(other, { key: "/" });
  expect(document.activeElement).toBe(other);
  other.remove();
});
