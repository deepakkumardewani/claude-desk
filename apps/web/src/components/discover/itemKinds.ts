import type { ItemKind } from "schema";

export const KIND_ORDER: ItemKind[] = [
  "skill",
  "agent",
  "command",
  "hook",
  "mcp",
  "setting",
  "plugin",
  "convertible",
];

export const KIND_LABELS: Record<ItemKind, string> = {
  skill: "Skills",
  agent: "Agents",
  command: "Commands",
  hook: "Hooks",
  mcp: "MCP",
  setting: "Settings",
  plugin: "Plugins",
  convertible: "Convertible",
};

export const KIND_SINGULAR: Record<ItemKind, string> = {
  skill: "skill",
  agent: "agent",
  command: "command",
  hook: "hook",
  mcp: "mcp",
  setting: "setting",
  plugin: "plugin",
  convertible: "convertible",
};

/** "1 skill" / "71 skills" for summary lines. */
export function kindCountLabel(kind: ItemKind, count: number): string {
  const word = count === 1 ? KIND_SINGULAR[kind] : KIND_LABELS[kind].toLowerCase();
  return `${count} ${word}`;
}
