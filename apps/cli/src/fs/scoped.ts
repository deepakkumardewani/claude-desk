import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { Scope } from "schema";

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

function getRoot(scope: Scope = "user"): string {
  if (scope === "user") {
    return resolve(process.env.CLAUDE_ROOT ?? join(homedir(), ".claude"));
  } else {
    // project scope: .claude in current working directory
    return resolve(process.cwd(), ".claude");
  }
}

function getCategories(root: string): Record<Category, string> {
  return {
    skills: resolve(root, "skills"),
    plans: resolve(root, "plans"),
    commands: resolve(root, "commands"),
    claudeMd: resolve(root, "CLAUDE.md"),
    settings: resolve(root, "settings.json"),
    agents: resolve(root, "agents"),
    plugins: resolve(root, "plugins"),
  };
}

/**
 * Check if a project scope exists by verifying .claude directory exists.
 */
export async function projectScopeExists(): Promise<boolean> {
  try {
    const projectRoot = resolve(process.cwd(), ".claude");
    await stat(projectRoot);
    return true;
  } catch {
    return false;
  }
}

export function isCategory(value: string): value is Category {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}

/**
 * Resolve a request to an absolute path, or throw if it escapes the scope root.
 * Supports both user and project scopes.
 */
export function safePath(category: Category, relative = "", scope: Scope = "user"): string {
  const root = getRoot(scope);
  const categories = getCategories(root);
  const base = categories[category];

  const target = resolve(base, relative);
  const rootWithSep = root + sep;

  if (target !== root && !target.startsWith(rootWithSep)) {
    throw new Error("path escapes claude root");
  }

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

export async function listCategory(category: Category, scope: Scope = "user"): Promise<string[]> {
  if (category === "claudeMd") {
    try {
      await stat(safePath(category, "", scope));
      return ["CLAUDE.md"];
    } catch {
      return [];
    }
  }

  if (category === "settings") {
    try {
      await stat(safePath(category, "", scope));
      return ["settings.json"];
    } catch {
      return [];
    }
  }

  if (category === "plugins") {
    return walkAllFiles(safePath(category, "", scope));
  }

  return walkMarkdownFiles(safePath(category, "", scope));
}

export async function readFileText(
  category: Category,
  relative: string,
  scope: Scope = "user",
): Promise<string> {
  const path = safePath(category, relative, scope);
  return readFile(path, "utf8");
}

export async function writeFileText(
  category: Category,
  relative: string,
  content: string,
  scope: Scope = "user",
): Promise<void> {
  const path = safePath(category, relative, scope);
  const dir = path.substring(0, path.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function listAllCategories(
  scope: Scope = "user",
): Promise<Array<{ category: Category; label: string; files: string[] }>> {
  const results = await Promise.all(
    CATEGORY_META.map(async ({ id, label }) => ({
      category: id,
      label,
      files: await listCategory(id, scope),
    })),
  );
  return results;
}
