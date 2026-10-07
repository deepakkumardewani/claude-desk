import { describe, expect, it } from "vite-plus/test";
import {
  CATALOG_CATEGORIES,
  catalogCategorySchema,
  catalogEntrySchema,
  catalogEnvVarSchema,
  catalogSchema,
} from "./mcpCatalog.js";

const entry = {
  id: "filesystem",
  name: "Filesystem",
  description: "Read and write files",
  category: CATALOG_CATEGORIES[0],
  homepage: "https://example.com",
  command: "npx",
  args: ["-y", "pkg"],
  official: true,
};

describe("catalogCategorySchema", () => {
  it("accepts every listed category and rejects others", () => {
    for (const category of CATALOG_CATEGORIES) {
      expect(catalogCategorySchema.safeParse(category).success).toBe(true);
    }
    expect(catalogCategorySchema.safeParse("not-a-category").success).toBe(false);
  });
});

describe("catalogEnvVarSchema", () => {
  it("defaults required to true", () => {
    expect(catalogEnvVarSchema.parse({ key: "TOKEN", label: "Token" }).required).toBe(true);
  });

  it("rejects empty key, empty label and a malformed docsUrl", () => {
    expect(catalogEnvVarSchema.safeParse({ key: "", label: "x" }).success).toBe(false);
    expect(catalogEnvVarSchema.safeParse({ key: "K", label: "" }).success).toBe(false);
    expect(catalogEnvVarSchema.safeParse({ key: "K", label: "L", docsUrl: "nope" }).success).toBe(
      false,
    );
  });
});

describe("catalogEntrySchema", () => {
  it("fills env and keywords defaults", () => {
    const parsed = catalogEntrySchema.parse(entry);
    expect(parsed.env).toEqual([]);
    expect(parsed.keywords).toEqual([]);
  });

  it("rejects an unsupported command, bad homepage and missing fields", () => {
    expect(catalogEntrySchema.safeParse({ ...entry, command: "node" }).success).toBe(false);
    expect(catalogEntrySchema.safeParse({ ...entry, homepage: "not a url" }).success).toBe(false);
    expect(catalogEntrySchema.safeParse({ ...entry, id: "" }).success).toBe(false);
    const { official: _official, ...missing } = entry;
    expect(catalogEntrySchema.safeParse(missing).success).toBe(false);
  });
});

describe("catalogSchema", () => {
  it("accepts a valid catalog and rejects non-positive or fractional versions", () => {
    const valid = { version: 1, updatedAt: "2026-01-01", entries: [entry] };
    expect(catalogSchema.safeParse(valid).success).toBe(true);
    expect(catalogSchema.safeParse({ ...valid, version: 0 }).success).toBe(false);
    expect(catalogSchema.safeParse({ ...valid, version: 1.5 }).success).toBe(false);
  });

  it("rejects when any entry is invalid", () => {
    const bad = { version: 1, updatedAt: "x", entries: [{ ...entry, command: "bash" }] };
    expect(catalogSchema.safeParse(bad).success).toBe(false);
  });
});
