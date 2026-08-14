import type { ClaudeSettings } from "schema";
import { fileHref, type ApiCategory, type TreeCategory } from "./api";

export const CATEGORY_LABELS: Record<ApiCategory, string> = {
  skills: "Skills",
  plans: "Plans",
  commands: "Commands",
  claudeMd: "CLAUDE.md",
  settings: "Settings",
  agents: "Agents",
  plugins: "Plugins",
};

export type WorkspaceFile = {
  category: ApiCategory;
  categoryLabel: string;
  name: string;
  label: string;
  detail: string;
  href: string;
};

/** Turn a stored path into a human label: "colorize/SKILL.md" -> "colorize". */
export function deriveFileLabel(name: string): string {
  if (name.endsWith("/SKILL.md")) {
    return name.slice(0, -"/SKILL.md".length);
  }
  const base = name.includes("/") ? name.slice(name.lastIndexOf("/") + 1) : name;
  return base.replace(/\.(md|json)$/i, "");
}

/** Convert a filename to a human-readable title: "build-phases.md" -> "Build Phases". */
export function deriveTitleFromFilename(name: string): string {
  const label = deriveFileLabel(name);
  return label
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Categories that link straight to a dedicated page instead of a file list. */
export function isDirectCategory(category: ApiCategory): boolean {
  return category === "settings" || category === "claudeMd";
}

/** True when the path is a skill entrypoint (not a companion reference/eval file). */
export function isSkillEntrypoint(name: string): boolean {
  return name === "SKILL.md" || name.endsWith("/SKILL.md");
}

/**
 * Count of meaningful items in a category — not raw file counts.
 * Skills: SKILL.md entrypoints. Plugins: configured plugins in settings.
 */
export function categoryItemCount(category: TreeCategory, settings?: ClaudeSettings): number {
  if (category.category === "plugins") {
    return Object.keys(settings?.enabledPlugins ?? {}).length;
  }
  if (category.category === "skills") {
    return category.files.filter((file) => isSkillEntrypoint(file.name)).length;
  }
  return category.files.length;
}

/** Categories authored by the user — plugin marketplace caches are infrastructure, not content. */
const AUTHORED_CATEGORIES: ApiCategory[] = ["skills", "commands", "plans", "agents"];

/** Human summary of authored content, e.g. "94 skills, 9 commands and 6 plans". */
export function describeWorkspace(categories: TreeCategory[], settings?: ClaudeSettings): string {
  const parts = AUTHORED_CATEGORIES.flatMap((id) => {
    const category = categories.find((entry) => entry.category === id);
    if (!category) {
      return [];
    }
    const count = categoryItemCount(category, settings);
    return count > 0 ? [`${count.toLocaleString()} ${category.label.toLowerCase()}`] : [];
  });
  if (parts.length === 0) {
    return "Your skills, commands and plans";
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Configured plugins as browseable rows (marketplace cache files are not plugins). */
export function pluginEntriesFromSettings(settings: ClaudeSettings): WorkspaceFile[] {
  const enabledPlugins = settings.enabledPlugins ?? {};
  return Object.keys(enabledPlugins)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const at = key.indexOf("@");
      const name = at === -1 ? key : key.slice(0, at);
      const marketplace = at === -1 ? "" : key.slice(at + 1);
      const enabled = enabledPlugins[key] !== false;
      return {
        category: "plugins" as const,
        categoryLabel: "Plugins",
        name: key,
        label: name,
        detail: marketplace ? `${marketplace}${enabled ? "" : " · off"}` : enabled ? "" : "off",
        href: "/settings",
      };
    });
}

/**
 * Files to show when browsing a category with an empty query.
 * Skills list entrypoints only; plugins use settings, not the cache tree.
 */
export function browseCategoryFiles(
  files: WorkspaceFile[],
  scope: ApiCategory,
  settings: ClaudeSettings,
): WorkspaceFile[] {
  if (scope === "plugins") {
    return pluginEntriesFromSettings(settings);
  }
  const scoped = files.filter((file) => file.category === scope);
  if (scope === "skills") {
    return scoped.filter((file) => isSkillEntrypoint(file.name));
  }
  return scoped;
}

/** Split a path-like label into a dim prefix and its meaningful leaf: "marketplaces/x/skills/foo" -> { prefix: "marketplaces/x/skills/", leaf: "foo" }. */
export function splitPathLabel(label: string): { prefix: string; leaf: string } {
  const lastSlash = label.lastIndexOf("/");
  if (lastSlash === -1) {
    return { prefix: "", leaf: label };
  }
  return { prefix: label.slice(0, lastSlash + 1), leaf: label.slice(lastSlash + 1) };
}

export function flattenFiles(categories: TreeCategory[]): WorkspaceFile[] {
  return categories.flatMap((category) =>
    category.files.map((file) => ({
      category: category.category,
      categoryLabel: category.label,
      name: file.name,
      label: deriveFileLabel(file.name),
      detail: file.name,
      href: fileHref(category.category, file.name),
    })),
  );
}

export function searchFiles(
  files: WorkspaceFile[],
  query: string,
  scope: ApiCategory | null,
): WorkspaceFile[] {
  const normalized = query.trim().toLowerCase();
  const scoped = scope ? files.filter((file) => file.category === scope) : files;
  if (!normalized) {
    return scoped;
  }
  return scoped.filter(
    (file) =>
      file.label.toLowerCase().includes(normalized) ||
      file.detail.toLowerCase().includes(normalized) ||
      file.categoryLabel.toLowerCase().includes(normalized),
  );
}
