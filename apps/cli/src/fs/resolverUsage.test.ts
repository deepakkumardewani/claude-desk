import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

// The homedir() strings below are fixture text for the scanner, not calls.

// Encodes AC1.3: only the resolver may read the home dir or the config-path env vars.
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESOLVER = join("fs", "claudePaths.ts");
const FORBIDDEN = /homedir\(\)|process\.env\.HOME\b|CLAUDE_ROOT|CLAUDE_CONFIG_DIR/;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

function findDirectReads(files: Array<{ path: string; text: string }>): string[] {
  return files
    .filter(({ path, text }) => path !== RESOLVER && FORBIDDEN.test(text))
    .map(({ path }) => path);
}

describe("resolver usage", () => {
  it("flags a direct read outside the resolver", () => {
    const offenders = findDirectReads([
      { path: join("fs", "other.ts"), text: "const h = homedir();" },
      { path: join("fs", "env.ts"), text: "process.env.CLAUDE_ROOT" },
      { path: RESOLVER, text: "homedir() CLAUDE_ROOT" },
      { path: join("fs", "clean.ts"), text: "claudeRoot()" },
    ]);
    expect(offenders).toEqual([join("fs", "other.ts"), join("fs", "env.ts")]);
  });

  it("keeps direct home/env reads inside fs/claudePaths.ts in non-test sources", () => {
    const files = listSourceFiles(SRC_ROOT).map((path) => ({
      path: relative(SRC_ROOT, path),
      text: readFileSync(path, "utf8"),
    }));
    expect(files.length).toBeGreaterThan(10);
    expect(findDirectReads(files)).toEqual([]);
  });
});
