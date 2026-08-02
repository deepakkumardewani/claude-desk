import { rename, writeFile } from "node:fs/promises";
import { safeParseSettings, type ClaudeSettings, type Scope } from "schema";
import { safePath } from "./scoped.js";
import { backupFile } from "./backups.js";

export type WriteSettingsResult =
  | { success: true; settings: ClaudeSettings }
  | { success: false; issues: Array<{ message: string; path?: PropertyKey[] }> };

function settingsPaths(scope: Scope = "user") {
  const settingsPath = safePath("settings", "", scope);
  return {
    settingsPath,
    tempPath: `${settingsPath}.tmp.${process.pid}`,
  };
}

/** Validate, back up, and atomically write settings.json. Only settings.json is writable. */
export async function writeSettings(
  input: unknown,
  scope: Scope = "user",
): Promise<WriteSettingsResult> {
  const parsed = safeParseSettings(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path,
      })),
    };
  }

  const { settingsPath, tempPath } = settingsPaths(scope);
  const content = `${JSON.stringify(parsed.data, null, 2)}\n`;

  // Back up the current version before writing
  await backupFile(settingsPath);

  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, settingsPath);

  return { success: true, settings: parsed.data };
}
