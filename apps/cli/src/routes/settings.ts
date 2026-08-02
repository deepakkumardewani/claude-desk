import {
  DEFAULT_SETTINGS,
  getSettingsFieldMetadata,
  parseSettings,
  safeParseSettings,
  type Scope,
} from "schema";
import { readFileText } from "../fs/scoped.js";
import { writeSettings } from "../fs/writeSettings.js";

export async function getSettingsResponse(scope: Scope = "user") {
  try {
    const raw = await readFileText("settings", "", scope);
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
    const message = error instanceof Error ? error.message : "unable to read settings";
    if (message.includes("ENOENT") || message.includes("file not found")) {
      return {
        status: 200 as const,
        body: { settings: DEFAULT_SETTINGS },
      };
    }
    if (message.includes("path escapes")) {
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

export async function putSettingsResponse(body: unknown, scope: Scope = "user") {
  const result = await writeSettings(body, scope);

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
}
