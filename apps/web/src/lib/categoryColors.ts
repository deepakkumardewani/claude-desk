/**
 * Maps context categories to their brand colors.
 * Used for StackedUsageBar and CategorySummaryTable visualizations.
 *
 * Keys are normalized (lowercased, qualifiers like "(deferred)" stripped) since the
 * CLI labels the same category differently across sections, e.g. "MCP tools (deferred)".
 */
const CATEGORY_COLOR_MAP: Record<string, string> = {
  "system prompt": "var(--cat-claudemd)",
  "mcp tools": "var(--cat-plugins)",
  "system tools": "var(--cat-settings)",
  "custom agents": "var(--cat-agents)",
  agents: "var(--cat-agents)",
  hooks: "var(--cat-claudemd)",
  mcp: "var(--cat-plugins)",
  plugins: "var(--cat-plugins)",
  "memory files": "var(--cat-commands)",
  memory: "var(--cat-commands)",
  skills: "var(--cat-plans)",
  tools: "var(--cat-plugins)",
  messages: "var(--cat-skills)",
  "free space": "#6a6a6a",
  "autocompact buffer": "var(--danger)",
  input: "var(--cat-plans)",
  output: "var(--cat-plugins)",
  history: "var(--cat-commands)",
};

function normalizeCategoryName(categoryName: string): string {
  return categoryName
    .replace(/\(.*?\)/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Get the color for a category name.
 * Falls back to accent color if category is not recognized.
 */
export function getCategoryColor(categoryName: string): string {
  return CATEGORY_COLOR_MAP[normalizeCategoryName(categoryName)] ?? "var(--accent)";
}

/** Discover item kinds are singular; their category names are plural. */
const ITEM_KIND_CATEGORY: Record<string, string> = {
  skill: "skills",
  agent: "agents",
  command: "commands",
  hook: "hooks",
  mcp: "mcp",
  setting: "settings",
  plugin: "plugins",
};

export function getItemKindColor(kind: string): string {
  const category = ITEM_KIND_CATEGORY[kind];
  return category ? getCategoryColor(category) : "var(--accent)";
}
