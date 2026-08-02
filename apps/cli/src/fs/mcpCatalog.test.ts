import { describe, it, expect } from "vite-plus/test";
import { loadCatalog } from "./mcpCatalog.js";
import { catalogSchema } from "schema";

describe("loadCatalog", () => {
  it("returns a valid catalog with ≥18 entries", () => {
    const catalog = loadCatalog();
    expect(catalog.entries.length).toBeGreaterThanOrEqual(18);
  });

  it("validates against the catalog schema", () => {
    const catalog = loadCatalog();
    const result = catalogSchema.safeParse(catalog);
    expect(result.success).toBe(true);
  });

  it("all entries have a defined id, name, and command", () => {
    const catalog = loadCatalog();
    catalog.entries.forEach((entry) => {
      expect(entry.id).toBeDefined();
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name).toBeDefined();
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.command).toMatch(/^(npx|uvx)$/);
    });
  });

  it("all homepage URLs are valid", () => {
    const catalog = loadCatalog();
    catalog.entries.forEach((entry) => {
      expect(() => new URL(entry.homepage)).not.toThrow();
    });
  });
});
