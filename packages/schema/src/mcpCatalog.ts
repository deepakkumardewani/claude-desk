import { z } from "zod";

/**
 * Catalog category enumeration
 */
export const catalogCategorySchema = z.enum([
  "memory",
  "browser",
  "files-and-git",
  "search-and-docs",
  "databases",
  "devtools",
  "productivity",
]);

export type CatalogCategory = z.infer<typeof catalogCategorySchema>;

// Named constant for UI chips
export const CATALOG_CATEGORIES = catalogCategorySchema.options;

/**
 * Environment variable specification for a catalog entry
 */
export const catalogEnvVarSchema = z.object({
  key: z.string().min(1).describe("Environment variable name, e.g. 'GITHUB_TOKEN'"),
  label: z.string().min(1).describe("Human-readable label for the variable"),
  required: z.boolean().default(true).describe("Whether this variable is required"),
  docsUrl: z.string().url().optional().describe("URL to documentation for obtaining the value"),
});

export type CatalogEnvVar = z.infer<typeof catalogEnvVarSchema>;

/**
 * Single MCP server entry in the curated catalog
 */
export const catalogEntrySchema = z.object({
  id: z.string().min(1).describe("Stable slug identifier, e.g. 'filesystem'"),
  name: z.string().min(1).describe("Display name, e.g. 'Filesystem'"),
  description: z.string().min(1).describe("One-sentence description"),
  category: catalogCategorySchema,
  homepage: z.string().url().describe("Project homepage or documentation URL"),
  command: z.enum(["npx", "uvx"]).describe("Package manager command to run"),
  args: z.array(z.string()).describe("Command arguments, e.g. package name and flags"),
  env: z
    .array(catalogEnvVarSchema)
    .default([])
    .describe("Required and optional environment variables"),
  official: z
    .boolean()
    .describe("True if published by Anthropic/vendor; false if community-maintained"),
  keywords: z.array(z.string()).default([]).describe("Search keywords to improve discoverability"),
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

/**
 * Complete curated MCP server catalog
 */
export const catalogSchema = z.object({
  version: z.number().int().positive().describe("Catalog version; bumped when entries change"),
  updatedAt: z.string().describe("ISO 8601 date when catalog was last updated"),
  entries: z.array(catalogEntrySchema).describe("Curated list of locally-runnable MCP servers"),
});

export type Catalog = z.infer<typeof catalogSchema>;
