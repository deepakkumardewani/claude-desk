// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import type { ProjectListItem, Workspace } from "../lib/workspaceState";
import { ScopeSwitcher } from "./ScopeSwitcher";

const ctx = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock("../lib/scope", () => ({ useWorkspace: () => ctx.value }));

const setWorkspace = vi.fn();
const addProject = vi.fn();
const removeExtra = vi.fn();

function setup(
  options: { workspace?: Workspace; projects?: ProjectListItem[]; extras?: string[] } = {},
) {
  ctx.value = {
    workspace: options.workspace ?? { kind: "user" },
    projects: options.projects ?? [],
    extras: options.extras ?? [],
    setWorkspace,
    addProject,
    removeExtra,
  };
  return render(<ScopeSwitcher />);
}

const trigger = () => screen.getByRole("button", { expanded: false });

beforeEach(() => {
  setWorkspace.mockReset();
  addProject.mockReset().mockResolvedValue(undefined);
  removeExtra.mockReset();
});
afterEach(cleanup);

test("trigger shows user badge and label", () => {
  setup();
  expect(screen.getByText("User")).toBeTruthy();
  expect(screen.getByText("~/.claude")).toBeTruthy();
});

test("trigger shows project name and shortened path", () => {
  setup({ workspace: { kind: "project", dir: "/a/b/c/app" } });
  expect(screen.getByText("Project")).toBeTruthy();
  expect(screen.getByText("app")).toBeTruthy();
  expect(screen.getByText("…/c/app")).toBeTruthy();
});

test("empty projects state and selecting User", () => {
  setup({ workspace: { kind: "project", dir: "/p" } });
  fireEvent.click(trigger());
  expect(screen.getByText("No projects yet")).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: /User/u }));
  expect(setWorkspace).toHaveBeenCalledWith({ kind: "user" });
  expect(screen.queryByRole("menu")).toBeNull();
});

test("projects are sorted existing-first then by name; missing ones are not selectable", () => {
  setup({
    projects: [
      { dir: "/z/zeta", name: "zeta", exists: true },
      { dir: "/a/gone", name: "gone", exists: false },
      { dir: "/a/alpha", name: "alpha", exists: true },
    ],
  });
  fireEvent.click(trigger());
  const names = screen
    .getAllByRole("menuitem")
    .slice(1)
    .map((el) => el.textContent ?? "");
  expect(names[0]).toContain("alpha");
  expect(names[1]).toContain("zeta");
  expect(names[2]).toContain("gone");
  expect(names[2]).toContain("Missing");
  expect((screen.getByRole("menuitem", { name: /gone/u }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

test("selecting a project switches workspace and closes the menu", () => {
  setup({ projects: [{ dir: "/a/alpha", name: "alpha", exists: true }] });
  fireEvent.click(trigger());
  fireEvent.click(screen.getByRole("menuitem", { name: /alpha/u }));
  expect(setWorkspace).toHaveBeenCalledWith({ kind: "project", dir: "/a/alpha" });
  expect(screen.queryByRole("menu")).toBeNull();
});

test("filter input appears for more than six projects and narrows the list", () => {
  const projects = Array.from({ length: 7 }, (_, i) => ({
    dir: `/w/proj${i}`,
    name: `proj${i}`,
    exists: true,
  }));
  setup({ projects });
  fireEvent.click(trigger());
  const filter = screen.getByPlaceholderText("Filter by name or path");
  fireEvent.change(filter, { target: { value: "PROJ3" } });
  expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  fireEvent.change(filter, { target: { value: "nomatch" } });
  expect(screen.getByText("No matching projects")).toBeTruthy();
});

test("filter input is hidden for six or fewer projects", () => {
  setup({ projects: [{ dir: "/a/x", name: "x", exists: true }] });
  fireEvent.click(trigger());
  expect(screen.queryByPlaceholderText("Filter by name or path")).toBeNull();
});

test("remove button only shows for extra projects and calls removeExtra", () => {
  setup({
    projects: [
      { dir: "/a/x", name: "x", exists: true },
      { dir: "/a/y", name: "y", exists: true },
    ],
    extras: ["/a/y"],
  });
  fireEvent.click(trigger());
  expect(screen.queryByRole("button", { name: "Remove x" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove y" }));
  expect(removeExtra).toHaveBeenCalledWith("/a/y");
});

test("adding a project trims input, calls addProject and closes", async () => {
  setup();
  fireEvent.click(trigger());
  const input = screen.getByPlaceholderText("Absolute project path");
  fireEvent.change(input, { target: { value: "  /new  " } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(addProject).toHaveBeenCalledWith("/new"));
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
});

test("blank path does not call addProject", () => {
  setup();
  fireEvent.click(trigger());
  fireEvent.change(screen.getByPlaceholderText("Absolute project path"), {
    target: { value: "   " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(addProject).not.toHaveBeenCalled();
  expect(screen.getByRole("menu")).toBeTruthy();
});

test("Escape and outside click close the menu; inside click does not", () => {
  setup();
  fireEvent.click(trigger());
  fireEvent.mouseDown(screen.getByRole("menu"));
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.keyDown(document, { key: "a" });
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();

  fireEvent.click(trigger());
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole("menu")).toBeNull();
});
