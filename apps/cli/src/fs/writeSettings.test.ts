import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { useTempHome } from "../testing/tempHomeHooks.js";
import { safePath } from "./scoped.js";
import { writeSettings } from "./writeSettings.js";
import { getBackups } from "./backups.js";

const home = useTempHome();
let fixtureRoot = "";

beforeEach(async () => {
  // CLAUDE_ROOT is unset by the helper, so the resolver lands on the temp HOME's .claude dir;
  // backups therefore go to <temp>/.claude/.claude-desk-backups and vanish on restore.
  fixtureRoot = home().claudeDir;
  await mkdir(fixtureRoot, { recursive: true });
});

function settingsPath() {
  return join(fixtureRoot, "settings.json");
}

describe("writeSettings", () => {
  test("rejects invalid settings before any disk change", async () => {
    await writeFile(settingsPath(), JSON.stringify({ model: "opus" }, null, 2));

    const result = await writeSettings({ effortLevel: "turbo" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
    }

    const current = await readFile(settingsPath(), "utf8");
    expect(JSON.parse(current)).toEqual({ model: "opus" });
  });

  test("creates backup then updates settings atomically on valid write", async () => {
    const initial = { model: "opus", alwaysThinkingEnabled: true };
    await writeFile(settingsPath(), JSON.stringify(initial, null, 2));

    const next = { model: "sonnet", effortLevel: "high", alwaysThinkingEnabled: false };
    const result = await writeSettings(next);
    expect(result.success).toBe(true);

    // Check that a backup was created
    const backups = await getBackups(settingsPath());
    expect(backups.length).toBeGreaterThan(0);

    // Verify the backup content
    const backupPath = backups[0].path;
    const backup = JSON.parse(await readFile(backupPath, "utf8")) as typeof initial;
    expect(backup).toEqual(initial);

    const updated = JSON.parse(await readFile(settingsPath(), "utf8")) as typeof next;
    expect(updated).toEqual(next);
  });

  test("writes valid settings when file is missing", async () => {
    const result = await writeSettings({ model: "haiku" });
    expect(result.success).toBe(true);

    const updated = JSON.parse(await readFile(settingsPath(), "utf8")) as { model: string };
    expect(updated.model).toBe("haiku");
    // No backup should be created for a missing file
    const backups = await getBackups(settingsPath());
    expect(backups.length).toBe(0);
  });

  test("refreshes backup on subsequent writes", async () => {
    await writeFile(settingsPath(), JSON.stringify({ model: "opus" }, null, 2));
    await writeSettings({ model: "sonnet" });
    await writeSettings({ model: "haiku" });

    // Get the most recent backup
    const backups = await getBackups(settingsPath());
    expect(backups.length).toBeGreaterThanOrEqual(1);

    // The most recent backup should be from the "sonnet" write
    const backup = JSON.parse(await readFile(backups[0].path, "utf8")) as { model: string };
    expect(backup.model).toBe("sonnet");
  });

  test("only writes through the settings safePath target", () => {
    expect(safePath("settings")).toBe(settingsPath());
    expect(() => safePath("settings", "../skills/evil.md")).toThrow(/path escapes/);
  });

  test("never leaves a temp file after successful write", async () => {
    await writeSettings({ model: "opus" });
    const tempPath = `${settingsPath()}.tmp.${process.pid}`;
    await expect(stat(tempPath)).rejects.toThrow();
  });

  test("preserves valid file when write fails validation", async () => {
    const valid = { model: "opus", effortLevel: "low" };
    await writeFile(settingsPath(), JSON.stringify(valid, null, 2));

    const result = await writeSettings({ effortLevel: "invalid-level" });
    expect(result.success).toBe(false);

    const current = JSON.parse(await readFile(settingsPath(), "utf8")) as typeof valid;
    expect(current).toEqual(valid);
  });
});
