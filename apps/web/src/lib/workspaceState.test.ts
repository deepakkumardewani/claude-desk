// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import {
  EXTRA_PROJECTS_KEY,
  LAST_ROUTE_KEY,
  LAST_WORKSPACE_KEY,
  decodeProjectId,
  dirBasename,
  encodeProjectId,
  firstSection,
  isFileExplorerPath,
  isMachineSection,
  loadJsonArray,
  loadLastRoute,
  loadRememberedWorkspace,
  mcpVisibleInWorkspace,
  parseScopedPath,
  pathForWorkspace,
  saveJsonArray,
  saveLastRoute,
  saveRememberedWorkspace,
  shortenPath,
  workspaceBasePath,
  workspacesEqual,
} from "./workspaceState";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test("project ids round-trip including unicode and url-unsafe characters", () => {
  for (const dir of ["/a/b", "/home/ü/проект", "/x?y>z~"]) {
    const id = encodeProjectId(dir);
    expect(id).not.toMatch(/[+/=]/u);
    expect(decodeProjectId(id)).toBe(dir);
  }
});

test("decodeProjectId returns empty string for invalid input", () => {
  expect(decodeProjectId("***")).toBe("");
});

test("isMachineSection recognises only machine sections", () => {
  expect(isMachineSection("usage")).toBe(true);
  expect(isMachineSection("skills")).toBe(false);
});

test("workspaceBasePath and pathForWorkspace", () => {
  expect(workspaceBasePath({ kind: "user" })).toBe("/user");
  const project = { kind: "project", dir: "/p" } as const;
  expect(workspaceBasePath(project)).toBe(`/project/${encodeProjectId("/p")}`);
  expect(pathForWorkspace({ kind: "user" }, "")).toBe("/user");
  expect(pathForWorkspace({ kind: "user" }, "skills/a")).toBe("/user/skills/a");
});

test("dirBasename and shortenPath", () => {
  expect(dirBasename("/a/b/")).toBe("b");
  expect(dirBasename("solo")).toBe("solo");
  expect(shortenPath("/a/b")).toBe("/a/b");
  expect(shortenPath("/a/b/c/d")).toBe("…/c/d");
});

test("parseScopedPath handles user, project and unscoped paths", () => {
  expect(parseScopedPath("/user")).toEqual({ workspace: { kind: "user" }, sectionPath: "" });
  expect(parseScopedPath("/user/skills/x")).toEqual({
    workspace: { kind: "user" },
    sectionPath: "skills/x",
  });
  const id = encodeProjectId("/p");
  expect(parseScopedPath(`/project/${id}`)).toEqual({
    workspace: { kind: "project", dir: "/p" },
    sectionPath: "",
  });
  expect(parseScopedPath(`/project/${id}/mcp`).sectionPath).toBe("mcp");
  expect(parseScopedPath("/usage")).toEqual({ workspace: null, sectionPath: "usage" });
});

test("firstSection returns the leading segment", () => {
  expect(firstSection("a/b")).toBe("a");
  expect(firstSection("")).toBe("");
});

test("isFileExplorerPath is false for full-width and machine sections", () => {
  expect(isFileExplorerPath("/user/skills/a")).toBe(true);
  expect(isFileExplorerPath("/user/settings")).toBe(false);
  expect(isFileExplorerPath("/user")).toBe(false);
  expect(isFileExplorerPath("/usage")).toBe(false);
  expect(isFileExplorerPath("/skills")).toBe(true);
});

test("loadJsonArray tolerates missing, malformed and non-array values", () => {
  expect(loadJsonArray("k")).toEqual([]);
  localStorage.setItem("k", "{bad");
  expect(loadJsonArray("k")).toEqual([]);
  localStorage.setItem("k", '{"a":1}');
  expect(loadJsonArray("k")).toEqual([]);
  localStorage.setItem("k", '["a",1,"b"]');
  expect(loadJsonArray("k")).toEqual(["a", "b"]);
});

test("saveJsonArray persists", () => {
  saveJsonArray(EXTRA_PROJECTS_KEY, ["/a"]);
  expect(loadJsonArray(EXTRA_PROJECTS_KEY)).toEqual(["/a"]);
});

test("last route prefers sessionStorage then localStorage", () => {
  expect(loadLastRoute()).toBeNull();
  localStorage.setItem(LAST_ROUTE_KEY, "/local");
  expect(loadLastRoute()).toBe("/local");
  saveLastRoute("/both");
  sessionStorage.setItem(LAST_ROUTE_KEY, "/session");
  expect(loadLastRoute()).toBe("/session");
});

test("remembered workspace round-trips and rejects bad payloads", () => {
  expect(loadRememberedWorkspace()).toBeNull();
  saveRememberedWorkspace({ kind: "project", dir: "/p" });
  expect(loadRememberedWorkspace()).toEqual({ kind: "project", dir: "/p" });
  saveRememberedWorkspace({ kind: "user" });
  expect(loadRememberedWorkspace()).toEqual({ kind: "user" });

  for (const raw of [
    '{"kind":"project"}',
    '{"kind":"project","dir":3}',
    '{"kind":"x"}',
    "7",
    "{bad",
  ]) {
    sessionStorage.setItem(LAST_WORKSPACE_KEY, raw);
    expect(loadRememberedWorkspace()).toBeNull();
  }
});

test("falls back to localStorage for the remembered workspace", () => {
  localStorage.setItem(LAST_WORKSPACE_KEY, '{"kind":"user"}');
  expect(loadRememberedWorkspace()).toEqual({ kind: "user" });
});

test("mcpVisibleInWorkspace maps scopes to workspaces", () => {
  expect(mcpVisibleInWorkspace("user", { kind: "user" })).toBe(true);
  expect(mcpVisibleInWorkspace("project", { kind: "user" })).toBe(false);
  const project = { kind: "project", dir: "/p" } as const;
  expect(mcpVisibleInWorkspace("project", project)).toBe(true);
  expect(mcpVisibleInWorkspace("local", project)).toBe(true);
  expect(mcpVisibleInWorkspace("user", project)).toBe(false);
});

test("workspacesEqual compares kind and dir", () => {
  const a = { kind: "project", dir: "/a" } as const;
  expect(workspacesEqual({ kind: "user" }, { kind: "user" })).toBe(true);
  expect(workspacesEqual({ kind: "user" }, a)).toBe(false);
  expect(workspacesEqual(a, { kind: "project", dir: "/a" })).toBe(true);
  expect(workspacesEqual(a, { kind: "project", dir: "/b" })).toBe(false);
});
