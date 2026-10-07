// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { ScopeProvider, useScope, useWorkspace, useWorkspaceSwitchGuard } from "./scope";
import { EXTRA_PROJECTS_KEY, LAST_WORKSPACE_KEY, encodeProjectId } from "./workspaceState";

const fetchProjects = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ fetchProjects }));

let dirty = false;
const isDirty = () => dirty;

function Probe() {
  const ws = useWorkspace();
  const scope = useScope();
  const location = useLocation();
  useWorkspaceSwitchGuard(isDirty);
  return (
    <div>
      <p data-testid="path">{location.pathname}</p>
      <p data-testid="kind">{ws.workspace.kind}</p>
      <p data-testid="dir">{ws.projectDir ?? "none"}</p>
      <p data-testid="extras">{ws.extras.join(",")}</p>
      <p data-testid="projects">{ws.projects.map((p) => `${p.name}:${p.exists}`).join(",")}</p>
      <p data-testid="available">{scope.availableScopes.join(",")}</p>
      <button onClick={() => ws.setWorkspace({ kind: "project", dir: "/p" })}>to-project</button>
      <button onClick={() => ws.setWorkspace({ kind: "user" })}>to-user</button>
      <button onClick={() => void ws.addProject("  /new/dir  ")}>add</button>
      <button onClick={() => void ws.addProject("   ")}>add-blank</button>
      <button onClick={() => ws.removeExtra("/p")}>remove</button>
      <button onClick={() => scope.setActiveScope("project")}>scope-project</button>
      <button onClick={() => scope.setActiveScope("user")}>scope-user</button>
    </div>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ScopeProvider>
        <Probe />
      </ScopeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  dirty = false;
  localStorage.clear();
  sessionStorage.clear();
  fetchProjects.mockReset();
  fetchProjects.mockResolvedValue({ projects: [] });
});
afterEach(() => {
  cleanup();
});

test("hooks throw outside the provider", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Bare() {
    useWorkspace();
    return null;
  }
  function BareScope() {
    useScope();
    return null;
  }
  expect(() => render(<Bare />)).toThrow("useWorkspace must be used within ScopeProvider");
  expect(() => render(<BareScope />)).toThrow("useScope must be used within ScopeProvider");
  vi.restoreAllMocks();
});

test("derives the workspace from a project URL and remembers it", async () => {
  renderAt(`/project/${encodeProjectId("/p")}/skills`);
  expect(screen.getByTestId("kind").textContent).toBe("project");
  expect(screen.getByTestId("dir").textContent).toBe("/p");
  await waitFor(() => expect(localStorage.getItem(LAST_WORKSPACE_KEY)).toContain("/p"));
});

test("falls back to the remembered workspace on unscoped paths", () => {
  localStorage.setItem(LAST_WORKSPACE_KEY, JSON.stringify({ kind: "project", dir: "/mem" }));
  renderAt("/usage");
  expect(screen.getByTestId("dir").textContent).toBe("/mem");
});

test("switching workspace navigates to the same section under the new base", async () => {
  renderAt("/user/skills/a");
  fireEvent.click(screen.getByText("to-project"));
  await waitFor(() =>
    expect(screen.getByTestId("path").textContent).toBe(
      `/project/${encodeProjectId("/p")}/skills/a`,
    ),
  );
  fireEvent.click(screen.getByText("to-project"));
  expect(screen.getByTestId("kind").textContent).toBe("project");
});

test("switching on a machine path does not navigate", async () => {
  renderAt("/usage");
  fireEvent.click(screen.getByText("to-project"));
  await waitFor(() => expect(screen.getByTestId("dir").textContent).toBe("/p"));
  expect(screen.getByTestId("path").textContent).toBe("/usage");
});

test("dirty guard shows the dialog; Stay cancels, Leave applies", async () => {
  dirty = true;
  renderAt("/user/skills/a");
  fireEvent.click(screen.getByText("to-project"));
  expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByTestId("kind").textContent).toBe("user");

  fireEvent.click(screen.getByText("to-project"));
  fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
  await waitFor(() => expect(screen.getByTestId("kind").textContent).toBe("project"));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("addProject trims, persists extras, refreshes and switches", async () => {
  renderAt("/user");
  fireEvent.click(screen.getByText("add"));
  await waitFor(() => expect(screen.getByTestId("dir").textContent).toBe("/new/dir"));
  expect(JSON.parse(localStorage.getItem(EXTRA_PROJECTS_KEY) ?? "[]")).toEqual(["/new/dir"]);
  expect(fetchProjects).toHaveBeenLastCalledWith(["/new/dir"]);
});

test("addProject ignores blank input", async () => {
  renderAt("/user");
  fireEvent.click(screen.getByText("add-blank"));
  await act(async () => {});
  expect(screen.getByTestId("extras").textContent).toBe("");
});

test("addProject does not duplicate an existing extra", async () => {
  localStorage.setItem(EXTRA_PROJECTS_KEY, JSON.stringify(["/new/dir"]));
  renderAt("/user");
  fireEvent.click(screen.getByText("add"));
  await waitFor(() => expect(screen.getByTestId("dir").textContent).toBe("/new/dir"));
  expect(screen.getByTestId("extras").textContent).toBe("/new/dir");
});

test("removeExtra drops it and returns to user when it was active", async () => {
  localStorage.setItem(EXTRA_PROJECTS_KEY, JSON.stringify(["/p", "/q"]));
  renderAt(`/project/${encodeProjectId("/p")}`);
  fireEvent.click(screen.getByText("remove"));
  await waitFor(() => expect(screen.getByTestId("extras").textContent).toBe("/q"));
  await waitFor(() => expect(screen.getByTestId("kind").textContent).toBe("user"));
});

test("removeExtra keeps the workspace when another project is active", async () => {
  localStorage.setItem(EXTRA_PROJECTS_KEY, JSON.stringify(["/p"]));
  renderAt("/user");
  fireEvent.click(screen.getByText("remove"));
  await waitFor(() => expect(screen.getByTestId("extras").textContent).toBe(""));
  expect(screen.getByTestId("kind").textContent).toBe("user");
});

test("fetch failure falls back to extras marked as missing", async () => {
  fetchProjects.mockRejectedValue(new Error("down"));
  localStorage.setItem(EXTRA_PROJECTS_KEY, JSON.stringify(["/x/proj"]));
  renderAt("/user");
  await waitFor(() => expect(screen.getByTestId("projects").textContent).toBe("proj:false"));
});

test("setActiveScope picks the first existing project, or the first when none exist", async () => {
  fetchProjects.mockResolvedValue({
    projects: [
      { dir: "/gone", name: "gone", exists: false },
      { dir: "/here", name: "here", exists: true },
    ],
  });
  renderAt("/user");
  await waitFor(() => expect(screen.getByTestId("available").textContent).toBe("user,project"));
  fireEvent.click(screen.getByText("scope-project"));
  await waitFor(() => expect(screen.getByTestId("dir").textContent).toBe("/here"));
  fireEvent.click(screen.getByText("scope-user"));
  await waitFor(() => expect(screen.getByTestId("kind").textContent).toBe("user"));
});

test("setActiveScope(project) with no projects is a no-op", async () => {
  renderAt("/user");
  expect(screen.getByTestId("available").textContent).toBe("user");
  fireEvent.click(screen.getByText("scope-project"));
  await act(async () => {});
  expect(screen.getByTestId("kind").textContent).toBe("user");
});

test("setActiveScope falls back to the first project when none exist on disk", async () => {
  fetchProjects.mockResolvedValue({ projects: [{ dir: "/gone", name: "gone", exists: false }] });
  renderAt("/user");
  await waitFor(() => expect(screen.getByTestId("available").textContent).toBe("user,project"));
  fireEvent.click(screen.getByText("scope-project"));
  await waitFor(() => expect(screen.getByTestId("dir").textContent).toBe("/gone"));
});
