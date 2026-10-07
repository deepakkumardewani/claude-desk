import type { DiscoveredItem, ItemKind } from "schema";

/** One logical item; `variants` are its copies under different source roots (.claude/, .agents/, …). */
export type ItemGroup = {
  key: string;
  kind: ItemKind;
  name: string;
  variants: DiscoveredItem[];
};

export const ROOT_SOURCE = "root";

/** Earlier entries win; roots not listed rank after all of these. */
export const SOURCE_PRIORITY = [".claude", ROOT_SOURCE, ".agents", ".codex", ".cursor"];

/** Only these kinds are copied verbatim into several tool folders; hooks/mcp/settings are not. */
const GROUPABLE_KINDS: ReadonlySet<ItemKind> = new Set(["skill", "agent", "command"]);

const SOURCE_ROOT_PATTERN = /^(\.[^/]+)\//;

export function pluginChildren(item: DiscoveredItem): DiscoveredItem[] {
  if (item.kind !== "plugin") return [];
  const children = (item.payload as { children?: unknown } | undefined)?.children;
  return Array.isArray(children) ? (children as DiscoveredItem[]) : [];
}

/** Marketplace plugins own their children; those must never be listed a second time. */
export function topLevelItems(items: DiscoveredItem[]): DiscoveredItem[] {
  const nestedIds = new Set(items.flatMap((item) => pluginChildren(item).map((c) => c.id)));
  return items.filter((item) => !nestedIds.has(item.id));
}

/** The leading dot-folder of a repo path (`.claude/skills/x` → `.claude`), else "root". */
export function sourceRoot(path: string): string {
  return SOURCE_ROOT_PATTERN.exec(path)?.[1] ?? ROOT_SOURCE;
}

function stripSourceRoot(path: string): string {
  return path.replace(SOURCE_ROOT_PATTERN, "");
}

function priorityRank(item: DiscoveredItem): number {
  const index = SOURCE_PRIORITY.indexOf(sourceRoot(item.path));
  return index === -1 ? SOURCE_PRIORITY.length : index;
}

function standaloneGroup(item: DiscoveredItem): ItemGroup {
  return {
    key: `${item.kind}:${item.name}:${item.path}`,
    kind: item.kind,
    name: item.name,
    variants: [item],
  };
}

/**
 * Merges copies of the same skill/agent/command found under different source roots.
 * A second copy under an already-seen root is a genuinely different item, so it stays separate.
 */
export function groupVariants(items: DiscoveredItem[]): ItemGroup[] {
  const groups: ItemGroup[] = [];
  const byKey = new Map<string, ItemGroup>();
  for (const item of items) {
    if (!GROUPABLE_KINDS.has(item.kind)) {
      groups.push(standaloneGroup(item));
      continue;
    }
    const key = `${item.kind}:${item.name}`;
    const existing = byKey.get(key);
    const root = sourceRoot(item.path);
    if (existing && !existing.variants.some((v) => sourceRoot(v.path) === root)) {
      existing.variants.push(item);
      continue;
    }
    if (existing) {
      groups.push(standaloneGroup(item));
      continue;
    }
    const group: ItemGroup = { key, kind: item.kind, name: item.name, variants: [item] };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

export function preferredVariant(group: ItemGroup): DiscoveredItem {
  return group.variants.reduce((best, v) => (priorityRank(v) < priorityRank(best) ? v : best));
}

function fingerprint(item: DiscoveredItem): string[] {
  return item.files.map((file) => `${stripSourceRoot(file.path)}:${file.blobSha}`).sort();
}

/** Same files with the same content, ignoring which source root they live under. */
export function variantsIdentical(a: DiscoveredItem, b: DiscoveredItem): boolean {
  const left = fingerprint(a);
  const right = fingerprint(b);
  // No file list means nothing to compare, so claiming "identical" would be a guess.
  if (left.length === 0 || left.length !== right.length) return false;
  return left.every((entry, index) => entry === right[index]);
}

/** Number of selected groups per kind; `selection` maps group key → chosen variant id. */
export function countSelectedByKind(
  selection: ReadonlyMap<string, string>,
  groups: ItemGroup[],
): Map<ItemKind, number> {
  const counts = new Map<ItemKind, number>();
  for (const group of groups) {
    if (selection.has(group.key)) counts.set(group.kind, (counts.get(group.kind) ?? 0) + 1);
  }
  return counts;
}
