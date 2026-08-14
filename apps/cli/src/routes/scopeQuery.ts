import type { McpScope, Scope, SettingsLayer } from "schema";
import { InvalidProjectDirError, requireAbsoluteProjectDir } from "../fs/scoped.js";

export function parseScope(raw?: string): Scope {
  return raw === "project" ? "project" : "user";
}

export function parseSettingsLayer(raw?: string): SettingsLayer {
  if (raw === "project" || raw === "projectLocal") return raw;
  return "user";
}

export function parseMcpScope(raw?: string): McpScope | undefined {
  if (!raw || raw === "user") return "user";
  if (raw === "project" || raw === "local") return raw;
  return undefined;
}

export function projectDirForLayer(
  layer: Scope | SettingsLayer | McpScope,
  projectDirRaw?: string,
): string | undefined {
  if (layer === "user") return undefined;
  return requireAbsoluteProjectDir(projectDirRaw);
}

export function isInvalidProjectDir(error: unknown): error is InvalidProjectDirError {
  return error instanceof InvalidProjectDirError;
}
