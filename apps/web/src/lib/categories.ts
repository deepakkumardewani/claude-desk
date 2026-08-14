import type { ApiCategory } from "./api";

export type CategoryMeta = {
  colorToken: string;
  label: string;
  purpose: string;
};

const FALLBACK: CategoryMeta = {
  colorToken: "text-text-muted",
  label: "Unknown",
  purpose: "",
};

const CATEGORY_MAP: Record<ApiCategory, CategoryMeta> = {
  skills: {
    colorToken: "bg-cat-skills",
    label: "Skills",
    purpose: "Reusable instructions Claude can invoke",
  },
  plans: {
    colorToken: "bg-cat-plans",
    label: "Plans",
    purpose: "Saved plans for longer work",
  },
  commands: {
    colorToken: "bg-cat-commands",
    label: "Commands",
    purpose: "Slash commands",
  },
  claudeMd: {
    colorToken: "bg-cat-claudemd",
    label: "CLAUDE.md",
    purpose: "Project instructions for Claude",
  },
  settings: {
    colorToken: "bg-cat-settings",
    label: "Settings",
    purpose: "Model, permissions, and defaults",
  },
  agents: {
    colorToken: "bg-cat-agents",
    label: "Agents",
    purpose: "Custom subagents",
  },
  plugins: {
    colorToken: "bg-cat-plugins",
    label: "Plugins",
    purpose: "Marketplace bundles",
  },
};

export function getCategoryMeta(category: string): CategoryMeta {
  return (CATEGORY_MAP as Record<string, CategoryMeta>)[category] ?? FALLBACK;
}
