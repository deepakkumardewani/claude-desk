import { describe, expect, it } from "vite-plus/test";
import { ENV_VAR_BY_NAME, ENV_VAR_CATALOG, searchEnvCatalog } from "./env-catalog";

describe("ENV_VAR_CATALOG", () => {
  it("has unique names and complete entries", () => {
    const names = ENV_VAR_CATALOG.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of ENV_VAR_CATALOG) {
      expect(entry.description).not.toBe("");
      expect(entry.category).not.toBe("");
      expect(entry.example).not.toBe("");
    }
  });

  it("indexes entries by name", () => {
    expect(ENV_VAR_BY_NAME.get("ANTHROPIC_MODEL")?.category).toBe("Model & reasoning");
    expect(ENV_VAR_BY_NAME.size).toBe(ENV_VAR_CATALOG.length);
    expect(ENV_VAR_BY_NAME.get("NOPE")).toBeUndefined();
  });
});

describe("searchEnvCatalog", () => {
  it("returns everything for a blank query", () => {
    expect(searchEnvCatalog("   ", new Set())).toHaveLength(ENV_VAR_CATALOG.length);
  });

  it("matches name, description and category case-insensitively", () => {
    expect(searchEnvCatalog("anthropic_model", new Set()).map((e) => e.name)).toContain(
      "ANTHROPIC_MODEL",
    );
    expect(searchEnvCatalog("bash tool", new Set()).map((e) => e.name)).toContain(
      "BASH_DEFAULT_TIMEOUT_MS",
    );
    const network = searchEnvCatalog("NETWORK", new Set());
    expect(network.map((e) => e.name)).toEqual(expect.arrayContaining(["HTTP_PROXY", "NO_PROXY"]));
  });

  it("excludes already-used variables", () => {
    const result = searchEnvCatalog("proxy", new Set(["HTTP_PROXY"]));
    expect(result.map((e) => e.name)).not.toContain("HTTP_PROXY");
    expect(result.map((e) => e.name)).toContain("HTTPS_PROXY");
  });

  it("returns [] when nothing matches", () => {
    expect(searchEnvCatalog("zzz-no-match", new Set())).toEqual([]);
  });
});
