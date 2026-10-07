import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  claudeHome,
  claudeJsonPath,
  claudeRoot,
  homeForDisplay,
  projectsDir,
} from "./claudePaths.js";

// homedir() is compared against the stubbed env only; nothing touches the real home.

// Pure path assertions on a fake HOME string: nothing here touches the filesystem.
const FAKE_HOME = "/fake/home-a";
const OTHER_HOME = "/fake/home-b";

describe("claudePaths", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", FAKE_HOME);
    vi.stubEnv("CLAUDE_ROOT", undefined);
    vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("defaults", () => {
    it("falls back to os.homedir() for every path", () => {
      expect(claudeHome()).toBe(homedir());
      expect(claudeHome()).toBe(FAKE_HOME);
      expect(claudeRoot()).toBe(join(FAKE_HOME, ".claude"));
      expect(claudeJsonPath()).toBe(join(FAKE_HOME, ".claude.json"));
      expect(projectsDir()).toBe(join(FAKE_HOME, ".claude", "projects"));
      expect(homeForDisplay()).toBe(FAKE_HOME);
    });
  });

  describe("CLAUDE_ROOT", () => {
    it("overrides the .claude dir and the projects dir beneath it", () => {
      vi.stubEnv("CLAUDE_ROOT", "/custom/root");
      expect(claudeRoot()).toBe(resolve("/custom/root"));
      expect(projectsDir()).toBe(join(resolve("/custom/root"), "projects"));
    });

    it("does not move .claude.json or the home dir", () => {
      vi.stubEnv("CLAUDE_ROOT", "/custom/root");
      expect(claudeJsonPath()).toBe(join(FAKE_HOME, ".claude.json"));
      expect(claudeHome()).toBe(FAKE_HOME);
    });

    it("resolves a relative override to an absolute path", () => {
      vi.stubEnv("CLAUDE_ROOT", "relative/root");
      expect(claudeRoot()).toBe(resolve("relative/root"));
    });
  });

  describe("CLAUDE_CONFIG_DIR", () => {
    it("overrides the dir holding .claude.json only", () => {
      vi.stubEnv("CLAUDE_CONFIG_DIR", "/cfg/dir");
      expect(claudeJsonPath()).toBe(join("/cfg/dir", ".claude.json"));
      expect(claudeRoot()).toBe(join(FAKE_HOME, ".claude"));
    });
  });

  describe("both set", () => {
    it("keeps each override independent", () => {
      vi.stubEnv("CLAUDE_ROOT", "/custom/root");
      vi.stubEnv("CLAUDE_CONFIG_DIR", "/cfg/dir");
      expect(claudeRoot()).toBe(resolve("/custom/root"));
      expect(claudeJsonPath()).toBe(join("/cfg/dir", ".claude.json"));
    });
  });

  describe("laziness", () => {
    it("re-reads HOME on every call", () => {
      expect(claudeRoot()).toBe(join(FAKE_HOME, ".claude"));
      vi.stubEnv("HOME", OTHER_HOME);
      expect(claudeRoot()).toBe(join(OTHER_HOME, ".claude"));
      expect(claudeJsonPath()).toBe(join(OTHER_HOME, ".claude.json"));
      expect(projectsDir()).toBe(join(OTHER_HOME, ".claude", "projects"));
      expect(homeForDisplay()).toBe(OTHER_HOME);
    });
  });
});
