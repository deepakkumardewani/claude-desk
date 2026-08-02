import { catalogSchema, CATALOG } from "schema";

/**
 * Load the curated MCP catalog from the local module.
 * Validates against the catalog schema on every load.
 * Throws with a descriptive zod message if validation fails.
 */
export function loadCatalog() {
  const result = catalogSchema.safeParse(CATALOG);
  if (!result.success) {
    throw new Error(`Catalog validation failed: ${result.error.message}`);
  }
  return result.data;
}
