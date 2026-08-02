import type { Catalog, CatalogEntry } from "schema";

/**
 * Fetch the curated MCP catalog from the API endpoint.
 */
export async function fetchCatalog(): Promise<Catalog> {
  const response = await fetch("/api/mcp/catalog");
  if (!response.ok) {
    throw new Error(`Failed to fetch catalog: ${response.status}`);
  }
  return response.json() as Promise<Catalog>;
}

/**
 * Filter and rank catalog entries by query and categories.
 * Pure function — no side effects.
 *
 * Ranking order: name-prefix > name-contains > keyword > description
 * Ties are broken by official status, then by name.
 */
export function filterCatalog(
  entries: readonly CatalogEntry[],
  options: { query?: string; categories?: readonly string[] } = {},
): CatalogEntry[] {
  const { query = "", categories = [] } = options;
  const lowerQuery = query.toLowerCase().trim();
  const categorySet = categories.length > 0 ? new Set(categories) : null;

  // Filter by category if specified
  let filtered = entries;
  if (categorySet && categorySet.size > 0) {
    filtered = filtered.filter((e) => categorySet.has(e.category));
  }

  // If no query, return all filtered entries sorted by official + name
  if (!lowerQuery) {
    return [...filtered].sort((a, b) => {
      if (a.official !== b.official) return b.official ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }

  // Score and filter by query
  const scored = filtered
    .map((entry) => {
      const nameLower = entry.name.toLowerCase();
      const descLower = entry.description.toLowerCase();

      // Ranking tiers
      let score = 0;
      if (nameLower.startsWith(lowerQuery)) {
        score = 4; // name-prefix
      } else if (nameLower.includes(lowerQuery)) {
        score = 3; // name-contains
      } else if (entry.keywords.some((k) => k.toLowerCase().includes(lowerQuery))) {
        score = 2; // keyword
      } else if (descLower.includes(lowerQuery)) {
        score = 1; // description
      } else {
        return null; // no match
      }

      return { entry, score };
    })
    .filter((item) => item !== null) as Array<{ entry: CatalogEntry; score: number }>;

  // Sort by score desc, then official desc, then name asc
  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.entry.official !== b.entry.official) return b.entry.official ? 1 : -1;
      return a.entry.name.localeCompare(b.entry.name);
    })
    .map((item) => item.entry);
}

/**
 * Install name for a catalog entry (the stable server name).
 */
export function entryInstallName(entry: CatalogEntry): string {
  return entry.id;
}

/**
 * Transport object for installing a catalog entry.
 * Uses placeholder mode by default (${KEY} for env vars).
 */
export function entryToTransport(
  entry: CatalogEntry,
  envValues: Record<string, string> = {},
): {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
} {
  const transport = {
    type: "stdio" as const,
    command: entry.command,
    args: [...entry.args],
  };

  // Build env object only if there are env values
  if (Object.keys(envValues).length > 0) {
    const env: Record<string, string> = {};
    for (const envVar of entry.env) {
      const value = envValues[envVar.key];
      if (value !== undefined) {
        env[envVar.key] = value;
      }
    }
    if (Object.keys(env).length > 0) {
      return { ...transport, env };
    }
  }

  return transport;
}

/**
 * Whether an installed server name matches a catalog entry.
 * Case-insensitive comparison.
 */
export function isEntryInstalled(
  entry: CatalogEntry,
  installedNames: ReadonlySet<string> | readonly string[],
): boolean {
  const names = installedNames instanceof Set ? installedNames : new Set(installedNames);
  const installName = entryInstallName(entry).toLowerCase();

  for (const name of names) {
    if (name.toLowerCase() === installName) {
      return true;
    }
  }
  return false;
}
