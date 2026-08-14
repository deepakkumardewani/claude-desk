export const USER_ROUTE_PREFIX = "/user";
export const PROJECT_ROUTE_PREFIX = "/project";

export const LAST_ROUTE_KEY = "claude-desk-last-route";
export const EXTRA_PROJECTS_KEY = "claude-desk-extra-projects";
export const LAST_WORKSPACE_KEY = "claude-desk-last-workspace";

export const MACHINE_SECTIONS = ["usage", "backups", "workspace"] as const;
export type MachineSection = (typeof MACHINE_SECTIONS)[number];

export const SETTINGS_LAYER_PROJECT = "project";
export const SETTINGS_LAYER_LOCAL = "projectLocal";

export type Workspace = { kind: "user" } | { kind: "project"; dir: string };

export type ProjectListItem = {
  dir: string;
  name: string;
  exists: boolean;
};

export type McpConfigScope = "user" | "project" | "local";

const MACHINE_SECTION_SET = new Set<string>(MACHINE_SECTIONS);

const FULL_WIDTH_SECTIONS = new Set([
  "",
  "backups",
  "mcp",
  "settings",
  "usage",
  "claude-md",
  "workspace",
]);

export function encodeProjectId(dir: string): string {
  const bytes = new TextEncoder().encode(dir);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function decodeProjectId(id: string): string {
  const padded = id.replaceAll("-", "+").replaceAll("_", "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  try {
    const binary = atob(`${padded}${pad}`);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export function isMachineSection(segment: string): segment is MachineSection {
  return MACHINE_SECTION_SET.has(segment);
}

export function workspaceBasePath(workspace: Workspace): string {
  if (workspace.kind === "user") {
    return USER_ROUTE_PREFIX;
  }
  return `${PROJECT_ROUTE_PREFIX}/${encodeProjectId(workspace.dir)}`;
}

export function dirBasename(dir: string): string {
  const trimmed = dir.replace(/\/+$/u, "");
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

export function shortenPath(dir: string): string {
  const parts = dir.split("/").filter(Boolean);
  if (parts.length <= 2) {
    return dir;
  }
  return `…/${parts.slice(-2).join("/")}`;
}

export function parseScopedPath(pathname: string): {
  workspace: Workspace | null;
  sectionPath: string;
} {
  if (pathname === USER_ROUTE_PREFIX || pathname.startsWith(`${USER_ROUTE_PREFIX}/`)) {
    return {
      workspace: { kind: "user" },
      sectionPath: pathname.slice(USER_ROUTE_PREFIX.length).replace(/^\//u, ""),
    };
  }

  if (pathname.startsWith(`${PROJECT_ROUTE_PREFIX}/`)) {
    const rest = pathname.slice(`${PROJECT_ROUTE_PREFIX}/`.length);
    const slash = rest.indexOf("/");
    const projectId = slash === -1 ? rest : rest.slice(0, slash);
    const sectionPath = slash === -1 ? "" : rest.slice(slash + 1);
    try {
      return {
        workspace: { kind: "project", dir: decodeProjectId(projectId) },
        sectionPath,
      };
    } catch {
      return { workspace: null, sectionPath: "" };
    }
  }

  return { workspace: null, sectionPath: pathname.replace(/^\//u, "") };
}

export function firstSection(sectionPath: string): string {
  const [head = ""] = sectionPath.split("/");
  return head;
}

export function isFileExplorerPath(pathname: string): boolean {
  const { workspace, sectionPath } = parseScopedPath(pathname);
  if (workspace === null && isMachineSection(firstSection(sectionPath))) {
    return false;
  }
  return !FULL_WIDTH_SECTIONS.has(firstSection(sectionPath));
}

export function pathForWorkspace(workspace: Workspace, sectionPath: string): string {
  const base = workspaceBasePath(workspace);
  return sectionPath ? `${base}/${sectionPath}` : base;
}

export function loadJsonArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function saveJsonArray(key: string, values: string[]): void {
  localStorage.setItem(key, JSON.stringify(values));
}

export function loadLastRoute(): string | null {
  return sessionStorage.getItem(LAST_ROUTE_KEY) ?? localStorage.getItem(LAST_ROUTE_KEY);
}

export function saveLastRoute(pathname: string): void {
  sessionStorage.setItem(LAST_ROUTE_KEY, pathname);
  localStorage.setItem(LAST_ROUTE_KEY, pathname);
}

export function loadRememberedWorkspace(): Workspace | null {
  try {
    const raw =
      sessionStorage.getItem(LAST_WORKSPACE_KEY) ?? localStorage.getItem(LAST_WORKSPACE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "kind" in parsed) {
      const kind = (parsed as { kind: string }).kind;
      if (kind === "user") {
        return { kind: "user" };
      }
      if (
        kind === "project" &&
        "dir" in parsed &&
        typeof (parsed as { dir: unknown }).dir === "string"
      ) {
        return { kind: "project", dir: (parsed as { dir: string }).dir };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveRememberedWorkspace(workspace: Workspace): void {
  const raw = JSON.stringify(workspace);
  sessionStorage.setItem(LAST_WORKSPACE_KEY, raw);
  localStorage.setItem(LAST_WORKSPACE_KEY, raw);
}

export function mcpVisibleInWorkspace(serverScope: string, workspace: Workspace): boolean {
  if (workspace.kind === "user") {
    return serverScope === "user";
  }
  return serverScope === "project" || serverScope === "local";
}

export function workspacesEqual(a: Workspace, b: Workspace): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "user" || b.kind === "user") {
    return true;
  }
  return a.dir === b.dir;
}
