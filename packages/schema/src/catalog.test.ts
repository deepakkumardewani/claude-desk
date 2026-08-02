import { describe, it, expect } from "vite-plus/test";
import { CATALOG, catalogSchema } from "./index.js";

describe("Catalog data", () => {
  it("should parse against catalogSchema", () => {
    const result = catalogSchema.safeParse(CATALOG);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error("Schema validation errors:", result.error.message);
    }
  });

  it("should have at least 18 entries", () => {
    expect(CATALOG.entries.length).toBeGreaterThanOrEqual(18);
  });

  it("should have all unique id values", () => {
    const ids = CATALOG.entries.map((entry) => entry.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have only npx or uvx commands", () => {
    CATALOG.entries.forEach((entry) => {
      expect(["npx", "uvx"]).toContain(entry.command);
    });
  });

  it("should have valid URLs for all homepages", () => {
    CATALOG.entries.forEach((entry) => {
      expect(() => new URL(entry.homepage)).not.toThrow(
        `Invalid homepage URL for ${entry.id}: ${entry.homepage}`,
      );
    });
  });

  it("should have valid URLs for env var docsUrl when present", () => {
    CATALOG.entries.forEach((entry) => {
      entry.env.forEach((envVar) => {
        if (envVar.docsUrl !== undefined) {
          expect(() => new URL(envVar.docsUrl as string)).not.toThrow(
            `Invalid docsUrl for ${entry.id} env var ${envVar.key}: ${envVar.docsUrl}`,
          );
        }
      });
    });
  });
});
