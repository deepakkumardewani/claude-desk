import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
  name: string;
  bin: Record<string, string>;
  files: string[];
  dependencies: Record<string, string>;
  private?: boolean;
};

describe("publish footprint", () => {
  test("package is public claude-desk with bin and runtime-only deps", () => {
    expect(pkg.name).toBe("claude-desk");
    expect(pkg.private).toBeUndefined();
    expect(pkg.bin["claude-desk"]).toBe("dist/bin.mjs");
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "web", "README.md", "LICENSE"]));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      ["@hono/node-server", "citty", "hono", "open"].sort(),
    );
  });
});
