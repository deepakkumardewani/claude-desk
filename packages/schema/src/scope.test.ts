import { describe, it, expect } from "vite-plus/test";
import { mergeSettings, getSettingScope, type Scope } from "./scope.js";
import type { ClaudeSettings } from "./index.js";

describe("mergeSettings", () => {
  it("returns empty merged settings when no layers provided", () => {
    const result = mergeSettings({});
    expect(result.effective).toEqual({});
    expect(result.scopeMap).toEqual({});
  });

  it("returns user settings when only user layer provided", () => {
    const userSettings: ClaudeSettings = {
      model: "claude-3-5-sonnet",
      effortLevel: "high",
    };
    const result = mergeSettings({ user: userSettings });

    expect(result.effective).toEqual(userSettings);
    expect(result.scopeMap).toEqual({
      model: "user",
      effortLevel: "user",
    });
  });

  it("returns project settings when only project layer provided", () => {
    const projectSettings: ClaudeSettings = {
      model: "claude-3-opus",
    };
    const result = mergeSettings({ project: projectSettings });

    expect(result.effective).toEqual(projectSettings);
    expect(result.scopeMap).toEqual({
      model: "project",
    });
  });

  it("merges user and project settings with project taking precedence", () => {
    const userSettings: ClaudeSettings = {
      model: "claude-3-5-sonnet",
      effortLevel: "high",
      autoUpdatesChannel: "stable",
    };
    const projectSettings: ClaudeSettings = {
      model: "claude-3-opus",
      fastMode: true,
    };

    const result = mergeSettings({ user: userSettings, project: projectSettings });

    expect(result.effective).toEqual({
      model: "claude-3-opus", // project wins
      effortLevel: "high", // user only
      autoUpdatesChannel: "stable", // user only
      fastMode: true, // project only
    });

    expect(result.scopeMap).toEqual({
      model: "project",
      effortLevel: "user",
      autoUpdatesChannel: "user",
      fastMode: "project",
    });
  });

  it("handles nested object merging (e.g., env vars)", () => {
    const userSettings: ClaudeSettings = {
      env: {
        DEBUG: "false",
        LOG_LEVEL: "info",
      },
    };
    const projectSettings: ClaudeSettings = {
      env: {
        DEBUG: "true",
        CUSTOM_VAR: "value",
      },
    };

    const result = mergeSettings({ user: userSettings, project: projectSettings });

    expect(result.effective.env).toEqual({
      DEBUG: "true", // project overrides
      LOG_LEVEL: "info", // from user
      CUSTOM_VAR: "value", // from project
    });

    expect(result.scopeMap["env.DEBUG"]).toBe("project");
    expect(result.scopeMap["env.LOG_LEVEL"]).toBe("user");
    expect(result.scopeMap["env.CUSTOM_VAR"]).toBe("project");
  });

  it("handles merging nested objects with no user layer", () => {
    const projectSettings: ClaudeSettings = {
      env: {
        DEBUG: "true",
      },
    };

    const result = mergeSettings({ project: projectSettings });

    expect(result.effective.env).toEqual({
      DEBUG: "true",
    });
    expect(result.scopeMap["env.DEBUG"]).toBe("project");
  });

  it("handles array values by replacing (not merging)", () => {
    const userSettings: ClaudeSettings = {
      claudeMdExcludes: ["file1", "file2"] as any,
    };
    const projectSettings: ClaudeSettings = {
      claudeMdExcludes: ["file3"] as any,
    };

    const result = mergeSettings({ user: userSettings, project: projectSettings });

    // Arrays are replaced, not merged
    expect(result.effective.claudeMdExcludes).toEqual(["file3"]);
    expect(result.scopeMap.claudeMdExcludes).toBe("project");
  });

  it("handles boolean values correctly", () => {
    const userSettings: ClaudeSettings = {
      autoMemoryEnabled: true,
      fastMode: false,
    };
    const projectSettings: ClaudeSettings = {
      autoMemoryEnabled: false,
    };

    const result = mergeSettings({ user: userSettings, project: projectSettings });

    expect(result.effective.autoMemoryEnabled).toBe(false);
    expect(result.effective.fastMode).toBe(false);
    expect(result.scopeMap.autoMemoryEnabled).toBe("project");
    expect(result.scopeMap.fastMode).toBe("user");
  });

  it("applies projectLocal over project and user", () => {
    const result = mergeSettings({
      user: { model: "user-model", env: { A: "1" } },
      project: { model: "project-model", env: { A: "2", B: "2" } },
      projectLocal: { env: { B: "3" } },
    });

    expect(result.effective.model).toBe("project-model");
    expect(result.effective.env).toEqual({ A: "2", B: "3" });
    expect(result.scopeMap.model).toBe("project");
    expect(result.scopeMap["env.A"]).toBe("project");
    expect(result.scopeMap["env.B"]).toBe("projectLocal");
  });
});

describe("getSettingScope", () => {
  it("returns the scope for a given key", () => {
    const scopeMap: Record<string, Scope> = {
      model: "project",
      effortLevel: "user",
    };

    expect(getSettingScope(scopeMap, "model")).toBe("project");
    expect(getSettingScope(scopeMap, "effortLevel")).toBe("user");
  });

  it("returns undefined for missing keys", () => {
    const scopeMap: Record<string, Scope> = {
      model: "project",
    };

    expect(getSettingScope(scopeMap, "nonexistent")).toBeUndefined();
  });
});
