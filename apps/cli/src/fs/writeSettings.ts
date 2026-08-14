import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { safeParseSettings, type ClaudeSettings, type SettingsLayer } from "schema";
import { settingsFilePath } from "./scoped.js";
import { backupFile } from "./backups.js";

export type WriteSettingsResult =
  | { success: true; settings: ClaudeSettings }
  | { success: false; issues: Array<{ message: string; path?: PropertyKey[] }> };

function settingsPaths(layer: SettingsLayer = "user", projectDir?: string) {
  const settingsPath = settingsFilePath(layer, projectDir);
  return {
    settingsPath,
    tempPath: `${settingsPath}.tmp.${process.pid}`,
  };
}

/** Validate, back up, and atomically write settings.json or settings.local.json. */
export async function writeSettings(
  input: unknown,
  layer: SettingsLayer = "user",
  projectDir?: string,
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

  const { settingsPath, tempPath } = settingsPaths(layer, projectDir);
  const content = `${JSON.stringify(parsed.data, null, 2)}\n`;

  await mkdir(dirname(settingsPath), { recursive: true });
  await backupFile(settingsPath);
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, settingsPath);

  return { success: true, settings: parsed.data };
}
