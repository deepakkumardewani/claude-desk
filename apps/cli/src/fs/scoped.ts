import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { Scope, SettingsLayer } from "schema";

export const CATEGORY_IDS = [
  "skills",
  "plans",
  "commands",
  "claudeMd",
  "settings",
  "agents",
  "plugins",
] as const;

export type Category = (typeof CATEGORY_IDS)[number];

export type CategoryMeta = {
  id: Category;
  label: string;
  routeSegment: string;
};

export const CATEGORY_META: CategoryMeta[] = [
  { id: "skills", label: "Skills", routeSegment: "skills" },
  { id: "plans", label: "Plans", routeSegment: "plans" },
  { id: "commands", label: "Commands", routeSegment: "commands" },
  { id: "claudeMd", label: "CLAUDE.md", routeSegment: "claude-md" },
  { id: "settings", label: "Settings", routeSegment: "settings" },
  { id: "agents", label: "Agents", routeSegment: "agents" },
  { id: "plugins", label: "Plugins", routeSegment: "plugins" },
];

const SETTINGS_LOCAL_FILE = "settings.local.json";
const SETTINGS_FILE = "settings.json";

export class InvalidProjectDirError extends Error {
  constructor(message = "projectDir is required and must be an absolute path") {
    super(message);
    this.name = "InvalidProjectDirError";
  }
}

export function userClaudeRoot(): string {
  return resolve(process.env.CLAUDE_ROOT ?? join(homedir(), ".claude"));
}

export function requireAbsoluteProjectDir(projectDir?: string): string {
  if (!projectDir || !isAbsolute(projectDir)) {
    throw new InvalidProjectDirError();
  }
  if (projectDir.split(/[/\\]/).includes("..")) {
    throw new InvalidProjectDirError("projectDir must not contain path traversal");
  }
  return resolve(projectDir);
}

export type ResolvedRoots = {
  userRoot: string;
  projectDir?: string;
  claudeRoot: string;
};

export function resolveRoots(input: {
  scope: Scope | "projectLocal";
  projectDir?: string;
}): ResolvedRoots {
  const userRoot = userClaudeRoot();
  if (input.scope === "user") {
    return { userRoot, claudeRoot: userRoot };
  }
  const projectDir = requireAbsoluteProjectDir(input.projectDir);
  return { userRoot, projectDir, claudeRoot: join(projectDir, ".claude") };
}

function getCategories(root: string): Record<Category, string> {
  return {
    skills: resolve(root, "skills"),
    plans: resolve(root, "plans"),
    commands: resolve(root, "commands"),
    claudeMd: resolve(root, "CLAUDE.md"),
    settings: resolve(root, SETTINGS_FILE),
    agents: resolve(root, "agents"),
    plugins: resolve(root, "plugins"),
  };
}

function categoryBase(category: Category, scope: Scope, projectDir?: string): string {
  if (scope === "user") {
    return getCategories(userClaudeRoot())[category];
  }
  const dir = requireAbsoluteProjectDir(projectDir);
  if (category === "claudeMd") {
    return join(dir, "CLAUDE.md");
  }
  return getCategories(join(dir, ".claude"))[category];
}

function assertInside(root: string, target: string): void {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + sep)) {
    throw new Error("path escapes claude root");
  }
}

/**
 * Resolve a request to an absolute path, or throw if it escapes the scope root.
 */
export function safePath(
  category: Category,
  relative = "",
  scope: Scope = "user",
  projectDir?: string,
): string {
  const base = categoryBase(category, scope, projectDir);
  const containment = scope === "user" ? userClaudeRoot() : requireAbsoluteProjectDir(projectDir);
  const target = resolve(base, relative);
  assertInside(containment, target);

  const isFileCategory = category === "claudeMd" || category === "settings";
  if (isFileCategory) {
    if (relative !== "" && target !== base) {
      throw new Error("path escapes category root");
    }
    return base;
  }

  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error("path escapes category root");
  }

  return target;
}

export function settingsFilePath(layer: SettingsLayer, projectDir?: string): string {
  if (layer === "user") {
    return safePath("settings", "", "user");
  }
  const project = requireAbsoluteProjectDir(projectDir);
  const fileName = layer === "projectLocal" ? SETTINGS_LOCAL_FILE : SETTINGS_FILE;
  const target = resolve(join(project, ".claude", fileName));
  assertInside(project, target);
  return target;
}

/** True when projectDir is an existing directory (`.claude` is not required). */
export async function projectScopeExists(projectDir?: string): Promise<boolean> {
  if (!projectDir) return false;
  try {
    await stat(requireAbsoluteProjectDir(projectDir));
    return true;
  } catch (error) {
    if (error instanceof InvalidProjectDirError) throw error;
    return false;
  }
}

export function isCategory(value: string): value is Category {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}

async function walkMarkdownFiles(dir: string, prefix = ""): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? join(prefix, entry) : entry;
    const absolutePath = join(dir, entry);
    const entryStat = await stat(absolutePath);
    if (entryStat.isDirectory()) {
      files.push(...(await walkMarkdownFiles(absolutePath, relativePath)));
      continue;
    }
    if (entry.endsWith(".md") || entry.endsWith(".json")) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function walkAllFiles(dir: string, prefix = ""): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? join(prefix, entry) : entry;
    const absolutePath = join(dir, entry);
    const entryStat = await stat(absolutePath);
    if (entryStat.isDirectory()) {
      files.push(...(await walkAllFiles(absolutePath, relativePath)));
      continue;
    }
    files.push(relativePath);
  }
  return files.sort();
}

export async function listCategory(
  category: Category,
  scope: Scope = "user",
  projectDir?: string,
): Promise<string[]> {
  if (category === "claudeMd") {
    try {
      await stat(safePath(category, "", scope, projectDir));
      return ["CLAUDE.md"];
    } catch {
      return [];
    }
  }

  if (category === "settings") {
    try {
      await stat(safePath(category, "", scope, projectDir));
      return [SETTINGS_FILE];
    } catch {
      return [];
    }
  }

  if (category === "plugins") {
    return walkAllFiles(safePath(category, "", scope, projectDir));
  }

  return walkMarkdownFiles(safePath(category, "", scope, projectDir));
}

export async function readFileText(
  category: Category,
  relative: string,
  scope: Scope = "user",
  projectDir?: string,
): Promise<string> {
  const path = safePath(category, relative, scope, projectDir);
  return readFile(path, "utf8");
}

export async function writeFileText(
  category: Category,
  relative: string,
  content: string,
  scope: Scope = "user",
  projectDir?: string,
): Promise<void> {
  const path = safePath(category, relative, scope, projectDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function listAllCategories(
  scope: Scope = "user",
  projectDir?: string,
): Promise<Array<{ category: Category; label: string; files: string[] }>> {
  const results = await Promise.all(
    CATEGORY_META.map(async ({ id, label }) => ({
      category: id,
      label,
      files: await listCategory(id, scope, projectDir),
    })),
  );
  return results;
}
