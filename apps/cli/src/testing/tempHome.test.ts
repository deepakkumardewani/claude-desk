import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { claudeRoot } from "../fs/claudePaths.js";
import { createTempHome } from "./tempHome.js";

// homedir() here asserts the fake (temp) home, never the real one.

const ENV_KEYS = ["HOME", "CLAUDE_ROOT", "CLAUDE_CONFIG_DIR"] as const;

function envSnapshot(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

describe("per-worker safety net (setupHome)", () => {
  it("points a test that omits the helper at the throwaway worker dir", () => {
    expect(homedir()).toContain("claude-desk-worker-home-");
    expect(homedir().startsWith(tmpdir())).toBe(true);
    expect(homedir()).not.toBe(userInfo().homedir);
  });
});

describe("createTempHome", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points HOME at a fresh dir under tmpdir and clears the override vars", () => {
    vi.stubEnv("CLAUDE_ROOT", "/somewhere/else");
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/cfg");
    const temp = createTempHome();
    try {
      expect(temp.home.startsWith(tmpdir())).toBe(true);
      expect(process.env.HOME).toBe(temp.home);
      expect(process.env.CLAUDE_ROOT).toBeUndefined();
      expect(process.env.CLAUDE_CONFIG_DIR).toBeUndefined();
      expect(temp.claudeDir).toBe(join(temp.home, ".claude"));
      expect(existsSync(temp.home)).toBe(true);
    } finally {
      temp.restore();
    }
  });

  it("restores env and removes the dir", () => {
    vi.stubEnv("CLAUDE_ROOT", "/somewhere/else");
    vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
    const before = envSnapshot();
    const temp = createTempHome();
    temp.restore();
    expect(envSnapshot()).toEqual(before);
    expect(existsSync(temp.home)).toBe(false);
  });

  it("copies the seed tree and resolves claudeRoot() inside the temp dir", () => {
    const seed = mkdtempSync(join(tmpdir(), "seed-"));
    mkdirSync(join(seed, ".claude", "skills"), { recursive: true });
    writeFileSync(join(seed, ".claude", "skills", "a.md"), "seeded");
    const temp = createTempHome({ seed });
    try {
      expect(readFileSync(join(temp.claudeDir, "skills", "a.md"), "utf8")).toBe("seeded");
      expect(claudeRoot()).toBe(temp.claudeDir);
      expect(homedir()).toBe(temp.home);
    } finally {
      temp.restore();
      rmSync(seed, { recursive: true, force: true });
    }
  });

  it("restore is idempotent", () => {
    const temp = createTempHome();
    temp.restore();
    expect(() => temp.restore()).not.toThrow();
  });
});
