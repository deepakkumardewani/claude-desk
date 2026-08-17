import {
  DEFAULT_SETTINGS,
  getSettingsFieldMetadata,
  parseSettings,
  safeParseSettings,
  type SettingsLayer,
} from "schema";
import { readFile } from "node:fs/promises";
import { readFileText, settingsFilePath } from "../fs/scoped.js";
import { writeSettings } from "../fs/writeSettings.js";
import { isInvalidProjectDir } from "./scopeQuery.js";
import { isFileNotFound, PathEscapeError } from "../errors.js";

export async function getSettingsResponse(layer: SettingsLayer = "user", projectDir?: string) {
  try {
    const raw =
      layer === "projectLocal"
        ? await readFile(settingsFilePath(layer, projectDir), "utf8")
        : await readFileText("settings", "", layer === "user" ? "user" : "project", projectDir);
    const parsedJson = JSON.parse(raw) as unknown;
    const result = safeParseSettings(parsedJson);

    if (!result.success) {
      return {
        status: 422 as const,
        body: { error: "invalid settings.json", issues: result.error.issues },
      };
    }

    return {
      status: 200 as const,
      body: { settings: result.data },
    };
  } catch (error) {
    if (isInvalidProjectDir(error)) {
      return { status: 400 as const, body: { error: error.message } };
    }
    if (isFileNotFound(error)) {
      return {
        status: 200 as const,
        body: { settings: DEFAULT_SETTINGS },
      };
    }
    if (error instanceof PathEscapeError) {
      return { status: 403 as const, body: { error: "forbidden path" } };
    }
    if (error instanceof SyntaxError) {
      return { status: 422 as const, body: { error: "invalid JSON in settings.json" } };
    }
    return { status: 404 as const, body: { error: "settings not found" } };
  }
}

export function getSettingsSchemaResponse() {
  return {
    status: 200 as const,
    body: {
      fields: getSettingsFieldMetadata(),
    },
  };
}

export function parseSettingsForTest(input: unknown) {
  return parseSettings(input);
}

export async function putSettingsResponse(
  body: unknown,
  layer: SettingsLayer = "user",
  projectDir?: string,
) {
  try {
    const result = await writeSettings(body, layer, projectDir);

    if (!result.success) {
      return {
        status: 400 as const,
        body: { error: "invalid settings", issues: result.issues },
      };
    }

    return {
      status: 200 as const,
      body: { settings: result.settings },
    };
  } catch (error) {
    if (isInvalidProjectDir(error)) {
      return { status: 400 as const, body: { error: error.message } };
    }
    throw error;
  }
}
