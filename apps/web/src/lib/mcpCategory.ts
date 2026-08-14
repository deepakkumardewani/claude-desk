import type { CatalogCategory } from "schema";

export const MCP_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  memory: "Memory",
  browser: "Browser",
  "files-and-git": "Files & Git",
  "search-and-docs": "Search & Docs",
  databases: "Databases",
  devtools: "Devtools",
  productivity: "Productivity",
};

// Tailwind's JIT scanner only picks up statically-written class names, so each
// class must appear literally here rather than being built via interpolation.
const CATEGORY_DOT_CLASSES: Record<CatalogCategory, string> = {
  memory: "bg-[color:var(--mcp-memory)]",
  browser: "bg-[color:var(--mcp-browser)]",
  "files-and-git": "bg-[color:var(--mcp-files-and-git)]",
  "search-and-docs": "bg-[color:var(--mcp-search-and-docs)]",
  databases: "bg-[color:var(--mcp-databases)]",
  devtools: "bg-[color:var(--mcp-devtools)]",
  productivity: "bg-[color:var(--mcp-productivity)]",
};

/** Tailwind class for the category's colored dot marker. */
export function categoryDotClass(category: CatalogCategory): string {
  return CATEGORY_DOT_CLASSES[category];
}
