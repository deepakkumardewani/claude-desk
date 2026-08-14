import { ClaudeSettings } from "./index.js";

/**
 * File/resource scope — where a markdown or category file lives.
 * - user: ~/.claude/...
 * - project: <projectDir>/.claude/... (CLAUDE.md at project root)
 */
export type Scope = "user" | "project";

/** Settings files: user settings.json, project settings.json, project settings.local.json */
export type SettingsLayer = Scope | "projectLocal";

/** MCP config origin: user (~/.claude.json), project (.mcp.json), local (projects[dir] in ~/.claude.json) */
export type McpScope = Scope | "local";

export interface EffectiveValue<T = unknown> {
  value: T;
  scope: SettingsLayer;
}

export interface MergedSettings {
  effective: ClaudeSettings;
  scopeMap: Record<string, SettingsLayer>;
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const LAYER_PRECEDENCE: SettingsLayer[] = ["user", "project", "projectLocal"];

function isMergeableObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assignLeaf(
  effective: Record<string, unknown>,
  sources: Record<string, SettingsLayer>,
  path: string[],
  value: unknown,
  layer: SettingsLayer,
): void {
  let cursor = effective;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!isMergeableObject(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  sources[path.join(".")] = layer;
}

function applyObject(
  effective: Record<string, unknown>,
  sources: Record<string, SettingsLayer>,
  obj: Record<string, unknown>,
  layer: SettingsLayer,
  path: string[],
): void {
  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const nextPath = [...path, key];
    if (isMergeableObject(value)) {
      applyObject(effective, sources, value, layer, nextPath);
      continue;
    }
    assignLeaf(effective, sources, nextPath, value, layer);
  }
}

/**
 * Merge settings layers with leaf-level source tracking.
 * Precedence (low → high): user, project, projectLocal.
 */
export function mergeSettings(
  layers: Partial<Record<SettingsLayer, ClaudeSettings>>,
): MergedSettings {
  const effective: Record<string, unknown> = {};
  const scopeMap: Record<string, SettingsLayer> = {};

  for (const layer of LAYER_PRECEDENCE) {
    const settings = layers[layer];
    if (!settings) continue;
    applyObject(effective, scopeMap, settings as Record<string, unknown>, layer, []);
  }

  return { effective: effective as ClaudeSettings, scopeMap };
}

export function getSettingScope(
  scopeMap: Record<string, SettingsLayer>,
  key: string,
): SettingsLayer | undefined {
  return scopeMap[key];
}
